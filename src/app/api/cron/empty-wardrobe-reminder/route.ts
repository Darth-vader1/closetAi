import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getResendClient, sendEmail } from "@/lib/email/service";
import { renderEmptyWardrobeReminderHtml } from "@/lib/email/templates";
import { logger } from "@/lib/logger";
import {
  verifyCronRequest,
  getUserLocalClock,
  claimEmailLogSlot,
  finalizeEmailLogSlot,
} from "@/lib/cron/auth";

export const maxDuration = 60;

/** Only users who signed up within this window are eligible. */
const MAX_AGE_DAYS = 30;

/**
 * Afternoon local-time window: send if the user's local clock is between
 * 13:00 and 18:00. On Vercel Hobby (once-per-day cron) the window check is
 * bypassed so everyone eligible still receives the email.
 */
const WINDOW_START = "13:00";
const WINDOW_END   = "18:00";

const CONCURRENCY_LIMIT = 5;

interface EligibleRow {
  user_id: string;
  remind_empty_wardrobe: boolean;
  unsubscribe_token: string;
}

/**
 * GET /api/cron/empty-wardrobe-reminder
 *
 * Sends a warm onboarding nudge to every user whose:
 *   - Wardrobe is empty (zero wardrobe_items rows)
 *   - Account is ≤ 30 days old
 *   - remind_empty_wardrobe preference is true (default)
 *   - Email address exists
 *
 * Idempotent per user per day via email_logs (kind = 'EMPTY_WARDROBE').
 * Triggered by Vercel Cron at 14:00 UTC daily; also callable manually with
 * a valid Bearer CRON_SECRET.
 */
export async function GET(request: NextRequest) {
  const authError = verifyCronRequest(request);
  if (authError) return authError;

  if (!getResendClient()) {
    logger.warn("cron.empty_wardrobe_reminder.no_email_provider");
    return NextResponse.json({ ok: true, skipped: true, reason: "Email provider not configured." });
  }

  const adminClient = createAdminClient();

  logger.info("cron.empty_wardrobe_reminder.start");

  // Vercel Hobby fires once a day — skip the local-time window check so all
  // eligible users receive the email regardless of timezone.
  const isDailyBatch =
    request.headers.get("x-vercel-cron") === "1" ||
    request.nextUrl.searchParams.get("mode") === "daily_batch";

  try {
    // 1. Fetch users who opted in to empty-wardrobe reminders.
    //    Gracefully fall back if the migration hasn't been applied yet.
    let prefsData: EligibleRow[] = [];

    const { data: fullPrefs, error: prefsErr } = await adminClient
      .from("email_preferences")
      .select("user_id, remind_empty_wardrobe, unsubscribe_token")
      .eq("remind_empty_wardrobe", true);

    if (prefsErr) {
      if (
        prefsErr.code === "42703" ||
        prefsErr.message?.includes("remind_empty_wardrobe")
      ) {
        // Column doesn't exist yet — migration not applied; treat everyone as opted-in.
        const { data: fallback, error: fallbackErr } = await adminClient
          .from("email_preferences")
          .select("user_id, unsubscribe_token");
        if (fallbackErr) {
          logger.error("cron.empty_wardrobe_reminder.prefs_failed", { error: fallbackErr });
          return NextResponse.json({ error: "Could not query preferences." }, { status: 500 });
        }
        prefsData = (fallback ?? []).map((r) => ({ ...r, remind_empty_wardrobe: true }));
      } else {
        logger.error("cron.empty_wardrobe_reminder.prefs_failed", { error: prefsErr });
        return NextResponse.json({ error: "Could not query preferences." }, { status: 500 });
      }
    } else {
      prefsData = fullPrefs ?? [];
    }

    if (prefsData.length === 0) {
      return NextResponse.json({ ok: true, dispatchedCount: 0, message: "No opted-in users." });
    }

    // 2. Cut-off date for new-user eligibility.
    const cutoffDate = new Date();
    cutoffDate.setUTCDate(cutoffDate.getUTCDate() - MAX_AGE_DAYS);
    const cutoffIso = cutoffDate.toISOString();

    let dispatchedCount = 0;

    const processUser = async (pref: EligibleRow) => {
      const userId = pref.user_id;

      // a. Fetch profile for display_name and timezone.
      const { data: profile } = await adminClient
        .from("profiles")
        .select("display_name, timezone, created_at")
        .eq("id", userId)
        .maybeSingle();

      // b. Skip if the account is older than MAX_AGE_DAYS.
      if (!profile?.created_at || profile.created_at < cutoffIso) return;

      // c. Respect the afternoon delivery window on sub-daily runs.
      if (!isDailyBatch) {
        const clock = getUserLocalClock(profile.timezone);
        if (clock.localTime < WINDOW_START || clock.localTime >= WINDOW_END) return;
      }

      const clock = getUserLocalClock(profile.timezone);

      // d. Check wardrobe item count — skip users who already have items.
      const { count, error: countErr } = await adminClient
        .from("wardrobe_items")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId);

      if (countErr) {
        logger.warn("cron.empty_wardrobe_reminder.count_failed", { userId, error: countErr.message });
        return;
      }
      if ((count ?? 0) > 0) return; // wardrobe not empty — nothing to do

      // e. Claim today's idempotency slot.
      const slot = await claimEmailLogSlot(
        adminClient,
        userId,
        // email_kind enum value — cast avoids TS type gap until Supabase
        // regenerates types from the new migration.
        "EMPTY_WARDROBE" as "DAILY",
        clock.localDate,
      );
      if (!slot) return; // already sent or in progress today

      try {
        // f. Resolve email address via admin auth API.
        const { data: authUser } = await adminClient.auth.admin.getUserById(userId);
        const recipientEmail = authUser?.user?.email;

        if (!recipientEmail) {
          await finalizeEmailLogSlot(adminClient, slot.logId, {
            status: "SKIPPED",
            reason: "No email address on account.",
          });
          return;
        }

        const displayName =
          profile.display_name || recipientEmail.split("@")[0] || "there";

        const html = renderEmptyWardrobeReminderHtml({
          displayName,
          unsubscribeToken: pref.unsubscribe_token,
        });

        const result = await sendEmail({
          to: recipientEmail,
          subject: "Your ClosetAI wardrobe is empty — let's fix that",
          html,
        });

        if (result.success) {
          dispatchedCount++;
          await finalizeEmailLogSlot(adminClient, slot.logId, {
            status: "SENT",
            providerMessageId: result.id,
          });
        } else {
          await finalizeEmailLogSlot(adminClient, slot.logId, {
            status: "FAILED",
            lastError: result.error ?? "Unknown delivery error",
          });
        }
      } catch (userErr) {
        await finalizeEmailLogSlot(adminClient, slot.logId, {
          status: "FAILED",
          lastError: userErr instanceof Error ? userErr.message : "Unexpected error",
        });
      }
    };

    // 3. Process in bounded batches to stay within serverless limits.
    for (let i = 0; i < prefsData.length; i += CONCURRENCY_LIMIT) {
      const batch = prefsData.slice(i, i + CONCURRENCY_LIMIT);
      await Promise.allSettled(batch.map(processUser));
    }

    logger.info("cron.empty_wardrobe_reminder.complete", { dispatchedCount });
    return NextResponse.json({ ok: true, dispatchedCount });
  } catch (err) {
    logger.error("cron.empty_wardrobe_reminder.error", { err });
    return NextResponse.json(
      { error: "Failed to run empty-wardrobe reminder cron." },
      { status: 500 },
    );
  }
}

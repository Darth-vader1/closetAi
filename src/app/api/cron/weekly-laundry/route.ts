import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getResendClient, sendEmail } from "@/lib/email/service";
import { renderWeeklyLaundryHtml } from "@/lib/email/templates";
import { logger } from "@/lib/logger";
import {
  verifyCronRequest,
  getUserLocalClock,
  normalizeTimeHHMM,
  claimEmailLogSlot,
  finalizeEmailLogSlot,
} from "@/lib/cron/auth";

export const maxDuration = 60; // 60s max execution for cron

interface WeeklyPrefRow {
  user_id: string;
  weekly_enabled: boolean;
  weekly_day: number;
  weekly_time: string | null;
  unsubscribe_token: string;
}

const CONCURRENCY_LIMIT = 5;

/**
 * Weekly Laundry Digest Cron Handler
 * Triggered by Vercel Cron or external scheduler with Bearer CRON_SECRET.
 * Dispatches weekly summary of laundry needs and clean garments to opted-in users.
 */
export async function GET(request: NextRequest) {
  const authError = verifyCronRequest(request);
  if (authError) return authError;

  const adminClient = createAdminClient();
  const hasResend = Boolean(getResendClient());

  logger.info("cron.weekly_laundry_start", { hasResend });

  try {
    // 1. Fetch users with weekly laundry digest enabled using real schema columns
    const { data: usersWithPrefs, error: prefsErr } = await adminClient
      .from("email_preferences")
      .select("user_id, weekly_enabled, weekly_day, weekly_time, unsubscribe_token")
      .eq("weekly_enabled", true);

    if (prefsErr) {
      logger.error("cron.fetch_laundry_prefs_failed", { error: prefsErr });
      return NextResponse.json({ error: "Could not query email preferences." }, { status: 500 });
    }

    const eligiblePrefs = (usersWithPrefs ?? []) as WeeklyPrefRow[];

    if (eligiblePrefs.length === 0) {
      return NextResponse.json({ ok: true, dispatchedCount: 0, message: "No users opted in for weekly laundry emails." });
    }

    if (!hasResend) {
      return NextResponse.json({
        ok: true,
        dispatchedCount: 0,
        message: "Resend email provider is not configured; skipping weekly digest dispatch.",
      });
    }

    let dispatchedCount = 0;

    const processUser = async (pref: WeeklyPrefRow) => {
      const userId = pref.user_id;

      // Fetch user profile for display_name and timezone
      const { data: profile } = await adminClient
        .from("profiles")
        .select("display_name, timezone")
        .eq("id", userId)
        .maybeSingle();

      const clock = getUserLocalClock(profile?.timezone);
      const targetDay = typeof pref.weekly_day === "number" ? pref.weekly_day : 0;
      const targetTime = normalizeTimeHHMM(pref.weekly_time, "18:00");

      // Match user's local weekday (0 = Sunday .. 6 = Saturday) and preferred time
      if (clock.weekdayIndex !== targetDay || clock.localTime < targetTime) {
        return;
      }

      // Atomically claim this ISO week's slot in email_logs (e.g. '2026-W41')
      const slot = await claimEmailLogSlot(adminClient, userId, "WEEKLY", clock.isoWeekKey);
      if (!slot) {
        return; // Already sent or in progress for this week
      }

      try {
        const { data: authUser } = await adminClient.auth.admin.getUserById(userId);
        const recipientEmail = authUser?.user?.email;
        if (!recipientEmail) {
          await finalizeEmailLogSlot(adminClient, slot.logId, {
            status: "SKIPPED",
            reason: "User has no email address.",
          });
          return;
        }

        // Query garment statuses for user
        const { data: items } = await adminClient
          .from("wardrobe_items")
          .select("name, category, status, wear_count")
          .eq("user_id", userId);

        const allItems = items ?? [];
        let cleanCount = 0;
        let wornCount = 0;
        let dirtyCount = 0;
        let inLaundryCount = 0;
        const urgentItems: Array<{ name: string; category: string; wearCount: number }> = [];

        for (const item of allItems) {
          if (item.status === "CLEAN") cleanCount++;
          else if (item.status === "WORN") wornCount++;
          else if (item.status === "DIRTY") {
            dirtyCount++;
            urgentItems.push({
              name: item.name,
              category: item.category,
              wearCount: item.wear_count || 1,
            });
          } else if (item.status === "IN_LAUNDRY" || item.status === "WASHING" || item.status === "DRYING") {
            inLaundryCount++;
          }
        }

        const displayName = profile?.display_name || recipientEmail.split("@")[0];

        const html = renderWeeklyLaundryHtml({
          displayName,
          cleanCount,
          wornCount,
          dirtyCount,
          inLaundryCount,
          urgentItems: urgentItems.slice(0, 6),
          unsubscribeToken: pref.unsubscribe_token,
        });

        const sendResult = await sendEmail({
          to: recipientEmail,
          subject: `Weekly Laundry Digest: ${dirtyCount + inLaundryCount} items waiting · ClosetAI`,
          html,
        });

        if (sendResult.success) {
          dispatchedCount++;
          await finalizeEmailLogSlot(adminClient, slot.logId, {
            status: "SENT",
            providerMessageId: sendResult.id,
          });
        } else {
          await finalizeEmailLogSlot(adminClient, slot.logId, {
            status: "FAILED",
            lastError: sendResult.error || "Email delivery failed",
          });
        }
      } catch (userErr) {
        await finalizeEmailLogSlot(adminClient, slot.logId, {
          status: "FAILED",
          lastError: userErr instanceof Error ? userErr.message : "Unexpected weekly cron error",
        });
      }
    };

    for (let i = 0; i < eligiblePrefs.length; i += CONCURRENCY_LIMIT) {
      const batch = eligiblePrefs.slice(i, i + CONCURRENCY_LIMIT);
      await Promise.allSettled(batch.map(processUser));
    }

    logger.info("cron.weekly_laundry_complete", { dispatchedCount });
    return NextResponse.json({ ok: true, dispatchedCount });
  } catch (err) {
    logger.error("cron.weekly_laundry_error", { err });
    return NextResponse.json({ error: "Failed to run weekly laundry cron job." }, { status: 500 });
  }
}

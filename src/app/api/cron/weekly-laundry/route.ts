import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getResendClient, sendEmail } from "@/lib/email/service";
import { renderWeeklyLaundryHtml } from "@/lib/email/templates";
import { getWhatsAppConfig, sendTemplateMessage } from "@/lib/whatsapp/service";
import { WHATSAPP_TEMPLATES } from "@/lib/whatsapp/templates";
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
  whatsapp_phone?: string | null;
  whatsapp_weekly_enabled?: boolean | null;
  whatsapp_phone_verified?: boolean | null;
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
  const hasWhatsApp = Boolean(getWhatsAppConfig());

  logger.info("cron.weekly_laundry_start", { hasResend, hasWhatsApp });

  try {
    // 1. Fetch users with weekly laundry digest enabled using real schema columns
    let prefsData: WeeklyPrefRow[] | null = null;
    const { data: fullPrefs, error: fullErr } = await adminClient
      .from("email_preferences")
      .select("user_id, weekly_enabled, weekly_day, weekly_time, unsubscribe_token, whatsapp_phone, whatsapp_weekly_enabled, whatsapp_phone_verified");

    if (fullErr && (fullErr.code === "42703" || fullErr.code === "PGRST204" || fullErr.message?.includes("whatsapp"))) {
      // Fallback if WhatsApp columns don't exist
      const { data: basePrefs, error: baseErr } = await adminClient
        .from("email_preferences")
        .select("user_id, weekly_enabled, weekly_day, weekly_time, unsubscribe_token");

      if (baseErr) {
        logger.error("cron.fetch_laundry_prefs_failed", { error: baseErr });
        return NextResponse.json({ error: "Could not query email preferences." }, { status: 500 });
      }
      prefsData = basePrefs as WeeklyPrefRow[];
    } else if (fullErr) {
      logger.error("cron.fetch_laundry_prefs_failed", { error: fullErr });
      return NextResponse.json({ error: "Could not query email preferences." }, { status: 500 });
    } else {
      prefsData = fullPrefs as WeeklyPrefRow[];
    }

    const eligiblePrefs = (prefsData ?? []).filter(
      (p) => p.weekly_enabled || Boolean(p.whatsapp_weekly_enabled && p.whatsapp_phone && p.whatsapp_phone_verified),
    );

    if (eligiblePrefs.length === 0) {
      return NextResponse.json({ ok: true, dispatchedCount: 0, message: "No users opted in for weekly laundry notifications." });
    }

    const isWeeklyBatch =
      request.headers.get("x-vercel-cron") === "1" ||
      request.nextUrl.searchParams.get("mode") === "daily_batch";

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

      // Match user's local weekday and preferred time on hourly/frequent runs
      if (!isWeeklyBatch && (clock.weekdayIndex !== targetDay || clock.localTime < targetTime)) {
        return;
      }

      // Atomically claim this ISO week's slot in email_logs (e.g. '2026-W41')
      const wantEmail = pref.weekly_enabled && hasResend;
      const wantWhatsApp = Boolean(
        pref.whatsapp_weekly_enabled &&
        pref.whatsapp_phone &&
        pref.whatsapp_phone_verified
      ) && hasWhatsApp;

      if (!wantEmail && !wantWhatsApp) {
        return;
      }

      const slot = await claimEmailLogSlot(adminClient, userId, "WEEKLY", clock.isoWeekKey);
      if (!slot) {
        return; // Already sent or in progress for this week
      }

      try {
        const { data: authUser } = await adminClient.auth.admin.getUserById(userId);
        const recipientEmail = authUser?.user?.email;
        if (!recipientEmail && wantEmail) {
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

        const displayName = profile?.display_name || recipientEmail?.split("@")[0] || "Friend";

        let emailSent = false;
        let waSent = false;
        let providerMessageId: string | undefined;
        const errors: string[] = [];

        // 1. Dispatch Email (if enabled and email exists)
        if (wantEmail && recipientEmail) {
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
            emailSent = true;
            providerMessageId = sendResult.id;
          } else if (sendResult.error) {
            errors.push(`email: ${sendResult.error}`);
          }
        }

        // 2. Dispatch WhatsApp (if enabled, phone verified, and WhatsApp configured)
        if (wantWhatsApp && pref.whatsapp_phone) {
          // Use template message for weekly reminders (likely outside 24h window)
          const waRes = await sendTemplateMessage(
            pref.whatsapp_phone,
            WHATSAPP_TEMPLATES.WEEKLY_LAUNDRY,
            {
              userName: displayName,
              itemCount: dirtyCount + inLaundryCount,
            }
          );

          if (waRes.success) {
            waSent = true;
            providerMessageId = providerMessageId ?? waRes.id;
          } else if (waRes.error) {
            errors.push(`whatsapp: ${waRes.error}`);
          }
        }

        if (emailSent || waSent) {
          dispatchedCount++;
          await finalizeEmailLogSlot(adminClient, slot.logId, {
            status: "SENT",
            providerMessageId,
          });
        } else if (errors.length > 0) {
          await finalizeEmailLogSlot(adminClient, slot.logId, {
            status: "FAILED",
            lastError: errors.join("; "),
          });
        } else {
          await finalizeEmailLogSlot(adminClient, slot.logId, {
            status: "SKIPPED",
            reason: "No deliverable recipient address.",
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

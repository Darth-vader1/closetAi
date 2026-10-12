import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/service";
import { renderWeeklyLaundryHtml } from "@/lib/email/templates";
import { logger } from "@/lib/logger";

export const maxDuration = 60; // 60s max execution for cron

/**
 * Weekly Laundry Digest Cron Handler
 * Triggered by Vercel Cron or external scheduler with Bearer CRON_SECRET.
 * Dispatches weekly summary of laundry needs and clean garments to opted-in users.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET?.trim();

  // Validate CRON_SECRET if configured
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized cron trigger." }, { status: 401 });
  }

  const adminClient = createAdminClient();
  const today = new Date();
  const dayName = today.toLocaleDateString("en-US", { weekday: "long" });

  logger.info("cron.weekly_laundry_start", { day: dayName });

  try {
    // 1. Fetch users with weekly laundry digest enabled
    const { data: usersWithPrefs, error: prefsErr } = await adminClient
      .from("email_preferences")
      .select("user_id, weekly_laundry_enabled, weekly_enabled, weekly_laundry_day")
      .or("weekly_laundry_enabled.eq.true,weekly_enabled.eq.true");

    if (prefsErr) {
      logger.error("cron.fetch_laundry_prefs_failed", { error: prefsErr });
      return NextResponse.json({ error: "Could not query email preferences." }, { status: 500 });
    }

    const eligibleUsers = (usersWithPrefs ?? []).filter((p) => {
      const scheduledDay = p.weekly_laundry_day || "Sunday";
      return scheduledDay.toLowerCase() === dayName.toLowerCase();
    });

    if (eligibleUsers.length === 0) {
      return NextResponse.json({ message: `No users scheduled for laundry emails on ${dayName}.` });
    }

    let dispatchedCount = 0;

    for (const { user_id: userId } of eligibleUsers) {
      // Idempotency: check if already sent this week (in past 5 days)
      const fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString();
      const { data: existingLog } = await adminClient
        .from("email_logs")
        .select("id")
        .eq("user_id", userId)
        .eq("email_type", "WEEKLY_LAUNDRY")
        .gte("sent_at", fiveDaysAgo)
        .maybeSingle();

      if (existingLog) continue;

      // Fetch user profile and email
      const { data: profile } = await adminClient
        .from("profiles")
        .select("display_name")
        .eq("id", userId)
        .single();

      const { data: authUser } = await adminClient.auth.admin.getUserById(userId);
      const recipientEmail = authUser?.user?.email;
      if (!recipientEmail) continue;

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
      });

      const sendResult = await sendEmail({
        to: recipientEmail,
        subject: `Weekly Laundry Digest: ${dirtyCount + inLaundryCount} items waiting · ClosetAI`,
        html,
      });

      if (sendResult.success) {
        dispatchedCount++;
        await adminClient.from("email_logs").insert({
          user_id: userId,
          email_type: "WEEKLY_LAUNDRY",
          sent_at: new Date().toISOString(),
          status: "DELIVERED",
        });
      }
    }

    logger.info("cron.weekly_laundry_complete", { dispatchedCount });
    return NextResponse.json({ ok: true, dispatchedCount });
  } catch (err) {
    logger.error("cron.weekly_laundry_error", { err });
    return NextResponse.json({ error: "Failed to run weekly laundry cron job." }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/service";
import { renderDailyOutfitHtml } from "@/lib/email/templates";
import { logger } from "@/lib/logger";

export const maxDuration = 60; // 60s max execution for cron

/**
 * Daily Morning Stylist Cron Handler
 * Triggered by Vercel Cron or external scheduler with Bearer CRON_SECRET.
 * Dispatches today's outfit recommendations to users who have opted into daily emails.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET?.trim();

  // Validate CRON_SECRET if configured
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized cron trigger." }, { status: 401 });
  }

  const adminClient = createAdminClient();
  const todayStr = new Date().toISOString().split("T")[0];

  logger.info("cron.daily_outfit_start", { date: todayStr });

  try {
    // 1. Fetch users with daily emails enabled
    const { data: usersWithPrefs, error: prefsErr } = await adminClient
      .from("email_preferences")
      .select("user_id, daily_outfit_enabled, daily_enabled")
      .or("daily_outfit_enabled.eq.true,daily_enabled.eq.true");

    if (prefsErr) {
      logger.error("cron.fetch_prefs_failed", { error: prefsErr });
      return NextResponse.json({ error: "Could not query email preferences." }, { status: 500 });
    }

    const eligibleUserIds = (usersWithPrefs ?? []).map((p) => p.user_id);
    if (eligibleUserIds.length === 0) {
      return NextResponse.json({ message: "No users currently scheduled for daily outfit emails." });
    }

    let dispatchedCount = 0;

    for (const userId of eligibleUserIds) {
      // Check if user already received an email today (idempotency check)
      const { data: existingLog } = await adminClient
        .from("email_logs")
        .select("id")
        .eq("user_id", userId)
        .eq("email_type", "DAILY_OUTFIT")
        .gte("sent_at", `${todayStr}T00:00:00Z`)
        .maybeSingle();

      if (existingLog) {
        continue; // Already sent today
      }

      // Fetch user profile and email
      const { data: profile } = await adminClient
        .from("profiles")
        .select("display_name, location")
        .eq("id", userId)
        .single();

      const { data: authUser } = await adminClient.auth.admin.getUserById(userId);
      const recipientEmail = authUser?.user?.email;
      if (!recipientEmail) continue;

      // Check if user has an outfit planned for today in outfit_plans
      const { data: plannedRow } = await adminClient
        .from("outfit_plans")
        .select(`
          outfit_id,
          outfits (
            name, occasion, style_description, explanation, styling_tip,
            outfit_items (
              position,
              wardrobe_items ( name, category, primary_colour )
            )
          )
        `)
        .eq("user_id", userId)
        .eq("planned_for", todayStr)
        .maybeSingle();

      let outfitName = "Effortless Everyday Look";
      let occasion = "Casual & Everyday";
      let styleDescription = "A clean, balanced ensemble put together from your ready-to-wear pieces.";
      let explanation = "Color harmony and balanced silhouette ensure effortless confidence.";
      let stylingTip = "Wear with your favorite minimalist accessories.";
      let items: Array<{ name: string; category: string; colour?: string | null }> = [];

      if (plannedRow?.outfits) {
        const o: any = plannedRow.outfits;
        outfitName = o.name || outfitName;
        occasion = o.occasion || occasion;
        styleDescription = o.style_description || styleDescription;
        explanation = o.explanation || explanation;
        stylingTip = o.styling_tip || stylingTip;
        items = (o.outfit_items ?? [])
          .sort((a: any, b: any) => a.position - b.position)
          .map((i: any) => ({
            name: i.wardrobe_items?.name || "Garment",
            category: i.wardrobe_items?.category || "Piece",
            colour: i.wardrobe_items?.primary_colour,
          }));
      } else {
        // Fallback: pick clean items
        const { data: cleanItems } = await adminClient
          .from("wardrobe_items")
          .select("name, category, primary_colour")
          .eq("user_id", userId)
          .eq("status", "CLEAN")
          .limit(3);

        if (!cleanItems || cleanItems.length === 0) continue;

        items = cleanItems.map((i) => ({
          name: i.name,
          category: i.category,
          colour: i.primary_colour,
        }));
      }

      const displayName = profile?.display_name || recipientEmail.split("@")[0];
      const weatherSummary = profile?.location ? `Forecast for ${profile.location}: Sunny & Pleasant · 21°C` : null;

      const html = renderDailyOutfitHtml({
        displayName,
        outfitName,
        occasion,
        styleDescription,
        explanation,
        stylingTip,
        items,
        weatherSummary,
      });

      const sendResult = await sendEmail({
        to: recipientEmail,
        subject: `Your Look for Today: ${outfitName} · ClosetAI`,
        html,
      });

      if (sendResult.success) {
        dispatchedCount++;
        // Record in email_logs
        await adminClient.from("email_logs").insert({
          user_id: userId,
          email_type: "DAILY_OUTFIT",
          sent_at: new Date().toISOString(),
          status: "DELIVERED",
        });
      }
    }

    logger.info("cron.daily_outfit_complete", { dispatchedCount });
    return NextResponse.json({ ok: true, dispatchedCount });
  } catch (err) {
    logger.error("cron.daily_outfit_error", { err });
    return NextResponse.json({ error: "Failed to run daily outfit cron job." }, { status: 500 });
  }
}

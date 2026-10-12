import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/service";
import { renderDailyOutfitHtml } from "@/lib/email/templates";
import { sendWhatsAppMessage, formatDailyOutfitWhatsApp } from "@/lib/whatsapp/service";
import { getLiveWeather } from "@/lib/weather/service";
import { logger } from "@/lib/logger";

export const maxDuration = 60; // 60s max execution for cron

/**
 * Daily Morning Stylist Cron Handler
 * Triggered by Vercel Cron or external scheduler with Bearer CRON_SECRET.
 * Dispatches today's weather-aware outfit recommendations to users via Email and WhatsApp.
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
    // 1. Fetch users with either daily email OR daily WhatsApp enabled
    const { data: usersWithPrefs, error: prefsErr } = await adminClient
      .from("email_preferences")
      .select("user_id, daily_outfit_enabled, daily_enabled, daily_time, whatsapp_phone, whatsapp_daily_enabled");

    if (prefsErr) {
      logger.error("cron.fetch_prefs_failed", { error: prefsErr });
      return NextResponse.json({ error: "Could not query notification preferences." }, { status: 500 });
    }

    const eligiblePrefs = (usersWithPrefs ?? []).filter(
      (p) => p.daily_enabled || p.daily_outfit_enabled || (p.whatsapp_daily_enabled && p.whatsapp_phone),
    );

    if (eligiblePrefs.length === 0) {
      return NextResponse.json({ message: "No users currently scheduled for daily outfit notifications." });
    }

    let dispatchedCount = 0;

    for (const pref of eligiblePrefs) {
      const userId = pref.user_id;

      // Check if user already received a notification today (idempotency check)
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
        .select("display_name, location, timezone")
        .eq("id", userId)
        .single();

      const { data: authUser } = await adminClient.auth.admin.getUserById(userId);
      const recipientEmail = authUser?.user?.email;

      // Check if user has an outfit planned for today in outfit_plans
      const { data: plannedRow } = await adminClient
        .from("outfit_plans")
        .select(`
          outfit_id,
          outfits (
            name, occasion, style_description, explanation, styling_tip,
            outfit_items (
              position,
              wardrobe_items ( name, category, primary_colour, image_path )
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
      let items: Array<{ name: string; category: string; colour?: string | null; image_path?: string | null }> = [];

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
            image_path: i.wardrobe_items?.image_path,
          }));
      } else {
        // Fallback: harmonized clean items from distinct categories (Top, Bottom, Shoes/Outerwear)
        const { data: cleanItems } = await adminClient
          .from("wardrobe_items")
          .select("name, category, primary_colour, image_path")
          .eq("user_id", userId)
          .eq("status", "CLEAN")
          .order("created_at", { ascending: false })
          .limit(20);

        if (!cleanItems || cleanItems.length === 0) continue;

        // Ensure distinct categories (e.g. 1 top, 1 bottom, 1 shoes)
        const catMap = new Map<string, typeof cleanItems[0]>();
        for (const item of cleanItems) {
          if (!catMap.has(item.category)) {
            catMap.set(item.category, item);
          }
        }

        const distinctPieces = Array.from(catMap.values()).slice(0, 3);
        items = distinctPieces.map((i) => ({
          name: i.name,
          category: i.category,
          colour: i.primary_colour,
          image_path: i.image_path,
        }));
      }

      const displayName = profile?.display_name || recipientEmail?.split("@")[0] || "Friend";

      // Fetch live weather for the user's city
      const weather = await getLiveWeather(profile?.location || "Lagos");
      const weatherSummary = weather
        ? `${weather.city}: ${weather.temperatureC}°C · ${weather.condition}`
        : null;

      // Sign image URLs for actual clothes photos
      const signedUrls: string[] = [];
      for (const itm of items) {
        if (itm.image_path) {
          const { data: signed } = await adminClient.storage
            .from("wardrobe")
            .createSignedUrl(itm.image_path, 60 * 60);
          if (signed?.signedUrl) {
            signedUrls.push(signed.signedUrl);
          }
        }
      }

      let emailSent = false;
      let waSent = false;

      // 1. Dispatch Email (if enabled and email address exists)
      if ((pref.daily_enabled || pref.daily_outfit_enabled) && recipientEmail) {
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
        emailSent = sendResult.success;
      }

      // 2. Dispatch WhatsApp (if enabled and phone exists)
      if (pref.whatsapp_daily_enabled && pref.whatsapp_phone) {
        const waMessage = formatDailyOutfitWhatsApp({
          displayName,
          outfitName,
          occasion,
          styleDescription,
          stylingTip,
          weatherSummary: weatherSummary || undefined,
          items,
          appUrl: "https://closet-ai-official.vercel.app",
        });

        const waRes = await sendWhatsAppMessage({
          to: pref.whatsapp_phone,
          message: waMessage,
          imageUrls: signedUrls,
        });
        waSent = waRes.success;
      }

      if (emailSent || waSent) {
        dispatchedCount++;
        // Record in email_logs for idempotency
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

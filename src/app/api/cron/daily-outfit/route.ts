import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getResendClient, sendEmail } from "@/lib/email/service";
import { renderDailyOutfitHtml } from "@/lib/email/templates";
import { getWhatsAppConfig, sendWhatsAppMessage, sendTemplateMessage, formatDailyOutfitWhatsApp } from "@/lib/whatsapp/service";
import { WHATSAPP_TEMPLATES, isWithin24HourWindow } from "@/lib/whatsapp/templates";
import { getLiveWeather } from "@/lib/weather/service";
import { getAppUrl } from "@/lib/env";
import { logger } from "@/lib/logger";
import {
  verifyCronRequest,
  getUserLocalClock,
  normalizeTimeHHMM,
  claimEmailLogSlot,
  finalizeEmailLogSlot,
} from "@/lib/cron/auth";
import { runStylingPipeline } from "@/lib/styling/pipeline";
import { listAllWardrobeItems, type WardrobeItem } from "@/lib/wardrobe/queries";

export const maxDuration = 60; // 60s max execution for cron

interface DailyPrefRow {
  user_id: string;
  daily_enabled: boolean;
  daily_time: string | null;
  unsubscribe_token: string;
  whatsapp_phone?: string | null;
  whatsapp_daily_enabled?: boolean | null;
  whatsapp_phone_verified?: boolean | null;
  whatsapp_last_inbound_at?: string | null;
}

const CONCURRENCY_LIMIT = 5;

const OCCASION_LABELS: Record<string, string> = {
  everyday: "Casual & Everyday",
  work: "Work & Office",
  school: "Campus & Class",
  date: "Date Night",
  party: "Party & Night Out",
  sport: "Sport & Athleisure",
  formal_event: "Formal Event",
  worship: "Sunday Best & Worship",
  traditional_event: "Traditional & Owambe",
  travel: "Travel & On-the-Go",
};

function normalizeStringArray(val: unknown): string[] {
  if (Array.isArray(val)) {
    return val.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
  }
  if (typeof val === "string" && val.trim().length > 0) {
    return [val.trim()];
  }
  return [];
}

function selectDailyOccasionAndStyle(
  localDate: string,
  preferredStyles: string[],
  commonOccasions: string[],
): { targetStyle: string | null; targetOccasion: string; dayIndex: number } {
  const [y, m, d] = localDate.split("-").map(Number);
  const utcDate = new Date(Date.UTC(y || 2026, (m || 1) - 1, d || 1));
  const dayOfWeek = utcDate.getUTCDay(); // 0 = Sun .. 6 = Sat
  const startOfYear = Date.UTC(y || 2026, 0, 0);
  const dayIndex = Math.max(0, Math.floor((utcDate.getTime() - startOfYear) / 86_400_000));

  const targetStyle =
    preferredStyles.length > 0 ? preferredStyles[dayIndex % preferredStyles.length] : null;

  if (commonOccasions.length === 0) {
    return { targetStyle, targetOccasion: "everyday", dayIndex };
  }

  let pool: string[] = [];
  if (dayOfWeek === 0) {
    if (commonOccasions.includes("worship")) {
      return { targetStyle, targetOccasion: "worship", dayIndex };
    }
    pool = commonOccasions.filter((o) =>
      ["everyday", "date", "party", "sport", "traditional_event"].includes(o),
    );
  } else if (dayOfWeek === 6) {
    pool = commonOccasions.filter((o) =>
      ["everyday", "sport", "party", "date", "traditional_event", "travel"].includes(o),
    );
  } else {
    pool = commonOccasions.filter((o) =>
      ["work", "school", "everyday", "sport"].includes(o),
    );
  }

  if (pool.length === 0) pool = commonOccasions;
  const targetOccasion = pool[dayIndex % pool.length] || "everyday";
  return { targetStyle, targetOccasion, dayIndex };
}

/**
 * Daily Morning Stylist Cron Handler
 * Triggered by Vercel Cron or external scheduler with Bearer CRON_SECRET.
 * Dispatches today's weather-aware outfit recommendations to users via Email and WhatsApp.
 */
export async function GET(request: NextRequest) {
  const authError = verifyCronRequest(request);
  if (authError) return authError;

  const adminClient = createAdminClient();
  const appUrl = getAppUrl();
  const hasResend = Boolean(getResendClient());
  const hasWhatsApp = Boolean(getWhatsAppConfig());

  logger.info("cron.daily_outfit_start", { hasResend, hasWhatsApp });

  try {
    // 1. Fetch preferences using real schema columns (with graceful fallback if WhatsApp migration is not yet applied)
    let prefsData: DailyPrefRow[] | null = null;
    const { data: fullPrefs, error: fullErr } = await adminClient
      .from("email_preferences")
      .select("user_id, daily_enabled, daily_time, unsubscribe_token, whatsapp_phone, whatsapp_daily_enabled, whatsapp_phone_verified, whatsapp_last_inbound_at");

    if (fullErr && (fullErr.code === "42703" || fullErr.code === "PGRST204" || fullErr.message?.includes("whatsapp"))) {
      const { data: basePrefs, error: baseErr } = await adminClient
        .from("email_preferences")
        .select("user_id, daily_enabled, daily_time, unsubscribe_token");

      if (baseErr) {
        logger.error("cron.fetch_prefs_failed", { error: baseErr });
        return NextResponse.json({ error: "Could not query notification preferences." }, { status: 500 });
      }
      prefsData = basePrefs as DailyPrefRow[];
    } else if (fullErr) {
      logger.error("cron.fetch_prefs_failed", { error: fullErr });
      return NextResponse.json({ error: "Could not query notification preferences." }, { status: 500 });
    } else {
      prefsData = fullPrefs as DailyPrefRow[];
    }

    const eligiblePrefs = (prefsData ?? []).filter(
      (p) => p.daily_enabled || Boolean(p.whatsapp_daily_enabled && p.whatsapp_phone),
    );

    if (eligiblePrefs.length === 0) {
      return NextResponse.json({ ok: true, dispatchedCount: 0, message: "No users opted in for daily notifications." });
    }

    const isDailyBatch =
      request.headers.get("x-vercel-cron") === "1" ||
      request.nextUrl.searchParams.get("mode") === "daily_batch";

    let dispatchedCount = 0;

    const processUser = async (pref: DailyPrefRow) => {
      const userId = pref.user_id;

      // Fetch user profile for timezone, location, display_name, and all styling preferences (from Onboarding / Settings)
      let profile: {
        display_name?: string | null;
        location?: string | null;
        timezone?: string | null;
        preferred_style?: string | string[] | null;
        common_occasions?: string[] | null;
        favourite_colours?: string[] | null;
        rewear_worn_items?: boolean | null;
      } | null = null;

      const profileRes = await adminClient
        .from("profiles")
        .select("display_name, location, timezone, preferred_style, common_occasions, favourite_colours, rewear_worn_items")
        .eq("id", userId)
        .maybeSingle();

      if (profileRes.error) {
        const fallbackProfile = await adminClient
          .from("profiles")
          .select("display_name, location, timezone, preferred_style, rewear_worn_items")
          .eq("id", userId)
          .maybeSingle();
        profile = fallbackProfile.data;
      } else {
        profile = profileRes.data;
      }

      const clock = getUserLocalClock(profile?.timezone);
      const targetTime = normalizeTimeHHMM(pref.daily_time, "07:00");

      // Respect user's preferred local send time on hourly/frequent runs;
      // on once-a-day Vercel Hobby cron runs, deliver for today regardless of hour.
      if (!isDailyBatch && clock.localTime < targetTime) {
        return;
      }

      const wantEmail = pref.daily_enabled && hasResend;
      const wantWhatsApp = Boolean(
        pref.whatsapp_daily_enabled &&
        pref.whatsapp_phone &&
        pref.whatsapp_phone_verified
      ) && hasWhatsApp;

      // Do not claim or mark SENT if neither configured provider can actually deliver
      if (!wantEmail && !wantWhatsApp) {
        return;
      }

      // Atomically claim today's idempotency slot in email_logs
      const slot = await claimEmailLogSlot(adminClient, userId, "DAILY", clock.localDate);
      if (!slot) {
        return; // Already sent or in progress for today
      }

      try {
        const { data: authUser } = await adminClient.auth.admin.getUserById(userId);
        const recipientEmail = authUser?.user?.email;
        const displayName = profile?.display_name || recipientEmail?.split("@")[0] || "Friend";

        // Fetch live weather BEFORE selecting the outfit so temperature/rain guide candidate selection
        const weather = await getLiveWeather(profile?.location || "Ilorin");
        const weatherSummary = weather ? `${weather.city}: ${weather.temperatureC}°C · ${weather.condition}` : null;

        // Check if user has an outfit planned for their local date in outfit_plans
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
          .eq("planned_for", clock.localDate)
          .maybeSingle();

        let outfitName = "Effortless Everyday Look";
        let occasion = "Casual & Everyday";
        let styleDescription = "A clean, balanced ensemble put together from your ready-to-wear pieces.";
        let explanation = "Color harmony and balanced silhouette ensure effortless confidence.";
        let stylingTip = "Wear with your favorite minimalist accessories.";
        let items: Array<{ name: string; category: string; colour?: string | null; image_path?: string | null }> = [];
        let outfitId: string | undefined = plannedRow?.outfit_id;

        if (plannedRow?.outfits) {
          const o = plannedRow.outfits as unknown as {
            name?: string;
            occasion?: string | null;
            style_description?: string | null;
            explanation?: string | null;
            styling_tip?: string | null;
            outfit_items?: Array<{
              position: number;
              wardrobe_items?: {
                name?: string;
                category?: string;
                primary_colour?: string | null;
                image_path?: string | null;
              } | null;
            }>;
          };
          outfitName = o.name || outfitName;
          occasion = (o.occasion && OCCASION_LABELS[o.occasion]) || o.occasion || occasion;
          styleDescription = o.style_description || styleDescription;
          explanation = o.explanation || explanation;
          stylingTip = o.styling_tip || stylingTip;
          items = (o.outfit_items ?? [])
            .slice()
            .sort((a, b) => a.position - b.position)
            .map((i) => ({
              name: i.wardrobe_items?.name || "Garment",
              category: i.wardrobe_items?.category || "Piece",
              colour: i.wardrobe_items?.primary_colour,
              image_path: i.wardrobe_items?.image_path,
            }));
        } else {
          // Use the full fashion intelligence pipeline with the user's saved styles, occasions, colours, weather, and recent history
          const allUserItems = await listAllWardrobeItems(adminClient, userId, 200).catch((err) => {
            logger.warn("cron.daily_outfit_load_items_failed", { userId, error: err });
            return null;
          });

          if (!allUserItems || allUserItems.length === 0) {
            await finalizeEmailLogSlot(adminClient, slot.logId, {
              status: "SKIPPED",
              reason: "No wardrobe items available.",
            });
            return;
          }

          const preferredStyles = normalizeStringArray(profile?.preferred_style);
          const commonOccasions = normalizeStringArray(profile?.common_occasions);
          const favouriteColours = normalizeStringArray(profile?.favourite_colours);
          const allowRewear = profile?.rewear_worn_items ?? false;

          const { targetStyle, targetOccasion } = selectDailyOccasionAndStyle(
            clock.localDate,
            preferredStyles,
            commonOccasions,
          );

          // Load recently planned outfits (last 7 days) and user feedback to avoid repeating combos
          const recentComboKeys = new Set<string>();
          const rejectedComboKeys = new Set<string>();
          const likedItemIds = new Set<string>();
          const dislikedItemIds = new Set<string>();

          const [recentPlansRes, recentFeedbackRes] = await Promise.all([
            adminClient
              .from("outfit_plans")
              .select("outfits ( outfit_items ( item_id ) )")
              .eq("user_id", userId)
              .order("planned_for", { ascending: false })
              .limit(10),
            adminClient
              .from("outfit_feedback")
              .select("action, rating, outfits ( outfit_items ( item_id ) )")
              .eq("user_id", userId)
              .order("created_at", { ascending: false })
              .limit(20),
          ]);

          for (const row of recentPlansRes.data ?? []) {
            const o = row.outfits as unknown as { outfit_items?: Array<{ item_id: string }> } | null;
            const ids = (o?.outfit_items ?? []).map((x) => x.item_id);
            if (ids.length > 0) recentComboKeys.add([...ids].sort().join("|"));
          }

          for (const row of recentFeedbackRes.data ?? []) {
            const o = row.outfits as unknown as { outfit_items?: Array<{ item_id: string }> } | null;
            const ids = (o?.outfit_items ?? []).map((x) => x.item_id);
            if (row.action === "LIKED" || (row.action === "RATED" && (row.rating ?? 0) >= 4)) {
              for (const id of ids) likedItemIds.add(id);
            } else if (row.action === "REJECTED" || (row.action === "RATED" && (row.rating ?? 5) <= 2)) {
              for (const id of ids) dislikedItemIds.add(id);
              if (ids.length > 0) rejectedComboKeys.add([...ids].sort().join("|"));
            }
          }

          const promptParts = [
            targetStyle ? `${targetStyle.replace(/_/g, " ")} outfit` : "Everyday outfit",
            targetOccasion ? `for ${targetOccasion.replace(/_/g, " ")}` : null,
            favouriteColours.length > 0 ? `preferring ${favouriteColours.slice(0, 3).join(", ")}` : null,
            "do not repeat recent outfits",
          ].filter(Boolean);
          const dailyPrompt = promptParts.join(" ");

          const byId = new Map<string, WardrobeItem>(allUserItems.map((i) => [i.id, i]));

          const runDaily = (rewear: boolean, allowRepeatFallback = false) =>
            runStylingPipeline({
              allItems: allUserItems,
              prompt: allowRepeatFallback ? dailyPrompt.replace("do not repeat recent outfits", "") : dailyPrompt,
              occasion: targetOccasion,
              weatherSummary,
              allowRewearWorn: rewear,
              feedback: {
                recentComboKeys: allowRepeatFallback ? undefined : recentComboKeys,
                rejectedComboKeys,
                likedItemIds,
                dislikedItemIds,
                userPreferredStyles: preferredStyles,
              },
              limit: 3,
            });

          // 1. Run with user's rewear preference and non-repetition constraint
          let result = runDaily(allowRewear, false);

          // 2. If all clean combinations were recently sent, relax repetition before relaxing laundry status
          if (result.outfits.length === 0 && recentComboKeys.size > 0) {
            result = runDaily(allowRewear, true);
          }

          // 3. If still no outfits and rewear was off, try with allowRewearWorn: true
          if (result.outfits.length === 0 && !allowRewear) {
            result = runDaily(true, false);
            if (result.outfits.length === 0 && recentComboKeys.size > 0) {
              result = runDaily(true, true);
            }
          }

          if (result.outfits.length === 0) {
            await finalizeEmailLogSlot(adminClient, slot.logId, {
              status: "SKIPPED",
              reason:
                result.fallback?.message ||
                "Insufficient wardrobe items to assemble a complete outfit (requires top + bottom, or a dress).",
            });
            return;
          }

          const best = result.outfits[0];
          const chosenItems = best.itemIds
            .map((id) => byId.get(id))
            .filter((i): i is WardrobeItem => Boolean(i));

          const resolvedOccasion = best.occasion || targetOccasion || "everyday";
          outfitName = best.name;
          occasion = OCCASION_LABELS[resolvedOccasion] || resolvedOccasion;
          styleDescription = best.styleDescription || (targetStyle ? `${targetStyle.replace(/_/g, " ")} ensemble` : styleDescription);
          explanation = best.explanation || best.factExplanation || explanation;
          stylingTip = best.stylingTip || stylingTip;
          items = chosenItems.map((i) => ({
            name: i.name,
            category: i.category,
            colour: i.primaryColour,
            image_path: i.imagePath,
          }));

          // Persist the generated outfit so the user can see and wear it in their calendar
          try {
            const { data: newOutfit } = await adminClient
              .from("outfits")
              .insert({
                user_id: userId,
                name: outfitName,
                occasion: resolvedOccasion,
                style_description: styleDescription,
                explanation,
                styling_tip: stylingTip,
                source: "AI",
              })
              .select("id")
              .maybeSingle();

            if (newOutfit?.id) {
              outfitId = newOutfit.id;
              await adminClient.from("outfit_items").insert(
                chosenItems.map((item, idx) => ({
                  outfit_id: newOutfit.id,
                  item_id: item.id,
                  user_id: userId,
                  position: idx,
                }))
              );
              await adminClient.from("outfit_plans").insert({
                user_id: userId,
                outfit_id: newOutfit.id,
                planned_for: clock.localDate,
                status: "PLANNED",
              });
            }
          } catch (err) {
            logger.warn("cron.daily_outfit_persist_failed", { userId, error: err });
          }
        }

        // Pre-sign image URLs for Email thumbnails and WhatsApp (7 days expiry for email clients)
        const emailItems: Array<{
          name: string;
          category: string;
          colour?: string | null;
          imageUrl?: string | null;
        }> = [];
        const signedUrls: string[] = [];

        for (const itm of items) {
          let signedUrl: string | null = null;
          if (itm.image_path) {
            try {
              const { data: signed } = await adminClient.storage
                .from("wardrobe")
                .createSignedUrl(itm.image_path, 60 * 60 * 24 * 7);
              signedUrl = signed?.signedUrl ?? null;
              if (signedUrl) signedUrls.push(signedUrl);
            } catch {
              signedUrl = null;
            }
          }
          emailItems.push({
            name: itm.name,
            category: itm.category,
            colour: itm.colour,
            imageUrl: signedUrl,
          });
        }

        let emailSent = false;
        let waSent = false;
        let providerMessageId: string | undefined;
        const errors: string[] = [];

        // 1. Dispatch Email (if enabled, email exists, and Resend is configured)
        if (wantEmail && recipientEmail) {
          const html = renderDailyOutfitHtml({
            displayName,
            outfitName,
            occasion,
            styleDescription,
            explanation,
            stylingTip,
            items: emailItems,
            weatherSummary,
            unsubscribeToken: pref.unsubscribe_token,
            date: clock.localDate,
            outfitId,
          });

          const sendResult = await sendEmail({
            to: recipientEmail,
            subject: `Your Look for Today: ${outfitName} · ClosetAI`,
            html,
          });

          if (sendResult.success) {
            emailSent = true;
            providerMessageId = sendResult.id;
          } else if (sendResult.error) {
            errors.push(`email: ${sendResult.error}`);
          }
        }

        // 2. Dispatch WhatsApp (if enabled, phone exists, and WhatsApp provider is configured)
        if (wantWhatsApp && pref.whatsapp_phone) {
          const waMessage = formatDailyOutfitWhatsApp({
            displayName,
            outfitName,
            occasion,
            styleDescription,
            stylingTip,
            weatherSummary: weatherSummary || undefined,
            items,
            appUrl,
          });

          // Check if within 24-hour window
          const within24h = isWithin24HourWindow(pref.whatsapp_last_inbound_at || null);

          let waRes: { success: boolean; id?: string; error?: string };

          if (within24h) {
            // Within 24h window - can send regular message with images
            waRes = await sendWhatsAppMessage({
              to: pref.whatsapp_phone,
              message: waMessage,
              imageUrls: signedUrls,
              userId: userId,
            });
          } else {
            // Outside 24h window - must use approved template
            waRes = await sendTemplateMessage(
              pref.whatsapp_phone,
              WHATSAPP_TEMPLATES.DAILY_OUTFIT,
              {
                userName: displayName,
                weatherDescription: weatherSummary || "perfect weather for dressing up",
              }
            );
          }

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
          lastError: userErr instanceof Error ? userErr.message : "Unexpected dispatch error",
        });
      }
    };

    // Process users in bounded batches to stay within serverless execution limits
    for (let i = 0; i < eligiblePrefs.length; i += CONCURRENCY_LIMIT) {
      const batch = eligiblePrefs.slice(i, i + CONCURRENCY_LIMIT);
      await Promise.allSettled(batch.map(processUser));
    }

    logger.info("cron.daily_outfit_complete", { dispatchedCount });
    return NextResponse.json({ ok: true, dispatchedCount });
  } catch (err) {
    logger.error("cron.daily_outfit_error", { err });
    return NextResponse.json({ error: "Failed to run daily outfit cron job." }, { status: 500 });
  }
}

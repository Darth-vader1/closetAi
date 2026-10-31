import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { takeAiQuota } from "@/lib/ai/rate-limit";
import { getAiProvider } from "@/lib/ai/service";
import { generateStylistRecommendations } from "@/lib/ai/stylist";
import { getProfile, getSessionUser } from "@/lib/auth/session";
import { assertActiveSubscription, checkUsageLimit, consumeUsage } from "@/lib/billing/entitlements";
import { isSameOrigin } from "@/lib/security/origin";
import { createClient } from "@/lib/supabase/server";
import { signImageUrls, type WardrobeItem } from "@/lib/wardrobe/queries";
import { logger } from "@/lib/logger";

const requestSchema = z.object({
  prompt: z.string().trim().min(1, "Please provide styling instructions or a vibe.").max(1000),
  occasion: z.string().trim().max(120).optional(),
  weather: z.string().trim().max(500).optional(),
  bodyBuild: z.enum(["tailored", "hourglass", "pear", "apple", "rectangle", "inverted_triangle", "athletic", "curvy", "tall_slender"]).optional(),
  anchorItemIds: z.array(z.string().uuid()).max(6).optional(),
  excludeItemIds: z.array(z.string().uuid()).max(20).optional(),
});

const json = (body: Record<string, unknown>, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request.headers)) {
    return json({ error: "Cross-site requests aren't allowed." }, 403);
  }

  try {
    const user = await getSessionUser();
    if (!user) return json({ error: "Please sign in again." }, 401);

    const subCheck = await assertActiveSubscription(user.id);
    if (!subCheck.active) {
      return json({ error: subCheck.error, subscriptionRequired: true }, 403);
    }

    const body = await request.json().catch(() => null);
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return json({ error: parsed.error.issues[0]?.message || "Invalid styling request." }, 400);
    }

    const availability = getAiProvider();
    if (!availability.available) {
      return json({ status: "unavailable", reason: availability.reason });
    }

    // Check freemium / premium recommendation limits
    const usage = await checkUsageLimit(user.id, "outfit_recommendations");
    if (!usage.allowed) {
      return json(
        {
          error:
            usage.message ||
            "You have reached your outfit recommendation limit. Upgrade to Premium for 100 recommendations per month.",
          upgradeRequired: true,
          remaining: 0,
          limit: usage.limit,
          resetsAt: usage.resetsAt,
        },
        403
      );
    }

    const supabase = await createClient();
    const profile = await getProfile();

    // Check rate limit quota
    const quota = await takeAiQuota(supabase, user.id, "STYLE_OUTFITS");
    if (!quota.allowed) {
      return json({ error: "You have reached your styling limit for this hour. Please try again later." }, 429);
    }

    // Fetch all user's wardrobe items (up to 200 items, not just first page of 24)
    const { data: itemRows, error: itemsErr } = await supabase
      .from("wardrobe_items")
      .select("id, name, category, subcategory, primary_colour, secondary_colours, pattern, material, style, occasions, seasons, warmth_level, image_path, status, care_type, is_favourite, ai_analysed, wear_count, last_worn_at, last_washed_at, created_at")
      .eq("user_id", user.id)
      .limit(200);

    if (itemsErr) {
      logger.error("stylist.fetch_items_failed", { userId: user.id, error: itemsErr });
      return json({ error: "Could not load your wardrobe items." }, 500);
    }

    const allItems: WardrobeItem[] = (itemRows ?? []).map((row) => ({
      id: row.id,
      name: row.name,
      category: row.category,
      subcategory: row.subcategory,
      primaryColour: row.primary_colour,
      secondaryColours: row.secondary_colours ?? [],
      pattern: row.pattern,
      material: row.material,
      style: row.style,
      occasions: row.occasions ?? [],
      seasons: row.seasons ?? [],
      warmthLevel: row.warmth_level,
      status: row.status as WardrobeItem["status"],
      careType: (row.care_type === "WASHABLE" || row.care_type === "WIPE_CLEAN" || row.care_type === "NO_WASH") 
        ? row.care_type 
        : "WASHABLE",
      isFavourite: row.is_favourite,
      aiAnalysed: row.ai_analysed,
      wearCount: row.wear_count,
      lastWornAt: row.last_worn_at,
      lastWashedAt: row.last_washed_at,
      createdAt: row.created_at,
      imagePath: row.image_path,
    }));

    // Allow re-wearing WORN items if user enables it in profile (or if requested in prompt)
    const allowRewear = profile?.rewear_worn_items ?? false;
    
    // Check if garment was worn in the last 24 hours
    const now = Date.now();
    const cleanItems = allItems.filter((item) => {
      // Must be eligible (CLEAN, or WORN if rewear enabled)
      if (item.status !== "CLEAN" && (item.status !== "WORN" || !allowRewear)) {
        return false;
      }

      // If item was worn in the past 24 hours and user didn't explicitly say "wear again" or "repeat",
      // give it a breathing rest so the user doesn't get suggested yesterday's clothes
      if (item.lastWornAt) {
        const hoursSinceWorn = (now - new Date(item.lastWornAt).getTime()) / (1000 * 60 * 60);
        const promptMentionsRepeat = /repeat|rewear|wear again|yesterday/i.test(parsed.data.prompt);
        if (hoursSinceWorn < 24 && !promptMentionsRepeat) {
          return false;
        }
      }

      return true;
    });

    if (cleanItems.length < 2) {
      return json(
        {
          error:
            "You need at least 2 clean wardrobe items for the stylist to create an outfit. Add or mark clothes as clean first!",
        },
        400,
      );
    }

    // Build inventory catalog for AI
    const inventory = cleanItems.map((item) => ({
      id: item.id,
      name: item.name,
      category: item.category,
      subcategory: item.subcategory,
      primaryColour: item.primaryColour,
      secondaryColours: item.secondaryColours,
      pattern: item.pattern,
      material: item.material,
      style: item.style,
      occasions: item.occasions,
      warmthLevel: item.warmthLevel,
    }));

    const baseStylePreferences = Array.isArray(profile?.preferred_style)
      ? [...profile.preferred_style]
      : typeof profile?.preferred_style === "string"
      ? [profile.preferred_style]
      : [];
    const stylePreferences = [...baseStylePreferences];

    // Continuous learning: gather liked/top-rated and rejected outfits from outfit_feedback
    const { data: recentFeedback } = await supabase
      .from("outfit_feedback")
      .select("action, rating, outfit_id, outfits ( name, style_description, outfit_items ( item_id ) )")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);

    const likedItemIds = new Set<string>();
    const dislikedItemIds = new Set<string>();
    const rejectedComboKeys = new Set<string>();

    if (recentFeedback && recentFeedback.length > 0) {
      const topRatedLabels: string[] = [];
      for (const row of recentFeedback) {
        const o = row.outfits as unknown as {
          name?: string;
          style_description?: string | null;
          outfit_items?: Array<{ item_id: string }>;
        } | null;
        const itemIds = (o?.outfit_items ?? []).map((x) => x.item_id);
        if (row.action === "LIKED" || (row.action === "RATED" && (row.rating ?? 0) >= 4)) {
          for (const id of itemIds) likedItemIds.add(id);
          if (o?.name && topRatedLabels.length < 3) {
            topRatedLabels.push(`${o.name} (${o.style_description || "favorite silhouette"})`);
          }
        } else if (row.action === "REJECTED" || (row.action === "RATED" && (row.rating ?? 5) <= 2)) {
          for (const id of itemIds) dislikedItemIds.add(id);
          if (itemIds.length > 0) rejectedComboKeys.add([...itemIds].sort().join("|"));
        }
      }
      if (topRatedLabels.length > 0) {
        stylePreferences.push(`Favorite looks user previously rated highly: ${topRatedLabels.join("; ")}`);
      }
    }

    const result = await generateStylistRecommendations(
      {
        userPrompt: parsed.data.prompt,
        occasion: parsed.data.occasion,
        weather: parsed.data.weather,
        bodyBuild: parsed.data.bodyBuild,
        stylePreferences,
        allowRewearWorn: allowRewear,
        anchorItemIds: parsed.data.anchorItemIds,
        excludeItemIds: parsed.data.excludeItemIds,
        wardrobeItems: allItems,
        feedback: {
          likedItemIds,
          dislikedItemIds,
          rejectedComboKeys,
          userPreferredStyles: baseStylePreferences,
          bodyBuild: parsed.data.bodyBuild,
        },
        inventory,
      },
      { provider: availability.provider, signal: request.signal },
    );

    if (result.status !== "ok") {
      return json(result);
    }

    // Only consume recommendation usage upon verified successful completion
    await consumeUsage(user.id, "outfit_recommendations");

    // Map item IDs back to full wardrobe items with signed image URLs
    const itemMap = new Map<string, WardrobeItem>(cleanItems.map((i) => [i.id, i]));
    const neededImagePaths = new Set<string>();

    for (const outfit of result.data.outfits) {
      for (const id of outfit.item_ids) {
        const item = itemMap.get(id);
        if (item) neededImagePaths.add(item.imagePath);
      }
    }

    const signedUrls = await signImageUrls(supabase, Array.from(neededImagePaths));
    const imageUrlsObj: Record<string, string> = {};
    for (const [path, url] of signedUrls.entries()) {
      imageUrlsObj[path] = url;
    }

    const populatedOutfits = result.data.outfits.map((o) => {
      const items = o.item_ids
        .map((id) => itemMap.get(id))
        .filter((item): item is WardrobeItem => Boolean(item));

      return {
        name: o.name,
        occasion: o.occasion,
        styleDescription: o.style_description,
        explanation: o.explanation,
        stylingTip: o.styling_tip,
        missingPieces: o.missing_pieces || [],
        items,
      };
    });

    return json({
      status: "ok",
      outfits: populatedOutfits,
      overallAdvice: result.data.overall_advice,
      wardrobeGaps: result.data.wardrobe_gaps || [],
      imageUrls: imageUrlsObj,
      provider: result.provider,
    });
  } catch (err) {
    console.error("Stylist API Error:", err);
    return json({ error: "Something went wrong while styling your outfits." }, 500);
  }
}

import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { takeAiQuota } from "@/lib/ai/rate-limit";
import { getAiProvider } from "@/lib/ai/service";
import { generateStylistRecommendations } from "@/lib/ai/stylist";
import { getProfile, getSessionUser } from "@/lib/auth/session";
import { isSameOrigin } from "@/lib/security/origin";
import { createClient } from "@/lib/supabase/server";
import { isEligibleStatus } from "@/lib/wardrobe/status";
import { listWardrobeItems, signImageUrls, type WardrobeItem } from "@/lib/wardrobe/queries";

const requestSchema = z.object({
  prompt: z.string().trim().min(1, "Please provide styling instructions or a vibe.").max(300),
  occasion: z.string().trim().max(60).optional(),
  weather: z.string().trim().max(100).optional(),
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

    const body = await request.json().catch(() => null);
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return json({ error: parsed.error.issues[0]?.message || "Invalid styling request." }, 400);
    }

    const availability = getAiProvider();
    if (!availability.available) {
      return json({ status: "unavailable", reason: availability.reason });
    }

    const supabase = await createClient();
    const profile = await getProfile();

    // Check rate limit quota
    const quota = await takeAiQuota(supabase, user.id, "STYLE_OUTFITS");
    if (!quota.allowed) {
      return json({ error: "You have reached your styling limit for this hour. Please try again later." }, 429);
    }

    // Fetch user's wardrobe items
    const { items: allItems } = await listWardrobeItems(supabase, user.id, {
      q: "",
      category: null,
      colour: null,
      status: null,
      favouritesOnly: false,
      sort: "newest",
      page: 1,
    });

    const allowRewear = profile?.rewear_worn_items ?? false;
    const cleanItems = allItems.filter((item) => isEligibleStatus(item.status, allowRewear));

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

    const result = await generateStylistRecommendations(
      {
        userPrompt: parsed.data.prompt,
        occasion: parsed.data.occasion,
        weather: parsed.data.weather,
        stylePreferences: profile?.style_preferences ?? [],
        inventory,
      },
      { provider: availability.provider, signal: request.signal },
    );

    if (result.status !== "ok") {
      return json(result);
    }

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
        items,
      };
    });

    return json({
      status: "ok",
      outfits: populatedOutfits,
      overallAdvice: result.data.overall_advice,
      imageUrls: imageUrlsObj,
      provider: result.provider,
    });
  } catch (err) {
    console.error("Stylist API Error:", err);
    return json({ error: "Something went wrong while styling your outfits." }, 500);
  }
}

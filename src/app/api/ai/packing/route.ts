import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getAiProvider } from "@/lib/ai/service";
import { getProfile, getSessionUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { signImageUrls, type WardrobeItem } from "@/lib/wardrobe/queries";
import { getLiveWeather } from "@/lib/weather/service";
import { logger } from "@/lib/logger";

const requestSchema = z.object({
  destination: z.string().trim().min(1, "Please provide a destination city or country.").max(80),
  days: z.number().int().min(2, "Trips must be at least 2 days.").max(14, "Packing capsules support up to 14 days."),
  tripType: z.string().trim().max(80).default("Vacation & Sightseeing"),
});

export async function POST(request: NextRequest) {
  try {
    const user = await getSessionUser();
    if (!user) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });

    const body = await request.json().catch(() => null);
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.issues[0]?.message || "Invalid trip details." }, { status: 400 });
    }

    const { destination, days, tripType } = parsed.data;
    const availability = getAiProvider();
    if (!availability.available) {
      return NextResponse.json({ error: "AI service is unavailable." }, { status: 503 });
    }

    const supabase = await createClient();
    const profile = await getProfile();

    // 1. Fetch live weather for destination
    const weather = await getLiveWeather(destination);

    // 2. Fetch clean wardrobe items
    const { data: itemRows, error: itemsErr } = await supabase
      .from("wardrobe_items")
      .select("id, name, category, subcategory, primary_colour, secondary_colours, pattern, material, style, occasions, seasons, warmth_level, image_path, status, wear_count, last_worn_at, created_at")
      .eq("user_id", user.id)
      .in("status", profile?.rewear_worn_items ? ["CLEAN", "WORN"] : ["CLEAN"])
      .limit(150);

    if (itemsErr || !itemRows || itemRows.length < 4) {
      return NextResponse.json(
        { error: "You need at least 4 clean wardrobe items to generate a travel packing capsule." },
        { status: 400 },
      );
    }

    const inventory = itemRows.map((r) => ({
      id: r.id,
      name: r.name,
      category: r.category,
      colour: r.primary_colour,
      material: r.material,
      style: r.style,
      warmthLevel: r.warmth_level,
    }));

    const weatherPrompt = weather
      ? `Forecast for ${weather.city}: ${weather.temperatureC}°C, ${weather.condition}. (${weather.summary})`
      : `Destination: ${destination}`;

    const systemPrompt = `You are an elite travel stylist and capsule wardrobe specialist.
Your goal is to build an interchangeable, carry-on travel capsule from the user's wardrobe for a ${days}-day trip to ${destination}.

Trip Vibe: ${tripType}
Weather Context: ${weatherPrompt}

Strict Rules:
1. Select a compact capsule of 6 to 12 items (tops, bottoms, layers, shoes) that can be mixed and matched.
2. Every item ID must strictly exist in the provided inventory.
3. Plan distinct outfit combinations for every day of the trip (Days 1 to ${days}).
4. Re-wear versatile items (like jackets, pants, or shoes) across multiple days like a seasoned traveler.
5. Provide actionable packing tips (wrinkle management, layering, comfort).

Return strictly JSON matching this structure:
{
  "capsule_item_ids": ["uuid1", "uuid2", ...],
  "capsule_rationale": "High-level strategy for this packing list",
  "daily_itinerary": [
    {
      "day": 1,
      "title": "Day 1: Travel & Arrival Casual",
      "item_ids": ["uuid1", "uuid2"],
      "styling_tip": "Wear your bulkiest jacket and comfortable sneakers during transit."
    }
  ],
  "packing_tips": ["Tip 1", "Tip 2", "Tip 3"]
}`;

    const userPrompt = `Build my carry-on capsule for a ${days}-day trip to ${destination}.
Wardrobe Inventory:
${JSON.stringify(inventory, null, 2)}`;

    const raw = await availability.provider.generateJson({
      task: "travel_packing_capsule",
      kind: "text",
      system: systemPrompt,
      prompt: userPrompt,
      jsonSchema: {
        type: "object",
        properties: {
          capsule_item_ids: { type: "array", items: { type: "string" } },
          capsule_rationale: { type: "string" },
          daily_itinerary: {
            type: "array",
            items: {
              type: "object",
              properties: {
                day: { type: "number" },
                title: { type: "string" },
                item_ids: { type: "array", items: { type: "string" } },
                styling_tip: { type: "string" },
              },
              required: ["day", "title", "item_ids", "styling_tip"],
            },
          },
          packing_tips: { type: "array", items: { type: "string" } },
        },
        required: ["capsule_item_ids", "capsule_rationale", "daily_itinerary", "packing_tips"],
      },
      signal: request.signal,
    });

    // Map items and sign URLs
    const itemMap = new Map(itemRows.map((i) => [i.id, i]));
    const capsuleItems = ((raw as any)?.capsule_item_ids ?? [])
      .map((id: string) => itemMap.get(id))
      .filter(Boolean);

    const neededPaths = Array.from(new Set(capsuleItems.map((i: any) => i.image_path).filter(Boolean))) as string[];
    const signedMap = await signImageUrls(supabase, neededPaths);

    const imageUrlsObj: Record<string, string> = {};
    for (const [path, url] of signedMap.entries()) {
      imageUrlsObj[path] = url;
    }

    return NextResponse.json({
      destination,
      days,
      weather,
      capsuleItems,
      capsuleRationale: (raw as any)?.capsule_rationale,
      dailyItinerary: (raw as any)?.daily_itinerary ?? [],
      packingTips: (raw as any)?.packing_tips ?? [],
      imageUrls: imageUrlsObj,
    });
  } catch (err) {
    logger.error("packing.generate_failed", { err });
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Could not generate travel packing capsule." },
      { status: 500 },
    );
  }
}

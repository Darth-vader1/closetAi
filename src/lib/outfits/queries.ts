import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { signImageUrls, type WardrobeItem } from "@/lib/wardrobe/queries";
import { isLaundryStatus } from "@/lib/wardrobe/status";

export interface OutfitWithItems {
  id: string;
  userId: string;
  name: string;
  occasion: string | null;
  styleDescription: string | null;
  explanation: string | null;
  stylingTip: string | null;
  photoPath: string | null;
  source: "MANUAL" | "ENGINE" | "AI";
  isFavourite: boolean;
  createdAt: string;
  items: WardrobeItem[];
}

interface RawOutfitRow {
  id: string;
  user_id: string;
  name: string;
  occasion: string | null;
  style_description: string | null;
  explanation: string | null;
  styling_tip: string | null;
  photo_path?: string | null;
  source: "MANUAL" | "ENGINE" | "AI";
  is_favourite: boolean;
  created_at: string;
  outfit_items: Array<{
    position: number;
    wardrobe_items: {
      id: string;
      name: string;
      category: string;
      subcategory: string | null;
      primary_colour: string | null;
      secondary_colours: string[] | null;
      pattern: string | null;
      material: string | null;
      style: string | null;
      occasions: string[] | null;
      seasons: string[] | null;
      warmth_level: number | null;
      image_path: string;
      status: string;
      is_favourite: boolean;
      ai_analysed: boolean;
      wear_count: number;
      last_worn_at: string | null;
      last_washed_at: string | null;
      created_at: string;
    };
  }>;
}

export async function listUserOutfits(
  supabase: SupabaseClient,
  userId: string,
): Promise<OutfitWithItems[]> {
  const { data, error } = await supabase
    .from("outfits")
    .select(`
      id, user_id, name, occasion, style_description, explanation, styling_tip, photo_path, source, is_favourite, created_at,
      outfit_items (
        position,
        wardrobe_items (
          id, name, category, subcategory, primary_colour, secondary_colours,
          pattern, material, style, occasions, seasons, warmth_level,
          image_path, status, is_favourite, ai_analysed, wear_count,
          last_worn_at, last_washed_at, created_at
        )
      )
    `)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Could not load outfits: ${error.message}`);

  return ((data ?? []) as unknown as RawOutfitRow[]).map((row) => ({
    id: row.id,
    userId: row.user_id,
    name: row.name,
    occasion: row.occasion,
    styleDescription: row.style_description,
    explanation: row.explanation,
    stylingTip: row.styling_tip,
    photoPath: row.photo_path ?? null,
    source: row.source,
    isFavourite: row.is_favourite,
    createdAt: row.created_at,
    items: (row.outfit_items ?? [])
      .sort((a, b) => a.position - b.position)
      .map((link) => {
        const item = link.wardrobe_items;
        return {
          id: item.id,
          name: item.name,
          category: item.category,
          subcategory: item.subcategory,
          primaryColour: item.primary_colour,
          secondaryColours: item.secondary_colours ?? [],
          pattern: item.pattern,
          material: item.material,
          style: item.style,
          occasions: item.occasions ?? [],
          seasons: item.seasons ?? [],
          warmthLevel: item.warmth_level,
          imagePath: item.image_path,
          status: isLaundryStatus(item.status) ? item.status : "UNAVAILABLE",
          isFavourite: item.is_favourite,
          aiAnalysed: item.ai_analysed,
          wearCount: item.wear_count,
          lastWornAt: item.last_worn_at,
          lastWashedAt: item.last_washed_at,
          createdAt: item.created_at,
        };
      }),
  }));
}

export interface PlannedOutfitRow {
  id: string;
  userId: string;
  outfitId: string;
  plannedFor: string;
  status: "PLANNED" | "WORN" | "SKIPPED";
  outfit: OutfitWithItems;
}

export interface OutfitHistoryRow {
  id: string;
  outfitId: string | null;
  wornOn: string;
  wornAt: string;
  outfit?: OutfitWithItems | null;
}

export async function listOutfitPlans(
  supabase: SupabaseClient,
  userId: string,
  from?: string,
  to?: string,
): Promise<PlannedOutfitRow[]> {
  let q = supabase
    .from("outfit_plans")
    .select(`
      id, user_id, outfit_id, planned_for, status,
      outfits (
        id, user_id, name, occasion, style_description, explanation, styling_tip, photo_path, source, is_favourite, created_at,
        outfit_items (
          position,
          wardrobe_items (
            id, name, category, subcategory, primary_colour, secondary_colours,
            pattern, material, style, occasions, seasons, warmth_level,
            image_path, status, is_favourite, ai_analysed, wear_count,
            last_worn_at, last_washed_at, created_at
          )
        )
      )
    `)
    .eq("user_id", userId)
    .order("planned_for", { ascending: true });

  if (from) q = q.gte("planned_for", from);
  if (to) q = q.lte("planned_for", to);

  const { data, error } = await q;
  if (error || !data) return [];

  return data.map((row: any) => {
    const o = row.outfits;
    const items = (o?.outfit_items ?? [])
      .sort((a: any, b: any) => a.position - b.position)
      .map((l: any) => {
        const item = l.wardrobe_items;
        return {
          id: item.id,
          name: item.name,
          category: item.category,
          subcategory: item.subcategory,
          primaryColour: item.primary_colour,
          secondaryColours: item.secondary_colours ?? [],
          pattern: item.pattern,
          material: item.material,
          style: item.style,
          occasions: item.occasions ?? [],
          seasons: item.seasons ?? [],
          warmthLevel: item.warmth_level,
          imagePath: item.image_path,
          status: isLaundryStatus(item.status) ? item.status : "UNAVAILABLE",
          isFavourite: item.is_favourite,
          aiAnalysed: item.ai_analysed,
          wearCount: item.wear_count,
          lastWornAt: item.last_worn_at,
          lastWashedAt: item.last_washed_at,
          createdAt: item.created_at,
        };
      });

    return {
      id: row.id,
      userId: row.user_id,
      outfitId: row.outfit_id,
      plannedFor: row.planned_for,
      status: row.status,
      outfit: {
        id: o?.id ?? row.outfit_id,
        userId: o?.user_id ?? row.user_id,
        name: o?.name ?? "Saved Outfit",
        occasion: o?.occasion ?? null,
        styleDescription: o?.style_description ?? null,
        explanation: o?.explanation ?? null,
        stylingTip: o?.styling_tip ?? null,
        photoPath: o?.photo_path ?? null,
        source: o?.source ?? "MANUAL",
        isFavourite: o?.is_favourite ?? false,
        createdAt: o?.created_at ?? "",
        items,
      },
    };
  });
}

export async function signAllOutfitImages(
  supabase: SupabaseClient,
  outfits: OutfitWithItems[],
): Promise<Map<string, string>> {
  const paths: string[] = [];
  for (const o of outfits) {
    if (o.photoPath) paths.push(o.photoPath);
    for (const item of o.items) {
      if (item.imagePath) paths.push(item.imagePath);
    }
  }
  return signImageUrls(supabase, [...new Set(paths)]);
}

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { signImageUrls, type WardrobeItem } from "@/lib/wardrobe/queries";
import type {
  FlatlayComposition,
  FlatlayCompositionWithUrls,
  FlatlayItem,
} from "./types";

interface FlatlayCompositionRow {
  id: string;
  user_id: string;
  name: string;
  preset: string;
  aspect_ratio: string;
  canvas_width: number;
  canvas_height: number;
  background_color: string;
  background_style: string;
  items: FlatlayItem[];
  thumbnail_path: string | null;
  outfit_id: string | null;
  created_at: string;
  updated_at: string;
}

export async function listFlatlayCompositions(
  supabase: SupabaseClient,
  userId: string,
): Promise<FlatlayComposition[]> {
  const { data, error } = await supabase
    .from("flatlay_compositions")
    .select("*")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false });

  if (error) {
    if (
      error.code === "42P01" ||
      error.code === "PGRST204" ||
      error.code === "PGRST200" ||
      error.message?.includes("does not exist") ||
      error.message?.includes("schema cache")
    ) {
      console.warn(
        "[Flatlay Studio] flatlay_compositions table not found in database. Run migration 20261021000001_flatlay_compositions.sql to enable persistence.",
      );
      return [];
    }
    console.error("Error listing flatlay compositions:", error.message || error);
    return [];
  }

  return ((data ?? []) as FlatlayCompositionRow[]).map(mapRowToComposition);
}

export async function getFlatlayComposition(
  supabase: SupabaseClient,
  userId: string,
  id: string,
): Promise<FlatlayCompositionWithUrls | null> {
  const { data, error } = await supabase
    .from("flatlay_compositions")
    .select("*")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (error || !data) {
    if (error) {
      if (
        error.code === "42P01" ||
        error.code === "PGRST204" ||
        error.code === "PGRST200" ||
        error.message?.includes("does not exist") ||
        error.message?.includes("schema cache")
      ) {
        return null;
      }
      console.error("Error fetching flatlay composition:", error.message || error);
    }
    return null;
  }

  const composition = mapRowToComposition(data as FlatlayCompositionRow);

  // Collect needed wardrobe item IDs and image paths
  const itemPaths: string[] = [];
  const wardrobeItemIds: string[] = [];

  for (const item of composition.items) {
    if (item.imagePath) itemPaths.push(item.imagePath);
    if (item.wardrobeItemId) wardrobeItemIds.push(item.wardrobeItemId);
  }

  if (composition.thumbnailPath) {
    itemPaths.push(composition.thumbnailPath);
  }

  // Fetch full wardrobe records and sign URLs in parallel
  const [signedMap, wardrobeRes] = await Promise.all([
    signImageUrls(supabase, [...new Set(itemPaths)]),
    wardrobeItemIds.length > 0
      ? supabase
          .from("wardrobe_items")
          .select("id, name, category, subcategory, primary_colour, secondary_colours, pattern, material, style, occasions, seasons, warmth_level, image_path, status, is_favourite, ai_analysed, wear_count, last_worn_at, last_washed_at, created_at")
          .eq("user_id", userId)
          .in("id", wardrobeItemIds)
      : Promise.resolve({ data: [] }),
  ]);

  const imageUrls: Record<string, string> = {};
  for (const [path, url] of signedMap.entries()) {
    imageUrls[path] = url;
  }

  const wardrobeItems: WardrobeItem[] = (wardrobeRes.data ?? []).map((row) => ({
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
    careType: (row as { care_type?: WardrobeItem["careType"] }).care_type ?? "WASHABLE",
    status: row.status as WardrobeItem["status"],
    isFavourite: row.is_favourite,
    aiAnalysed: row.ai_analysed,
    wearCount: row.wear_count,
    lastWornAt: row.last_worn_at,
    lastWashedAt: row.last_washed_at,
    createdAt: row.created_at,
    imagePath: row.image_path,
  }));

  return {
    ...composition,
    imageUrls,
    thumbnailUrl: composition.thumbnailPath ? imageUrls[composition.thumbnailPath] : null,
    wardrobeItems,
  };
}

function mapRowToComposition(row: FlatlayCompositionRow): FlatlayComposition {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    preset: row.preset as FlatlayComposition["preset"],
    aspectRatio: row.aspect_ratio as FlatlayComposition["aspectRatio"],
    canvasWidth: row.canvas_width,
    canvasHeight: row.canvas_height,
    backgroundColor: row.background_color,
    backgroundStyle: row.background_style as FlatlayComposition["backgroundStyle"],
    items: Array.isArray(row.items) ? row.items : [],
    thumbnailPath: row.thumbnail_path,
    outfitId: row.outfit_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { escapeLike, PAGE_SIZE, type WardrobeQuery } from "@/lib/validation/wardrobe";
import { isLaundryStatus, type LaundryStatus } from "@/lib/wardrobe/status";

export const WARDROBE_BUCKET = "wardrobe";
/** Signed image URLs live for an hour; pages are rendered fresh per request. */
export const IMAGE_URL_TTL_SECONDS = 60 * 60;

export interface WardrobeItem {
  id: string;
  name: string;
  category: string;
  subcategory: string | null;
  primaryColour: string | null;
  secondaryColours: string[];
  pattern: string | null;
  material: string | null;
  style: string | null;
  occasions: string[];
  seasons: string[];
  warmthLevel: number | null;
  imagePath: string;
  status: LaundryStatus;
  isFavourite: boolean;
  aiAnalysed: boolean;
  wearCount: number;
  lastWornAt: string | null;
  lastWashedAt: string | null;
  createdAt: string;
}

const COLUMNS =
  "id, name, category, subcategory, primary_colour, secondary_colours, pattern, material, style, occasions, seasons, warmth_level, image_path, status, is_favourite, ai_analysed, wear_count, last_worn_at, last_washed_at, created_at";

interface Row {
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
}

function toItem(row: Row): WardrobeItem {
  return {
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
    imagePath: row.image_path,
    status: isLaundryStatus(row.status) ? row.status : "UNAVAILABLE",
    isFavourite: row.is_favourite,
    aiAnalysed: row.ai_analysed,
    wearCount: row.wear_count,
    lastWornAt: row.last_worn_at,
    lastWashedAt: row.last_washed_at,
    createdAt: row.created_at,
  };
}

/** Filtered, sorted, paginated wardrobe list. RLS scopes it to the caller; user_id is also explicit. */
export async function listWardrobeItems(
  supabase: SupabaseClient,
  userId: string,
  query: WardrobeQuery,
): Promise<{ items: WardrobeItem[]; total: number }> {
  let builder = supabase.from("wardrobe_items").select(COLUMNS, { count: "exact" }).eq("user_id", userId);

  if (query.q) builder = builder.ilike("name", `%${escapeLike(query.q)}%`);
  if (query.category) builder = builder.eq("category", query.category);
  if (query.colour) builder = builder.eq("primary_colour", query.colour);
  if (query.status) builder = builder.eq("status", query.status);
  if (query.favouritesOnly) builder = builder.eq("is_favourite", true);

  switch (query.sort) {
    case "oldest":
      builder = builder.order("created_at", { ascending: true });
      break;
    case "name":
      builder = builder.order("name", { ascending: true });
      break;
    case "least_worn":
      builder = builder.order("last_worn_at", { ascending: true, nullsFirst: true }).order("created_at", { ascending: false });
      break;
    default:
      builder = builder.order("created_at", { ascending: false });
  }

  const from = (query.page - 1) * PAGE_SIZE;
  const { data, count, error } = await builder.range(from, from + PAGE_SIZE - 1);
  if (error) throw new Error(`Could not load wardrobe: ${error.message}`);
  return { items: ((data ?? []) as Row[]).map(toItem), total: count ?? 0 };
}

export async function getWardrobeItem(supabase: SupabaseClient, userId: string, id: string): Promise<WardrobeItem | null> {
  const { data, error } = await supabase.from("wardrobe_items").select(COLUMNS).eq("id", id).eq("user_id", userId).maybeSingle();
  if (error) throw new Error(`Could not load item: ${error.message}`);
  return data ? toItem(data as Row) : null;
}

/** Items in any non-CLEAN status, for the laundry page. */
export async function listItemsNeedingAttention(supabase: SupabaseClient, userId: string): Promise<WardrobeItem[]> {
  const { data, error } = await supabase
    .from("wardrobe_items")
    .select(COLUMNS)
    .eq("user_id", userId)
    .neq("status", "CLEAN")
    .order("updated_at", { ascending: true });
  if (error) throw new Error(`Could not load laundry: ${error.message}`);
  return ((data ?? []) as Row[]).map(toItem);
}

export async function countItemsByStatus(supabase: SupabaseClient, userId: string): Promise<Array<{ status: LaundryStatus }>> {
  const { data, error } = await supabase.from("wardrobe_items").select("status").eq("user_id", userId);
  if (error) throw new Error(`Could not load wardrobe summary: ${error.message}`);
  return (data ?? []).filter((r): r is { status: LaundryStatus } => isLaundryStatus(r.status));
}

/** Returns garment counts grouped by category for quick-filter pills in large wardrobes. */
export async function countItemsByCategory(
  supabase: SupabaseClient,
  userId: string,
): Promise<Record<string, number>> {
  const { data, error } = await supabase
    .from("wardrobe_items")
    .select("category")
    .eq("user_id", userId);
  if (error) return {};
  const counts: Record<string, number> = {};
  for (const row of (data ?? []) as Array<{ category?: string | null }>) {
    if (row.category) {
      counts[row.category] = (counts[row.category] ?? 0) + 1;
    }
  }
  return counts;
}

/** Loads up to `limit` wardrobe items for Outfit Studio so 100+ item wardrobes aren't truncated at 24. */
export async function listAllWardrobeItems(
  supabase: SupabaseClient,
  userId: string,
  limit = 300,
): Promise<WardrobeItem[]> {
  const { data, error } = await supabase
    .from("wardrobe_items")
    .select(COLUMNS)
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(`Could not load wardrobe items: ${error.message}`);
  return ((data ?? []) as Row[]).map(toItem);
}

/** Batch-sign private image paths. Missing objects are simply absent from the map. */
export async function signImageUrls(supabase: SupabaseClient, paths: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (paths.length === 0) return result;
  const { data, error } = await supabase.storage.from(WARDROBE_BUCKET).createSignedUrls(paths, IMAGE_URL_TTL_SECONDS);
  if (error) throw new Error(`Could not sign image URLs: ${error.message}`);
  for (const entry of data ?? []) {
    if (entry.path && entry.signedUrl) result.set(entry.path, entry.signedUrl);
  }
  return result;
}


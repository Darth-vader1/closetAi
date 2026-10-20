import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { escapeLike, PAGE_SIZE, type WardrobeQuery } from "@/lib/validation/wardrobe";
import { isLaundryStatus, type LaundryStatus } from "@/lib/wardrobe/status";
import { signImageUrlsBatch, uniquePaths, type ImageSize } from "@/lib/wardrobe/image-transform";

export const WARDROBE_BUCKET = "wardrobe";
/** Signed image URLs live for an hour; pages are rendered fresh per request. */
export const IMAGE_URL_TTL_SECONDS = 60 * 60;

// Re-export so callers can import size type from here too.
export type { ImageSize };

export interface WardrobeItem {
  id: string;
  name: string;
  category: string;
  subcategory: string | null;
  brand?: string | null;
  price?: number | null;
  currency?: string | null;
  primaryColour: string | null;
  secondaryColours: string[];
  pattern: string | null;
  material: string | null;
  style: string | null;
  occasions: string[];
  seasons: string[];
  warmthLevel: number | null;
  imagePath: string;
  originalImagePath?: string;
  beautifiedImagePath?: string | null;
  beautificationMode?: "clean-cutout" | "ai-enhance" | null;
  beautificationProvider?: string | null;
  beautificationModel?: string | null;
  beautificationStatus?:
    | "NONE"
    | "PROCESSING"
    | "COMPLETED"
    | "FAILED"
    | "RESTORED_ORIGINAL";
  beautifiedAt?: string | null;
  status: LaundryStatus;
  careType: "WASHABLE" | "WIPE_CLEAN" | "NO_WASH";
  isFavourite: boolean;
  aiAnalysed: boolean;
  wearCount: number;
  lastWornAt: string | null;
  lastWashedAt: string | null;
  createdAt: string;
}

const BASE_COLUMNS =
  "id, name, category, subcategory, primary_colour, secondary_colours, pattern, material, style, occasions, seasons, warmth_level, image_path, status, care_type, is_favourite, ai_analysed, wear_count, last_worn_at, last_washed_at, created_at";

const COLUMNS = `${BASE_COLUMNS}, brand, price, currency`;

const COLUMNS_WITH_BEAUTIFY = `${COLUMNS}, original_image_path, beautified_image_path, beautification_mode, beautification_provider, beautification_model, beautification_status, beautified_at`;

interface Row {
  id: string;
  name: string;
  category: string;
  subcategory: string | null;
  brand?: string | null;
  source_brand?: string | null;
  price?: number | string | null;
  currency?: string | null;
  primary_colour: string | null;
  secondary_colours: string[] | null;
  pattern: string | null;
  material: string | null;
  style: string | null;
  occasions: string[] | null;
  seasons: string[] | null;
  warmth_level: number | null;
  image_path: string;
  original_image_path?: string | null;
  beautified_image_path?: string | null;
  beautification_mode?: string | null;
  beautification_provider?: string | null;
  beautification_model?: string | null;
  beautification_status?: string | null;
  beautified_at?: string | null;
  status: string;
  care_type: string | null;
  is_favourite: boolean;
  ai_analysed: boolean;
  wear_count: number;
  last_worn_at: string | null;
  last_washed_at: string | null;
  created_at: string;
}

function toItem(row: Row): WardrobeItem {
  const statusVal = row.beautification_status;
  const resolvedBeautifyStatus =
    statusVal === "PROCESSING" ||
    statusVal === "COMPLETED" ||
    statusVal === "FAILED" ||
    statusVal === "RESTORED_ORIGINAL"
      ? statusVal
      : row.beautified_image_path
        ? "COMPLETED"
        : "NONE";

  return {
    id: row.id,
    name: row.name,
    category: row.category,
    subcategory: row.subcategory,
    brand: row.brand ?? row.source_brand ?? null,
    price: row.price != null && row.price !== "" ? Number(row.price) : null,
    currency: row.currency ?? "USD",
    primaryColour: row.primary_colour,
    secondaryColours: row.secondary_colours ?? [],
    pattern: row.pattern,
    material: row.material,
    style: row.style,
    occasions: row.occasions ?? [],
    seasons: row.seasons ?? [],
    warmthLevel: row.warmth_level,
    imagePath: row.image_path,
    originalImagePath: row.original_image_path ?? row.image_path,
    beautifiedImagePath: row.beautified_image_path ?? null,
    beautificationMode:
      row.beautification_mode === "clean-cutout" || row.beautification_mode === "ai-enhance"
        ? row.beautification_mode
        : null,
    beautificationProvider: row.beautification_provider ?? null,
    beautificationModel: row.beautification_model ?? null,
    beautificationStatus: resolvedBeautifyStatus,
    beautifiedAt: row.beautified_at ?? null,
    status: isLaundryStatus(row.status) ? row.status : "UNAVAILABLE",
    careType: (row.care_type === "WASHABLE" || row.care_type === "WIPE_CLEAN" || row.care_type === "NO_WASH") 
      ? row.care_type 
      : "WASHABLE", // Default for backward compatibility
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
  let { data, count, error } = await builder.range(from, from + PAGE_SIZE - 1);
  if (error && (error.code === "42703" || error.message.includes("does not exist"))) {
    let fallbackBuilder = supabase.from("wardrobe_items").select(BASE_COLUMNS, { count: "exact" }).eq("user_id", userId);
    if (query.q) fallbackBuilder = fallbackBuilder.ilike("name", `%${escapeLike(query.q)}%`);
    if (query.category) fallbackBuilder = fallbackBuilder.eq("category", query.category);
    if (query.colour) fallbackBuilder = fallbackBuilder.eq("primary_colour", query.colour);
    if (query.status) fallbackBuilder = fallbackBuilder.eq("status", query.status);
    if (query.favouritesOnly) fallbackBuilder = fallbackBuilder.eq("is_favourite", true);
    switch (query.sort) {
      case "oldest": fallbackBuilder = fallbackBuilder.order("created_at", { ascending: true }); break;
      case "name": fallbackBuilder = fallbackBuilder.order("name", { ascending: true }); break;
      case "least_worn": fallbackBuilder = fallbackBuilder.order("last_worn_at", { ascending: true, nullsFirst: true }).order("created_at", { ascending: false }); break;
      default: fallbackBuilder = fallbackBuilder.order("created_at", { ascending: false });
    }
    const res = await fallbackBuilder.range(from, from + PAGE_SIZE - 1);
    data = res.data as unknown as typeof data;
    count = res.count;
    error = res.error;
  }
  if (error) throw new Error(`Could not load wardrobe: ${error.message}`);
  return { items: ((data ?? []) as Row[]).map(toItem), total: count ?? 0 };
}

export async function getWardrobeItem(supabase: SupabaseClient, userId: string, id: string): Promise<WardrobeItem | null> {
  const { data, error } = await supabase
    .from("wardrobe_items")
    .select(COLUMNS_WITH_BEAUTIFY)
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    if (error.message.includes("original_image_path") || error.code === "42703") {
      const fallback = await supabase
        .from("wardrobe_items")
        .select(COLUMNS)
        .eq("id", id)
        .eq("user_id", userId)
        .maybeSingle();
      if (fallback.error && fallback.error.code === "42703") {
        const baseFallback = await supabase
          .from("wardrobe_items")
          .select(BASE_COLUMNS)
          .eq("id", id)
          .eq("user_id", userId)
          .maybeSingle();
        return baseFallback.data ? toItem(baseFallback.data as Row) : null;
      }
      if (fallback.error) throw new Error(`Could not load item: ${fallback.error.message}`);
      return fallback.data ? toItem(fallback.data as Row) : null;
    }
    throw new Error(`Could not load item: ${error.message}`);
  }
  return data ? toItem(data as unknown as Row) : null;
}

/** Items in any non-CLEAN status and WASHABLE care type, for the laundry page. */
export async function listItemsNeedingAttention(supabase: SupabaseClient, userId: string): Promise<WardrobeItem[]> {
  const { data, error } = await supabase
    .from("wardrobe_items")
    .select(COLUMNS)
    .eq("user_id", userId)
    .neq("status", "CLEAN")
    .eq("care_type", "WASHABLE")
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

/**
 * Batch-sign private image paths at a given size variant.
 *
 * `size` defaults to `"original"` so all existing callers are unchanged.
 * Pass `"thumbnail"` for grids/cards (240×320 px) or `"medium"` for detail
 * pages (600×800 px). Supabase's CDN caches the transformed result so the
 * browser only pays the resize cost once per unique path+size combination.
 *
 * Deduplicates paths automatically; missing objects are absent from the map.
 */
export async function signImageUrls(
  supabase: SupabaseClient,
  paths: string[],
  size: ImageSize = "original",
): Promise<Map<string, string>> {
  return signImageUrlsBatch(supabase, uniquePaths(paths), size);
}


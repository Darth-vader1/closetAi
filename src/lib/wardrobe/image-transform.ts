import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { WARDROBE_BUCKET } from "@/lib/wardrobe/queries";

/**
 * Image size variants.
 *
 * - thumbnail  240 × 320 px  — wardrobe grids, dashboard cards, calendar thumbnails (≈ 15–25 KB WebP)
 * - medium     600 × 800 px  — item detail page, outfit studio item panels (≈ 60–100 KB WebP)
 * - original   no transform  — AI analysis download, full-resolution inspection
 *
 * Supabase Storage image transformations resize to fit within the given box while
 * preserving the original aspect ratio. Outputs are WebP when the client sends
 * `Accept: image/webp` (which Next.js <Image> does), otherwise JPEG.
 * Transformed images are edge-cached by Supabase's CDN — the signed URL path stays
 * stable for the lifetime of the TTL so the browser can also cache the response.
 *
 * Supabase transform docs: https://supabase.com/docs/guides/storage/serving/image-transformations
 *
 * NOTE: Image transformations require the Supabase Pro plan or above. On the Free
 * plan `createSignedUrl` with `transform` options still works but the transform
 * parameters are silently ignored and the original image is returned instead.
 * The application degrades gracefully: you still get a valid (larger) image.
 */

export type ImageSize = "thumbnail" | "medium" | "original";

/** Pixel dimensions used for each size variant. */
export const SIZE_DIMS: Record<Exclude<ImageSize, "original">, { width: number; height: number }> = {
  thumbnail: { width: 240, height: 320 },
  medium:    { width: 600, height: 800 },
};

/** Signed URL TTL in seconds. 1 hour is enough for a single SSR page render. */
export const IMAGE_TTL = 60 * 60;

/**
 * Long TTL used when we need a URL to survive beyond the page session, e.g.
 * email delivery. 7 days is a reasonable balance between security and usability.
 */
export const EMAIL_IMAGE_TTL = 60 * 60 * 24 * 7;

// ─────────────────────────────────────────────────────────────────────────────
// Single URL
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sign a single private storage path, optionally applying Supabase image
 * transformation so the browser receives a right-sized WebP/JPEG instead of
 * the full original.
 */
export async function signImageUrl(
  supabase: SupabaseClient,
  path: string,
  size: ImageSize = "original",
  ttl: number = IMAGE_TTL,
): Promise<string | null> {
  const transform = size !== "original" ? SIZE_DIMS[size] : undefined;

  const { data, error } = await supabase.storage
    .from(WARDROBE_BUCKET)
    .createSignedUrl(path, ttl, transform ? { transform: { width: transform.width, height: transform.height, resize: "contain" } } : undefined);

  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

// ─────────────────────────────────────────────────────────────────────────────
// Batch URL signing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Batch-sign an array of storage paths for a given size variant.
 *
 * Returns a Map<storagePath, signedUrl>. Paths that could not be signed are
 * absent from the map (the caller should render a fallback placeholder).
 *
 * Supabase's `createSignedUrls` (plural) sends a single request for the whole
 * batch — much cheaper than N individual calls.
 *
 * IMPORTANT: Supabase's batch signing endpoint does NOT currently support the
 * `transform` option, so for non-original sizes we fall back to signing one
 * URL per path using the single API. To bound the cost of this, callers should
 * deduplicate paths before calling and keep batches small (the default page
 * size is 24 items, so this is typically 24 sequential calls — fast enough for
 * SSR).
 *
 * If Supabase adds batch transform support in future, this function can be
 * updated in one place without touching any caller.
 */
export async function signImageUrlsBatch(
  supabase: SupabaseClient,
  paths: string[],
  size: ImageSize = "original",
  ttl: number = IMAGE_TTL,
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (paths.length === 0) return result;

  if (size === "original") {
    // Fast path: batch API, single network round-trip.
    const { data, error } = await supabase.storage
      .from(WARDROBE_BUCKET)
      .createSignedUrls(paths, ttl);
    if (error) throw new Error(`Could not batch-sign image URLs: ${error.message}`);
    for (const entry of data ?? []) {
      if (entry.path && entry.signedUrl) result.set(entry.path, entry.signedUrl);
    }
    return result;
  }

  // Transform path: sign in parallel with bounded concurrency (max 6 at once).
  const dims = SIZE_DIMS[size];
  const CONCURRENCY = 6;
  let i = 0;

  const runBatch = async () => {
    while (i < paths.length) {
      const path = paths[i++];
      const { data, error } = await supabase.storage
        .from(WARDROBE_BUCKET)
        .createSignedUrl(path, ttl, {
          transform: { width: dims.width, height: dims.height, resize: "contain" },
        });
      if (!error && data?.signedUrl) result.set(path, data.signedUrl);
    }
  };

  // Launch up to CONCURRENCY workers in parallel.
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, paths.length) }, runBatch));
  return result;
}

// ─────────────────────────────────────────────────────────────────────────────
// Utility: deduplicate paths before signing
// ─────────────────────────────────────────────────────────────────────────────

/** Return unique, non-empty paths from any array, preserving order. */
export function uniquePaths(paths: (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of paths) {
    if (p && !seen.has(p)) { seen.add(p); out.push(p); }
  }
  return out;
}

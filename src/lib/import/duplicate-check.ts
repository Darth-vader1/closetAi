import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeProductUrl } from "@/lib/import/url-utils";

export interface DuplicateWardrobeMatch {
  id: string;
  name: string;
  category: string;
  matchedBy: "source_url" | "source_image_sha256";
  sourceUrl: string | null;
}

/**
 * Checks whether the authenticated user has already imported the exact same product
 * by comparing normalized `source_url` and/or `source_image_sha256`.
 *
 * Intentionally never matches on garment name, category, or colour so two distinct items
 * with similar names or colours are never falsely flagged as duplicates.
 */
export async function findDuplicateImportedItem(
  supabase: SupabaseClient,
  userId: string,
  options: {
    sourceUrl?: string | null;
    sourceImageSha256?: string | null;
  },
): Promise<DuplicateWardrobeMatch | null> {
  let normalizedUrl: string | null = null;
  if (options.sourceUrl) {
    try {
      normalizedUrl = normalizeProductUrl(options.sourceUrl);
    } catch {
      normalizedUrl = options.sourceUrl.trim() || null;
    }
  }

  const normalizedHash =
    typeof options.sourceImageSha256 === "string" &&
    /^[0-9a-f]{64}$/i.test(options.sourceImageSha256.trim())
      ? options.sourceImageSha256.trim().toLowerCase()
      : null;

  try {
    if (normalizedUrl) {
      const byUrl = await supabase
        .from("wardrobe_items")
        .select("id, name, category, source_url")
        .eq("user_id", userId)
        .eq("source_url", normalizedUrl)
        .limit(1)
        .maybeSingle();

      if (!byUrl.error && byUrl.data) {
        return {
          id: byUrl.data.id as string,
          name: byUrl.data.name as string,
          category: byUrl.data.category as string,
          matchedBy: "source_url",
          sourceUrl: (byUrl.data.source_url as string | null) ?? normalizedUrl,
        };
      }
    }

    if (normalizedHash) {
      const byHash = await supabase
        .from("wardrobe_items")
        .select("id, name, category, source_url")
        .eq("user_id", userId)
        .eq("source_image_sha256", normalizedHash)
        .limit(1)
        .maybeSingle();

      if (!byHash.error && byHash.data) {
        return {
          id: byHash.data.id as string,
          name: byHash.data.name as string,
          category: byHash.data.category as string,
          matchedBy: "source_image_sha256",
          sourceUrl: (byHash.data.source_url as string | null) ?? null,
        };
      }
    }
  } catch {
    // Graceful fallback if database schema is undergoing migration or columns are absent
    return null;
  }

  return null;
}

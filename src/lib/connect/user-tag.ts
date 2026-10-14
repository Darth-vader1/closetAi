/**
 * Closet ID utilities — client/server safe (no server-only imports).
 *
 * Primary identifier: `closet_id` column on `public.profiles`.
 *   Format: CLOS-XXXXXXXX (DB-generated, unique-constrained, stable).
 *
 * Fallback: `closetIdFallback(uuid)` — derived from the UUID when the DB
 *   value is not yet available (e.g. pre-migration rows, optimistic UI).
 *   NOT guaranteed unique — use only as a last resort.
 */

/**
 * Derive a display tag from a UUID when no DB closet_id is available.
 * Uses last 6 hex chars of the UUID → "#a3f8c2".
 * @deprecated Prefer the DB-stored closet_id from the profiles table.
 */
export function userTag(uuid: string): string {
  const hex = uuid.replace(/-/g, "");
  return `#${hex.slice(-6).toLowerCase()}`;
}

/**
 * Format a stored closet_id for display.
 * Input:  "CLOS-A3F8C249"
 * Output: "CLOS-A3F8C249"  (already formatted; function is a no-op passthrough
 *          kept for consistency so callers don't need null checks).
 */
export function formatClosetId(closetId: string): string {
  return closetId;
}

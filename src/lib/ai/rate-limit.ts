import type { SupabaseClient } from "@supabase/supabase-js";

export type AiOperation = "ANALYSE_IMAGE" | "STYLE_OUTFITS" | "CHAT";

/** Requests allowed per rolling hour, per user, per operation. */
export const AI_HOURLY_LIMITS: Record<AiOperation, number> = {
  ANALYSE_IMAGE: 60,
  STYLE_OUTFITS: 30,
  CHAT: 60,
};

export function isOverLimit(recentCount: number, limit: number): boolean {
  return recentCount >= limit;
}

/**
 * Counts the user's AI calls in the last hour and records a new one if under the limit.
 * Uses the caller's own (RLS-scoped) client. The count-then-insert is not atomic, so a burst of
 * parallel requests can slightly overshoot the limit. That is acceptable for cost control; it is
 * not a security boundary.
 */
export async function takeAiQuota(
  supabase: SupabaseClient,
  userId: string,
  operation: AiOperation,
  now: Date = new Date(),
): Promise<{ allowed: true } | { allowed: false; retryAfterMinutes: number }> {
  const since = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const { count, error } = await supabase
    .from("ai_usage_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("operation", operation)
    .gte("created_at", since);
  if (error) throw new Error(`Could not check AI usage: ${error.message}`);

  if (isOverLimit(count ?? 0, AI_HOURLY_LIMITS[operation])) return { allowed: false, retryAfterMinutes: 60 };

  const { error: insertError } = await supabase.from("ai_usage_events").insert({ user_id: userId, operation });
  if (insertError) throw new Error(`Could not record AI usage: ${insertError.message}`);
  return { allowed: true };
}

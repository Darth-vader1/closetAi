import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { AI_HOURLY_LIMITS, takeAiQuota } from "@/lib/ai/rate-limit";

/** Minimal fake of the query-builder calls takeAiQuota makes. */
function fakeSupabase(recentCount: number, opts: { countError?: boolean; insertError?: boolean } = {}) {
  const inserts: unknown[] = [];
  const filters: Array<[string, unknown]> = [];
  const select = {
    eq(col: string, val: unknown) {
      filters.push([col, val]);
      return select;
    },
    gte(col: string, val: unknown) {
      filters.push([col, val]);
      return Promise.resolve(opts.countError ? { count: null, error: { message: "boom" } } : { count: recentCount, error: null });
    },
  };
  const client = {
    from: () => ({
      select: () => select,
      insert: (row: unknown) => {
        inserts.push(row);
        return Promise.resolve({ error: opts.insertError ? { message: "boom" } : null });
      },
    }),
  } as unknown as SupabaseClient;
  return { client, inserts, filters };
}

describe("takeAiQuota", () => {
  const user = "11111111-1111-4111-8111-111111111111";

  it("allows and records a call while under the limit", async () => {
    const { client, inserts } = fakeSupabase(AI_HOURLY_LIMITS.ANALYSE_IMAGE - 1);
    expect(await takeAiQuota(client, user, "ANALYSE_IMAGE")).toEqual({ allowed: true });
    expect(inserts).toEqual([{ user_id: user, operation: "ANALYSE_IMAGE" }]);
  });

  it("blocks without recording once the limit is reached", async () => {
    const { client, inserts } = fakeSupabase(AI_HOURLY_LIMITS.ANALYSE_IMAGE);
    const result = await takeAiQuota(client, user, "ANALYSE_IMAGE");
    expect(result.allowed).toBe(false);
    expect(inserts).toHaveLength(0);
  });

  it("counts only this user's calls of this operation in the last hour", async () => {
    const now = new Date("2026-10-10T12:00:00.000Z");
    const { client, filters } = fakeSupabase(0);
    await takeAiQuota(client, user, "CHAT", now);
    expect(filters).toContainEqual(["user_id", user]);
    expect(filters).toContainEqual(["operation", "CHAT"]);
    expect(filters).toContainEqual(["created_at", "2026-10-10T11:00:00.000Z"]);
  });

  it("surfaces database errors instead of silently allowing the call", async () => {
    await expect(takeAiQuota(fakeSupabase(0, { countError: true }).client, user, "CHAT")).rejects.toThrow(/AI usage/);
    await expect(takeAiQuota(fakeSupabase(0, { insertError: true }).client, user, "CHAT")).rejects.toThrow(/AI usage/);
  });
});

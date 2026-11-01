import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import {
  AI_HOURLY_LIMITS,
  lookupInMemoryAiTelemetry,
  recordAiQuotaOutcome,
  takeAiQuota,
} from "@/lib/ai/rate-limit";

/** Minimal fake of the query-builder calls takeAiQuota makes. */
function fakeSupabase(
  recentCount: number,
  opts: {
    countError?: boolean;
    insertError?: boolean;
    missingTelemetryColumns?: boolean;
  } = {},
) {
  const inserts: unknown[] = [];
  const updates: unknown[] = [];
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
  const updateChain = {
    eq() {
      return updateChain;
    },
  };
  const client = {
    from: () => ({
      select: () => select,
      insert: (row: Record<string, unknown>) => {
        inserts.push(row);
        if (opts.missingTelemetryColumns && "sub_operation" in row) {
          return Promise.resolve({
            error: {
              code: "PGRST204",
              message: "Could not find the 'sub_operation' column of 'ai_usage_events'",
            },
          });
        }
        return Promise.resolve({ error: opts.insertError ? { message: "boom" } : null });
      },
      update: (patch: unknown) => {
        updates.push(patch);
        return updateChain;
      },
    }),
  } as unknown as SupabaseClient;
  return { client, inserts, updates, filters };
}

describe("takeAiQuota", () => {
  const user = "11111111-1111-4111-8111-111111111111";

  it("allows and records a call while under the limit", async () => {
    const { client, inserts } = fakeSupabase(AI_HOURLY_LIMITS.ANALYSE_IMAGE - 1);
    expect(await takeAiQuota(client, user, "ANALYSE_IMAGE")).toEqual({ allowed: true });
    expect(inserts).toEqual([{ user_id: user, operation: "ANALYSE_IMAGE" }]);
  });

  it("records granular image analysis telemetry and falls back cleanly when DB columns are not migrated yet", async () => {
    const now = new Date("2026-11-01T15:00:00.000Z");
    const { client, inserts, updates } = fakeSupabase(0, { missingTelemetryColumns: true });

    const quota = await takeAiQuota(
      client,
      user,
      "ANALYSE_IMAGE",
      { subOperation: "OOTD_EXTRACT" },
      now,
    );
    expect(quota.allowed).toBe(true);
    if (!quota.allowed) return;
    expect(quota.eventId).toBeTruthy();
    expect(inserts).toHaveLength(2);
    expect(inserts[1]).toEqual({
      id: quota.eventId,
      user_id: user,
      operation: "ANALYSE_IMAGE",
    });

    await recordAiQuotaOutcome(client, quota.eventId, user, {
      subOperation: "OOTD_EXTRACT",
      provider: "groq",
      metadata: { photoType: "ootd", itemCount: 5 },
    });
    expect(updates).toHaveLength(1);

    const mem = lookupInMemoryAiTelemetry(
      quota.eventId!,
      user,
      "ANALYSE_IMAGE",
      now.toISOString(),
    );
    expect(mem?.subOperation).toBe("OOTD_EXTRACT");
    expect(mem?.provider).toBe("groq");
    expect(mem?.metadata).toEqual({ photoType: "ootd", itemCount: 5 });
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

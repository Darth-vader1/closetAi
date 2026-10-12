import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  claimEmailLogSlot,
  getUserLocalClock,
  normalizeTimeHHMM,
  verifyCronRequest,
} from "@/lib/cron/auth";
import { GET as unsubscribeGet } from "@/app/api/email/unsubscribe/route";
import { GET as whatsappGet, POST as whatsappPost } from "@/app/api/webhook/whatsapp/route";
import type { SupabaseClient } from "@supabase/supabase-js";

describe("cron authentication & scheduling helpers", () => {
  const originalSecret = process.env.CRON_SECRET;

  afterEach(() => {
    if (originalSecret === undefined) {
      delete process.env.CRON_SECRET;
    } else {
      process.env.CRON_SECRET = originalSecret;
    }
  });

  it("fails closed with 500 when CRON_SECRET is unset or too short", () => {
    delete process.env.CRON_SECRET;
    const req = new NextRequest("https://example.com/api/cron/daily-outfit");
    const res = verifyCronRequest(req);
    expect(res?.status).toBe(500);
  });

  it("rejects wrong Bearer token with 401 and accepts valid token", () => {
    process.env.CRON_SECRET = "super_secret_cron_token_123456";
    const badReq = new NextRequest("https://example.com/api/cron/daily-outfit", {
      headers: { authorization: "Bearer wrong_token" },
    });
    expect(verifyCronRequest(badReq)?.status).toBe(401);

    const goodReq = new NextRequest("https://example.com/api/cron/daily-outfit", {
      headers: { authorization: "Bearer super_secret_cron_token_123456" },
    });
    expect(verifyCronRequest(goodReq)).toBeNull();
  });

  it("computes user local date, time, weekday, and ISO week key accurately", () => {
    const fixedUtc = new Date("2026-10-11T06:30:00Z"); // Sunday 07:30 in Africa/Lagos (UTC+1)
    const clock = getUserLocalClock("Africa/Lagos", fixedUtc);
    expect(clock.localDate).toBe("2026-10-11");
    expect(clock.localTime).toBe("07:30");
    expect(clock.weekdayIndex).toBe(0); // Sunday
    expect(clock.isoWeekKey).toMatch(/^2026-W\d{2}$/);
    expect(normalizeTimeHHMM("07:00:00", "08:00")).toBe("07:00");
  });

  it("reclaims a stale PENDING email_logs slot older than 15 minutes", async () => {
    const staleIso = new Date(Date.now() - 20 * 60 * 1000).toISOString();
    const fakeAdmin = {
      from: vi.fn(() => ({
        upsert: () => ({
          select: () => ({
            maybeSingle: async () => ({ data: null, error: null }),
          }),
        }),
        select: () => ({
          eq: () => ({
            eq: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: {
                    id: "log-1",
                    status: "PENDING",
                    attempt_count: 1,
                    updated_at: staleIso,
                  },
                  error: null,
                }),
              }),
            }),
          }),
        }),
        update: () => ({
          eq: () => ({
            eq: () => ({
              select: () => ({
                maybeSingle: async () => ({
                  data: { id: "log-1", attempt_count: 2 },
                  error: null,
                }),
              }),
            }),
          }),
        }),
      })),
    } as unknown as SupabaseClient;

    const claimed = await claimEmailLogSlot(fakeAdmin, "user-1", "DAILY", "2026-10-12");
    expect(claimed).toEqual({ logId: "log-1", attemptCount: 2 });
  });
});

describe("unsubscribe route safety", () => {
  it("renders a confirmation form on GET without mutating state", async () => {
    const token = "11111111-2222-4333-8444-555555555555";
    const req = new NextRequest(`https://example.com/api/email/unsubscribe?token=${token}&type=daily`);
    const res = await unsubscribeGet(req);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("<form");
    expect(html).toContain(token);
  });

  it("rejects non-UUID tokens on GET with 400", async () => {
    const req = new NextRequest("https://example.com/api/email/unsubscribe?token=not-a-uuid");
    const res = await unsubscribeGet(req);
    expect(res.status).toBe(400);
  });
});

describe("WhatsApp webhook security", () => {
  const origVerify = process.env.WHATSAPP_VERIFY_TOKEN;
  const origSecret = process.env.WHATSAPP_APP_SECRET;

  beforeEach(() => {
    process.env.WHATSAPP_VERIFY_TOKEN = "my_verify_token_secret";
    process.env.WHATSAPP_APP_SECRET = "my_app_secret_key";
  });

  afterEach(() => {
    if (origVerify === undefined) delete process.env.WHATSAPP_VERIFY_TOKEN;
    else process.env.WHATSAPP_VERIFY_TOKEN = origVerify;
    if (origSecret === undefined) delete process.env.WHATSAPP_APP_SECRET;
    else process.env.WHATSAPP_APP_SECRET = origSecret;
  });

  it("verifies hub.verify_token on GET and rejects mismatches", async () => {
    const okReq = new NextRequest(
      "https://example.com/api/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=my_verify_token_secret&hub.challenge=12345",
    );
    const okRes = await whatsappGet(okReq);
    expect(okRes.status).toBe(200);
    expect(await okRes.text()).toBe("12345");

    const badReq = new NextRequest(
      "https://example.com/api/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=12345",
    );
    const badRes = await whatsappGet(badReq);
    expect(badRes.status).toBe(403);
  });

  it("verifies X-Hub-Signature-256 HMAC-SHA256 on POST", async () => {
    const payload = JSON.stringify({ entry: [] });
    const validSig =
      "sha256=" + crypto.createHmac("sha256", "my_app_secret_key").update(payload, "utf8").digest("hex");

    const badReq = new NextRequest("https://example.com/api/webhook/whatsapp", {
      method: "POST",
      headers: { "x-hub-signature-256": "sha256=deadbeef" },
      body: payload,
    });
    expect((await whatsappPost(badReq)).status).toBe(401);

    const goodReq = new NextRequest("https://example.com/api/webhook/whatsapp", {
      method: "POST",
      headers: { "x-hub-signature-256": validSig },
      body: payload,
    });
    expect((await whatsappPost(goodReq)).status).toBe(200);
  });
});

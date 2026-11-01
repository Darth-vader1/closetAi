import { describe, expect, it, vi, beforeEach } from "vitest";

const {
  mockFrom,
  mockListUsers,
  mockRequireAdmin,
  mockIsSupabaseConfigured,
  mockGetResendClient,
  mockGetWhatsAppConfig,
} = vi.hoisted(() => ({
  mockFrom: vi.fn(),
  mockListUsers: vi.fn(),
  mockRequireAdmin: vi.fn(),
  mockIsSupabaseConfigured: vi.fn(() => true),
  mockGetResendClient: vi.fn(),
  mockGetWhatsAppConfig: vi.fn(),
}));

vi.mock("@/lib/auth/admin", () => ({
  requireAdmin: mockRequireAdmin,
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: mockFrom,
    auth: {
      admin: {
        listUsers: mockListUsers,
      },
    },
  }),
}));

vi.mock("@/lib/email/service", () => ({
  getResendClient: mockGetResendClient,
}));

vi.mock("@/lib/whatsapp/service", () => ({
  getWhatsAppConfig: mockGetWhatsAppConfig,
}));

vi.mock("@/lib/env", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/env")>();
  return {
    ...actual,
    isSupabaseConfigured: mockIsSupabaseConfigured,
  };
});

import {
  getAdminAiUsageAnalytics,
  getAdminSystemHealth,
} from "@/lib/admin/system-and-usage";
import { POST as probePost } from "@/app/api/admin/system/probe/route";

describe("Admin System Health & AI Usage Telemetry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue({
      id: "admin-1",
      email: "admin@closetai.test",
      role: "superadmin",
    });
  });

  it("getAdminSystemHealth inspects real env keys, DB ping, and 7d cron logs instead of static values", async () => {
    mockGetResendClient.mockReturnValue({
      provider: "gmail_smtp",
      user: "hello@closetai.test",
      appPassword: "secret",
      from: "ClosetAI <hello@closetai.test>",
    });
    mockGetWhatsAppConfig.mockReturnValue(null);

    mockFrom.mockImplementation((table: string) => {
      if (table === "profiles") {
        return {
          select: vi.fn().mockResolvedValue({ count: 47, error: null }),
        };
      }
      if (table === "email_logs") {
        return {
          select: vi.fn().mockReturnValue({
            gte: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({
                  data: [
                    {
                      status: "SENT",
                      sent_at: "2026-10-31T07:00:00Z",
                      updated_at: "2026-10-31T07:00:00Z",
                      last_error: null,
                    },
                    {
                      status: "FAILED",
                      sent_at: null,
                      updated_at: "2026-10-30T07:00:00Z",
                      last_error: "SMTP timeout",
                    },
                  ],
                }),
              }),
            }),
          }),
        };
      }
      return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
    });

    const report = await getAdminSystemHealth({
      SUPABASE_SERVICE_ROLE_KEY: "srv-key",
      AI_PROVIDER: "groq",
      GROQ_API_KEY: "gsk_1,gsk_2",
      MISTRAL_API_KEY: "mstrl_backup",
      PHOTOROOM_API_KEY: "pr_live_1",
      CRON_SECRET: "1234567890abcdef1234",
      PAYSTACK_SECRET_KEY: "sk_live_paystack123",
      NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY: "pk_live_paystack123",
      STRIPE_SECRET_KEY: "",
    });

    const supabaseSvc = report.services.find((s) => s.id === "supabase");
    expect(supabaseSvc?.state).toBe("healthy");

    const aiSvc = report.services.find((s) => s.id === "ai_models");
    expect(aiSvc?.state).toBe("healthy");
    expect(aiSvc?.statusLabel).toContain("GROQ");
    expect(aiSvc?.statusLabel).toContain("fallback");

    const beautifySvc = report.services.find((s) => s.id === "beautify");
    expect(beautifySvc?.state).toBe("healthy");
    expect(beautifySvc?.statusLabel).toBe("1 Cloud Tier Active");

    const billingSvc = report.services.find((s) => s.id === "billing");
    expect(billingSvc?.state).toBe("healthy");
    expect(billingSvc?.statusLabel).toBe("Paystack Live");

    const emailSvc = report.services.find((s) => s.id === "email_cron");
    expect(emailSvc?.state).toBe("warning"); // 1 failed cron send in last 7d
    expect(report.cron.sent7d).toBe(1);
    expect(report.cron.failed7d).toBe(1);
    expect(report.cron.lastFailureError).toBe("SMTP timeout");
  });

  it("getAdminAiUsageAnalytics aggregates per-user AI calls and flags exhausted plan quotas", async () => {
    const now = new Date("2026-11-01T12:00:00Z");

    mockListUsers.mockResolvedValue({
      data: {
        users: [
          { id: "u-free", email: "free@example.com" },
          { id: "u-pro", email: "pro@example.com" },
        ],
      },
    });

    const sampleEvents = [
      { id: "e1", user_id: "u-free", operation: "CHAT", created_at: "2026-11-01T11:30:00Z" },
      { id: "e2", user_id: "u-free", operation: "STYLE_OUTFITS", created_at: "2026-11-01T10:00:00Z" },
      { id: "e3", user_id: "u-free", operation: "ANALYSE_IMAGE", created_at: "2026-10-29T09:00:00Z" },
      { id: "e4", user_id: "u-pro", operation: "GENERATE_PHOTO", created_at: "2026-11-01T08:00:00Z" },
    ];

    mockFrom.mockImplementation((table: string) => {
      if (table === "ai_usage_events") {
        return {
          select: vi.fn((_cols: string, opts?: { head?: boolean }) => {
            if (opts?.head) {
              return {
                count: sampleEvents.length,
                error: null,
                gte: vi.fn().mockResolvedValue({ count: sampleEvents.length, error: null }),
              };
            }
            return {
              gte: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  range: vi.fn().mockResolvedValue({ data: sampleEvents, error: null }),
                }),
              }),
            };
          }),
        };
      }
      if (table === "profiles") {
        return {
          select: vi.fn().mockResolvedValue({
            data: [
              {
                id: "u-free",
                display_name: "Ada",
                role: "user",
                subscription_status: "free",
                subscription_plan: "free",
                subscription_provider: null,
              },
              {
                id: "u-pro",
                display_name: "Chinedu",
                role: "user",
                subscription_status: "active",
                subscription_plan: "monthly",
                subscription_provider: "paystack",
              },
            ],
          }),
        };
      }
      if (table === "usage_records") {
        return {
          select: vi.fn().mockReturnValue({
            gte: vi.fn().mockResolvedValue({
              data: [
                // Free plan limit is 5 outfit_recommendations/week -> 5 means exhausted!
                {
                  user_id: "u-free",
                  feature: "outfit_recommendations",
                  period_start: "2026-10-26T00:00:00Z",
                  period_end: "2026-11-02T00:00:00Z",
                  count: 5,
                },
                {
                  user_id: "u-pro",
                  feature: "outfit_recommendations",
                  period_start: "2026-11-01T00:00:00Z",
                  period_end: "2026-12-01T00:00:00Z",
                  count: 12,
                },
              ],
            }),
          }),
        };
      }
      return { select: vi.fn().mockResolvedValue({ data: [], error: null }) };
    });

    const analytics = await getAdminAiUsageAnalytics(now);

    expect(analytics.activeUsers30d).toBe(2);
    expect(analytics.byOperation30d).toEqual({
      ANALYSE_IMAGE: 1,
      STYLE_OUTFITS: 1,
      CHAT: 1,
      GENERATE_PHOTO: 1,
    });
    expect(analytics.quotaExhaustedUsersCount).toBe(1);
    expect(analytics.dailyTrend14d).toHaveLength(14);

    const topUser = analytics.userLeaderboard[0];
    expect(topUser.userId).toBe("u-free");
    expect(topUser.calls30d).toBe(3);
    expect(topUser.isQuotaExhausted).toBe(true);
    expect(topUser.outfitQuotaUsed).toBe(5);
    expect(topUser.outfitQuotaLimit).toBe(5);
  });

  it("POST /api/admin/system/probe rejects cross-origin requests with 403", async () => {
    const req = new Request("http://localhost:3000/api/admin/system/probe", {
      method: "POST",
      headers: {
        origin: "https://evil.example",
        host: "localhost:3000",
      },
    });
    const res = await probePost(req);
    expect(res.status).toBe(403);
  });
});

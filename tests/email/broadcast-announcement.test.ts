import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  DEFAULT_ANNOUNCEMENT_FEATURES,
  DEFAULT_ANNOUNCEMENT_SUPER_SUBJECT,
  renderFeatureAnnouncementHtml,
} from "@/lib/email/templates";

const mockSendEmail = vi.fn();
const mockRequireAdmin = vi.fn();
const mockListUsers = vi.fn();
const mockInsertAudit = vi.fn();

vi.mock("@/lib/email/service", () => ({
  sendEmail: (...args: unknown[]) => mockSendEmail(...args),
}));

vi.mock("@/lib/auth/admin", () => ({
  requireAdmin: () => mockRequireAdmin(),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    auth: {
      admin: {
        listUsers: (...args: unknown[]) => mockListUsers(...args),
      },
    },
    from: (table: string) => {
      if (table === "profiles") {
        return {
          select: async () => ({
            data: [
              { id: "u-verified", display_name: "Gbemisola" },
              { id: "u-unverified", display_name: "PendingUser" },
            ],
            error: null,
          }),
        };
      }
      if (table === "email_preferences") {
        return {
          select: async () => ({
            data: [{ user_id: "u-verified", unsubscribe_token: "11111111-2222-4333-8444-555555555555" }],
            error: null,
          }),
        };
      }
      if (table === "admin_audit_logs") {
        return {
          insert: (...args: unknown[]) => mockInsertAudit(...args),
        };
      }
      return {};
    },
  }),
}));

import { POST as broadcastPost } from "@/app/api/admin/broadcast/route";

describe("Feature Announcement Email Template & Admin Broadcast Route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRequireAdmin.mockResolvedValue({ id: "admin-1", email: "admin@closetai.com" });
    mockInsertAudit.mockResolvedValue({ error: null });
    mockSendEmail.mockResolvedValue({ success: true, id: "msg-123" });
  });

  it("renders all 6 flagship features with deep links, personalized greeting, and unsubscribe URL", () => {
    const token = "11111111-2222-4333-8444-555555555555";
    const html = renderFeatureAnnouncementHtml({
      displayName: "Chanel",
      unsubscribeToken: token,
    });

    expect(DEFAULT_ANNOUNCEMENT_FEATURES).toHaveLength(6);
    expect(html).toContain("Hello, Chanel");
    expect(html).toContain("Live @ClosetAI Stylist Chat");
    expect(html).toContain("Editorial Flatlay Studio");
    expect(html).toContain("9 Body Shapes, Layering &amp; Modest Styling");
    expect(html).toContain("Product Studio Beautify, Multi-Crop &amp; Store Import");
    expect(html).toContain("ClosetAI Connect &amp; Closet ID Sharing");
    expect(html).toContain("30-Day Trip Capsules, Smart Calendar &amp; WhatsApp Briefs");

    expect(html).toContain("/connect/stylist");
    expect(html).toContain("/studio/flatlay");
    expect(html).toContain("/stylist");
    expect(html).toContain("/wardrobe/new");
    expect(html).toContain("/connect");
    expect(html).toContain("/packing");
    expect(html).toContain(`token=${token}&type=announcement`);
  });

  it("rejects cross-origin POST requests with 403", async () => {
    const req = new Request("http://localhost:3000/api/admin/broadcast", {
      method: "POST",
      headers: {
        origin: "https://evil.example.com",
        host: "localhost:3000",
        "content-type": "application/json",
      },
      body: JSON.stringify({ mode: "test", testEmail: "admin@closetai.com" }),
    });

    const res = await broadcastPost(req);
    expect(res.status).toBe(403);
    expect(mockSendEmail).not.toHaveBeenCalled();
  });

  it("dispatches broadcast emails to verified members, skips unverified when confirmedOnly=true, and logs audit", async () => {
    mockListUsers.mockResolvedValueOnce({
      data: {
        users: [
          { id: "u-verified", email: "gbemisola@example.com", email_confirmed_at: "2026-10-30T10:00:00Z" },
          { id: "u-unverified", email: "pending@example.com", email_confirmed_at: null },
        ],
      },
      error: null,
    });

    const req = new Request("http://localhost:3000/api/admin/broadcast", {
      method: "POST",
      headers: {
        origin: "http://localhost:3000",
        host: "localhost:3000",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        mode: "broadcast",
        confirmedOnly: true,
      }),
    });

    const res = await broadcastPost(req);
    expect(res.status).toBe(200);
    const json = await res.json();

    expect(json).toEqual({
      ok: true,
      sentCount: 1,
      failedCount: 0,
      skippedCount: 1,
    });

    expect(mockSendEmail).toHaveBeenCalledTimes(1);
    expect(mockSendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "gbemisola@example.com",
        subject: DEFAULT_ANNOUNCEMENT_SUPER_SUBJECT,
        html: expect.stringContaining("Hello, Gbemisola"),
      }),
    );
    expect(mockInsertAudit).toHaveBeenCalledTimes(1);
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderAdminNewUserAlertHtml } from "@/lib/email/templates";
import { getAdminEmails } from "@/lib/auth/admin";
import { notifyAdminsOfNewSignup } from "@/lib/admin/notifications";
import * as emailService from "@/lib/email/service";

describe("Admin New User Signup Notifications", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe("renderAdminNewUserAlertHtml", () => {
    it("renders user registration details in the HTML email", () => {
      const html = renderAdminNewUserAlertHtml({
        email: "sarah.connor@example.com",
        displayName: "Sarah Connor",
        userId: "usr_12345678-abcd",
        createdAt: "2026-10-30T12:00:00Z",
      });

      expect(html).toContain("New User Signed Up");
      expect(html).toContain("Sarah Connor");
      expect(html).toContain("sarah.connor@example.com");
      expect(html).toContain("usr_12345678-abcd");
      expect(html).toContain("Free Tier (Freemium)");
      expect(html).toContain("/admin/users");
    });

    it("handles missing displayName and userId gracefully", () => {
      const html = renderAdminNewUserAlertHtml({
        email: "anonymous@example.com",
      });

      expect(html).toContain("anonymous@example.com");
      expect(html).toContain("Not specified");
    });
  });

  describe("getAdminEmails", () => {
    it("includes default admin emails", () => {
      const admins = getAdminEmails();
      expect(admins).toContain("gbolahanabiodun92@gmail.com");
      expect(admins).toContain("olufemi-abiodun.gbolahan@st.tau.edu.ng");
    });

    it("parses ADMIN_EMAILS and ADMIN_EMAIL environment variables", () => {
      process.env.ADMIN_EMAILS = "custom1@example.com, custom2@example.com ";
      const admins = getAdminEmails();
      expect(admins).toContain("custom1@example.com");
      expect(admins).toContain("custom2@example.com");
    });

    it("parses singular ADMIN_EMAIL environment variable", () => {
      delete process.env.ADMIN_EMAILS;
      process.env.ADMIN_EMAIL = "ceo@closetai.com";
      const admins = getAdminEmails();
      expect(admins).toContain("ceo@closetai.com");
    });
  });

  describe("notifyAdminsOfNewSignup", () => {
    it("sends notification email to all admins when mailer is configured", async () => {
      vi.spyOn(emailService, "getResendClient").mockReturnValue({
        provider: "resend",
        apiKey: "re_mock_test",
      });

      const sendEmailSpy = vi.spyOn(emailService, "sendEmail").mockResolvedValue({
        success: true,
        id: "msg_mock_123",
      });

      const result = await notifyAdminsOfNewSignup({
        email: "newuser@example.com",
        displayName: "New User",
        userId: "uuid-new-123",
      });

      expect(result.success).toBe(true);
      expect(result.sentCount).toBeGreaterThanOrEqual(2);
      expect(sendEmailSpy).toHaveBeenCalled();
      expect(sendEmailSpy.mock.calls[0][0].subject).toContain("newuser@example.com");
    });

    it("skips notifications if ADMIN_SIGNUP_NOTIFICATIONS_ENABLED is false", async () => {
      process.env.ADMIN_SIGNUP_NOTIFICATIONS_ENABLED = "false";

      const sendEmailSpy = vi.spyOn(emailService, "sendEmail");

      const result = await notifyAdminsOfNewSignup({
        email: "newuser@example.com",
      });

      expect(result.success).toBe(true);
      expect(result.sentCount).toBe(0);
      expect(sendEmailSpy).not.toHaveBeenCalled();
    });

    it("handles mailer not configured gracefully without throwing", async () => {
      vi.spyOn(emailService, "getResendClient").mockReturnValue(null);

      const result = await notifyAdminsOfNewSignup({
        email: "newuser@example.com",
      });

      expect(result.success).toBe(false);
      expect(result.sentCount).toBe(0);
    });
  });
});

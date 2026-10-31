import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sendUserWelcomeEmail } from "@/lib/email/welcome";
import { renderAuthEmailHtml } from "@/lib/email/templates";
import * as emailService from "@/lib/email/service";
import * as supabaseAdmin from "@/lib/supabase/admin";

describe("User Welcome & OTP Verification Email Flow", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...originalEnv, SUPABASE_SERVICE_ROLE_KEY: "test_service_key" };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  describe("Email 1: Distraction-free OTP verification email (renderAuthEmailHtml)", () => {
    it("renders clean, focused verification email with OTP code and activation CTA", () => {
      const html = renderAuthEmailHtml({
        type: "signup",
        displayName: "Ada Lovelace",
        actionUrl: "https://closetai.app/auth/callback?token=xyz",
        otpCode: "123456",
      });

      expect(html).toContain("CLOSET·AI ACCOUNT VERIFICATION");
      expect(html).toContain("Verify your email address");
      expect(html).toContain("Ada Lovelace");
      expect(html).toContain("123456");
      expect(html).toContain("Verify Email Address →");
      expect(html).toContain("https://closetai.app/auth/callback?token=xyz");
    });
  });

  describe("Email 2: Official Welcome Quickstart Email (sendUserWelcomeEmail)", () => {
    it("dispatches the welcome quickstart email upon account confirmation", async () => {
      vi.spyOn(emailService, "getResendClient").mockReturnValue({
        provider: "gmail_smtp",
        user: "test@gmail.com",
        appPassword: "secretpassword",
        from: "ClosetAI <test@gmail.com>",
      });

      const sendEmailSpy = vi.spyOn(emailService, "sendEmail").mockResolvedValue({
        success: true,
        id: "msg_welcome_123",
      });

      const updateUserByIdSpy = vi.fn().mockResolvedValue({ data: {}, error: null });
      const getUserByIdSpy = vi.fn().mockResolvedValue({
        data: { user: { id: "usr_welcome_1", user_metadata: {} } },
        error: null,
      });

      vi.spyOn(supabaseAdmin, "createAdminClient").mockReturnValue({
        auth: {
          admin: {
            getUserById: getUserByIdSpy,
            updateUserById: updateUserByIdSpy,
          },
        },
      } as unknown as ReturnType<typeof supabaseAdmin.createAdminClient>);

      const result = await sendUserWelcomeEmail({
        userId: "usr_welcome_1",
        email: "ada@example.com",
        displayName: "Ada",
      });

      expect(result.success).toBe(true);
      expect(sendEmailSpy).toHaveBeenCalledTimes(1);
      expect(sendEmailSpy.mock.calls[0][0].to).toBe("ada@example.com");
      expect(sendEmailSpy.mock.calls[0][0].subject).toContain("Welcome to ClosetAI, Ada!");
      expect(sendEmailSpy.mock.calls[0][0].subject).toContain("Your Wardrobe Quickstart");

      expect(updateUserByIdSpy).toHaveBeenCalledWith("usr_welcome_1", {
        user_metadata: expect.objectContaining({
          welcome_email_sent: true,
        }),
      });
    });

    it("skips sending if user has already received the welcome email", async () => {
      vi.spyOn(emailService, "getResendClient").mockReturnValue({
        provider: "gmail_smtp",
        user: "test@gmail.com",
        appPassword: "secretpassword",
        from: "ClosetAI <test@gmail.com>",
      });

      const sendEmailSpy = vi.spyOn(emailService, "sendEmail");

      vi.spyOn(supabaseAdmin, "createAdminClient").mockReturnValue({
        auth: {
          admin: {
            getUserById: vi.fn().mockResolvedValue({
              data: {
                user: {
                  id: "usr_welcome_2",
                  user_metadata: { welcome_email_sent: true },
                },
              },
              error: null,
            }),
          },
        },
      } as unknown as ReturnType<typeof supabaseAdmin.createAdminClient>);

      const result = await sendUserWelcomeEmail({
        userId: "usr_welcome_2",
        email: "ada@example.com",
        displayName: "Ada",
      });

      expect(result.success).toBe(true);
      expect(result.skipped).toBe(true);
      expect(sendEmailSpy).not.toHaveBeenCalled();
    });
  });
});

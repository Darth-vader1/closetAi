import "server-only";
import { getAdminEmails } from "@/lib/auth/admin";
import { getResendClient, sendEmail } from "@/lib/email/service";
import { renderAdminNewUserAlertHtml } from "@/lib/email/templates";
import { logger } from "@/lib/logger";

export interface NewUserSignupNotificationInput {
  userId?: string | null;
  email: string;
  displayName?: string | null;
  createdAt?: string | null;
}

/**
 * Notifies all configured administrators via email whenever a new user registers.
 * Executes safely and non-blockingly so it never delays or interrupts the user's signup flow.
 */
export async function notifyAdminsOfNewSignup(
  input: NewUserSignupNotificationInput,
): Promise<{ success: boolean; sentCount: number }> {
  try {
    if (process.env.ADMIN_SIGNUP_NOTIFICATIONS_ENABLED === "false") {
      logger.info("admin.signup_notification_disabled_by_env");
      return { success: true, sentCount: 0 };
    }

    const emailConfig = getResendClient();
    if (!emailConfig) {
      logger.warn("admin.signup_notification_skipped_no_mailer", {
        note: "Email service is not configured (GMAIL_USER or RESEND_API_KEY).",
      });
      return { success: false, sentCount: 0 };
    }

    const adminEmails = getAdminEmails();
    if (adminEmails.length === 0) {
      logger.warn("admin.signup_notification_no_recipients");
      return { success: false, sentCount: 0 };
    }

    const html = renderAdminNewUserAlertHtml({
      email: input.email,
      displayName: input.displayName,
      userId: input.userId,
      createdAt: input.createdAt || new Date().toISOString(),
    });

    const userLabel = input.displayName
      ? `${input.displayName} (${input.email})`
      : input.email;
    const subject = `[ClosetAI] New User Signup: ${userLabel}`;

    const results = await Promise.allSettled(
      adminEmails.map((adminEmail) =>
        sendEmail({
          to: adminEmail,
          subject,
          html,
        }),
      ),
    );

    let sentCount = 0;
    results.forEach((res, index) => {
      const target = adminEmails[index];
      if (res.status === "fulfilled" && res.value.success) {
        sentCount++;
      } else {
        const error =
          res.status === "fulfilled" ? res.value.error : String(res.reason);
        logger.warn("admin.signup_notification_single_failure", { target, error });
      }
    });

    logger.info("admin.signup_notification_completed", {
      totalAdmins: adminEmails.length,
      sentCount,
      newUserEmail: input.email,
    });

    return { success: sentCount > 0, sentCount };
  } catch (err) {
    logger.error("admin.signup_notification_failed", {
      err: err instanceof Error ? err.message : String(err),
    });
    return { success: false, sentCount: 0 };
  }
}

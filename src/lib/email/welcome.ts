import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getResendClient, sendEmail } from "@/lib/email/service";
import { renderOnboardingWelcomeHtml } from "@/lib/email/templates";
import { logger } from "@/lib/logger";

export interface SendUserWelcomeEmailInput {
  userId: string;
  email: string;
  displayName?: string | null;
  preferredStyles?: string[] | null;
  force?: boolean;
}

/**
 * Sends the official Welcome Email to the user upon email confirmation / login.
 * Idempotent: checks user_metadata.welcome_email_sent to ensure the user receives
 * the welcome email exactly once, preventing duplicates.
 */
export async function sendUserWelcomeEmail({
  userId,
  email,
  displayName,
  preferredStyles,
  force = false,
}: SendUserWelcomeEmailInput): Promise<{ success: boolean; skipped?: boolean }> {
  try {
    const emailConfig = getResendClient();
    if (!emailConfig) {
      logger.warn("email.welcome_skipped_no_mailer", { userId, email });
      return { success: false, skipped: true };
    }

    if (!force && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
      const admin = createAdminClient();
      const { data: userRecord } = await admin.auth.admin.getUserById(userId);
      if (userRecord?.user?.user_metadata?.welcome_email_sent) {
        logger.info("email.welcome_already_sent_skipped", { userId, email });
        return { success: true, skipped: true };
      }
    }

    const html = renderOnboardingWelcomeHtml({
      displayName,
      preferredStyles,
    });

    const subject = `Welcome to ClosetAI${displayName ? `, ${displayName}` : ""}! ✨ Your Wardrobe Quickstart`;

    const sent = await sendEmail({
      to: email,
      subject,
      html,
    });

    if (sent.success) {
      logger.info("email.welcome_sent_successfully", { userId, email });

      // Mark as sent in user metadata for idempotency
      if (process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
        try {
          const admin = createAdminClient();
          const { data: userRecord } = await admin.auth.admin.getUserById(userId);
          const currentMeta = userRecord?.user?.user_metadata || {};
          await admin.auth.admin.updateUserById(userId, {
            user_metadata: {
              ...currentMeta,
              welcome_email_sent: true,
              welcome_email_sent_at: new Date().toISOString(),
            },
          });
        } catch (metaErr) {
          logger.warn("email.welcome_mark_metadata_failed", { userId, error: metaErr });
        }
      }

      return { success: true };
    } else {
      logger.error("email.welcome_send_failed", { userId, email, error: sent.error });
      return { success: false };
    }
  } catch (err) {
    logger.error("email.welcome_error", {
      userId,
      email,
      err: err instanceof Error ? err.message : String(err),
    });
    return { success: false };
  }
}

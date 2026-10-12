import { Resend } from "resend";
import { logger } from "@/lib/logger";

/**
 * Returns a configured Resend client instance, or null if unconfigured.
 * Resend sends HTML emails for daily outfit recommendations and weekly laundry digests.
 */
export function getResendClient(): { resend: Resend; from: string } | null {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim() || "ClosetAI <onboarding@resend.dev>";

  if (!apiKey) {
    return null;
  }

  return {
    resend: new Resend(apiKey),
    from,
  };
}

export interface SendEmailPayload {
  to: string;
  subject: string;
  html: string;
}

/**
 * Sends an email with graceful fallback logging if Resend API key is not yet set.
 */
export async function sendEmail({
  to,
  subject,
  html,
}: SendEmailPayload): Promise<{ success: boolean; id?: string; error?: string }> {
  const client = getResendClient();

  if (!client) {
    logger.info("email.simulation", {
      to,
      subject,
      note: "RESEND_API_KEY not configured. Email logged in console simulation mode.",
    });
    console.log(`\n📬 [EMAIL SIMULATED: To: ${to} | Subject: "${subject}"]`);
    return { success: true, id: "simulated-" + Date.now() };
  }

  try {
    const { data, error } = await client.resend.emails.send({
      from: client.from,
      to,
      subject,
      html,
    });

    if (error) {
      logger.error("email.send_failed", { error, to, subject });
      return { success: false, error: error.message };
    }

    logger.info("email.sent", { id: data?.id, to, subject });
    return { success: true, id: data?.id };
  } catch (err) {
    logger.error("email.exception", { err, to, subject });
    return { success: false, error: err instanceof Error ? err.message : "Email delivery failed" };
  }
}

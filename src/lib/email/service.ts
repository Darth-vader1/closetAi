import nodemailer from "nodemailer";
import { Resend } from "resend";
import { logger } from "@/lib/logger";

export type EmailProviderConfig =
  | { provider: "gmail_smtp"; user: string; appPassword: string; from: string }
  | {
      provider: "gmail_api";
      clientId: string;
      clientSecret: string;
      refreshToken: string;
      user: string;
      from: string;
    }
  | { provider: "resend"; resend: Resend; from: string };

/**
 * Returns the active email provider configuration (Gmail App Password, Gmail REST API OAuth2, or Resend),
 * or null if no email credentials are configured.
 */
export function getResendClient(): EmailProviderConfig | null {
  const gmailUser = process.env.GMAIL_USER?.trim();
  const gmailAppPassword = process.env.GMAIL_APP_PASSWORD?.replace(/\s+/g, "").trim();

  // 1. Gmail SMTP via 16-character App Password (easiest setup)
  if (gmailUser && gmailAppPassword) {
    const from = `ClosetAI <${gmailUser}>`;
    return {
      provider: "gmail_smtp",
      user: gmailUser,
      appPassword: gmailAppPassword,
      from,
    };
  }

  // 2. Gmail REST API via OAuth2 (Client ID + Client Secret + Refresh Token)
  const clientId = process.env.GMAIL_CLIENT_ID?.trim();
  const clientSecret = process.env.GMAIL_CLIENT_SECRET?.trim();
  const refreshToken = process.env.GMAIL_REFRESH_TOKEN?.trim();
  if (clientId && clientSecret && refreshToken) {
    const senderEmail = gmailUser || "me";
    const from =
      process.env.EMAIL_FROM?.trim() ||
      (gmailUser ? `ClosetAI <${gmailUser}>` : "ClosetAI");
    return {
      provider: "gmail_api",
      clientId,
      clientSecret,
      refreshToken,
      user: senderEmail,
      from,
    };
  }

  // 3. Resend API
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (apiKey) {
    const from = process.env.EMAIL_FROM?.trim() || "ClosetAI <onboarding@resend.dev>";
    return {
      provider: "resend",
      resend: new Resend(apiKey),
      from,
    };
  }

  return null;
}

export interface SendEmailPayload {
  to: string;
  subject: string;
  html: string;
}

/**
 * Builds an RFC 2822 base64url-encoded MIME message for the Gmail REST API (`users.messages.send`).
 */
function encodeGmailMimeMessage({
  from,
  to,
  subject,
  html,
}: {
  from: string;
  to: string;
  subject: string;
  html: string;
}): string {
  const encodedSubject = `=?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`;
  const mime = [
    `From: ${from}`,
    `To: ${to}`,
    `Subject: ${encodedSubject}`,
    "MIME-Version: 1.0",
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    Buffer.from(html, "utf8").toString("base64"),
  ].join("\r\n");

  return Buffer.from(mime, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function htmlToPlainText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<\/(p|div|h1|h2|h3|tr|li)>/gi, "\n")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/**
 * Sends an HTML email via Gmail (App Password or REST API OAuth2) or Resend.
 */
export async function sendEmail({
  to,
  subject,
  html,
}: SendEmailPayload): Promise<{ success: boolean; id?: string; error?: string }> {
  const config = getResendClient();
  const text = htmlToPlainText(html);

  if (!config) {
    logger.warn("email.not_configured", {
      to,
      subject,
      note: "Neither Gmail (GMAIL_USER + GMAIL_APP_PASSWORD / OAuth2) nor RESEND_API_KEY is configured.",
    });
    return {
      success: false,
      error: "Email service is not configured. Set GMAIL_USER and GMAIL_APP_PASSWORD (or RESEND_API_KEY).",
    };
  }

  try {
    // 1. Gmail SMTP (App Password via Port 587 STARTTLS over IPv4)
    if (config.provider === "gmail_smtp") {
      const smtpOptions = {
        host: "smtp.gmail.com",
        port: 587,
        secure: false,
        requireTLS: true,
        family: 4,
        connectionTimeout: 10_000,
        greetingTimeout: 10_000,
        socketTimeout: 15_000,
        auth: {
          user: config.user,
          pass: config.appPassword,
        },
      };
      const transporter = nodemailer.createTransport(smtpOptions);

      const info = await transporter.sendMail({
        from: config.from,
        replyTo: config.user,
        to,
        subject,
        text,
        html,
      });

      logger.info("email.sent_gmail_smtp", {
        id: info.messageId,
        to,
        subject,
        accepted: info.accepted,
        rejected: info.rejected,
        response: info.response,
      });
      return { success: true, id: info.messageId };
    }

    // 2. Gmail REST API (OAuth2 Refresh Token -> users.messages.send)
    if (config.provider === "gmail_api") {
      const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: config.clientId,
          client_secret: config.clientSecret,
          refresh_token: config.refreshToken,
          grant_type: "refresh_token",
        }),
      });

      if (!tokenRes.ok) {
        const errText = await tokenRes.text().catch(() => "");
        logger.error("email.gmail_oauth_failed", { status: tokenRes.status, errText: errText.slice(0, 200) });
        return { success: false, error: "Could not authenticate with Gmail OAuth2 API." };
      }

      const tokenData = (await tokenRes.json()) as { access_token?: string };
      if (!tokenData.access_token) {
        return { success: false, error: "Gmail OAuth2 did not return an access token." };
      }

      const raw = encodeGmailMimeMessage({ from: config.from, to, subject, html });
      const sendRes = await fetch(
        "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${tokenData.access_token}`,
          },
          body: JSON.stringify({ raw }),
        },
      );

      if (!sendRes.ok) {
        const errText = await sendRes.text().catch(() => "");
        logger.error("email.gmail_api_send_failed", { status: sendRes.status, errText: errText.slice(0, 200) });
        return { success: false, error: "Gmail API rejected the message." };
      }

      const sendData = (await sendRes.json()) as { id?: string };
      logger.info("email.sent_gmail_api", { id: sendData.id, to, subject });
      return { success: true, id: sendData.id };
    }

    // 3. Resend
    const { data, error } = await config.resend.emails.send({
      from: config.from,
      to,
      subject,
      html,
    });

    if (error) {
      logger.error("email.send_failed", { error, to, subject });
      return { success: false, error: error.message };
    }

    logger.info("email.sent_resend", { id: data?.id, to, subject });
    return { success: true, id: data?.id };
  } catch (err) {
    logger.error("email.exception", { err, to, subject });
    return { success: false, error: err instanceof Error ? err.message : "Email delivery failed" };
  }
}

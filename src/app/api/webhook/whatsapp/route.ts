import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { digitsOnly } from "@/lib/whatsapp/phone";
import { parseVerificationCode, verifyCodeFromSender } from "@/lib/whatsapp/verification";
import { sendWhatsAppMessage } from "@/lib/whatsapp/service";

/**
 * Meta WhatsApp Webhook Endpoint
 *
 * GET  — handshake: Meta confirms the callback URL using WHATSAPP_VERIFY_TOKEN.
 * POST — inbound messages and delivery statuses, authenticated by X-Hub-Signature-256
 *        (HMAC-SHA256 of the raw body with the app secret).
 *
 * Both methods FAIL CLOSED: if the secret/token is not configured the endpoint refuses to work
 * instead of accepting anything. There is deliberately no default token.
 *
 * Inbound handling (all database access uses the service-role client — there is no user session
 * in a webhook, and the tables involved are server-only):
 *  - dedupes by Meta message id (atomic insert, retries are safe)
 *  - records `whatsapp_last_inbound_at`, which starts Meta's 24-hour customer-service window
 *  - STOP / START opt-out and opt-in
 *  - a verification code texted from the number being verified
 */

const MAX_MESSAGES_PER_REQUEST = 100;

function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

const STOP_WORDS = new Set(["STOP", "STOPALL", "STOP ALL", "UNSUBSCRIBE", "CANCEL", "END", "QUIT"]);
const START_WORDS = new Set(["START", "UNSTOP", "SUBSCRIBE", "RESUME"]);

async function reply(to: string, message: string): Promise<void> {
  try {
    // The user just messaged us, so we are inside the 24-hour window and may send free-form text.
    await sendWhatsAppMessage({ to, message, skipVerificationCheck: true, skipOptOutCheck: true });
  } catch (err) {
    logger.warn("whatsapp.webhook_reply_failed", { err });
  }
}

async function handleOptOut(digits: string): Promise<void> {
  const admin = createAdminClient();
  const { error: optErr } = await admin
    .from("whatsapp_optouts")
    .upsert({ phone_digits: digits, opted_out_at: new Date().toISOString() }, { onConflict: "phone_digits" });
  if (optErr) logger.error("whatsapp.optout_record_failed", { err: optErr });

  const { error } = await admin
    .from("email_preferences")
    .update({
      whatsapp_daily_enabled: false,
      whatsapp_weekly_enabled: false,
      whatsapp_enabled: false,
      updated_at: new Date().toISOString(),
    })
    .eq("whatsapp_phone_digits", digits);
  if (error) logger.error("whatsapp.optout_prefs_failed", { err: error });

  logger.info("whatsapp.user_opted_out");
  await reply(digits, "You've been unsubscribed from ClosetAI WhatsApp messages. Text START any time to turn them back on.");
}

async function handleOptIn(digits: string): Promise<void> {
  const admin = createAdminClient();
  const { error: delErr } = await admin.from("whatsapp_optouts").delete().eq("phone_digits", digits);
  if (delErr) logger.error("whatsapp.optin_clear_failed", { err: delErr });

  // Only a number that completed verification is switched back on. Texting START from the
  // number itself is the consent; an unverified number never gets messages just by existing.
  const { error } = await admin
    .from("email_preferences")
    .update({ whatsapp_daily_enabled: true, whatsapp_enabled: true, updated_at: new Date().toISOString() })
    .eq("whatsapp_phone_digits", digits)
    .eq("whatsapp_phone_verified", true);
  if (error) logger.error("whatsapp.optin_prefs_failed", { err: error });

  logger.info("whatsapp.user_opted_in");
  await reply(digits, "Welcome back! ClosetAI WhatsApp messages are on again. Text STOP any time to opt out.");
}

async function handleVerificationCode(digits: string, text: string): Promise<void> {
  const result = await verifyCodeFromSender(digits, text);
  if (result.success) {
    logger.info("whatsapp.phone_verified_via_webhook", { userId: result.userId });
    await reply(digits, "✅ Your number is verified. You'll now get your ClosetAI outfit updates here.");
    return;
  }
  logger.info("whatsapp.invalid_code_submitted", { reason: result.errorCode });
  if (result.errorCode === "LOCKED") {
    await reply(digits, "That code is locked after too many wrong tries. Request a new one in ClosetAI Settings.");
  } else if (result.errorCode === "INVALID") {
    await reply(digits, "That code didn't work or has expired. Request a new one in ClosetAI Settings.");
  }
}

async function handleIncomingText(messageId: string, from: string, textBody: string): Promise<void> {
  const digits = digitsOnly(from);
  if (!digits) {
    logger.warn("whatsapp.inbound_bad_sender");
    return;
  }

  const admin = createAdminClient();

  // Atomic dedupe: only the request that actually inserts the id proceeds. Meta retries are safe.
  const { data: inserted, error: dedupeErr } = await admin
    .from("whatsapp_webhook_messages")
    .upsert({ whatsapp_message_id: messageId, from_number: digits }, { onConflict: "whatsapp_message_id", ignoreDuplicates: true })
    .select("id");
  if (dedupeErr) {
    // Every handler below is idempotent, so keep going rather than drop a STOP request.
    logger.error("whatsapp.dedupe_failed", { err: dedupeErr });
  } else if (!inserted || inserted.length === 0) {
    logger.info("whatsapp.duplicate_message_ignored", { messageId });
    return;
  }

  // The user messaged us: Meta's 24-hour customer-service window starts now.
  const { error: touchErr } = await admin
    .from("email_preferences")
    .update({ whatsapp_last_inbound_at: new Date().toISOString() })
    .eq("whatsapp_phone_digits", digits);
  if (touchErr) logger.error("whatsapp.inbound_touch_failed", { err: touchErr });

  const normalized = textBody.trim().toUpperCase().replace(/\s+/g, " ");
  if (STOP_WORDS.has(normalized)) return handleOptOut(digits);
  if (START_WORDS.has(normalized)) return handleOptIn(digits);
  if (parseVerificationCode(textBody)) return handleVerificationCode(digits, textBody);

  logger.info("whatsapp.unknown_message", { messageId });
}

export async function GET(request: NextRequest) {
  const expectedToken = process.env.WHATSAPP_VERIFY_TOKEN?.trim();
  if (!expectedToken) {
    logger.error("whatsapp.webhook_not_configured", { err: new Error("WHATSAPP_VERIFY_TOKEN is not set") });
    return NextResponse.json({ error: "Webhook is not configured." }, { status: 500 });
  }

  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token") ?? "";
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && challenge && safeCompare(token, expectedToken)) {
    logger.info("whatsapp.webhook_verified");
    return new Response(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  }

  return NextResponse.json({ error: "Verification token mismatch" }, { status: 403 });
}

export async function POST(request: NextRequest) {
  const appSecret = process.env.WHATSAPP_APP_SECRET?.trim();
  if (!appSecret) {
    logger.error("whatsapp.webhook_not_configured", { err: new Error("WHATSAPP_APP_SECRET is not set") });
    return NextResponse.json({ error: "Webhook is not configured." }, { status: 500 });
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return NextResponse.json({ error: "Could not read request body." }, { status: 400 });
  }

  const signatureHeader = request.headers.get("x-hub-signature-256") ?? "";
  if (!signatureHeader.startsWith("sha256=")) {
    return NextResponse.json({ error: "Missing or invalid webhook signature." }, { status: 401 });
  }
  const expectedSignature = "sha256=" + crypto.createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");
  if (!safeCompare(signatureHeader, expectedSignature)) {
    logger.warn("whatsapp.webhook_invalid_signature");
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON." }, { status: 400 });
  }

  // Meta batches: many entries, each with many changes, each with many messages.
  type Change = { value?: { messages?: Array<{ id?: string; type?: string; from?: string; text?: { body?: string } }>; statuses?: Array<{ id?: string; status?: string }> } };
  const entries = Array.isArray((body as { entry?: unknown })?.entry) ? ((body as { entry: Array<{ changes?: Change[] }> }).entry) : [];

  let processed = 0;
  for (const entry of entries) {
    for (const change of entry.changes ?? []) {
      for (const status of change.value?.statuses ?? []) {
        logger.info("whatsapp.status_update", { status: status.status, id: status.id });
      }
      for (const msg of change.value?.messages ?? []) {
        if (processed++ >= MAX_MESSAGES_PER_REQUEST) break;
        // Never log phone numbers or message text (PII); only the id and type.
        logger.info("whatsapp.incoming_message", { id: msg.id, type: msg.type });
        if (msg.type === "text" && msg.id && msg.from && typeof msg.text?.body === "string") {
          try {
            await handleIncomingText(msg.id, msg.from, msg.text.body);
          } catch (err) {
            // One bad message must not make Meta retry the whole batch.
            logger.error("whatsapp.incoming_text_error", { err, messageId: msg.id });
          }
        }
      }
    }
  }

  return NextResponse.json({ status: "ok" }, { status: 200 });
}

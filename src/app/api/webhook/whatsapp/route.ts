import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";
import { parseVerificationCode, hashVerificationCode } from "@/lib/whatsapp/verification";

function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Handles incoming text message for verification code or opt-out commands
 */
async function handleIncomingTextMessage(
  messageId: string,
  from: string,
  textBody: string
): Promise<void> {
  try {
    const supabase = await createClient();
    
    // Check for message deduplication
    const { data: existing } = await supabase
      .from('whatsapp_webhook_messages')
      .select('id')
      .eq('whatsapp_message_id', messageId)
      .single();
    
    if (existing) {
      logger.info('whatsapp.duplicate_message_ignored', { messageId });
      return;
    }
    
    // Store message ID for deduplication (create table if needed)
    await supabase
      .from('whatsapp_webhook_messages')
      .insert({ 
        whatsapp_message_id: messageId,
        from_number: from.replace(/[^0-9]/g, ''),
        received_at: new Date().toISOString(),
      })
      .catch(() => {
        // Table might not exist yet - non-critical for now
        logger.warn('whatsapp.dedup_table_missing');
      });
    
    const normalized = textBody.trim().toUpperCase();
    
    // Handle STOP command (opt-out)
    if (normalized === 'STOP' || normalized === 'STOPALL' || normalized === 'UNSUBSCRIBE' || normalized === 'STOP ALL') {
      await handleOptOut(from);
      return;
    }
    
    // Handle START command (opt-in)
    if (normalized === 'START' || normalized === 'UNSTOP') {
      await handleOptIn(from);
      return;
    }
    
    // Try to parse as verification code
    const codeDigits = parseVerificationCode(textBody);
    if (codeDigits) {
      await handleVerificationCode(from, codeDigits);
      return;
    }
    
    // Unknown message - log but don't respond
    logger.info('whatsapp.unknown_message', { messageId });
  } catch (error) {
    logger.error('whatsapp.incoming_text_error', { err: error, messageId });
  }
}

/**
 * Handles user opt-out (STOP command)
 */
async function handleOptOut(from: string): Promise<void> {
  try {
    const supabase = await createClient();
    const cleanPhone = from.replace(/[^0-9]/g, '');
    
    // Disable WhatsApp for this phone number in email_preferences
    const { error } = await supabase
      .from('email_preferences')
      .update({ 
        whatsapp_enabled: false,
        updated_at: new Date().toISOString(),
      })
      .eq('whatsapp_phone', cleanPhone);
    
    if (error) {
      logger.error('whatsapp.dedup_table_missing', { err: error });
    } else {
      logger.info('whatsapp.user_opted_out');
    }
  } catch (error) {
    logger.error('whatsapp.opt_out_error', { err: error });
  }
}

/**
 * Handles user opt-in (START command)
 */
async function handleOptIn(from: string): Promise<void> {
  try {
    const supabase = await createClient();
    const cleanPhone = from.replace(/[^0-9]/g, '');
    
    // Re-enable WhatsApp for this phone number (if they had it before)
    const { error } = await supabase
      .from('email_preferences')
      .update({ 
        whatsapp_enabled: true,
        updated_at: new Date().toISOString(),
      })
      .eq('whatsapp_phone', cleanPhone);
    
    if (error) {
      logger.error('whatsapp.opt_in_failed', { err: error });
    } else {
      logger.info('whatsapp.user_opted_in');
    }
  } catch (error) {
    logger.error('whatsapp.opt_in_error', { err: error });
  }
}

/**
 * Handles verification code submission via WhatsApp
 */
async function handleVerificationCode(from: string, codeDigits: string): Promise<void> {
  try {
    const supabase = await createClient();
    const cleanPhone = from.replace(/[^0-9]/g, '');
    
    // Find user by phone number in email_preferences
    const { data: prefs, error: prefsError } = await supabase
      .from('email_preferences')
      .select('user_id, whatsapp_phone_verified')
      .eq('whatsapp_phone', cleanPhone)
      .single();
    
    if (prefsError || !prefs) {
      logger.warn('whatsapp.verification_no_user_found');
      return;
    }
    
    if (prefs.whatsapp_phone_verified) {
      logger.info('whatsapp.already_verified', { userId: prefs.user_id });
      return;
    }
    
    // Hash and verify code
    const codeHash = hashVerificationCode(codeDigits);
    
    const { data, error } = await supabase.rpc('verify_whatsapp_code', {
      p_user_id: prefs.user_id,
      p_code_hash: codeHash,
    });
    
    if (error) {
      logger.error('whatsapp.verify_code_rpc_failed', { err: error, userId: prefs.user_id });
      return;
    }
    
    if (data && data[0]?.success) {
      logger.info('whatsapp.phone_verified_via_webhook', { userId: prefs.user_id });
    } else {
      logger.info('whatsapp.invalid_code_submitted', { userId: prefs.user_id });
    }
  } catch (error) {
    logger.error('whatsapp.verification_error', { err: error });
  }
}

/**
 * Meta WhatsApp Webhook Endpoint
 *
 * 1. GET: Handshake verification by Meta to confirm the endpoint URL and secret token.
 * 2. POST: Receives incoming status updates (sent, delivered, read) and replies from users,
 *    verified via X-Hub-Signature-256 HMAC-SHA256.
 * 
 * Handles:
 * - Verification codes texted to business number
 * - STOP/START opt-out commands
 * - Message status updates
 * - Message deduplication
 */

export async function GET(request: NextRequest) {
  const expectedToken = process.env.WHATSAPP_VERIFY_TOKEN?.trim() || "closetai_whatsapp_verify_2026";

  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token") ?? "";
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && challenge && safeCompare(token, expectedToken)) {
    logger.info("whatsapp.webhook_verified");
    return new Response(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  return NextResponse.json({ error: "Verification token mismatch" }, { status: 403 });
}

export async function POST(request: NextRequest) {
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return NextResponse.json({ error: "Could not read request body." }, { status: 400 });
  }

  const appSecret = process.env.WHATSAPP_APP_SECRET?.trim();
  if (appSecret) {
    const signatureHeader = request.headers.get("x-hub-signature-256") ?? "";
    if (!signatureHeader.startsWith("sha256=")) {
      return NextResponse.json({ error: "Missing or invalid webhook signature." }, { status: 401 });
    }

    const expectedSignature =
      "sha256=" + crypto.createHmac("sha256", appSecret).update(rawBody, "utf8").digest("hex");

    if (!safeCompare(signatureHeader, expectedSignature)) {
      logger.warn("whatsapp.webhook_invalid_signature");
      return NextResponse.json({ error: "Invalid webhook signature." }, { status: 401 });
    }
  }

  try {
    const body = JSON.parse(rawBody);

    // Meta sends notification pings (deliveries, incoming replies)
    const change = body?.entry?.[0]?.changes?.[0]?.value;
    if (change) {
      const statuses = change.statuses;
      const messages = change.messages;

      if (Array.isArray(statuses) && statuses[0]) {
        logger.info("whatsapp.status_update", {
          status: statuses[0].status,
          id: statuses[0].id,
        });
      }

      if (Array.isArray(messages) && messages[0]) {
        const msg = messages[0];
        // Log only message ID and type — never log phone numbers or message body text (PII)
        logger.info("whatsapp.incoming_message", {
          id: msg.id,
          type: msg.type,
        });
        
        // Handle text messages (verification codes, STOP/START commands)
        if (msg.type === 'text' && msg.text?.body) {
          await handleIncomingTextMessage(
            msg.id,
            msg.from,
            msg.text.body
          );
        }
      }
    }

    return NextResponse.json({ status: "ok" }, { status: 200 });
  } catch (err) {
    logger.error("whatsapp.webhook_error", { err });
    return NextResponse.json({ status: "error" }, { status: 400 });
  }
}

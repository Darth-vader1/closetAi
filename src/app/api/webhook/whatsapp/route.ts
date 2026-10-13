import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";

function safeCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

/**
 * Meta WhatsApp Webhook Endpoint
 *
 * 1. GET: Handshake verification by Meta to confirm the endpoint URL and secret token.
 * 2. POST: Receives incoming status updates (sent, delivered, read) and replies from users,
 *    verified via X-Hub-Signature-256 HMAC-SHA256.
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
        // Log only message ID and type — never log phone numbers or message body text (PII)
        logger.info("whatsapp.incoming_message", {
          id: messages[0].id,
          type: messages[0].type,
        });
      }
    }

    return NextResponse.json({ status: "ok" }, { status: 200 });
  } catch (err) {
    logger.error("whatsapp.webhook_error", { err });
    return NextResponse.json({ status: "error" }, { status: 400 });
  }
}

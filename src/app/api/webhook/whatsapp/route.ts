import { NextRequest, NextResponse } from "next/server";
import { logger } from "@/lib/logger";

/**
 * Meta WhatsApp Webhook Endpoint
 * 
 * 1. GET: Handshake verification by Meta to confirm the endpoint URL and secret token.
 * 2. POST: Receives incoming status updates (sent, delivered, read) and replies from users.
 */

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  const expectedToken = process.env.WHATSAPP_VERIFY_TOKEN?.trim() || "closetai_webhook_secret";

  if (mode === "subscribe" && token === expectedToken) {
    logger.info("whatsapp.webhook_verified");
    return new Response(challenge, { status: 200 });
  }

  return NextResponse.json({ error: "Verification token mismatch" }, { status: 403 });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);

    // Meta sends notification pings (deliveries, incoming replies)
    if (body?.entry?.[0]?.changes?.[0]?.value) {
      const change = body.entry[0].changes[0].value;
      const statuses = change.statuses;
      const messages = change.messages;

      if (statuses) {
        logger.info("whatsapp.status_update", { status: statuses[0]?.status, id: statuses[0]?.id });
      }

      if (messages) {
        logger.info("whatsapp.incoming_message", {
          from: messages[0]?.from,
          text: messages[0]?.text?.body,
        });
      }
    }

    // Must return 200 OK fast so Meta knows message was received
    return NextResponse.json({ status: "ok" }, { status: 200 });
  } catch (err) {
    logger.error("whatsapp.webhook_error", { err });
    return NextResponse.json({ status: "error" }, { status: 500 });
  }
}

import { logger } from "@/lib/logger";

export interface SendWhatsAppPayload {
  to: string; // E.164 formatted phone number (e.g. "+2348012345678" or "2348012345678")
  message: string;
  imageUrl?: string | null; // Single photo fallback
  imageUrls?: string[]; // Multiple photos of the outfit garments (e.g. top, bottom, shoes)
}

export interface MetaCloudConfig {
  provider: "meta";
  accessToken: string;
  phoneNumberId: string;
}

export interface TwilioConfig {
  provider: "twilio";
  accountSid: string;
  authToken: string;
  fromNumber: string; // e.g. "whatsapp:+14155238886"
}

export type WhatsAppProviderConfig = MetaCloudConfig | TwilioConfig;

/**
 * Checks for WhatsApp credentials in priority order:
 * 1. Meta WhatsApp Cloud API (WHATSAPP_ACCESS_TOKEN & WHATSAPP_PHONE_NUMBER_ID)
 * 2. Twilio WhatsApp API (TWILIO_ACCOUNT_SID & TWILIO_AUTH_TOKEN)
 * 3. Null (Simulation Mode)
 */
export function getWhatsAppConfig(): WhatsAppProviderConfig | null {
  // 1. Check for Meta WhatsApp Cloud API first
  const metaToken = process.env.WHATSAPP_ACCESS_TOKEN?.trim() || process.env.META_WHATSAPP_TOKEN?.trim();
  const metaPhoneId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim() || process.env.META_PHONE_NUMBER_ID?.trim();

  if (metaToken && metaPhoneId) {
    return {
      provider: "meta",
      accessToken: metaToken,
      phoneNumberId: metaPhoneId,
    };
  }

  // 2. Check for Twilio fallback
  const twilioSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const twilioToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const twilioFrom = process.env.TWILIO_WHATSAPP_FROM?.trim() || "whatsapp:+14155238886";

  if (twilioSid && twilioToken) {
    return {
      provider: "twilio",
      accountSid: twilioSid,
      authToken: twilioToken,
      fromNumber: twilioFrom,
    };
  }

  return null;
}

/**
 * Clean phone number to digits only (without leading + or whatsapp: prefix for Meta,
 * e.g. "2348012345678")
 */
function cleanDigits(phone: string): string {
  return phone.replace(/^whatsapp:/i, "").replace(/[^\d]/g, "");
}

/**
 * Dispatches a WhatsApp notification using either:
 * - Direct Meta WhatsApp Cloud API (Graph API v21.0)
 * - Twilio WhatsApp API
 * - Local Simulation Mode (prints formatted card to console if unconfigured)
 */
export async function sendWhatsAppMessage({
  to,
  message,
  imageUrl,
  imageUrls = [],
}: SendWhatsAppPayload): Promise<{ success: boolean; id?: string; error?: string }> {
  const digitsOnly = cleanDigits(to);
  const config = getWhatsAppConfig();

  // Combine images
  const allImages = [...(imageUrls || []), ...(imageUrl ? [imageUrl] : [])].filter(
    (url, idx, self) => Boolean(url) && self.indexOf(url) === idx,
  );

  // Simulation Mode Fallback
  if (!config) {
    logger.info("whatsapp.simulation", {
      to: `+${digitsOnly}`,
      imageCount: allImages.length,
      messagePreview: message.slice(0, 100),
      note: "Neither Meta Cloud API nor Twilio credentials found. Dispatched in console simulation mode.",
    });

    console.log(`\n💬 [WHATSAPP SIMULATION DISPATCH]`);
    console.log(`To: +${digitsOnly}`);
    if (allImages.length) console.log(`Images: ${allImages.join(", ")}`);
    console.log(`----------------------------------------`);
    console.log(message);
    console.log(`----------------------------------------\n`);

    return { success: true, id: "simulated-wa-" + Date.now() };
  }

  // Provider 1: Meta WhatsApp Cloud API
  if (config.provider === "meta") {
    try {
      const endpoint = `https://graph.facebook.com/v21.0/${config.phoneNumberId}/messages`;

      // 1. Send the first item photo with the full styling caption (or text if no images)
      const primaryImage = allImages[0];
      const primaryPayload = primaryImage
        ? {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: digitsOnly,
            type: "image",
            image: {
              link: primaryImage,
              caption: message,
            },
          }
        : {
            messaging_product: "whatsapp",
            recipient_type: "individual",
            to: digitsOnly,
            type: "text",
            text: {
              preview_url: false,
              body: message,
            },
          };

      let res = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(primaryPayload),
      });

      let data = await res.json().catch(() => null);

      // Meta 24-hour Customer Care Window rule:
      if (!res.ok && (data?.error?.code === 131047 || data?.error?.message?.includes("template"))) {
        console.log("ℹ️ Outside 24-hour window, dispatching WhatsApp template 'hello_world'...");
        const templatePayload = {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: digitsOnly,
          type: "template",
          template: {
            name: "hello_world",
            language: { code: "en_US" },
          },
        };

        res = await fetch(endpoint, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${config.accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(templatePayload),
        });

        data = await res.json().catch(() => null);
      }

      if (!res.ok || data?.error) {
        const errMsg = data?.error?.message || res.statusText || "Meta WhatsApp Cloud API error";
        logger.error("whatsapp.meta_dispatch_failed", { error: data?.error, to: digitsOnly });
        return { success: false, error: errMsg };
      }

      const messageId = data?.messages?.[0]?.id || "meta-" + Date.now();

      // 2. If there are additional garment photos (e.g. top + trousers + shoes), dispatch them sequentially
      if (allImages.length > 1) {
        for (let i = 1; i < allImages.length; i++) {
          try {
            await fetch(endpoint, {
              method: "POST",
              headers: {
                Authorization: `Bearer ${config.accessToken}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify({
                messaging_product: "whatsapp",
                recipient_type: "individual",
                to: digitsOnly,
                type: "image",
                image: { link: allImages[i] },
              }),
            });
          } catch {
            // Non-critical if secondary image fails
          }
        }
      }
      logger.info("whatsapp.meta_dispatched", { id: messageId, to: digitsOnly });
      return { success: true, id: messageId };
    } catch (err) {
      logger.error("whatsapp.meta_exception", { error: err, to: digitsOnly });
      return { success: false, error: err instanceof Error ? err.message : "Meta API network error" };
    }
  }

  // Provider 2: Twilio WhatsApp
  try {
    const formattedTo = `whatsapp:+${digitsOnly}`;
    const authHeader = Buffer.from(`${config.accountSid}:${config.authToken}`).toString("base64");
    const endpoint = `https://api.twilio.com/2010-04-01/Accounts/${config.accountSid}/Messages.json`;

    const bodyParams = new URLSearchParams({
      From: config.fromNumber,
      To: formattedTo,
      Body: message,
    });

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Basic ${authHeader}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: bodyParams.toString(),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({ message: res.statusText }));
      logger.error("whatsapp.twilio_dispatch_failed", { error: errData, to: formattedTo });
      return { success: false, error: errData.message || "Failed to dispatch Twilio WhatsApp message." };
    }

    const data = await res.json();
    return { success: true, id: data.sid };
  } catch (err) {
    logger.error("whatsapp.twilio_exception", { error: err, to: digitsOnly });
    return { success: false, error: err instanceof Error ? err.message : "Twilio API network error" };
  }
}

/**
 * Formats a clean, readable WhatsApp Outfit Card with markdown styling and emoji.
 */
export function formatDailyOutfitWhatsApp({
  displayName,
  outfitName,
  occasion,
  styleDescription,
  stylingTip,
  weatherSummary,
  items,
  appUrl = "https://closetai.app",
}: {
  displayName: string;
  outfitName: string;
  occasion: string;
  styleDescription: string;
  stylingTip: string;
  weatherSummary?: string;
  items: Array<{ name: string; category: string; colour?: string | null }>;
  appUrl?: string;
}): string {
  const itemLines = items.map((i) => `  • *${i.category}:* ${i.name}${i.colour ? ` (${i.colour})` : ""}`).join("\n");

  return [
    `✨ *ClosetAI · Your Daily Look*`,
    ``,
    `Good morning, *${displayName}*! 👋`,
    weatherSummary ? `🌤️ *Weather:* ${weatherSummary}` : null,
    `🎯 *Occasion:* ${occasion}`,
    ``,
    `👗 *${outfitName}*`,
    `_${styleDescription}_`,
    ``,
    `*Your Pieces For Today:*`,
    itemLines,
    ``,
    `💡 *Stylist Tip:*`,
    `${stylingTip}`,
    ``,
    `Tap to confirm wear or swap pieces:`,
    `${appUrl}/stylist`,
  ]
    .filter((line) => line !== null)
    .join("\n");
}

/**
 * Formats a WhatsApp link URL for direct 1-tap browser sharing (wa.me)
 */
export function createWhatsAppShareLink(text: string): string {
  return `https://wa.me/?text=${encodeURIComponent(text)}`;
}

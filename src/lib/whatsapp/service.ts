import { logger, logError } from "@/lib/logger";
import {
  buildTemplateMessagePayload,
  parseMetaError,
  isWithin24HourWindow,
  type WhatsAppTemplateName,
  type TemplateParams,
  logTemplateSend,
} from './templates';

export interface SendWhatsAppPayload {
  to: string; // E.164 formatted phone number (e.g. "+2348012345678" or "2348012345678")
  message: string;
  imageUrl?: string | null; // Single photo fallback
  imageUrls?: string[]; // Multiple photos of the outfit garments (e.g. top, bottom, shoes)
  userId?: string; // For tracking 24h window and verification status
  skipVerificationCheck?: boolean; // For internal verification messages only
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
 * Production safety check - refuse simulation in production
 * CRITICAL: Prevents silent failures where WhatsApp isn't configured in prod
 */
function checkProductionSimulation(): void {
  const isProduction = process.env.NODE_ENV === 'production' || 
                       process.env.VERCEL_ENV === 'production';
  
  if (isProduction) {
    throw new Error(
      'PRODUCTION_SAFETY: WhatsApp credentials not configured. ' +
      'Refusing to simulate in production environment. ' +
      'Set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID.'
    );
  }
}

/**
 * Checks for WhatsApp credentials in priority order:
 * 1. Meta WhatsApp Cloud API (WHATSAPP_ACCESS_TOKEN & WHATSAPP_PHONE_NUMBER_ID)
 * 2. Twilio WhatsApp API (TWILIO_ACCOUNT_SID & TWILIO_AUTH_TOKEN)
 * 3. Null (Simulation Mode - development only, throws in production)
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
 * Sends a WhatsApp template message (for use outside 24h window)
 * 
 * Template messages must be pre-approved by Meta. Use this when:
 * - Outside the 24-hour customer care window
 * - User has verified their phone number
 * - Rate limits exceeded on regular messages
 */
export async function sendTemplateMessage(
  to: string,
  templateName: WhatsAppTemplateName,
  params: TemplateParams
): Promise<{ success: boolean; id?: string; error?: string }> {
  const digitsOnly = cleanDigits(to);
  const config = getWhatsAppConfig();

  if (!config) {
    checkProductionSimulation();
    
    // Simulation mode for development
    logger.info("whatsapp.template_simulation", {
      to: `+${digitsOnly}`,
      template: templateName,
      note: "Template dispatched in console simulation mode.",
    });

    console.log(`\n📋 [WHATSAPP TEMPLATE SIMULATION]`);
    console.log(`To: +${digitsOnly}`);
    console.log(`Template: ${templateName}`);
    console.log(`Params:`, params);
    console.log(`----------------------------------------\n`);

    return { success: true, id: "simulated-template-" + Date.now() };
  }

  // Only Meta Cloud API supports templates
  if (config.provider !== "meta") {
    const error = "Template messages only supported with Meta WhatsApp Cloud API";
    logError(new Error(error), { provider: config.provider });
    return { success: false, error };
  }

  try {
    const endpoint = `https://graph.facebook.com/v21.0/${config.phoneNumberId}/messages`;
    const payload = buildTemplateMessagePayload(to, templateName, params);

    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json().catch(() => null);

    if (!res.ok || data?.error) {
      const parsedError = parseMetaError(data);
      const errMsg = parsedError?.message || data?.error?.message || res.statusText || "Meta API error";
      
      logTemplateSend(templateName, false, parsedError || undefined);
      logger.error("whatsapp.template_failed", { 
        error: data?.error, 
        to: digitsOnly,
        template: templateName,
        errorCode: parsedError?.code,
      });
      
      return { success: false, error: errMsg };
    }

    const messageId = data?.messages?.[0]?.id || "meta-template-" + Date.now();
    logTemplateSend(templateName, true);
    logger.info("whatsapp.template_sent", { 
      id: messageId, 
      to: digitsOnly,
      template: templateName,
    });
    
    return { success: true, id: messageId };
  } catch (err) {
    logError(err as Error, { to: digitsOnly, template: templateName });
    logger.error("whatsapp.template_exception", { 
      error: err, 
      to: digitsOnly,
      template: templateName,
    });
    return { 
      success: false, 
      error: err instanceof Error ? err.message : "Meta API network error" 
    };
  }
}

/**
 * Updates the last message timestamp for 24h window tracking
 */
async function updateLastMessageTime(userId: string): Promise<void> {
  try {
    const { createClient } = await import('@/lib/supabase/server');
    const supabase = await createClient();
    
    await supabase
      .from('email_preferences')
      .update({ last_whatsapp_message_at: new Date().toISOString() })
      .eq('user_id', userId);
  } catch (error) {
    // Non-critical - log but don't fail the message
    logError(error as Error, { userId, context: 'updateLastMessageTime' });
  }
}

/**
 * Checks if user has verified their phone number
 */
async function isPhoneVerified(userId: string): Promise<boolean> {
  try {
    const { createClient } = await import('@/lib/supabase/server');
    const supabase = await createClient();
    
    const { data, error } = await supabase
      .from('email_preferences')
      .select('whatsapp_phone_verified')
      .eq('user_id', userId)
      .single();
    
    if (error) {
      logError(error, { userId, context: 'isPhoneVerified' });
      return false;
    }
    
    return data?.whatsapp_phone_verified || false;
  } catch (error) {
    logError(error as Error, { userId, context: 'isPhoneVerified' });
    return false;
  }
}

/**
 * Dispatches a WhatsApp notification using either:
 * - Direct Meta WhatsApp Cloud API (Graph API v21.0)
 * - Twilio WhatsApp API
 * - Local Simulation Mode (prints formatted card to console if unconfigured)
 * 
 * Production safety:
 * - Refuses simulation in production environment
 * - Checks phone verification status for user messages (unless skipVerificationCheck=true)
 * - Tracks 24h messaging window
 */
export async function sendWhatsAppMessage({
  to,
  message,
  imageUrl,
  imageUrls = [],
  userId,
  skipVerificationCheck = false,
}: SendWhatsAppPayload): Promise<{ success: boolean; id?: string; error?: string }> {
  const digitsOnly = cleanDigits(to);
  const config = getWhatsAppConfig();

  // Production safety check - refuse simulation in production
  if (!config) {
    checkProductionSimulation();
  }

  // Verify phone ownership for user-initiated messages (not for verification codes)
  if (userId && !skipVerificationCheck) {
    const verified = await isPhoneVerified(userId);
    if (!verified) {
      const error = "Phone number not verified. Complete verification in settings.";
      logger.warn("whatsapp.unverified_send_blocked", { userId });
      return { success: false, error };
    }
  }

  // Combine images
  const allImages = [...(imageUrls || []), ...(imageUrl ? [imageUrl] : [])].filter(
    (url, idx, self) => Boolean(url) && self.indexOf(url) === idx,
  );

  // Simulation Mode Fallback (development only)
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
      // If outside window (error 131047), don't auto-retry - this should use templates
      if (!res.ok && data?.error) {
        const parsedError = parseMetaError(data);
        
        if (parsedError?.isOutside24hWindow) {
          const errMsg = "Outside 24-hour messaging window. Use template messages instead.";
          logger.warn("whatsapp.outside_24h_window", { 
            to: digitsOnly,
            userId,
            errorCode: parsedError.code,
          });
          return { success: false, error: errMsg };
        }
        
        // Log other errors
        const errMsg = parsedError?.message || data?.error?.message || res.statusText || "Meta WhatsApp Cloud API error";
        logger.error("whatsapp.meta_dispatch_failed", { 
          error: data?.error, 
          to: digitsOnly,
          errorCode: parsedError?.code,
        });
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
      
      // Update 24h window tracking
      if (userId) {
        await updateLastMessageTime(userId);
      }
      
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
    
    // Update 24h window tracking
    if (userId) {
      await updateLastMessageTime(userId);
    }
    
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

/**
 * WhatsApp Template Message Management
 * 
 * Handles sending pre-approved template messages when outside the 24-hour window.
 * All templates must be approved by Meta before use.
 */

import { logError } from '@/lib/logger';

// Template names registered with Meta
export const WHATSAPP_TEMPLATES = {
  DAILY_OUTFIT: 'daily_outfit_suggestion',
  WEEKLY_LAUNDRY: 'weekly_laundry_reminder',
  VERIFICATION_CODE: 'phone_verification',
} as const;

export type WhatsAppTemplateName = typeof WHATSAPP_TEMPLATES[keyof typeof WHATSAPP_TEMPLATES];

// Template parameter types for type safety
export interface DailyOutfitParams {
  userName: string;
  weatherDescription: string;
}

export interface WeeklyLaundryParams {
  userName: string;
  itemCount: number;
}

export interface VerificationCodeParams {
  code: string;
}

export type TemplateParams = DailyOutfitParams | WeeklyLaundryParams | VerificationCodeParams;

/**
 * Formats template parameters for Meta API
 * Parameters must match the order defined in Meta Business Manager
 */
function formatTemplateParameters(
  templateName: WhatsAppTemplateName,
  params: TemplateParams
): Array<{ type: 'text'; text: string }> {
  switch (templateName) {
    case WHATSAPP_TEMPLATES.DAILY_OUTFIT: {
      const p = params as DailyOutfitParams;
      return [
        { type: 'text', text: p.userName },
        { type: 'text', text: p.weatherDescription },
      ];
    }

    case WHATSAPP_TEMPLATES.WEEKLY_LAUNDRY: {
      const p = params as WeeklyLaundryParams;
      return [
        { type: 'text', text: p.userName },
        { type: 'text', text: p.itemCount.toString() },
      ];
    }

    case WHATSAPP_TEMPLATES.VERIFICATION_CODE: {
      const p = params as VerificationCodeParams;
      return [
        { type: 'text', text: p.code },
      ];
    }

    default: {
      const exhaustiveCheck: never = templateName;
      throw new Error(`Unknown template: ${exhaustiveCheck}`);
    }
  }
}

/**
 * Builds the template message payload for Meta Cloud API
 * 
 * @see https://developers.facebook.com/docs/whatsapp/cloud-api/guides/send-message-templates
 */
export function buildTemplateMessagePayload(
  to: string,
  templateName: WhatsAppTemplateName,
  params: TemplateParams,
  languageCode: string = 'en_US'
): object {
  const components = [
    {
      type: 'body',
      parameters: formatTemplateParameters(templateName, params),
    },
  ];

  return {
    messaging_product: 'whatsapp',
    to: to.replace(/[^0-9]/g, ''), // Strip formatting
    type: 'template',
    template: {
      name: templateName,
      language: {
        code: languageCode,
      },
      components,
    },
  };
}

/**
 * Parses Meta API error responses to determine if we should fall back to templates
 * 
 * Meta error codes:
 * - 131047: Message undeliverable (outside 24h window)
 * - 132001: Template name does not exist
 * - 132000: Template not approved
 * - 131026: Number not on WhatsApp
 * - 130429: Rate limit exceeded (messaging limit reached)
 * - 80007: Rate limit exceeded (too many messages)
 * 
 * @see https://developers.facebook.com/docs/whatsapp/cloud-api/support/error-codes
 */
export interface MetaErrorResponse {
  error: {
    message: string;
    type: string;
    code: number;
    error_data?: {
      details: string;
    };
    error_subcode?: number;
    fbtrace_id?: string;
  };
}

export interface ParsedMetaError {
  code: number;
  subcode?: number;
  message: string;
  isOutside24hWindow: boolean;
  isTemplateError: boolean;
  isRateLimit: boolean;
  isInvalidRecipient: boolean;
  isRetryable: boolean;
}

/**
 * Parses Meta API error response into structured error info
 */
export function parseMetaError(error: unknown): ParsedMetaError | null {
  // Handle axios error format
  let errorData: MetaErrorResponse | null = null;

  if (error && typeof error === 'object') {
    if ('response' in error && error.response && typeof error.response === 'object') {
      if ('data' in error.response) {
        errorData = error.response.data as MetaErrorResponse;
      }
    } else if ('error' in error) {
      errorData = error as MetaErrorResponse;
    }
  }

  if (!errorData?.error?.code) {
    return null;
  }

  const { code, error_subcode: subcode, message } = errorData.error;

  const parsed: ParsedMetaError = {
    code,
    subcode,
    message,
    isOutside24hWindow: code === 131047,
    isTemplateError: code === 132001 || code === 132000,
    isRateLimit: code === 130429 || code === 80007,
    isInvalidRecipient: code === 131026,
    isRetryable: false,
  };

  // Determine if error is retryable
  // Rate limits and outside 24h window are retryable with template messages
  parsed.isRetryable = parsed.isOutside24hWindow || parsed.isRateLimit;

  return parsed;
}

/**
 * Determines if a user is within the 24-hour messaging window
 * 
 * WhatsApp allows sending free-form messages within 24 hours of last user message.
 * Outside that window, only approved template messages can be sent.
 */
export function isWithin24HourWindow(lastMessageAt: Date | string | null): boolean {
  if (!lastMessageAt) {
    return false;
  }

  const lastMessage = typeof lastMessageAt === 'string' 
    ? new Date(lastMessageAt) 
    : lastMessageAt;

  const hoursSinceLastMessage = (Date.now() - lastMessage.getTime()) / (1000 * 60 * 60);

  return hoursSinceLastMessage < 24;
}

/**
 * Validates that a template name is registered
 */
export function isValidTemplateName(name: string): name is WhatsAppTemplateName {
  return Object.values(WHATSAPP_TEMPLATES).includes(name as WhatsAppTemplateName);
}

/**
 * Type guard for template parameters
 */
export function validateTemplateParams(
  templateName: WhatsAppTemplateName,
  params: unknown
): params is TemplateParams {
  if (!params || typeof params !== 'object') {
    return false;
  }

  switch (templateName) {
    case WHATSAPP_TEMPLATES.DAILY_OUTFIT:
      return (
        'userName' in params &&
        'weatherDescription' in params &&
        typeof params.userName === 'string' &&
        typeof params.weatherDescription === 'string'
      );

    case WHATSAPP_TEMPLATES.WEEKLY_LAUNDRY:
      return (
        'userName' in params &&
        'itemCount' in params &&
        typeof params.userName === 'string' &&
        typeof params.itemCount === 'number'
      );

    case WHATSAPP_TEMPLATES.VERIFICATION_CODE:
      return (
        'code' in params &&
        typeof params.code === 'string' &&
        params.code.length > 0
      );

    default:
      return false;
  }
}

/**
 * Logs template message send attempt (without PII)
 */
export function logTemplateSend(
  templateName: WhatsAppTemplateName,
  success: boolean,
  error?: ParsedMetaError
): void {
  if (success) {
    // Use structured logging in production
    console.log('WhatsApp template sent', {
      template: templateName,
      timestamp: new Date().toISOString(),
    });
  } else {
    logError(
      new Error(`WhatsApp template send failed: ${error?.message || 'Unknown error'}`),
      {
        template: templateName,
        errorCode: error?.code,
        errorSubcode: error?.subcode,
        isRetryable: error?.isRetryable,
      }
    );
  }
}

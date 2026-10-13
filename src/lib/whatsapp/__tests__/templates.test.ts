/**
 * Tests for WhatsApp Template Messages
 * 
 * Run with: npm test templates.test.ts
 */

import { describe, it, expect } from '@jest/globals';
import {
  WHATSAPP_TEMPLATES,
  buildTemplateMessagePayload,
  parseMetaError,
  isWithin24HourWindow,
  isValidTemplateName,
  validateTemplateParams,
} from '../templates';

describe('WhatsApp Template Names', () => {
  it('exports expected template constants', () => {
    expect(WHATSAPP_TEMPLATES.DAILY_OUTFIT).toBe('daily_outfit_suggestion');
    expect(WHATSAPP_TEMPLATES.WEEKLY_LAUNDRY).toBe('weekly_laundry_reminder');
    expect(WHATSAPP_TEMPLATES.VERIFICATION_CODE).toBe('phone_verification');
  });

  it('validates template names correctly', () => {
    expect(isValidTemplateName('daily_outfit_suggestion')).toBe(true);
    expect(isValidTemplateName('weekly_laundry_reminder')).toBe(true);
    expect(isValidTemplateName('phone_verification')).toBe(true);
    expect(isValidTemplateName('invalid_template')).toBe(false);
    expect(isValidTemplateName('')).toBe(false);
  });
});

describe('Template Message Payload Building', () => {
  it('builds daily outfit template correctly', () => {
    const payload = buildTemplateMessagePayload(
      '+2348012345678',
      WHATSAPP_TEMPLATES.DAILY_OUTFIT,
      {
        userName: 'Alex',
        weatherDescription: 'sunny, 75°F',
      }
    );

    expect(payload).toMatchObject({
      messaging_product: 'whatsapp',
      to: '2348012345678', // Digits only
      type: 'template',
      template: {
        name: 'daily_outfit_suggestion',
        language: { code: 'en_US' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: 'Alex' },
              { type: 'text', text: 'sunny, 75°F' },
            ],
          },
        ],
      },
    });
  });

  it('builds weekly laundry template correctly', () => {
    const payload = buildTemplateMessagePayload(
      '2348012345678',
      WHATSAPP_TEMPLATES.WEEKLY_LAUNDRY,
      {
        userName: 'Sam',
        itemCount: 12,
      }
    );

    expect(payload).toMatchObject({
      messaging_product: 'whatsapp',
      to: '2348012345678',
      type: 'template',
      template: {
        name: 'weekly_laundry_reminder',
        language: { code: 'en_US' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: 'Sam' },
              { type: 'text', text: '12' },
            ],
          },
        ],
      },
    });
  });

  it('builds verification code template correctly', () => {
    const payload = buildTemplateMessagePayload(
      '+1-555-123-4567',
      WHATSAPP_TEMPLATES.VERIFICATION_CODE,
      {
        code: 'CLOSET-123456',
      }
    );

    expect(payload).toMatchObject({
      messaging_product: 'whatsapp',
      to: '15551234567', // Strips formatting
      type: 'template',
      template: {
        name: 'phone_verification',
        language: { code: 'en_US' },
        components: [
          {
            type: 'body',
            parameters: [
              { type: 'text', text: 'CLOSET-123456' },
            ],
          },
        ],
      },
    });
  });

  it('strips phone number formatting', () => {
    const payload = buildTemplateMessagePayload(
      '+234 (801) 234-5678',
      WHATSAPP_TEMPLATES.VERIFICATION_CODE,
      { code: '123456' }
    );

    expect(payload).toHaveProperty('to', '2348012345678');
  });

  it('supports custom language code', () => {
    const payload = buildTemplateMessagePayload(
      '2348012345678',
      WHATSAPP_TEMPLATES.DAILY_OUTFIT,
      { userName: 'Maria', weatherDescription: 'sunny' },
      'es_MX'
    );

    expect(payload).toMatchObject({
      template: {
        language: { code: 'es_MX' },
      },
    });
  });
});

describe('Template Parameter Validation', () => {
  it('validates daily outfit params', () => {
    expect(
      validateTemplateParams(WHATSAPP_TEMPLATES.DAILY_OUTFIT, {
        userName: 'Alex',
        weatherDescription: 'sunny',
      })
    ).toBe(true);

    expect(
      validateTemplateParams(WHATSAPP_TEMPLATES.DAILY_OUTFIT, {
        userName: 'Alex',
        // Missing weatherDescription
      })
    ).toBe(false);

    expect(
      validateTemplateParams(WHATSAPP_TEMPLATES.DAILY_OUTFIT, {
        userName: 123, // Wrong type
        weatherDescription: 'sunny',
      })
    ).toBe(false);
  });

  it('validates weekly laundry params', () => {
    expect(
      validateTemplateParams(WHATSAPP_TEMPLATES.WEEKLY_LAUNDRY, {
        userName: 'Sam',
        itemCount: 5,
      })
    ).toBe(true);

    expect(
      validateTemplateParams(WHATSAPP_TEMPLATES.WEEKLY_LAUNDRY, {
        userName: 'Sam',
        itemCount: '5', // Wrong type (string instead of number)
      })
    ).toBe(false);
  });

  it('validates verification code params', () => {
    expect(
      validateTemplateParams(WHATSAPP_TEMPLATES.VERIFICATION_CODE, {
        code: 'CLOSET-123456',
      })
    ).toBe(true);

    expect(
      validateTemplateParams(WHATSAPP_TEMPLATES.VERIFICATION_CODE, {
        code: '', // Empty code
      })
    ).toBe(false);

    expect(
      validateTemplateParams(WHATSAPP_TEMPLATES.VERIFICATION_CODE, {})
    ).toBe(false);
  });
});

describe('Meta API Error Parsing', () => {
  it('parses outside 24h window error', () => {
    const error = {
      response: {
        data: {
          error: {
            message: 'Message undeliverable',
            code: 131047,
            type: 'OAuthException',
          },
        },
      },
    };

    const parsed = parseMetaError(error);
    expect(parsed).toMatchObject({
      code: 131047,
      isOutside24hWindow: true,
      isTemplateError: false,
      isRateLimit: false,
      isInvalidRecipient: false,
      isRetryable: true,
    });
  });

  it('parses template not found error', () => {
    const error = {
      error: {
        message: 'Template name does not exist',
        code: 132001,
      },
    };

    const parsed = parseMetaError(error);
    expect(parsed).toMatchObject({
      code: 132001,
      isOutside24hWindow: false,
      isTemplateError: true,
      isRetryable: false,
    });
  });

  it('parses template not approved error', () => {
    const error = {
      error: {
        message: 'Template not approved',
        code: 132000,
      },
    };

    const parsed = parseMetaError(error);
    expect(parsed).toMatchObject({
      code: 132000,
      isTemplateError: true,
      isRetryable: false,
    });
  });

  it('parses rate limit errors', () => {
    const error1 = {
      error: {
        message: 'Rate limit exceeded',
        code: 130429,
      },
    };

    const parsed1 = parseMetaError(error1);
    expect(parsed1).toMatchObject({
      code: 130429,
      isRateLimit: true,
      isRetryable: true,
    });

    const error2 = {
      error: {
        message: 'Too many messages',
        code: 80007,
      },
    };

    const parsed2 = parseMetaError(error2);
    expect(parsed2?.isRateLimit).toBe(true);
  });

  it('parses invalid recipient error', () => {
    const error = {
      error: {
        message: 'Number not on WhatsApp',
        code: 131026,
      },
    };

    const parsed = parseMetaError(error);
    expect(parsed).toMatchObject({
      code: 131026,
      isInvalidRecipient: true,
      isRetryable: false,
    });
  });

  it('handles axios error format', () => {
    const axiosError = {
      response: {
        data: {
          error: {
            message: 'Test error',
            code: 131047,
          },
        },
      },
    };

    const parsed = parseMetaError(axiosError);
    expect(parsed?.code).toBe(131047);
  });

  it('returns null for non-Meta errors', () => {
    expect(parseMetaError(null)).toBeNull();
    expect(parseMetaError({})).toBeNull();
    expect(parseMetaError({ error: {} })).toBeNull();
    expect(parseMetaError(new Error('Random error'))).toBeNull();
  });

  it('includes subcode if present', () => {
    const error = {
      error: {
        message: 'Error',
        code: 100,
        error_subcode: 2388001,
      },
    };

    const parsed = parseMetaError(error);
    expect(parsed?.subcode).toBe(2388001);
  });
});

describe('24-Hour Window Detection', () => {
  it('detects within 24h window', () => {
    const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000);
    expect(isWithin24HourWindow(oneHourAgo)).toBe(true);

    const twentyThreeHoursAgo = new Date(Date.now() - 23 * 60 * 60 * 1000);
    expect(isWithin24HourWindow(twentyThreeHoursAgo)).toBe(true);
  });

  it('detects outside 24h window', () => {
    const twentyFiveHoursAgo = new Date(Date.now() - 25 * 60 * 60 * 1000);
    expect(isWithin24HourWindow(twentyFiveHoursAgo)).toBe(false);

    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    expect(isWithin24HourWindow(oneWeekAgo)).toBe(false);
  });

  it('handles null/missing timestamp', () => {
    expect(isWithin24HourWindow(null)).toBe(false);
  });

  it('handles string timestamps', () => {
    const oneHourAgo = new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString();
    expect(isWithin24HourWindow(oneHourAgo)).toBe(true);

    const twentyFiveHoursAgo = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    expect(isWithin24HourWindow(twentyFiveHoursAgo)).toBe(false);
  });

  it('handles edge case: exactly 24h ago', () => {
    const exactlyTwentyFourHours = new Date(Date.now() - 24 * 60 * 60 * 1000);
    // Should be false (outside window)
    expect(isWithin24HourWindow(exactlyTwentyFourHours)).toBe(false);
  });
});

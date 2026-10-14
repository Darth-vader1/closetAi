'use server';

/**
 * Server Actions for WhatsApp Phone Verification
 * 
 * Handles:
 * - Generating verification codes
 * - Verifying submitted codes
 * - Checking verification status
 * - Sending verification codes via WhatsApp
 */

import { 
  generateVerificationCode, 
  verifySubmittedCode, 
  getVerificationStatus,
  type VerificationStatus,
} from '@/lib/whatsapp/verification';
import { sendTemplateMessage } from '@/lib/whatsapp/service';
import { WHATSAPP_TEMPLATES } from '@/lib/whatsapp/templates';
import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import { takeAiQuota } from '@/lib/ai/rate-limit';

export interface StartVerificationResult {
  success: boolean;
  expiresInMinutes?: number;
  error?: string;
  errorCode?: string;
}

/**
 * Initiates phone verification by generating a code and sending it via WhatsApp
 */
export async function startPhoneVerification(): Promise<StartVerificationResult> {
  try {
    const supabase = await createClient();

    // Identity comes from the verified session, never from the client.
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return { success: false, error: 'Not authenticated', errorCode: 'UNAUTHORIZED' };
    }

    // The database enforces: a saved number, not already verified, not opted out, not verified by
    // another account, and per-user (5/hour) and per-number (3/day) limits.
    const result = await generateVerificationCode(user.id);
    if (!result.success || !result.code || !result.phoneDigits) {
      return { success: false, error: result.error || 'Failed to generate code', errorCode: result.errorCode };
    }

    // Send the code ONLY to the number the code is bound to. It is never returned to the browser:
    // receiving it on that WhatsApp number is the proof of ownership.
    const sendResult = await sendTemplateMessage(result.phoneDigits, WHATSAPP_TEMPLATES.VERIFICATION_CODE, {
      code: result.code,
    });

    if (!sendResult.success) {
      logger.error('whatsapp.send_verification_code_failed', {
        err: new Error('Failed to send verification code'),
        userId: user.id,
        sendError: sendResult.error,
      });
      return {
        success: false,
        error: "We couldn't send the code to that number. Check it is a WhatsApp number and try again.",
        errorCode: 'SEND_FAILED',
      };
    }

    const expiresInMinutes = result.expiresAt
      ? Math.ceil((result.expiresAt.getTime() - Date.now()) / (1000 * 60))
      : 15;

    return { success: true, expiresInMinutes };
  } catch (error) {
    logger.error('whatsapp.start_verification_error', { err: error });
    return { success: false, error: 'An unexpected error occurred', errorCode: 'SERVER_ERROR' };
  }
}

export interface VerifyCodeResult {
  success: boolean;
  error?: string;
  errorCode?: string;
}

/**
 * Verifies a user-submitted code
 */
export async function verifyPhoneCode(code: string): Promise<VerifyCodeResult> {
  try {
    const supabase = await createClient();
    
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return {
        success: false,
        error: 'Not authenticated',
        errorCode: 'UNAUTHORIZED',
      };
    }
    
    // Verify the code
    const result = await verifySubmittedCode(user.id, code);
    
    return result;
  } catch (error) {
    logger.error('whatsapp.verify_phone_code_error', { err: error });
    return {
      success: false,
      error: 'An unexpected error occurred',
      errorCode: 'SERVER_ERROR',
    };
  }
}

export interface CheckVerificationResult {
  success: boolean;
  status?: VerificationStatus;
  error?: string;
}

/**
 * Checks current verification status
 */
export async function checkVerificationStatus(): Promise<CheckVerificationResult> {
  try {
    const supabase = await createClient();
    
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return {
        success: false,
        error: 'Not authenticated',
      };
    }
    
    // Get verification status
    const status = await getVerificationStatus(user.id);
    
    if (!status) {
      return {
        success: false,
        error: 'Failed to fetch verification status',
      };
    }
    
    return {
      success: true,
      status,
    };
  } catch (error) {
    logger.error('whatsapp.check_verification_status_error', { err: error });
    return {
      success: false,
      error: 'An unexpected error occurred',
    };
  }
}

/**
 * Sends a test message to verify WhatsApp is working
 * Only allowed for verified users
 */
export interface SendTestMessageResult {
  success: boolean;
  error?: string;
}

export async function sendTestWhatsAppMessage(): Promise<SendTestMessageResult> {
  try {
    const supabase = await createClient();
    
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return {
        success: false,
        error: 'Not authenticated',
      };
    }
    
    // Check verification status
    const status = await getVerificationStatus(user.id);
    if (!status?.isVerified) {
      return {
        success: false,
        error: 'Phone number not verified',
      };
    }
    const quota = await takeAiQuota(supabase, user.id, 'CHAT');
    if (!quota.allowed) {
      return { success: false, error: 'Too many test messages sent recently. Please try again later.' };
    }
    
    // Get preferences from email_preferences
    const { data: prefs, error: prefsError } = await supabase
      .from('email_preferences')
      .select('whatsapp_phone, whatsapp_enabled')
      .eq('user_id', user.id)
      .single();
    
    if (prefsError || !prefs?.whatsapp_phone) {
      return {
        success: false,
        error: 'WhatsApp not configured',
      };
    }
    
    // Get display name from profiles
    const { data: profile } = await supabase
      .from('profiles')
      .select('display_name')
      .eq('id', user.id)
      .single();
    
    // Send a test template message
    const result = await sendTemplateMessage(
      prefs.whatsapp_phone,
      WHATSAPP_TEMPLATES.DAILY_OUTFIT,
      {
        userName: profile?.display_name || 'there',
        weatherDescription: 'sunny with a high of 72°F',
      }
    );
    
    return {
      success: result.success,
      error: result.error,
    };
  } catch (error) {
    logger.error('whatsapp.send_test_message_error', { err: error });
    return {
      success: false,
      error: 'An unexpected error occurred',
    };
  }
}

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
    
    // Get current user
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return {
        success: false,
        error: 'Not authenticated',
        errorCode: 'UNAUTHORIZED',
      };
    }
    
    // Get user's WhatsApp phone number from email_preferences
    const { data: prefs, error: prefsError } = await supabase
      .from('email_preferences')
      .select('whatsapp_phone, whatsapp_enabled')
      .eq('user_id', user.id)
      .single();
    
    if (prefsError || !prefs) {
      return {
        success: false,
        error: 'Failed to fetch preferences',
        errorCode: 'DATABASE_ERROR',
      };
    }
    
    if (!prefs.whatsapp_enabled || !prefs.whatsapp_phone) {
      return {
        success: false,
        error: 'WhatsApp notifications not enabled. Please enable and set your phone number first.',
        errorCode: 'NOT_ENABLED',
      };
    }
    
    // Generate verification code
    const result = await generateVerificationCode(user.id);
    
    if (!result.success || !result.code) {
      return {
        success: false,
        error: result.error || 'Failed to generate code',
        errorCode: result.errorCode,
      };
    }
    
    // Send code via WhatsApp template
    const sendResult = await sendTemplateMessage(
      prefs.whatsapp_phone,
      WHATSAPP_TEMPLATES.VERIFICATION_CODE,
      { code: result.code }
    );
    
    if (!sendResult.success) {
      // Code was generated but couldn't be sent
      // User can still verify manually if they received it
      logger.error('whatsapp.send_verification_code_failed', {
        err: new Error('Failed to send verification code'),
        userId: user.id,
        sendError: sendResult.error,
      });
      
      return {
        success: false,
        error: `Code generated but couldn't be sent: ${sendResult.error}`,
        errorCode: 'SEND_FAILED',
      };
    }
    
    // Calculate expiry time
    const expiresInMinutes = result.expiresAt 
      ? Math.ceil((result.expiresAt.getTime() - Date.now()) / (1000 * 60))
      : 15;
    
    return {
      success: true,
      expiresInMinutes,
    };
  } catch (error) {
    logger.error('whatsapp.start_verification_error', { err: error });
    return {
      success: false,
      error: 'An unexpected error occurred',
      errorCode: 'SERVER_ERROR',
    };
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

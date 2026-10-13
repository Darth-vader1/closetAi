/**
 * WhatsApp Phone Verification
 * 
 * Handles generation and validation of verification codes for proving phone ownership.
 * Uses SHA-256 hashing with pepper for security. Never stores plaintext codes.
 */

import { createClient } from '@/lib/supabase/server';
import { logger } from '@/lib/logger';
import crypto from 'crypto';

// Verification code format: CLOSET-XXXXXX (6 random digits)
const CODE_PREFIX = 'CLOSET';
const CODE_LENGTH = 6;
const CODE_EXPIRY_MINUTES = 15;
const MAX_ACTIVE_CODES = 3;
const RATE_LIMIT_ATTEMPTS = 5;
const RATE_LIMIT_WINDOW_HOURS = 1;

/**
 * Gets the verification pepper from environment
 * CRITICAL: This must be a secret value, never exposed to clients
 */
function getVerificationPepper(): string {
  const pepper = process.env.WHATSAPP_VERIFICATION_PEPPER;
  
  if (!pepper) {
    throw new Error('WHATSAPP_VERIFICATION_PEPPER environment variable not set');
  }
  
  if (pepper.length < 32) {
    throw new Error('WHATSAPP_VERIFICATION_PEPPER must be at least 32 characters');
  }
  
  return pepper;
}

/**
 * Generates a random 6-digit numeric code
 */
export function generateCodeDigits(): string {
  // Use crypto.randomInt for cryptographically secure random numbers
  const min = 100000;
  const max = 999999;
  return crypto.randomInt(min, max + 1).toString();
}

/**
 * Formats code in user-friendly format: CLOSET-XXXXXX
 */
export function formatVerificationCode(digits: string): string {
  if (digits.length !== CODE_LENGTH) {
    throw new Error(`Code must be ${CODE_LENGTH} digits`);
  }
  return `${CODE_PREFIX}-${digits}`;
}

/**
 * Parses user input code, handling various formats
 * Accepts: "CLOSET-123456", "closet-123456", "123456", "CLOSET 123456"
 */
export function parseVerificationCode(input: string): string | null {
  // Remove whitespace and convert to uppercase
  const cleaned = input.trim().toUpperCase().replace(/\s+/g, '-');
  
  // Extract digits only
  const digitsOnly = cleaned.replace(/[^0-9]/g, '');
  
  // Must be exactly 6 digits
  if (digitsOnly.length !== CODE_LENGTH) {
    return null;
  }
  
  // Validate it's a valid number
  if (!/^\d{6}$/.test(digitsOnly)) {
    return null;
  }
  
  return digitsOnly;
}

/**
 * Hashes a verification code with pepper using SHA-256
 * 
 * Security: Never store plaintext codes. Use pepper (server-side secret) 
 * to prevent rainbow table attacks even if database is compromised.
 */
export function hashVerificationCode(digits: string): string {
  const pepper = getVerificationPepper();
  
  // Hash with pepper: SHA-256(pepper || code)
  const hash = crypto
    .createHash('sha256')
    .update(pepper + digits)
    .digest('hex');
  
  return hash;
}

/**
 * Verifies a code matches the expected hash
 */
export function verifyCodeHash(digits: string, expectedHash: string): boolean {
  const actualHash = hashVerificationCode(digits);
  
  // Use constant-time comparison to prevent timing attacks
  return crypto.timingSafeEqual(
    Buffer.from(actualHash),
    Buffer.from(expectedHash)
  );
}

/**
 * Result of verification code generation
 */
export interface GenerateCodeResult {
  success: boolean;
  code?: string; // Full formatted code: "CLOSET-XXXXXX"
  expiresAt?: Date;
  verificationId?: string;
  error?: string;
  errorCode?: 'RATE_LIMITED' | 'TOO_MANY_ACTIVE' | 'NOT_ENABLED' | 'ALREADY_VERIFIED' | 'DATABASE_ERROR';
}

/**
 * Generates a new verification code and stores hash in database
 * 
 * Rate limiting:
 * - Max 5 code generation attempts per hour
 * - Max 3 active (unexpired) codes at once
 * - 1 hour lockout after 5 attempts
 */
export async function generateVerificationCode(
  userId: string
): Promise<GenerateCodeResult> {
  try {
    const supabase = await createClient();
    
    // Check user's WhatsApp settings and verification status from email_preferences
    const { data: prefs, error: prefsError } = await supabase
      .from('email_preferences')
      .select('whatsapp_enabled, whatsapp_phone, whatsapp_phone_verified')
      .eq('user_id', userId)
      .single();
    
    if (prefsError) {
      logger.error('whatsapp.generate_code_fetch_prefs_failed', { err: prefsError, userId });
      return {
        success: false,
        error: 'Failed to fetch user preferences',
        errorCode: 'DATABASE_ERROR',
      };
    }
    
    if (!prefs?.whatsapp_enabled || !prefs?.whatsapp_phone) {
      return {
        success: false,
        error: 'WhatsApp notifications not enabled',
        errorCode: 'NOT_ENABLED',
      };
    }
    
    if (prefs.whatsapp_phone_verified) {
      return {
        success: false,
        error: 'Phone already verified',
        errorCode: 'ALREADY_VERIFIED',
      };
    }
    
    // Generate code and hash
    const digits = generateCodeDigits();
    const codeHash = hashVerificationCode(digits);
    const formattedCode = formatVerificationCode(digits);
    const expiresAt = new Date(Date.now() + CODE_EXPIRY_MINUTES * 60 * 1000);
    
    // Create verification record using security definer function
    // This function handles rate limiting and active code checks
    const { data: verificationId, error: createError } = await supabase
      .rpc('create_whatsapp_verification', {
        p_user_id: userId,
        p_code_hash: codeHash,
        p_code_prefix: CODE_PREFIX,
        p_expires_at: expiresAt.toISOString(),
      });
    
    if (createError) {
      // Parse rate limit errors
      if (createError.message?.includes('RATE_LIMITED')) {
        return {
          success: false,
          error: 'Too many attempts. Please try again in 1 hour.',
          errorCode: 'RATE_LIMITED',
        };
      }
      
      if (createError.message?.includes('TOO_MANY_ACTIVE')) {
        return {
          success: false,
          error: 'Too many active codes. Please wait for them to expire.',
          errorCode: 'TOO_MANY_ACTIVE',
        };
      }
      
      logger.error('whatsapp.create_verification_failed', { err: createError, userId });
      return {
        success: false,
        error: 'Failed to create verification code',
        errorCode: 'DATABASE_ERROR',
      };
    }
    
    return {
      success: true,
      code: formattedCode,
      expiresAt,
      verificationId,
    };
  } catch (error) {
    logger.error('whatsapp.generate_code_error', { err: error, userId });
    return {
      success: false,
      error: 'An unexpected error occurred',
      errorCode: 'DATABASE_ERROR',
    };
  }
}

/**
 * Result of code verification attempt
 */
export interface VerifyCodeResult {
  success: boolean;
  error?: string;
  errorCode?: 'INVALID' | 'EXPIRED' | 'LOCKED' | 'ALREADY_USED' | 'DATABASE_ERROR';
}

/**
 * Verifies a user-submitted code
 * 
 * Attempt tracking:
 * - Max 5 attempts per code
 * - Code locked after max attempts
 * - Must request new code after lockout
 */
export async function verifySubmittedCode(
  userId: string,
  submittedCode: string
): Promise<VerifyCodeResult> {
  try {
    // Parse and validate code format
    const digits = parseVerificationCode(submittedCode);
    
    if (!digits) {
      return {
        success: false,
        error: 'Invalid code format. Expected: CLOSET-XXXXXX',
        errorCode: 'INVALID',
      };
    }
    
    // Hash the submitted code
    const codeHash = hashVerificationCode(digits);
    
    // Verify using security definer function
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('verify_whatsapp_code', {
      p_user_id: userId,
      p_code_hash: codeHash,
    });
    
    if (error) {
      logger.error('whatsapp.verify_code_rpc_failed', { err: error, userId });
      return {
        success: false,
        error: 'Verification failed',
        errorCode: 'DATABASE_ERROR',
      };
    }
    
    // Parse result from function
    if (!data || data.length === 0) {
      return {
        success: false,
        error: 'Verification failed',
        errorCode: 'DATABASE_ERROR',
      };
    }
    
    const result = data[0];
    
    if (result.success) {
      return {
        success: true,
      };
    }
    
    // Parse error message from function
    const message = result.message || '';
    
    if (message.includes('LOCKED')) {
      return {
        success: false,
        error: 'Too many failed attempts. Please request a new code.',
        errorCode: 'LOCKED',
      };
    }
    
    if (message.includes('INVALID')) {
      return {
        success: false,
        error: 'Invalid or expired code',
        errorCode: 'INVALID',
      };
    }
    
    if (message.includes('ALREADY_VERIFIED')) {
      return {
        success: false,
        error: 'This code has already been used',
        errorCode: 'ALREADY_USED',
      };
    }
    
    return {
      success: false,
      error: message,
      errorCode: 'INVALID',
    };
  } catch (error) {
    logger.error('whatsapp.verify_code_error', { err: error, userId });
    return {
      success: false,
      error: 'An unexpected error occurred',
      errorCode: 'DATABASE_ERROR',
    };
  }
}

/**
 * Gets the current verification status for a user
 */
export interface VerificationStatus {
  isVerified: boolean;
  verifiedAt?: Date;
  isRateLimited: boolean;
  rateLimitExpiresAt?: Date;
  activeCodeCount: number;
  hasWhatsAppEnabled: boolean;
}

export async function getVerificationStatus(
  userId: string
): Promise<VerificationStatus | null> {
  try {
    const supabase = await createClient();
    
    // Get verification status from email_preferences
    const { data: prefs, error: prefsError } = await supabase
      .from('email_preferences')
      .select(`
        whatsapp_enabled,
        whatsapp_phone_verified,
        whatsapp_phone_verified_at,
        whatsapp_verification_locked_until
      `)
      .eq('user_id', userId)
      .single();
    
    if (prefsError || !prefs) {
      logger.error('whatsapp.get_verification_status_failed', { err: prefsError, userId });
      return null;
    }
    
    // Count active verification codes
    const { count: activeCount } = await supabase
      .from('whatsapp_verifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .is('verified_at', null)
      .gt('expires_at', new Date().toISOString());
    
    const lockedUntil = prefs.whatsapp_verification_locked_until
      ? new Date(prefs.whatsapp_verification_locked_until)
      : null;
    
    return {
      isVerified: prefs.whatsapp_phone_verified || false,
      verifiedAt: prefs.whatsapp_phone_verified_at
        ? new Date(prefs.whatsapp_phone_verified_at)
        : undefined,
      isRateLimited: lockedUntil ? lockedUntil > new Date() : false,
      rateLimitExpiresAt: lockedUntil || undefined,
      activeCodeCount: activeCount || 0,
      hasWhatsAppEnabled: prefs.whatsapp_enabled || false,
    };
  } catch (error) {
    logger.error('whatsapp.get_verification_status_error', { err: error, userId });
    return null;
  }
}

/**
 * Constants exported for use in UI
 */
export const VERIFICATION_CONSTANTS = {
  CODE_PREFIX,
  CODE_LENGTH,
  CODE_EXPIRY_MINUTES,
  MAX_ACTIVE_CODES,
  RATE_LIMIT_ATTEMPTS,
  RATE_LIMIT_WINDOW_HOURS,
} as const;

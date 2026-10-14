/**
 * WhatsApp phone verification.
 *
 * Proves that a user controls the number they saved. We send a short code to that number over
 * WhatsApp; the user proves receipt either by typing it into Settings or by texting it back to our
 * business number (the webhook then matches the SENDER's number).
 *
 * Security model:
 *  - Codes are HMAC-SHA256 hashed with a server-only pepper; plaintext is never stored.
 *  - All database access goes through the service-role client and server-only RPCs. The browser
 *    (anon/authenticated roles) cannot call them or read the tables, so it cannot choose a hash,
 *    pick another user's id, or flip `whatsapp_phone_verified` itself.
 *  - A code is bound to the number it was issued for; changing the number invalidates it.
 *  - Rate limits and "one verified owner per number" live in the database (see migration
 *    20261014000001), so they hold no matter which code path calls them.
 */

import "server-only";
import crypto from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

const CODE_PREFIX = "CLOSET";
const CODE_LENGTH = 6;
const CODE_EXPIRY_MINUTES = 15;
const MAX_ACTIVE_CODES = 1;
const RATE_LIMIT_ATTEMPTS = 5;
const RATE_LIMIT_WINDOW_HOURS = 1;

function getVerificationPepper(): string {
  const pepper = process.env.WHATSAPP_VERIFICATION_PEPPER;
  if (!pepper) throw new Error("WHATSAPP_VERIFICATION_PEPPER environment variable not set");
  if (pepper.length < 32) throw new Error("WHATSAPP_VERIFICATION_PEPPER must be at least 32 characters");
  return pepper;
}

/** Cryptographically secure 6-digit code (100000-999999). */
export function generateCodeDigits(): string {
  return crypto.randomInt(100000, 1000000).toString();
}

export function formatVerificationCode(digits: string): string {
  if (!/^\d{6}$/.test(digits)) throw new Error(`Code must be ${CODE_LENGTH} digits`);
  return `${CODE_PREFIX}-${digits}`;
}

/**
 * Accepts exactly a code and nothing else: "CLOSET-123456", "closet 123456" or "123456".
 * Anything with other words or digits in it ("order 123456 please") is NOT a code, so ordinary
 * chat to our business number can never be mistaken for a verification attempt.
 */
export function parseVerificationCode(input: string): string | null {
  const match = /^\s*(?:closet[\s-]*)?(\d{6})\s*$/i.exec(input);
  return match ? match[1] : null;
}

/** HMAC-SHA256(pepper, code). Returned as hex. */
export function hashVerificationCode(digits: string): string {
  return crypto.createHmac("sha256", getVerificationPepper()).update(digits).digest("hex");
}

export function verifyCodeHash(digits: string, expectedHash: string): boolean {
  const actual = Buffer.from(hashVerificationCode(digits));
  const expected = Buffer.from(expectedHash);
  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

export type StartErrorCode =
  | "NO_PHONE"
  | "ALREADY_VERIFIED"
  | "OPTED_OUT"
  | "PHONE_IN_USE"
  | "RATE_LIMITED"
  | "PHONE_RATE_LIMITED"
  | "DATABASE_ERROR";

export interface GenerateCodeResult {
  success: boolean;
  /** Full formatted code, e.g. "CLOSET-123456". Only ever sent to the user's own WhatsApp. */
  code?: string;
  /** Digits of the number the code is bound to — send the code to exactly this number. */
  phoneDigits?: string;
  expiresAt?: Date;
  verificationId?: string;
  error?: string;
  errorCode?: StartErrorCode;
}

const START_ERRORS: Record<Exclude<StartErrorCode, "DATABASE_ERROR">, string> = {
  NO_PHONE: "Save your WhatsApp number first.",
  ALREADY_VERIFIED: "This number is already verified.",
  OPTED_OUT: "This number has opted out of WhatsApp messages. Text START to our number to opt back in.",
  PHONE_IN_USE: "This number is already verified on another account.",
  RATE_LIMITED: "Too many attempts. Please try again in an hour.",
  PHONE_RATE_LIMITED: "Too many codes have been requested for this number today. Please try again tomorrow.",
};

/** Starts verification for the given (already authenticated) user. */
export async function generateVerificationCode(userId: string): Promise<GenerateCodeResult> {
  try {
    const digits = generateCodeDigits();
    const codeHash = hashVerificationCode(digits);
    const expiresAt = new Date(Date.now() + CODE_EXPIRY_MINUTES * 60 * 1000);

    const admin = createAdminClient();
    const { data, error } = await admin.rpc("start_whatsapp_verification", {
      p_user_id: userId,
      p_code_hash: codeHash,
      p_code_prefix: CODE_PREFIX,
      p_expires_at: expiresAt.toISOString(),
    });

    if (error) {
      const known = (Object.keys(START_ERRORS) as Array<keyof typeof START_ERRORS>).find((key) =>
        error.message?.includes(key),
      );
      if (known) return { success: false, error: START_ERRORS[known], errorCode: known };
      logger.error("whatsapp.start_verification_failed", { err: error, userId });
      return { success: false, error: "Could not create a verification code.", errorCode: "DATABASE_ERROR" };
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row?.out_phone_digits) {
      return { success: false, error: "Could not create a verification code.", errorCode: "DATABASE_ERROR" };
    }

    return {
      success: true,
      code: formatVerificationCode(digits),
      phoneDigits: row.out_phone_digits as string,
      verificationId: row.out_verification_id as string,
      expiresAt,
    };
  } catch (error) {
    logger.error("whatsapp.generate_code_error", { err: error, userId });
    return { success: false, error: "An unexpected error occurred.", errorCode: "DATABASE_ERROR" };
  }
}

export interface VerifyCodeResult {
  success: boolean;
  userId?: string;
  error?: string;
  errorCode?: "INVALID" | "LOCKED" | "PHONE_IN_USE" | "DATABASE_ERROR";
}

async function callVerify(args: { hash: string; userId?: string; phoneDigits?: string }): Promise<VerifyCodeResult> {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("verify_whatsapp_code", {
    p_code_hash: args.hash,
    p_user_id: args.userId ?? null,
    p_phone_digits: args.phoneDigits ?? null,
  });

  if (error) {
    logger.error("whatsapp.verify_code_rpc_failed", { err: error });
    return { success: false, error: "Verification failed.", errorCode: "DATABASE_ERROR" };
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return { success: false, error: "Verification failed.", errorCode: "DATABASE_ERROR" };
  if (row.out_success) return { success: true, userId: row.out_user_id as string };

  const message = String(row.out_message ?? "");
  if (message.startsWith("LOCKED")) {
    return { success: false, error: "Too many wrong attempts. Please request a new code.", errorCode: "LOCKED" };
  }
  if (message.startsWith("PHONE_IN_USE")) {
    return { success: false, error: "This number is already verified on another account.", errorCode: "PHONE_IN_USE" };
  }
  return { success: false, error: "That code is invalid or has expired.", errorCode: "INVALID" };
}

/** Code typed into Settings by an authenticated user. `userId` MUST come from the session. */
export async function verifySubmittedCode(userId: string, submittedCode: string): Promise<VerifyCodeResult> {
  const digits = parseVerificationCode(submittedCode);
  if (!digits) return { success: false, error: "Enter the 6-digit code, e.g. CLOSET-123456.", errorCode: "INVALID" };
  try {
    return await callVerify({ hash: hashVerificationCode(digits), userId });
  } catch (error) {
    logger.error("whatsapp.verify_code_error", { err: error, userId });
    return { success: false, error: "An unexpected error occurred.", errorCode: "DATABASE_ERROR" };
  }
}

/** Code texted to our business number. `phoneDigits` MUST be the signature-verified sender. */
export async function verifyCodeFromSender(phoneDigits: string, submittedCode: string): Promise<VerifyCodeResult> {
  const digits = parseVerificationCode(submittedCode);
  if (!digits) return { success: false, errorCode: "INVALID" };
  try {
    return await callVerify({ hash: hashVerificationCode(digits), phoneDigits });
  } catch (error) {
    logger.error("whatsapp.verify_sender_code_error", { err: error });
    return { success: false, errorCode: "DATABASE_ERROR" };
  }
}

export interface VerificationStatus {
  isVerified: boolean;
  verifiedAt?: Date;
  isRateLimited: boolean;
  rateLimitExpiresAt?: Date;
  activeCodeCount: number;
  hasWhatsAppEnabled: boolean;
  hasPhone: boolean;
}

/** Status for the signed-in user. `userId` MUST come from the session. */
export async function getVerificationStatus(userId: string): Promise<VerificationStatus | null> {
  try {
    const admin = createAdminClient();
    const { data: prefs, error } = await admin
      .from("email_preferences")
      .select("whatsapp_phone, whatsapp_daily_enabled, whatsapp_phone_verified, whatsapp_phone_verified_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (error || !prefs) {
      logger.error("whatsapp.get_verification_status_failed", { err: error, userId });
      return null;
    }

    const { count } = await admin
      .from("whatsapp_verifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .is("verified_at", null)
      .gt("expires_at", new Date().toISOString());

    return {
      isVerified: prefs.whatsapp_phone_verified === true,
      verifiedAt: prefs.whatsapp_phone_verified_at ? new Date(prefs.whatsapp_phone_verified_at) : undefined,
      isRateLimited: false,
      activeCodeCount: count ?? 0,
      hasWhatsAppEnabled: prefs.whatsapp_daily_enabled === true,
      hasPhone: Boolean(prefs.whatsapp_phone),
    };
  } catch (error) {
    logger.error("whatsapp.get_verification_status_error", { err: error, userId });
    return null;
  }
}

export const VERIFICATION_CONSTANTS = {
  CODE_PREFIX,
  CODE_LENGTH,
  CODE_EXPIRY_MINUTES,
  MAX_ACTIVE_CODES,
  RATE_LIMIT_ATTEMPTS,
  RATE_LIMIT_WINDOW_HOURS,
} as const;

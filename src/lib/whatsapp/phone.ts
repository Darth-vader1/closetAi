/**
 * Phone number normalisation shared by settings, verification and the webhook.
 *
 * The database also derives `whatsapp_phone_digits` (digits only) from whatever is stored, so
 * matching never depends on spacing or a leading "+". This module is the single place that
 * decides what a *valid* number looks like before it is saved.
 */

export interface NormalisedPhone {
  /** "+2348012345678" — what we store and show. */
  e164: string;
  /** "2348012345678" — what Meta sends as `from` and what we match on. */
  digits: string;
}

/**
 * Accepts "+234 801 234 5678", "(234) 801-234-5678", "2348012345678". Rejects anything that is
 * not 7-15 digits starting with a non-zero country code (E.164), so free text can never be saved
 * as a phone number.
 */
export function normaliseWhatsAppPhone(input: string | null | undefined): NormalisedPhone | null {
  if (!input) return null;
  const stripped = input.trim().replace(/[\s().-]/g, "");
  if (!/^\+?[1-9]\d{6,14}$/.test(stripped)) return null;
  const digits = stripped.replace(/^\+/, "");
  return { e164: `+${digits}`, digits };
}

/** Digits only, for comparing against Meta's `from` field. Returns null if not plausible. */
export function digitsOnly(input: string | null | undefined): string | null {
  if (!input) return null;
  const digits = input.replace(/\D/g, "");
  return /^[1-9]\d{6,14}$/.test(digits) ? digits : null;
}

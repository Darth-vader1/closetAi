import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { friendlyAuthError } from "@/lib/auth/errors";
import { logger } from "@/lib/logger";
import { safeRedirectPath } from "@/lib/security/redirect";
import { createClient } from "@/lib/supabase/server";

const confirmOtpSchema = z.object({
  email: z.string().trim().email("Enter a valid email address."),
  token: z
    .string()
    .trim()
    .regex(/^\d{6,10}$/, "Enter the verification code from your email."),
  type: z.enum(["signup", "recovery", "email", "magiclink"]).default("signup"),
  next: z.string().optional(),
});

/**
 * GET /auth/confirm
 * Verifies either `token_hash` + `type` or `email` + 6-digit `token` + `type` and redirects.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const tokenHash = searchParams.get("token_hash");
  const email = searchParams.get("email");
  const token = searchParams.get("token");
  const type = (searchParams.get("type") as EmailOtpType | null) ?? "signup";
  const defaultNext = type === "recovery" ? "/reset-password" : "/onboarding";
  const next = safeRedirectPath(searchParams.get("next"), defaultNext);

  try {
    const supabase = await createClient();

    if (tokenHash) {
      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type,
      });
      if (error) {
        logger.warn("auth.confirm_token_hash_failed", { code: error.code, status: error.status });
        return NextResponse.redirect(`${origin}/login?error=link_expired`);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }

    if (email && token) {
      const { error } = await supabase.auth.verifyOtp({
        email,
        token,
        type,
      });
      if (error) {
        logger.warn("auth.confirm_otp_get_failed", { code: error.code, status: error.status });
        return NextResponse.redirect(`${origin}/login?error=link_expired`);
      }
      return NextResponse.redirect(`${origin}${next}`);
    }
  } catch (err) {
    logger.error("auth.confirm_get_error", { err });
  }

  return NextResponse.redirect(`${origin}/login?error=link_invalid`);
}

/**
 * POST /auth/confirm
 * Verifies a 6-digit OTP code (`email` + `token` + `type`) from the 60-second fallback panel.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null);
    const parsed = confirmOtpSchema.safeParse(body);
    if (!parsed.success) {
      const firstIssue = parsed.error.issues[0]?.message ?? "Enter a valid 6-digit code.";
      return NextResponse.json({ ok: false, error: firstIssue }, { status: 400 });
    }

    const { email, token, type, next } = parsed.data;
    const defaultNext = type === "recovery" ? "/reset-password" : "/onboarding";
    const redirectTo = safeRedirectPath(next, defaultNext);

    const supabase = await createClient();
    const { error } = await supabase.auth.verifyOtp({
      email,
      token,
      type: type as EmailOtpType,
    });

    if (error) {
      logger.warn("auth.confirm_otp_post_failed", { code: error.code, status: error.status });
      return NextResponse.json(
        { ok: false, error: friendlyAuthError(error) },
        { status: 400 },
      );
    }

    return NextResponse.json({ ok: true, redirectTo });
  } catch (err) {
    logger.error("auth.confirm_post_error", { err });
    return NextResponse.json(
      { ok: false, error: "Could not verify the code right now. Please try again." },
      { status: 500 },
    );
  }
}

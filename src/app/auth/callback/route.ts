import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { logger } from "@/lib/logger";
import { safeRedirectPath } from "@/lib/security/redirect";
import { createClient } from "@/lib/supabase/server";

/**
 * Landing point for email verification and password recovery links.
 * Supports both `token_hash` + `type` (sent directly via ClosetAI's Gmail mailer)
 * and PKCE `code` (sent by Supabase's default mailer).
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = safeRedirectPath(searchParams.get("next"), "/dashboard");

  if (!code && !(tokenHash && type)) {
    return NextResponse.redirect(`${origin}/login?error=link_invalid`);
  }

  try {
    const supabase = await createClient();

    if (tokenHash && type) {
      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type,
      });
      if (error) {
        logger.warn("auth.callback_otp_failed", { code: error.code, status: error.status });
        return NextResponse.redirect(`${origin}/login?error=link_expired`);
      }
    } else if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) {
        logger.warn("auth.callback_exchange_failed", { code: error.code, status: error.status });
        return NextResponse.redirect(`${origin}/login?error=link_expired`);
      }
    }
  } catch (err) {
    logger.error("auth.callback_error", { err });
    return NextResponse.redirect(`${origin}/login?error=link_invalid`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}


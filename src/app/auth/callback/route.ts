import { NextResponse, type NextRequest } from "next/server";
import { logger } from "@/lib/logger";
import { safeRedirectPath } from "@/lib/security/redirect";
import { createClient } from "@/lib/supabase/server";

/**
 * Landing point for Supabase email links (verification, password recovery) using PKCE.
 * Exchanges the one-time `code` for a session, then redirects to a validated local path.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = safeRedirectPath(searchParams.get("next"), "/dashboard");

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=link_invalid`);
  }

  try {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      logger.warn("auth.callback_exchange_failed", { code: error.code, status: error.status });
      return NextResponse.redirect(`${origin}/login?error=link_expired`);
    }
  } catch (err) {
    logger.error("auth.callback_error", { err });
    return NextResponse.redirect(`${origin}/login?error=link_invalid`);
  }

  return NextResponse.redirect(`${origin}${next}`);
}

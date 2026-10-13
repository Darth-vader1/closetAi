"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { friendlyAuthError } from "@/lib/auth/errors";
import type { AuthActionResult } from "@/lib/auth/types";
import { ConfigError, getAppUrl } from "@/lib/env";
import { logger } from "@/lib/logger";
import { safeRedirectPath } from "@/lib/security/redirect";
import { createClient } from "@/lib/supabase/server";
import {
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  signUpSchema,
} from "@/lib/validation/auth";

/**
 * Prefer the current request's origin (so localhost stays on localhost and preview URLs stay
 * on the preview URL), falling back to NEXT_PUBLIC_APP_URL.
 */
async function resolveAppUrl(): Promise<string> {
  try {
    const hdrs = await headers();
    const origin = hdrs.get("origin");
    if (origin && /^https?:\/\//i.test(origin)) {
      return origin.replace(/\/$/, "");
    }
    const host = hdrs.get("x-forwarded-host") || hdrs.get("host");
    if (host) {
      const proto = hdrs.get("x-forwarded-proto") || (host.startsWith("localhost") || host.startsWith("127.0.0.1") ? "http" : "https");
      return `${proto}://${host}`.replace(/\/$/, "");
    }
  } catch {
    // Fallback to configured NEXT_PUBLIC_APP_URL
  }
  return getAppUrl();
}

/** Flatten Zod issues to one message per field. */
function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

function configFailure(err: unknown): AuthActionResult | null {
  if (err instanceof ConfigError) {
    return { ok: false, error: "Sign-in isn't configured yet. The site owner needs to connect Supabase." };
  }
  return null;
}

export async function signUpAction(input: unknown): Promise<AuthActionResult> {
  const parsed = signUpSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };

  try {
    const appUrl = await resolveAppUrl();
    const { getResendClient, sendEmail } = await import("@/lib/email/service");
    const emailConfig = getResendClient();

    // When Gmail/Resend + Service Role are configured, generate the verification link server-side
    // and send it via ClosetAI's own mailer (bypassing Supabase's 2/hr built-in email limit).
    if (emailConfig && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
      const { createAdminClient } = await import("@/lib/supabase/admin");
      const admin = createAdminClient();
      const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
        type: "signup",
        email: parsed.data.email,
        password: parsed.data.password,
        options: {
          data: { display_name: parsed.data.displayName },
          redirectTo: `${appUrl}/auth/callback?next=/onboarding`,
        },
      });

      if (linkErr) {
        logger.warn("auth.signup_generate_link_failed", { code: linkErr.code, status: linkErr.status });
        return { ok: false, error: friendlyAuthError(linkErr) };
      }

      const hashedToken = linkData?.properties?.hashed_token;
      const actionUrl = hashedToken
        ? `${appUrl}/auth/callback?token_hash=${encodeURIComponent(hashedToken)}&type=signup&next=/onboarding`
        : linkData?.properties?.action_link;

      if (actionUrl) {
        const { renderAuthEmailHtml } = await import("@/lib/email/templates");
        const sent = await sendEmail({
          to: parsed.data.email,
          subject: "Verify your ClosetAI account",
          html: renderAuthEmailHtml({
            type: "signup",
            displayName: parsed.data.displayName,
            actionUrl,
            otpCode: linkData?.properties?.email_otp,
          }),
        });
        if (!sent.success) {
          logger.error("auth.signup_email_send_failed", { error: sent.error });
          return { ok: false, error: "Could not send verification email. Please try again in a moment." };
        }
        return {
          ok: true,
          message: "Check your email for a verification link (please check your Spam or Promotions folder if you don't see it). Once confirmed, you can finish setting up your wardrobe.",
        };
      }
    }

    const supabase = await createClient();
    const { data, error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        data: { display_name: parsed.data.displayName },
        emailRedirectTo: `${appUrl}/auth/callback?next=/onboarding`,
      },
    });
    if (error) {
      logger.warn("auth.signup_failed", { code: error.code, status: error.status });
      return { ok: false, error: friendlyAuthError(error) };
    }
    // When email confirmation is disabled in Supabase, a session is returned immediately.
    if (data.session) redirect("/onboarding");
    return {
      ok: true,
      message: "Check your email for a verification link (please check your Spam or Promotions folder if you don't see it). Once confirmed, you can finish setting up your wardrobe.",
    };
  } catch (err) {
    const cfg = configFailure(err);
    if (cfg) return cfg;
    throw err; // includes Next's redirect signal
  }
}

export async function signInAction(input: unknown, next?: string | null): Promise<AuthActionResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };

  const rememberMe = parsed.data.rememberMe !== false;

  try {
    const { cookies } = await import("next/headers");
    const { REMEMBER_COOKIE } = await import("@/lib/supabase/server");
    const cookieStore = await cookies();
    cookieStore.set(REMEMBER_COOKIE, rememberMe ? "1" : "0", {
      path: "/",
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      ...(rememberMe ? { maxAge: 60 * 60 * 24 * 30 } : {}),
    });

    const supabase = await createClient({ rememberMe });
    const { error } = await supabase.auth.signInWithPassword({
      email: parsed.data.email,
      password: parsed.data.password,
    });
    if (error) {
      logger.warn("auth.signin_failed", { code: error.code, status: error.status });
      return { ok: false, error: friendlyAuthError(error) };
    }
  } catch (err) {
    const cfg = configFailure(err);
    if (cfg) return cfg;
    throw err;
  }
  redirect(safeRedirectPath(next));
}

export async function requestPasswordResetAction(input: unknown): Promise<AuthActionResult> {
  const parsed = forgotPasswordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Enter a valid email address.", fieldErrors: fieldErrors(parsed.error) };

  try {
    const appUrl = await resolveAppUrl();
    const { getResendClient, sendEmail } = await import("@/lib/email/service");
    const emailConfig = getResendClient();

    if (emailConfig && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
      const { createAdminClient } = await import("@/lib/supabase/admin");
      const admin = createAdminClient();
      const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
        type: "recovery",
        email: parsed.data.email,
        options: {
          redirectTo: `${appUrl}/auth/callback?next=/reset-password`,
        },
      });

      if (linkErr) {
        logger.warn("auth.reset_generate_link_failed", { code: linkErr.code, status: linkErr.status });
        if (linkErr.code === "over_email_send_rate_limit" || linkErr.code === "over_request_rate_limit") {
          return { ok: false, error: friendlyAuthError(linkErr) };
        }
        // For user_not_found, return the same success message to avoid account enumeration.
        if (linkErr.code === "user_not_found") {
          return {
            ok: true,
            message: "If an account exists for that email, a reset link and verification code are on their way (please check your Spam or Promotions folder if you don't see it).",
          };
        }
        return { ok: false, error: friendlyAuthError(linkErr) };
      }

      if (linkData?.properties) {
        const hashedToken = linkData.properties.hashed_token;
        const actionUrl = hashedToken
          ? `${appUrl}/auth/callback?token_hash=${encodeURIComponent(hashedToken)}&type=recovery&next=/reset-password`
          : linkData.properties.action_link;

        if (actionUrl) {
          const { renderAuthEmailHtml } = await import("@/lib/email/templates");
          const sent = await sendEmail({
            to: parsed.data.email,
            subject: "Reset your ClosetAI password",
            html: renderAuthEmailHtml({
              type: "recovery",
              actionUrl,
              otpCode: linkData.properties.email_otp,
            }),
          });
          if (!sent.success) {
            logger.error("auth.reset_email_send_failed", { error: sent.error });
            return { ok: false, error: "Could not send the password reset email right now. Please try again in a moment." };
          }
        }
      }
      return {
        ok: true,
        message: "If an account exists for that email, a reset link and verification code are on their way (please check your Spam or Promotions folder if you don't see it).",
      };
    }

    const supabase = await createClient();
    const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
      redirectTo: `${appUrl}/auth/callback?next=/reset-password`,
    });
    // Only surface rate limiting. Any other outcome gets the same message so we never reveal
    // whether an address has an account.
    if (error?.code === "over_email_send_rate_limit" || error?.code === "over_request_rate_limit") {
      return { ok: false, error: friendlyAuthError(error) };
    }
    if (error) logger.warn("auth.reset_request_failed", { code: error.code, status: error.status });
  } catch (err) {
    const cfg = configFailure(err);
    if (cfg) return cfg;
    throw err;
  }
  return {
    ok: true,
    message: "If an account exists for that email, a reset link and verification code are on their way (please check your Spam or Promotions folder if you don't see it).",
  };
}

export async function updatePasswordAction(input: unknown): Promise<AuthActionResult> {
  const parsed = resetPasswordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Please fix the highlighted fields.", fieldErrors: fieldErrors(parsed.error) };

  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getClaims();
    if (!data?.claims?.sub) {
      return { ok: false, error: "This reset link has expired or was already used. Request a new one." };
    }
    const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
    if (error) {
      logger.warn("auth.password_update_failed", { code: error.code, status: error.status });
      return { ok: false, error: friendlyAuthError(error) };
    }
  } catch (err) {
    const cfg = configFailure(err);
    if (cfg) return cfg;
    throw err;
  }
  redirect("/dashboard");
}

export async function signOutAction(): Promise<void> {
  try {
    const supabase = await createClient();
    await supabase.auth.signOut();
  } catch (err) {
    if (!(err instanceof ConfigError)) throw err;
  }
  redirect("/");
}

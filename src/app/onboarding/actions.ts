"use server";

import { redirect } from "next/navigation";
import type { AuthActionResult } from "@/lib/auth/types";
import { requireUser } from "@/lib/auth/session";
import { logger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";
import { onboardingSchema } from "@/lib/validation/onboarding";

/**
 * Saves onboarding answers. The user id always comes from the verified session, never from input.
 * Email preferences are written first and the profile (which carries onboarding_completed_at) last,
 * so a partial failure simply shows onboarding again instead of locking the user out half-configured.
 */
export async function completeOnboardingAction(input: unknown): Promise<AuthActionResult> {
  const user = await requireUser();
  const parsed = onboardingSchema.safeParse(input);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? "form");
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { ok: false, error: "Please fix the highlighted fields.", fieldErrors };
  }
  const d = parsed.data;
  const supabase = await createClient();

  const prefsPayload = {
    daily_enabled: d.dailyEnabled,
    daily_time: d.dailyTime,
    weekly_enabled: d.weeklyEnabled,
    weekly_day: d.weeklyDay,
    weekly_time: d.weeklyTime,
  };

  // 1. Try updating email preferences first if the row already exists
  const prefsUpdate = await supabase
    .from("email_preferences")
    .update(prefsPayload)
    .eq("user_id", user.id)
    .select("user_id");

  if (prefsUpdate.error || !prefsUpdate.data || prefsUpdate.data.length === 0) {
    const prefsUpsert = await supabase
      .from("email_preferences")
      .upsert({
        user_id: user.id,
        ...prefsPayload,
      });
    if (prefsUpsert.error && prefsUpdate.error) {
      logger.error("onboarding.prefs_failed", { userId: user.id, code: prefsUpsert.error.code });
      return { ok: false, error: "We couldn't save your email preferences. Please try again." };
    }
  }

  const profilePayload = {
    display_name: d.displayName,
    favourite_colours: d.favouriteColours,
    common_occasions: d.commonOccasions,
    location: d.location,
    timezone: d.timezone,
    discoverable: true,
    onboarding_completed_at: new Date().toISOString(),
  };

  // 2. Try updating the profile first (most common flow since signup trigger creates the row)
  let profileUpdate = await supabase
    .from("profiles")
    .update({ ...profilePayload, preferred_style: d.preferredStyles })
    .eq("id", user.id)
    .select("id");

  // Fallback: If column is still single text (older migration), save the first style
  if (profileUpdate.error) {
    profileUpdate = await supabase
      .from("profiles")
      .update({ ...profilePayload, preferred_style: d.preferredStyles[0] ?? null })
      .eq("id", user.id)
      .select("id");
  }

  // 3. If update returned 0 rows or failed (e.g. signup trigger didn't run), try upserting
  if (profileUpdate.error || !profileUpdate.data || profileUpdate.data.length === 0) {
    let profileUpsert = await supabase
      .from("profiles")
      .upsert({
        id: user.id,
        ...profilePayload,
        preferred_style: d.preferredStyles,
      });

    if (profileUpsert.error) {
      profileUpsert = await supabase
        .from("profiles")
        .upsert({
          id: user.id,
          ...profilePayload,
          preferred_style: d.preferredStyles[0] ?? null,
        });
    }

    if (profileUpsert.error && profileUpdate.error) {
      logger.error("onboarding.profile_failed", {
        userId: user.id,
        code: profileUpsert.error.code ?? profileUpdate.error.code,
        message: profileUpsert.error.message,
      });
      return { ok: false, error: "We couldn't save your profile. Please try again." };
    }

    // Send Onboarding Welcome Quickstart Email
    if (user.email) {
      try {
        const { renderOnboardingWelcomeHtml } = await import("@/lib/email/templates");
        const { sendEmail } = await import("@/lib/email/service");
        await sendEmail({
          to: user.email,
          subject: `Welcome to ClosetAI${d.displayName ? `, ${d.displayName}` : ""} — Your Wardrobe Quickstart`,
          html: renderOnboardingWelcomeHtml({
            displayName: d.displayName,
            preferredStyles: d.preferredStyles,
          }),
        });
        logger.info("onboarding.welcome_email_sent", { userId: user.id, email: user.email });
      } catch (emailErr) {
        logger.warn("onboarding.welcome_email_failed", { userId: user.id, error: emailErr });
      }
    }
  }

  redirect("/subscription");
}

/** Lets users skip everything nonessential. Emails stay off; the timezone stays UTC until they set one. */
export async function skipOnboardingAction(): Promise<AuthActionResult> {
  const user = await requireUser();
  const supabase = await createClient();

  const skipPayload = {
    discoverable: true,
    onboarding_completed_at: new Date().toISOString(),
  };

  const updateRes = await supabase
    .from("profiles")
    .update(skipPayload)
    .eq("id", user.id)
    .select("id");

  if (updateRes.error || !updateRes.data || updateRes.data.length === 0) {
    const { error: upsertError } = await supabase
      .from("profiles")
      .upsert({ id: user.id, ...skipPayload });

    if (upsertError && updateRes.error) {
      logger.error("onboarding.skip_failed", { userId: user.id, code: upsertError.code });
      return { ok: false, error: "Something went wrong. Please try again." };
    }
  }

  redirect("/subscription");
}

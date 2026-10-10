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

  const prefs = await supabase
    .from("email_preferences")
    .update({
      daily_enabled: d.dailyEnabled,
      daily_time: d.dailyTime,
      weekly_enabled: d.weeklyEnabled,
      weekly_day: d.weeklyDay,
      weekly_time: d.weeklyTime,
    })
    .eq("user_id", user.id);
  if (prefs.error) {
    logger.error("onboarding.prefs_failed", { userId: user.id, code: prefs.error.code });
    return { ok: false, error: "We couldn't save your email preferences. Please try again." };
  }

  const profile = await supabase
    .from("profiles")
    .update({
      display_name: d.displayName,
      preferred_style: d.preferredStyle,
      favourite_colours: d.favouriteColours,
      common_occasions: d.commonOccasions,
      location: d.location,
      timezone: d.timezone,
      onboarding_completed_at: new Date().toISOString(),
    })
    .eq("id", user.id);
  if (profile.error) {
    logger.error("onboarding.profile_failed", { userId: user.id, code: profile.error.code });
    return { ok: false, error: "We couldn't save your profile. Please try again." };
  }

  redirect("/dashboard");
}

/** Lets users skip everything nonessential. Emails stay off; the timezone stays UTC until they set one. */
export async function skipOnboardingAction(): Promise<AuthActionResult> {
  const user = await requireUser();
  const supabase = await createClient();
  const { error } = await supabase
    .from("profiles")
    .update({ onboarding_completed_at: new Date().toISOString() })
    .eq("id", user.id);
  if (error) {
    logger.error("onboarding.skip_failed", { userId: user.id, code: error.code });
    return { ok: false, error: "Something went wrong. Please try again." };
  }
  redirect("/dashboard");
}

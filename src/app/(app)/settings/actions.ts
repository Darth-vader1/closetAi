"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { updateProfileSchema, updateEmailPreferencesSchema } from "@/lib/validation/settings";
import { logger } from "@/lib/logger";
import { sendEmail } from "@/lib/email/service";
import { renderDailyOutfitHtml, renderWeeklyLaundryHtml } from "@/lib/email/templates";
import { countItemsByStatus, listItemsNeedingAttention } from "@/lib/wardrobe/queries";
import { countByStatus } from "@/lib/wardrobe/status";

export type ActionResult<T = unknown> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

function fail(error: string, fieldErrors?: Record<string, string>): ActionResult {
  return { ok: false, error, fieldErrors };
}

export async function updateProfileSettingsAction(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = updateProfileSchema.safeParse(input);

  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      errors[String(issue.path[0])] = issue.message;
    }
    return fail("Please check the profile fields.", errors);
  }

  const supabase = await createClient();
  const updatePayload: Record<string, unknown> = {
    display_name: parsed.data.displayName,
    preferred_style: parsed.data.preferredStyle,
    common_occasions: parsed.data.commonOccasions,
    location: parsed.data.location,
    timezone: parsed.data.timezone,
    rewear_worn_items: parsed.data.rewearWornItems,
    updated_at: new Date().toISOString(),
  };

  // Attempt update with gender
  let { error } = await supabase
    .from("profiles")
    .update({
      ...updatePayload,
      gender: parsed.data.gender,
    })
    .eq("id", user.id);

  // If gender column is missing in schema (e.g. migration pending), update without gender
  if (error && (error.code === "PGRST204" || error.message.includes("'gender'"))) {
    const fallback = await supabase
      .from("profiles")
      .update(updatePayload)
      .eq("id", user.id);
    error = fallback.error;
  }

  if (error) {
    logger.error("settings.profile_update_failed", { userId: user.id, error });
    return fail("Could not update profile. Please try again.");
  }

  revalidatePath("/settings");
  revalidatePath("/stylist");
  revalidatePath("/dashboard");
  return { ok: true, message: "Profile settings updated successfully." };
}

export async function updateEmailPreferencesAction(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = updateEmailPreferencesSchema.safeParse(input);

  if (!parsed.success) {
    return fail("Invalid notification settings.");
  }

  const supabase = await createClient();

  const weekdayIndexMap: Record<string, number> = {
    Sunday: 0,
    Monday: 1,
    Tuesday: 2,
    Wednesday: 3,
    Thursday: 4,
    Friday: 5,
    Saturday: 6,
  };
  const weeklyDayInt = weekdayIndexMap[parsed.data.weeklyLaundryDay] ?? 0;

  // Schema columns from 20261009000001_schema.sql:
  // daily_enabled, daily_time, weekly_enabled, weekly_day, weekly_time
  const { error } = await supabase.from("email_preferences").upsert(
    {
      user_id: user.id,
      daily_enabled: parsed.data.dailyEnabled,
      daily_time: parsed.data.dailyTime,
      weekly_enabled: parsed.data.weeklyLaundryEnabled,
      weekly_day: weeklyDayInt,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );

  if (error) {
    logger.error("settings.email_prefs_failed", { userId: user.id, error });
    return fail("Could not update email preferences.");
  }

  revalidatePath("/settings");
  return { ok: true, message: "Email preferences saved." };
}

/**
 * Sends a real test email immediately to the user's logged in address to verify Resend delivery
 */
export async function sendTestEmailAction(type: "daily" | "laundry"): Promise<ActionResult> {
  const user = await requireUser();
  if (!user.email) return fail("No email address associated with this account.");

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .single();

  const displayName = profile?.display_name || user.email.split("@")[0];

  if (type === "daily") {
    const html = renderDailyOutfitHtml({
      displayName,
      outfitName: "Monochrome City Minimalist (Test Preview)",
      occasion: "Casual Friday & Coffee",
      styleDescription: "A sleek combination of neutral tones and structured layering for effortless style.",
      explanation: "Balancing crisp lines with breathable textures creates a relaxed yet intentional aesthetic.",
      stylingTip: "Tuck the shirt loosely into the waistband and fold cuffs once for a modern finish.",
      items: [
        { name: "Charcoal Structured Overshirt", category: "Outerwear", colour: "Grey" },
        { name: "Classic White Cotton Tee", category: "Tops", colour: "White" },
        { name: "Black Tailored Chinos", category: "Bottoms", colour: "Black" },
      ],
      weatherSummary: "Mild & Clear · 19°C",
    });

    const res = await sendEmail({
      to: user.email,
      subject: "Test Preview: Your Daily Look · ClosetAI",
      html,
    });

    if (!res.success) {
      return fail(`Could not send test email: ${res.error || "Delivery issue"}`);
    }

    return { ok: true, message: `Test Daily Outfit email sent to ${user.email}!` };
  } else {
    const [all, attention] = await Promise.all([
      countItemsByStatus(supabase, user.id).catch(() => []),
      listItemsNeedingAttention(supabase, user.id).catch(() => []),
    ]);

    const counts = countByStatus(all);
    const urgentItems = attention.slice(0, 5).map((i) => ({
      name: i.name,
      category: i.category,
      wearCount: i.wearCount || 1,
    }));

    const html = renderWeeklyLaundryHtml({
      displayName,
      cleanCount: counts.CLEAN,
      wornCount: counts.WORN,
      dirtyCount: counts.DIRTY,
      inLaundryCount: counts.IN_LAUNDRY,
      urgentItems,
    });

    const res = await sendEmail({
      to: user.email,
      subject: "Test Preview: Weekly Laundry Digest · ClosetAI",
      html,
    });

    if (!res.success) {
      return fail(`Could not send test email: ${res.error || "Delivery issue"}`);
    }

    return { ok: true, message: `Test Laundry Digest email sent to ${user.email}!` };
  }
}

export async function deleteAccountAction(): Promise<ActionResult> {
  const user = await requireUser();
  const supabase = await createClient();

  try {
    // Clean up user data
    await supabase.from("wardrobe_items").delete().eq("user_id", user.id);
    await supabase.from("outfits").delete().eq("user_id", user.id);
    await supabase.from("email_preferences").delete().eq("user_id", user.id);
    await supabase.from("profiles").delete().eq("id", user.id);

    // Sign user out
    await supabase.auth.signOut();

    return { ok: true, message: "Account and wardrobe data deleted successfully." };
  } catch (err) {
    logger.error("settings.delete_account_failed", { userId: user.id, err });
    return fail("Could not complete account deletion. Please contact support.");
  }
}

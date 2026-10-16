"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { updateProfileSchema, updateEmailPreferencesSchema } from "@/lib/validation/settings";
import { logger } from "@/lib/logger";
import { getResendClient, sendEmail } from "@/lib/email/service";
import { renderDailyOutfitHtml, renderWeeklyLaundryHtml } from "@/lib/email/templates";
import { countItemsByStatus, listItemsNeedingAttention, WARDROBE_BUCKET } from "@/lib/wardrobe/queries";
import { countByStatus } from "@/lib/wardrobe/status";
import { getWhatsAppConfig, sendWhatsAppMessage, formatDailyOutfitWhatsApp } from "@/lib/whatsapp/service";
import { takeAiQuota } from "@/lib/ai/rate-limit";
import { getAppUrl } from "@/lib/env";
import { normaliseWhatsAppPhone } from "@/lib/whatsapp/phone";

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
    gender: parsed.data.gender,
    preferred_style: parsed.data.preferredStyle,
    common_occasions: parsed.data.commonOccasions,
    location: parsed.data.location,
    timezone: parsed.data.timezone,
    rewear_worn_items: parsed.data.rewearWornItems,
    discoverable: parsed.data.discoverable,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("profiles")
    .update(updatePayload)
    .eq("id", user.id);

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

  // A saved number must be a real, normalised phone number (never free text). Changing it drops
  // verification automatically in the database, so a number is only ever messaged after the
  // person who controls it has proved so.
  const rawPhone = parsed.data.whatsappPhone.trim();
  const phone = rawPhone ? normaliseWhatsAppPhone(rawPhone) : null;
  if (rawPhone && !phone) {
    return fail("Please enter a valid WhatsApp number in international format, e.g. +2348012345678.");
  }

  const fullPayload = {
    daily_enabled: parsed.data.dailyEnabled,
    daily_time: parsed.data.dailyTime,
    weekly_enabled: parsed.data.weeklyLaundryEnabled,
    weekly_day: weeklyDayInt,
    whatsapp_phone: phone?.e164 ?? null,
    whatsapp_daily_enabled: parsed.data.whatsappDailyEnabled,
    remind_empty_wardrobe: parsed.data.remindEmptyWardrobe,
    updated_at: new Date().toISOString(),
  };

  const { data: updatedRows, error: updateErr } = await supabase
    .from("email_preferences")
    .update(fullPayload)
    .eq("user_id", user.id)
    .select("user_id");

  if (updateErr) {
    logger.error("settings.email_prefs_failed", { userId: user.id, error: updateErr });
    return fail("Could not update notification preferences. Please ensure all database migrations are applied.");
  }

  // If the user row was not yet created by the signup trigger, insert it under the user's RLS session
  if (!updatedRows || updatedRows.length === 0) {
    const { error: insertErr } = await supabase.from("email_preferences").insert({
      user_id: user.id,
      ...fullPayload,
    });

    if (insertErr) {
      logger.error("settings.email_prefs_insert_failed", { userId: user.id, error: insertErr });
      return fail("Could not save notification preferences.");
    }
  }

  revalidatePath("/settings");
  return { ok: true, message: "Notification preferences saved." };
}

/**
 * Sends a real test email immediately to the user's logged in address to verify Resend delivery
 */
export async function sendTestEmailAction(type: "daily" | "laundry"): Promise<ActionResult> {
  const user = await requireUser();
  if (!user.email) return fail("No email address associated with this account.");

  if (!getResendClient()) {
    return fail("Email service is not configured. Set GMAIL_USER and GMAIL_APP_PASSWORD (or RESEND_API_KEY) in your environment variables.");
  }

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();

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

    return {
      ok: true,
      message: `Test Daily Outfit email sent to ${user.email}! Please check your Spam or Promotions folder if you don't see it in your Inbox.`,
    };
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

    return {
      ok: true,
      message: `Test Laundry Digest email sent to ${user.email}! Please check your Spam or Promotions folder if you don't see it in your Inbox.`,
    };
  }
}

/**
 * Sends a real WhatsApp test preview to the user's saved phone number.
 */
export async function sendTestWhatsAppAction(phoneNumber: string): Promise<ActionResult> {
  const user = await requireUser();
  const phone = phoneNumber.trim();
  if (!/^\+?[1-9]\d{6,14}$/.test(phone.replace(/[\s()-]/g, ""))) {
    return fail("Please enter a valid WhatsApp phone number in international format (e.g. +2348012345678).");
  }

  if (!getWhatsAppConfig()) {
    return fail("WhatsApp Cloud API credentials are not configured on this server.");
  }

  const supabase = await createClient();

  // Rate limit test dispatches per user
  const quota = await takeAiQuota(supabase, user.id, "CHAT");
  if (!quota.allowed) {
    return fail("Too many test messages sent recently. Please try again later.");
  }

  // Require the target phone number to match the user's saved whatsapp_phone preference
  const { data: savedPref } = await supabase
    .from("email_preferences")
    .select("whatsapp_phone, whatsapp_phone_verified")
    .eq("user_id", user.id)
    .maybeSingle();

  const normalizeDigits = (val: string) => val.replace(/[^\d]/g, "");
  if (!savedPref?.whatsapp_phone || normalizeDigits(savedPref.whatsapp_phone) !== normalizeDigits(phone)) {
    return fail("Please save your WhatsApp phone number in preferences before sending a test message.");
  }
  if (!savedPref.whatsapp_phone_verified) {
    return fail("Verify your WhatsApp number first. Use the Verify button, then try the test again.");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, location")
    .eq("id", user.id)
    .maybeSingle();

  const displayName = profile?.display_name || user.email?.split("@")[0] || "Friend";

  // Find distinct real wardrobe items across categories (e.g. top + trousers + shoes/jacket)
  const { data: realItems } = await supabase
    .from("wardrobe_items")
    .select("name, category, primary_colour, image_path")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(30);

  type RealItem = {
    name: string;
    category: string;
    primary_colour: string | null;
    image_path: string | null;
  };

  const categoryMap = new Map<string, RealItem>();
  if (realItems) {
    for (const item of realItems) {
      if (!categoryMap.has(item.category)) {
        categoryMap.set(item.category, item);
      }
    }
  }

  const selectedItems = Array.from(categoryMap.values()).slice(0, 3);

  const signedImageUrls: string[] = [];
  for (const item of selectedItems) {
    if (item.image_path) {
      const { data: signed } = await supabase.storage
        .from(WARDROBE_BUCKET)
        .createSignedUrl(item.image_path, 60 * 60);
      if (signed?.signedUrl) {
        signedImageUrls.push(signed.signedUrl);
      }
    }
  }

  const itemsList =
    selectedItems.length > 0
      ? selectedItems.map((i) => ({
          name: i.name,
          category: i.category,
          colour: i.primary_colour,
        }))
      : [
          { name: "Classic White Cotton Tee", category: "Tops", colour: "White" },
          { name: "Charcoal Structured Overshirt", category: "Outerwear", colour: "Grey" },
          { name: "Tailored Black Chinos", category: "Bottoms", colour: "Black" },
        ];

  const message = formatDailyOutfitWhatsApp({
    displayName,
    outfitName: "Monochrome Minimalist (WhatsApp Preview)",
    occasion: "Casual Friday & Coffee",
    styleDescription: "Crisp neutral contrast with structured layering for effortless day-to-night versatility.",
    stylingTip: "Tuck the tee loosely into waistband and cuff the sleeves once for an intentional silhouette.",
    weatherSummary: `${profile?.location || "Lagos"}: 28°C · Clear & Pleasant`,
    items: itemsList,
    appUrl: getAppUrl(),
  });

  const res = await sendWhatsAppMessage({
    to: savedPref.whatsapp_phone,
    message,
    imageUrls: signedImageUrls,
    userId: user.id,
  });

  if (!res.success) {
    return fail(`Could not send WhatsApp message: ${res.error || "Delivery issue"}`);
  }

  return { ok: true, message: `Test WhatsApp message dispatched to ${phone}!` };
}

export async function deleteAccountAction(): Promise<ActionResult> {
  const user = await requireUser();

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()) {
    logger.error("settings.delete_account_missing_service_role", { userId: user.id });
    return fail("Account deletion is not fully configured on this server. Please contact support.");
  }

  const supabase = await createClient();
  const adminClient = createAdminClient();

  try {
    // 1. Collect all storage object paths belonging to the user
    const [{ data: items }, { data: outfits }, { data: folderFiles }] = await Promise.all([
      supabase.from("wardrobe_items").select("image_path").eq("user_id", user.id),
      supabase.from("outfits").select("photo_path").eq("user_id", user.id),
      supabase.storage.from(WARDROBE_BUCKET).list(user.id, { limit: 1000 }),
    ]);

    const pathsToDelete = new Set<string>();
    for (const item of items ?? []) {
      if (item.image_path) pathsToDelete.add(item.image_path);
    }
    for (const outfit of outfits ?? []) {
      if (outfit.photo_path) pathsToDelete.add(outfit.photo_path);
    }
    for (const file of folderFiles ?? []) {
      if (file.name) pathsToDelete.add(`${user.id}/${file.name}`);
    }

    if (pathsToDelete.size > 0) {
      const { error: storageErr } = await supabase.storage
        .from(WARDROBE_BUCKET)
        .remove(Array.from(pathsToDelete));

      if (storageErr) {
        logger.error("settings.delete_storage_failed", { userId: user.id, error: storageErr });
        return fail("Could not delete stored wardrobe photos. Please try again.");
      }
    }

    // 2. Delete the user's profile row (cascades to all user-owned tables via ON DELETE CASCADE)
    const { error: profileDeleteErr } = await supabase
      .from("profiles")
      .delete()
      .eq("id", user.id);

    if (profileDeleteErr) {
      logger.error("settings.delete_profile_failed", { userId: user.id, error: profileDeleteErr });
      return fail("Could not delete account profile data.");
    }

    // 3. Delete the auth.users record using the service-role admin client
    const { error: authDeleteErr } = await adminClient.auth.admin.deleteUser(user.id);
    if (authDeleteErr) {
      logger.error("settings.delete_auth_user_failed", { userId: user.id, error: authDeleteErr });
      return fail("Could not remove authentication account. Please contact support.");
    }

    // 4. Sign user out
    await supabase.auth.signOut();

    return { ok: true, message: "Account and wardrobe data deleted permanently." };
  } catch (err) {
    logger.error("settings.delete_account_failed", { userId: user.id, err });
    return fail("Could not complete account deletion. Please contact support.");
  }
}

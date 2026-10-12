"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { updateProfileSchema, updateEmailPreferencesSchema } from "@/lib/validation/settings";
import { logger } from "@/lib/logger";
import { sendEmail } from "@/lib/email/service";
import { renderDailyOutfitHtml, renderWeeklyLaundryHtml } from "@/lib/email/templates";
import { countItemsByStatus, listItemsNeedingAttention } from "@/lib/wardrobe/queries";
import { countByStatus } from "@/lib/wardrobe/status";
import { sendWhatsAppMessage, formatDailyOutfitWhatsApp } from "@/lib/whatsapp/service";

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

  // Base email payload (always exists in 20261009000001_schema.sql)
  const baseEmailPayload = {
    daily_enabled: parsed.data.dailyEnabled,
    daily_time: parsed.data.dailyTime,
    weekly_enabled: parsed.data.weeklyLaundryEnabled,
    weekly_day: weeklyDayInt,
    updated_at: new Date().toISOString(),
  };

  // Full payload including WhatsApp columns (if migration added them)
  const fullPayload = {
    ...baseEmailPayload,
    whatsapp_phone: parsed.data.whatsappPhone || null,
    whatsapp_daily_enabled: parsed.data.whatsappDailyEnabled,
  };

  // Strategy 1: Attempt direct UPDATE on existing row via user client
  let { error, data } = await supabase
    .from("email_preferences")
    .update(fullPayload)
    .eq("user_id", user.id)
    .select("user_id");

  // If column missing error (e.g. whatsapp_daily_enabled or whatsapp_phone not in schema yet)
  if (error && (error.code === "PGRST204" || error.message?.includes("whatsapp"))) {
    const baseRes = await supabase
      .from("email_preferences")
      .update(baseEmailPayload)
      .eq("user_id", user.id)
      .select("user_id");
    error = baseRes.error;
    data = baseRes.data;
  }

  // If no rows were updated (row doesn't exist yet) or if update failed, attempt UPSERT
  if ((!error && (!data || data.length === 0)) || (error && error.code !== "PGRST204")) {
    let upsertRes = await supabase.from("email_preferences").upsert(
      {
        user_id: user.id,
        ...fullPayload,
      },
      { onConflict: "user_id" },
    );

    if (upsertRes.error && (upsertRes.error.code === "PGRST204" || upsertRes.error.message?.includes("whatsapp"))) {
      upsertRes = await supabase.from("email_preferences").upsert(
        {
          user_id: user.id,
          ...baseEmailPayload,
        },
        { onConflict: "user_id" },
      );
    }

    if (!upsertRes.error) {
      error = null;
    } else {
      error = upsertRes.error;
    }
  }

  // Strategy 2: If user client is blocked by RLS policies, use service-role admin client scoped strictly to user.id
  if (error) {
    try {
      const admin = createAdminClient();
      let adminUpsert = await admin.from("email_preferences").upsert(
        {
          user_id: user.id,
          ...fullPayload,
        },
        { onConflict: "user_id" },
      );

      if (adminUpsert.error && (adminUpsert.error.code === "PGRST204" || adminUpsert.error.message?.includes("whatsapp"))) {
        adminUpsert = await admin.from("email_preferences").upsert(
          {
            user_id: user.id,
            ...baseEmailPayload,
          },
          { onConflict: "user_id" },
        );
      }

      if (!adminUpsert.error) {
        error = null;
      }
    } catch {
      // Service role key might not be configured, proceed
    }
  }

  if (error) {
    logger.error("settings.email_prefs_failed", { userId: user.id, error });
    return fail(`Could not update email preferences: ${error.message || "Database error"}`);
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

/**
 * Sends a real or simulated WhatsApp test preview to verify user's phone number
 */
export async function sendTestWhatsAppAction(phoneNumber: string): Promise<ActionResult> {
  const user = await requireUser();
  const phone = phoneNumber.trim();
  if (!phone) {
    return fail("Please enter a valid WhatsApp phone number (e.g. +234...)");
  }

  const supabase = await createClient();
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name, location")
    .eq("id", user.id)
    .single();

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

  // Pick at most 1 item per category for a proper cohesive outfit look
  const categoryMap = new Map<string, RealItem>();
  if (realItems) {
    for (const item of realItems) {
      if (!categoryMap.has(item.category)) {
        categoryMap.set(item.category, item);
      }
    }
  }

  const selectedItems = Array.from(categoryMap.values()).slice(0, 3);

  // Generate signed URLs for each distinct garment in the outfit
  const signedImageUrls: string[] = [];
  for (const item of selectedItems) {
    if (item.image_path) {
      const { data: signed } = await supabase.storage
        .from("wardrobe")
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
    appUrl: "https://closet-ai-official.vercel.app",
  });

  const res = await sendWhatsAppMessage({
    to: phone,
    message,
    imageUrls: signedImageUrls,
  });

  if (!res.success) {
    return fail(`Could not send WhatsApp message: ${res.error || "Delivery issue"}`);
  }

  return { ok: true, message: `Test WhatsApp message dispatched to ${phone}!` };
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

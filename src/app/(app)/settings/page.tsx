import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { ContextualGuide } from "@/components/onboarding/contextual-guide";
import { SettingsClient } from "@/components/settings/settings-client";
import { requireUser, getProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Settings · ClosetAI",
  description: "Manage your personal styling profile, gender expression, and automated email schedules.",
};

export default async function SettingsPage() {
  const user = await requireUser();
  const profile = await getProfile();
  const supabase = await createClient();

  // Load user's email preferences from database
  const { data: emailPrefs } = await supabase
    .from("email_preferences")
    .select("*")
    .eq("user_id", user.id)
    .maybeSingle();

  const initialProfile = {
    displayName: profile?.display_name || "",
    gender: profile?.gender || "unisex",
    preferredStyle: Array.isArray(profile?.preferred_style)
      ? (profile?.preferred_style as string[])
      : typeof profile?.preferred_style === "string"
      ? [profile.preferred_style]
      : [],
    commonOccasions: profile?.common_occasions || [],
    location: profile?.location || "",
    timezone: profile?.timezone || "UTC",
    rewearWornItems: profile?.rewear_worn_items ?? true,
  };

  const weekdayNames = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const initialWeeklyDay =
    typeof emailPrefs?.weekly_day === "number" && emailPrefs.weekly_day >= 0 && emailPrefs.weekly_day <= 6
      ? weekdayNames[emailPrefs.weekly_day]
      : "Sunday";

  const initialPreferences = {
    dailyEnabled: emailPrefs?.daily_enabled ?? false,
    dailyTime: emailPrefs?.daily_time ? String(emailPrefs.daily_time).slice(0, 5) : "07:00",
    weeklyLaundryEnabled: emailPrefs?.weekly_enabled ?? false,
    weeklyLaundryDay: initialWeeklyDay,
    whatsappPhone: emailPrefs?.whatsapp_phone || "",
    whatsappDailyEnabled: emailPrefs?.whatsapp_daily_enabled ?? false,
    remindEmptyWardrobe: emailPrefs?.remind_empty_wardrobe ?? true,
    whatsappVerified: emailPrefs?.whatsapp_phone_verified ?? false,
  };

  return (
    <>
      <PageHeader
        title="Settings & Preferences"
        description="Fine-tune your personal style persona, gender presentation, and automated morning email schedules."
      />
      <ContextualGuide section="settings" />
      <SettingsClient
        userEmail={user.email || ""}
        initialProfile={initialProfile}
        initialPreferences={initialPreferences}
      />
    </>
  );
}

import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
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
    gender: (profile as any)?.gender || "unisex",
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

  const initialPreferences = {
    dailyEnabled: emailPrefs?.daily_outfit_enabled ?? emailPrefs?.daily_enabled ?? true,
    dailyTime: emailPrefs?.daily_outfit_time ?? "07:00",
    weeklyLaundryEnabled: emailPrefs?.weekly_laundry_enabled ?? emailPrefs?.weekly_enabled ?? true,
    weeklyLaundryDay: emailPrefs?.weekly_laundry_day ?? "Sunday",
  };

  return (
    <>
      <PageHeader
        title="Settings & Preferences"
        description="Fine-tune your personal style persona, gender presentation, and automated morning email schedules."
      />
      <SettingsClient
        userEmail={user.email || ""}
        initialProfile={initialProfile}
        initialPreferences={initialPreferences}
      />
    </>
  );
}

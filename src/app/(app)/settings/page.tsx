import type { Metadata } from "next";
import Link from "next/link";
import { CreditCard } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { ContextualGuide } from "@/components/onboarding/contextual-guide";
import { SettingsClient } from "@/components/settings/settings-client";
import { Button } from "@/components/ui/button";
import { requireUser, getProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { userTag } from "@/lib/connect/user-tag";

export const metadata: Metadata = {
  title: "Settings · ClosetAI",
  description: "Manage your personal styling profile, gender expression, and automated email schedules.",
};

export default async function SettingsPage() {
  const user = await requireUser();
  const profile = await getProfile();
  const supabase = await createClient();

  const [{ data: emailPrefs }, profileRow] = await Promise.all([
    supabase
      .from("email_preferences")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("profiles")
      .select("closet_id, discoverable")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  // Use DB closet_id when available; fall back to UUID-derived tag for
  // pre-migration deployments.
  const closetId =
    (profileRow.data?.closet_id as string | null | undefined) ??
    userTag(user.id);

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
    discoverable: profileRow.data?.discoverable ?? true,
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
        action={
          <Button variant="outline" asChild>
            <Link href="/settings/subscription" className="flex items-center gap-1.5 text-xs">
              <CreditCard className="size-3.5 text-accent" />
              <span>Subscription & Usage</span>
            </Link>
          </Button>
        }
      />
      <ContextualGuide section="settings" />
      <SettingsClient
        userEmail={user.email || ""}
        connectTag={closetId}
        initialProfile={initialProfile}
        initialPreferences={initialPreferences}
      />
    </>
  );
}

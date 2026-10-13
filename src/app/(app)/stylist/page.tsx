import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { ContextualGuide } from "@/components/onboarding/contextual-guide";
import { StylistClient } from "@/components/stylist/stylist-client";
import { getProfile, requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

import { getLiveWeather } from "@/lib/weather/service";

export const metadata: Metadata = {
  title: "AI Stylist · ClosetAI",
  description: "Ask for custom outfit ideas and styling advice grounded in your real wardrobe.",
};

export default async function StylistPage() {
  const user = await requireUser();
  const profile = await getProfile();
  const supabase = await createClient();

  // Fetch live weather based on user location (defaults gracefully to Lagos if unspecified)
  const weather = await getLiveWeather(profile?.location);

  // Count clean items available for styling
  const { count: cleanCount } = await supabase
    .from("wardrobe_items")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .in("status", profile?.rewear_worn_items ? ["CLEAN", "WORN"] : ["CLEAN"]);

  const userGender =
    profile?.gender === "womenswear"
      ? "female"
      : profile?.gender === "menswear"
      ? "male"
      : "unisex";

  return (
    <>
      <PageHeader
        title="AI Stylist"
        description="Describe any occasion, vibe, or weather. The stylist curates complete looks from clothes that are ready to wear."
      />
      <ContextualGuide section="stylist" />
      <StylistClient
        initialCleanCount={cleanCount ?? 0}
        userStylePreferences={
          Array.isArray(profile?.preferred_style)
            ? profile.preferred_style
            : typeof profile?.preferred_style === "string"
            ? [profile.preferred_style]
            : []
        }
        initialGender={userGender}
        initialWeather={weather}
      />
    </>
  );
}

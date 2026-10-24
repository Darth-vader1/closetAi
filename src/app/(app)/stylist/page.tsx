import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { ContextualGuide } from "@/components/onboarding/contextual-guide";
import { StylistClient } from "@/components/stylist/stylist-client";
import { getProfile, requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

import { headers } from "next/headers";
import { getLiveWeather, getLiveWeatherByCoords } from "@/lib/weather/service";

export const metadata: Metadata = {
  title: "AI Stylist · ClosetAI",
  description: "Ask for custom outfit ideas and styling advice grounded in your real wardrobe.",
};

export default async function StylistPage() {
  const user = await requireUser();
  const profile = await getProfile();
  const supabase = await createClient();

  // Detect live weather from request geo headers first, falling back to profile.location.
  const reqHeaders = await headers();
  const edgeLat = Number(reqHeaders.get("x-vercel-ip-latitude"));
  const edgeLon = Number(reqHeaders.get("x-vercel-ip-longitude"));
  const edgeCity = reqHeaders.get("x-vercel-ip-city") || reqHeaders.get("cf-ipcity");
  let weather = null;
  if (Number.isFinite(edgeLat) && Number.isFinite(edgeLon) && (edgeLat !== 0 || edgeLon !== 0)) {
    weather = await getLiveWeatherByCoords(edgeLat, edgeLon, edgeCity ? decodeURIComponent(edgeCity) : null);
  } else if (edgeCity) {
    weather = await getLiveWeather(decodeURIComponent(edgeCity));
  } else if (profile?.location) {
    weather = await getLiveWeather(profile.location);
  }

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

import type { Metadata } from "next";
import { headers } from "next/headers";
import { StylistChatThread } from "@/components/connect/stylist-chat-thread";
import { getProfile, requireUser } from "@/lib/auth/session";
import { listShareableWardrobeAndOutfits } from "@/lib/connect/queries";
import { listStylistChatMessages } from "@/lib/connect/stylist-chat-queries";
import { createClient } from "@/lib/supabase/server";
import { getLiveWeather, getLiveWeatherByCoords } from "@/lib/weather/service";

export const metadata: Metadata = {
  title: "ClosetAI Stylist Chat · Connect",
  description:
    "Text directly with @ClosetAI Stylist for fashion advice, share clothes and outfits from your closet, and get instant outfit combinations.",
};

export default async function ConnectStylistChatPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const [profile, shareable] = await Promise.all([
    getProfile(),
    listShareableWardrobeAndOutfits(supabase, user.id),
  ]);

  const reqHeaders = await headers();
  const edgeLat = Number(reqHeaders.get("x-vercel-ip-latitude"));
  const edgeLon = Number(reqHeaders.get("x-vercel-ip-longitude"));
  const edgeCity =
    reqHeaders.get("x-vercel-ip-city") || reqHeaders.get("cf-ipcity");

  let weather = null;
  if (
    Number.isFinite(edgeLat) &&
    Number.isFinite(edgeLon) &&
    (edgeLat !== 0 || edgeLon !== 0)
  ) {
    weather = await getLiveWeatherByCoords(
      edgeLat,
      edgeLon,
      edgeCity ? decodeURIComponent(edgeCity) : null,
    ).catch(() => null);
  } else if (edgeCity) {
    weather = await getLiveWeather(decodeURIComponent(edgeCity)).catch(() => null);
  } else if (profile?.location) {
    weather = await getLiveWeather(profile.location).catch(() => null);
  }

  const [cleanCountRes, initialMessages] = await Promise.all([
    supabase
      .from("wardrobe_items")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .in("status", profile?.rewear_worn_items ? ["CLEAN", "WORN"] : ["CLEAN"]),
    listStylistChatMessages(supabase, user.id, shareable, 50),
  ]);

  const timeZone = profile?.timezone?.trim() || "UTC";

  return (
    <StylistChatThread
      currentUserId={user.id}
      initialMessages={initialMessages}
      shareableItems={shareable.items}
      shareableOutfits={shareable.outfits}
      weatherSummary={weather?.summary ?? null}
      cleanCount={cleanCountRes.count ?? shareable.items.length}
      referenceNowMs={Date.now()}
      timeZone={timeZone}
    />
  );
}

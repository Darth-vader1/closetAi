import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { ContextualGuide } from "@/components/onboarding/contextual-guide";
import { CalendarClient } from "@/components/calendar/calendar-client";
import { requireUser } from "@/lib/auth/session";
import { listOutfitPlans, listUserOutfits, signAllOutfitImages } from "@/lib/outfits/queries";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Outfit Calendar · ClosetAI",
  description: "Plan what to wear for the week ahead and track your confirmed outfits.",
};

export default async function CalendarPage() {
  const user = await requireUser();
  const supabase = await createClient();

  // Fetch plans and saved outfits in parallel
  const [plans, savedOutfits] = await Promise.all([
    listOutfitPlans(supabase, user.id).catch(() => []),
    listUserOutfits(supabase, user.id).catch(() => []),
  ]);

  // Batch sign images across all outfits in plans and library
  const allOutfits = [...plans.map((p) => p.outfit), ...savedOutfits];
  const urlMap = await signAllOutfitImages(supabase, allOutfits);
  const imageUrlsObj: Record<string, string> = {};
  for (const [path, url] of urlMap.entries()) {
    imageUrlsObj[path] = url;
  }

  return (
    <>
      <PageHeader
        title="Outfit Calendar"
        description="Plan outfits for the week ahead, see what you wore previously, and confirm your daily look."
      />
      <ContextualGuide section="calendar" />
      <CalendarClient
        initialPlans={plans}
        savedOutfits={savedOutfits}
        imageUrls={imageUrlsObj}
      />
    </>
  );
}

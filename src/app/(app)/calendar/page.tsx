import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { ContextualGuide } from "@/components/onboarding/contextual-guide";
import { CalendarClient } from "@/components/calendar/calendar-client";
import { requireUser } from "@/lib/auth/session";
import { listOutfitPlans, listUserOutfits } from "@/lib/outfits/queries";
import { listAllWardrobeItems, signImageUrls } from "@/lib/wardrobe/queries";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Outfit Calendar · ClosetAI",
  description: "Plan what to wear for the week ahead and log Morning, Afternoon, and Evening outfits.",
};

export default async function CalendarPage({
  searchParams,
}: {
  searchParams?: Promise<{ date?: string }>;
}) {
  const user = await requireUser();
  const supabase = await createClient();
  const resolvedParams = searchParams ? await searchParams : undefined;
  const initialDate = resolvedParams?.date;

  // Fetch plans, saved outfits, and wardrobe items in parallel
  const [plans, savedOutfits, wardrobeItems] = await Promise.all([
    listOutfitPlans(supabase, user.id).catch(() => []),
    listUserOutfits(supabase, user.id).catch(() => []),
    listAllWardrobeItems(supabase, user.id, 200).catch(() => []),
  ]);

  // Batch sign images across all outfits in plans and library first, then wardrobe items
  const allOutfits = [...plans.map((p) => p.outfit), ...savedOutfits];
  const allPaths: string[] = [];
  for (const outfit of allOutfits) {
    if (outfit.photoPath) allPaths.push(outfit.photoPath);
    for (const item of outfit.items) {
      if (item.imagePath) allPaths.push(item.imagePath);
    }
  }
  for (const item of wardrobeItems) {
    if (item.imagePath) allPaths.push(item.imagePath);
  }
  // Use "original" so Supabase signs all paths in a single batch HTTP call (~150ms)
  // rather than N individual /render/image/sign/ round-trips.
  const urlMap = await signImageUrls(supabase, allPaths, "original");
  const imageUrlsObj: Record<string, string> = {};
  for (const [path, url] of urlMap.entries()) {
    imageUrlsObj[path] = url;
  }

  return (
    <>
      <PageHeader
        title="Outfit Calendar"
        description="Plan outfits or log what you wore across Morning, Afternoon, and Evening slots."
      />
      <ContextualGuide section="calendar" />
      <CalendarClient
        initialPlans={plans}
        savedOutfits={savedOutfits}
        wardrobeItems={wardrobeItems}
        imageUrls={imageUrlsObj}
        initialDate={initialDate}
      />
    </>
  );
}

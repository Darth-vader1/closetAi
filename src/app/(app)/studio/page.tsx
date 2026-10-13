import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { ContextualGuide } from "@/components/onboarding/contextual-guide";
import { OutfitStudio } from "@/components/studio/outfit-studio";
import { getProfile, requireUser } from "@/lib/auth/session";
import { generateOutfits } from "@/lib/outfits/engine";
import { listUserOutfits, signAllOutfitImages } from "@/lib/outfits/queries";
import { createClient } from "@/lib/supabase/server";
import { listWardrobeItems, signImageUrls } from "@/lib/wardrobe/queries";

export const metadata: Metadata = { title: "Outfit Studio" };

export default async function StudioPage() {
  const user = await requireUser();
  const profile = await getProfile();
  const supabase = await createClient();

  // 1. Fetch user outfits and wardrobe items in parallel
  const [outfits, { items: wardrobeItems }] = await Promise.all([
    listUserOutfits(supabase, user.id).catch(() => []),
    listWardrobeItems(supabase, user.id, {
      q: "",
      category: null,
      colour: null,
      status: null,
      favouritesOnly: false,
      sort: "newest",
      page: 1,
    }),
  ]);

  // 2. Batch-sign image URLs for wardrobe garments and full-body outfit photos
  const itemPaths = wardrobeItems.map((i) => i.imagePath);
  const [itemUrlsMap, outfitUrlsMap] = await Promise.all([
    signImageUrls(supabase, itemPaths),
    signAllOutfitImages(supabase, outfits),
  ]);

  const itemImageUrls: Record<string, string> = {};
  for (const [path, url] of itemUrlsMap.entries()) {
    itemImageUrls[path] = url;
  }

  const photoUrls: Record<string, string> = {};
  for (const [path, url] of outfitUrlsMap.entries()) {
    photoUrls[path] = url;
  }

  // 3. Generate initial outfit suggestions using the deterministic rule engine
  const initialSuggestions = generateOutfits(wardrobeItems, {
    allowRewearWorn: profile?.rewear_worn_items ?? false,
    limit: 6,
  });

  return (
    <>
      <PageHeader
        title="Outfit Studio"
        description="Pair tops, bottoms, and shoes into complete looks, or let the engine suggest combinations from clean clothes."
      />
      <ContextualGuide section="studio" />
      <OutfitStudio
        initialOutfits={outfits}
        wardrobeItems={wardrobeItems}
        itemImageUrls={itemImageUrls}
        photoUrls={photoUrls}
        initialSuggestions={initialSuggestions}
      />
    </>
  );
}

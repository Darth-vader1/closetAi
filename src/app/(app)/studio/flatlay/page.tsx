import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { FlatlayStudioEditor } from "@/components/studio/flatlay/flatlay-studio-editor";
import { requireUser } from "@/lib/auth/session";
import { listFlatlayCompositions } from "@/lib/flatlay/queries";
import { listUserOutfits } from "@/lib/outfits/queries";
import { createClient } from "@/lib/supabase/server";
import { listWardrobeItems, signImageUrls } from "@/lib/wardrobe/queries";

export const metadata: Metadata = {
  title: "Flatlay Studio · ClosetAI",
  description: "Compose aesthetic fashion collage boards and editorial flatlays from your actual wardrobe.",
};

export default async function FlatlayStudioPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const [savedOutfits, { items: wardrobeItems }, compositions] = await Promise.all([
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
    listFlatlayCompositions(supabase, user.id),
  ]);

  const itemPaths = wardrobeItems.flatMap((i) =>
    [i.imagePath, i.beautifiedImagePath].filter(Boolean) as string[]
  );
  const signedMap = await signImageUrls(supabase, itemPaths);

  const itemImageUrls: Record<string, string> = {};
  for (const [path, url] of signedMap.entries()) {
    itemImageUrls[path] = url;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Button asChild variant="outline" size="sm" className="gap-1.5 text-xs">
          <Link href="/studio">
            <ArrowLeft className="size-3.5" />
            <span>Back to Studio</span>
          </Link>
        </Button>
      </div>

      <PageHeader
        title="Flatlay Studio"
        description="Compose magazine-worthy fashion collages from your actual wardrobe. Drag, rotate, resize, adjust layers, and export high-res PNG lookbooks."
      />

      <FlatlayStudioEditor
        initialComposition={compositions[0] ?? null}
        wardrobeItems={wardrobeItems}
        itemImageUrls={itemImageUrls}
        savedOutfits={savedOutfits}
      />
    </div>
  );
}

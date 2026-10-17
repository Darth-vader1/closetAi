import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Card } from "@/components/ui/card";
import { DeleteItemButton, EditItemForm } from "@/components/wardrobe/edit-item-form";
import { ItemBeautifyCard } from "@/components/wardrobe/beautify-image-modal";
import { StatusActions } from "@/components/wardrobe/status-actions";
import { StatusBadge } from "@/components/wardrobe/status-badge";
import { getProfile, requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { formatDate } from "@/lib/utils/format";
import type { ItemFieldsInput } from "@/lib/validation/wardrobe";
import { uuidSchema } from "@/lib/validation/wardrobe";
import { categoryLabel } from "@/lib/wardrobe/categories";
import { getWardrobeItem, signImageUrls } from "@/lib/wardrobe/queries";
import { STATUS_DESCRIPTIONS } from "@/lib/wardrobe/status";

export const metadata: Metadata = { title: "Garment" };

export default async function ItemPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();

  const supabase = await createClient();
  const [item, profile] = await Promise.all([getWardrobeItem(supabase, user.id, id), getProfile()]);
  // Someone else's id and a missing id look identical: both are simply "not found".
  if (!item) notFound();

  const originalImagePath = item.originalImagePath ?? item.imagePath;
  const beautifiedImagePath = item.beautifiedImagePath ?? null;
  const pathsToSign = [
    item.imagePath,
    originalImagePath,
    ...(beautifiedImagePath ? [beautifiedImagePath] : []),
  ];
  const urls = await signImageUrls(supabase, pathsToSign, "medium");
  const tz = profile?.timezone ?? "UTC";

  const initial: ItemFieldsInput = {
    name: item.name,
    category: item.category,
    subcategory: item.subcategory ?? "",
    careType: item.careType,
    primaryColour: item.primaryColour as ItemFieldsInput["primaryColour"],
    secondaryColours: item.secondaryColours as ItemFieldsInput["secondaryColours"],
    pattern: item.pattern as ItemFieldsInput["pattern"],
    material: item.material ?? "",
    style: item.style as ItemFieldsInput["style"],
    occasions: item.occasions,
    seasons: item.seasons as ItemFieldsInput["seasons"],
    warmthLevel: item.warmthLevel,
    isFavourite: item.isFavourite,
  };

  return (
    <>
      <Link href="/wardrobe" className="mb-4 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-muted hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Back to wardrobe
      </Link>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,26rem)_1fr]">
        <div className="space-y-4 lg:sticky lg:top-8 lg:self-start">
          <ItemBeautifyCard
            id={item.id}
            name={item.name}
            category={item.category}
            isFavourite={item.isFavourite}
            activeImagePath={item.imagePath}
            originalImagePath={originalImagePath}
            beautifiedImagePath={beautifiedImagePath}
            beautificationMode={item.beautificationMode ?? null}
            activeImageUrl={urls.get(item.imagePath)}
            originalImageUrl={urls.get(originalImagePath)}
            beautifiedImageUrl={
              beautifiedImagePath
                ? urls.get(beautifiedImagePath)
                : undefined
            }
          />
        </div>

        <div className="space-y-6">
          <div>
            <h1 className="text-3xl sm:text-4xl">{item.name}</h1>
            <p className="mt-1 text-muted">{categoryLabel(item.category)}</p>
          </div>

          <Card>
            <h2 className="text-xl">Laundry status</h2>
            <div className="mt-3 flex items-center gap-3">
              <StatusBadge status={item.status} />
              <p className="text-sm text-muted">{STATUS_DESCRIPTIONS[item.status]}</p>
            </div>
            <div className="mt-4">
              <StatusActions id={item.id} status={item.status} showAnyStatus />
            </div>
            <dl className="mt-6 grid gap-4 border-t border-border pt-4 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-muted">Added</dt>
                <dd className="font-medium">{formatDate(item.createdAt, tz)}</dd>
              </div>
              <div>
                <dt className="text-muted">Last worn</dt>
                <dd className="font-medium">{formatDate(item.lastWornAt, tz, "Not recorded yet")}</dd>
              </div>
              <div>
                <dt className="text-muted">Last washed</dt>
                <dd className="font-medium">{formatDate(item.lastWashedAt, tz, "Not recorded yet")}</dd>
              </div>
            </dl>
          </Card>

          <Card>
            <h2 className="mb-5 text-xl">Details</h2>
            <EditItemForm id={item.id} initial={initial} />
          </Card>

          <Card>
            <h2 className="mb-3 text-xl">Remove from wardrobe</h2>
            <DeleteItemButton id={item.id} name={item.name} />
          </Card>
        </div>
      </div>
    </>
  );
}

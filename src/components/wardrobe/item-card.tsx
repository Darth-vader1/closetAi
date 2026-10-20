import Link from "next/link";
import { CareTypeBadge } from "@/components/wardrobe/care-type-badge";
import { FavouriteButton } from "@/components/wardrobe/favourite-button";
import { ItemImage } from "@/components/wardrobe/item-image";
import { StatusBadge } from "@/components/wardrobe/status-badge";
import type { WardrobeItem } from "@/lib/wardrobe/queries";
import { categoryLabel, humanise } from "@/lib/wardrobe/categories";

export function ItemCard({ item, imageUrl }: { item: WardrobeItem; imageUrl: string | undefined }) {
  return (
    <article className="group relative overflow-hidden rounded-[1.25rem] border border-border bg-surface">
      <Link href={`/wardrobe/${item.id}`} className="block focus-visible:outline-offset-[-2px]">
        <ItemImage
          url={imageUrl}
          alt={item.name}
          className="aspect-[4/5] w-full transition-transform duration-300 group-hover:scale-[1.02] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 240px"
        />
        <div className="space-y-1.5 p-4">
          <div className="flex items-center justify-between gap-1.5">
            <h3 className="truncate font-sans text-base font-medium">{item.name}</h3>
            {item.brand && (
              <span className="shrink-0 rounded-md bg-surface-muted px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-muted border border-border/50">
                {item.brand}
              </span>
            )}
          </div>
          <p className="truncate text-sm text-muted">
            {categoryLabel(item.category)}
            {item.primaryColour ? ` · ${humanise(item.primaryColour)}` : ""}
          </p>
          <div className="flex items-center gap-2 flex-wrap">
            <StatusBadge status={item.status} />
            <CareTypeBadge careType={item.careType} />
          </div>
        </div>
      </Link>
      <FavouriteButton id={item.id} name={item.name} isFavourite={item.isFavourite} className="absolute right-2 top-2" />
    </article>
  );
}

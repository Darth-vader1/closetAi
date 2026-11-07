"use client";

import * as React from "react";
import Image from "next/image";
import {
  BookmarkCheck,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Heart,
  Loader2,
  Plus,
  Shirt,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ItemImage } from "@/components/wardrobe/item-image";
import type {
  SwipeableGarmentItem,
  SwipeableOutfitCardData,
} from "@/lib/outfits/swipe-deck-logic";
import { cn } from "@/lib/utils/cn";
import { humanise } from "@/lib/wardrobe/categories";

export interface OutfitBrowsingCardProps {
  outfit: SwipeableOutfitCardData;
  isExpanded: boolean;
  onToggleExpand: () => void;
  reducedMotion?: boolean;
  compact?: boolean;
  /** Optional custom visual stage (e.g. 3D Stage or Editorial Flatlay in AI Stylist). */
  customPreview?: React.ReactNode;
  /** Optional save callback when the section supports saving an outfit. */
  onSave?: () => void;
  saveLabel?: string;
  savedLabel?: string;
  /** Optional favourite toggle callback when the section supports favouriting. */
  onToggleFavourite?: () => void;
  /** Optional actions rendered in the primary bar alongside Show More Details. */
  primaryActionsSlot?: React.ReactNode;
  /** Optional actions rendered inside the expanded details panel. */
  expandedActionsSlot?: React.ReactNode;
  className?: string;
}

/**
 * Editorial garment composition built strictly from the outfit's real garment photos.
 * Does not expose individual garment names or full metadata breakdown on the card front.
 */
function OutfitCollagePreview({
  items,
  outfitTitle,
  compact = false,
}: {
  items: SwipeableGarmentItem[];
  outfitTitle: string;
  compact?: boolean;
}) {
  if (items.length === 0) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center rounded-2xl border border-dashed border-border bg-surface-muted/70 text-muted",
          compact ? "aspect-[16/10] p-4" : "aspect-[4/3] sm:aspect-[16/10] p-6",
        )}
        role="img"
        aria-label={`${outfitTitle} preview unavailable`}
      >
        <Shirt className="size-8 text-muted/70" aria-hidden />
        <span className="mt-2 text-xs font-medium">Outfit preview</span>
      </div>
    );
  }

  const visibleItems = items.slice(0, 4);
  const extraCount = Math.max(0, items.length - 4);
  const heightClass = compact
    ? "aspect-[16/10] max-h-56"
    : "aspect-[4/3] sm:aspect-[16/10] max-h-[380px]";

  if (visibleItems.length === 1) {
    const first = visibleItems[0];
    return (
      <div
        className={cn(
          "relative w-full overflow-hidden rounded-2xl border border-border bg-surface-muted/60 p-3",
          heightClass,
        )}
      >
        <ItemImage
          url={first.imageUrl ?? undefined}
          alt={first.name}
          sizes="(max-width: 640px) 90vw, 520px"
          priority
          className="size-full rounded-xl [&_img]:object-contain"
        />
      </div>
    );
  }

  if (visibleItems.length === 2) {
    return (
      <div
        className={cn(
          "relative grid w-full grid-cols-2 gap-2.5 overflow-hidden rounded-2xl border border-border bg-surface-muted/50 p-2.5",
          heightClass,
        )}
      >
        {visibleItems.map((item, idx) => (
          <div
            key={item.id}
            className="relative h-full w-full overflow-hidden rounded-xl border border-border/60 bg-surface"
          >
            <ItemImage
              url={item.imageUrl ?? undefined}
              alt={item.name}
              sizes="(max-width: 640px) 45vw, 260px"
              priority={idx === 0}
              className="size-full [&_img]:object-contain p-1"
            />
          </div>
        ))}
      </div>
    );
  }

  if (visibleItems.length === 3) {
    const [lead, second, third] = visibleItems;
    return (
      <div
        className={cn(
          "relative grid w-full grid-cols-12 grid-rows-2 gap-2.5 overflow-hidden rounded-2xl border border-border bg-surface-muted/50 p-2.5",
          heightClass,
        )}
      >
        <div className="relative col-span-7 row-span-2 overflow-hidden rounded-xl border border-border/60 bg-surface">
          <ItemImage
            url={lead.imageUrl ?? undefined}
            alt={lead.name}
            sizes="(max-width: 640px) 55vw, 320px"
            priority
            className="size-full [&_img]:object-contain p-1.5"
          />
        </div>
        <div className="relative col-span-5 row-span-1 overflow-hidden rounded-xl border border-border/60 bg-surface">
          <ItemImage
            url={second.imageUrl ?? undefined}
            alt={second.name}
            sizes="(max-width: 640px) 38vw, 220px"
            className="size-full [&_img]:object-contain p-1"
          />
        </div>
        <div className="relative col-span-5 row-span-1 overflow-hidden rounded-xl border border-border/60 bg-surface">
          <ItemImage
            url={third.imageUrl ?? undefined}
            alt={third.name}
            sizes="(max-width: 640px) 38vw, 220px"
            className="size-full [&_img]:object-contain p-1"
          />
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative grid w-full grid-cols-2 grid-rows-2 gap-2.5 overflow-hidden rounded-2xl border border-border bg-surface-muted/50 p-2.5",
        heightClass,
      )}
    >
      {visibleItems.map((item, idx) => (
        <div
          key={item.id}
          className="relative overflow-hidden rounded-xl border border-border/60 bg-surface"
        >
          <ItemImage
            url={item.imageUrl ?? undefined}
            alt={item.name}
            sizes="(max-width: 640px) 45vw, 260px"
            priority={idx === 0}
            className="size-full [&_img]:object-contain p-1"
          />
        </div>
      ))}
      {extraCount > 0 && (
        <span className="pointer-events-none absolute bottom-4 right-4 rounded-full border border-border bg-surface/95 px-2.5 py-1 text-[11px] font-semibold text-foreground shadow-xs backdrop-blur-xs">
          +{extraCount} more
        </span>
      )}
    </div>
  );
}

export function OutfitBrowsingCard({
  outfit,
  isExpanded,
  onToggleExpand,
  reducedMotion = false,
  compact = false,
  customPreview,
  onSave,
  saveLabel = "Save Outfit",
  savedLabel = "Saved",
  onToggleFavourite,
  primaryActionsSlot,
  expandedActionsSlot,
  className,
}: OutfitBrowsingCardProps) {
  const reactId = React.useId();
  const detailsPanelId = `outfit-details-${reactId}`;

  const fallbackSummary =
    outfit.items.length > 0
      ? `${outfit.items.length} coordinated ${outfit.items.length === 1 ? "piece" : "pieces"} from your wardrobe.`
      : null;
  const shortSummary = outfit.shortDescription || fallbackSummary;

  const hasMetadataChips =
    Boolean(outfit.occasion) || Boolean(outfit.styleTags && outfit.styleTags.length > 0);

  return (
    <Card
      className={cn(
        "overflow-hidden border-border bg-surface shadow-sm",
        compact ? "p-4 sm:p-5" : "p-5 sm:p-6 md:p-7",
        className,
      )}
    >
      {/* 1. Card Header: Badges, Title, Short Description & Optional Favourite */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1.5">
          {(outfit.aestheticBadge || outfit.occasion) && (
            <div className="flex flex-wrap items-center gap-1.5">
              {outfit.aestheticBadge && (
                <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-0.5 text-[11px] font-semibold text-accent">
                  <Sparkles className="size-3 shrink-0" aria-hidden />
                  <span>{outfit.aestheticBadge}</span>
                </span>
              )}
              {outfit.occasion && (
                <span className="inline-flex items-center rounded-full border border-border bg-surface-muted/70 px-2.5 py-0.5 text-[11px] font-medium capitalize text-muted">
                  {outfit.occasion}
                </span>
              )}
            </div>
          )}

          <h3
            className={cn(
              "font-serif font-medium tracking-tight text-foreground break-words",
              compact ? "text-lg sm:text-xl" : "text-xl sm:text-2xl",
            )}
          >
            {outfit.title}
          </h3>

          {shortSummary && (
            <p
              className={cn(
                "text-muted leading-relaxed",
                compact ? "text-xs line-clamp-2" : "text-xs sm:text-sm line-clamp-2",
              )}
            >
              {shortSummary}
            </p>
          )}
        </div>

        {onToggleFavourite && (
          <button
            type="button"
            onClick={onToggleFavourite}
            aria-pressed={Boolean(outfit.isFavourite)}
            aria-label={
              outfit.isFavourite
                ? `Remove ${outfit.title} from favourites`
                : `Favourite ${outfit.title}`
            }
            className={cn(
              "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3 py-2 text-xs font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring",
              outfit.isFavourite
                ? "border-danger/35 bg-danger-soft text-danger"
                : "border-border bg-surface text-muted hover:bg-surface-muted hover:text-foreground",
            )}
          >
            <Heart
              className="size-4 shrink-0"
              fill={outfit.isFavourite ? "currentColor" : "none"}
              aria-hidden
            />
            <span className="sr-only sm:not-sr-only">
              {outfit.isFavourite ? "Favourited" : "Favourite"}
            </span>
          </button>
        )}
      </div>

      {/* 2. Outfit Visual Preview (Custom Stage, OOTD Photo, or Garment Collage) */}
      <div className="mt-4">
        {customPreview ? (
          customPreview
        ) : outfit.photoUrl ? (
          <div
            className={cn(
              "relative w-full overflow-hidden rounded-2xl border border-border bg-surface-muted",
              compact ? "aspect-[4/5] max-h-64" : "aspect-[3/4] sm:aspect-[4/3] max-h-[420px]",
            )}
          >
            <Image
              src={outfit.photoUrl}
              alt={outfit.title}
              fill
              sizes="(max-width: 640px) 92vw, 560px"
              className="object-cover"
              priority
            />
          </div>
        ) : (
          <OutfitCollagePreview
            items={outfit.items}
            outfitTitle={outfit.title}
            compact={compact}
          />
        )}
      </div>

      {/* 3. Default Primary Controls: Show More Details + Optional Save Action */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2.5">
        <button
          type="button"
          onClick={onToggleExpand}
          aria-expanded={isExpanded}
          aria-controls={detailsPanelId}
          className={cn(
            "inline-flex min-h-11 flex-1 items-center justify-between gap-2 rounded-xl border px-4 py-2.5 text-left text-xs sm:text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-ring",
            isExpanded
              ? "border-accent/40 bg-accent-soft/45 text-foreground"
              : "border-border-strong bg-surface-muted/55 text-foreground hover:bg-surface-muted",
          )}
        >
          <span className="flex items-center gap-2">
            <span>{isExpanded ? "Hide Details" : "Show More Details"}</span>
            {outfit.items.length > 0 && (
              <span className="rounded-full bg-surface px-2 py-0.5 text-[11px] font-semibold text-muted border border-border">
                {outfit.items.length} {outfit.items.length === 1 ? "piece" : "pieces"}
              </span>
            )}
          </span>
          <ChevronDown
            className={cn(
              "size-4 shrink-0 text-muted",
              !reducedMotion && "transition-transform duration-300",
              isExpanded && "rotate-180 text-accent",
            )}
            aria-hidden
          />
        </button>

        {onSave && (
          <Button
            type="button"
            size={compact ? "sm" : "default"}
            variant={outfit.isSaved ? "outline" : "primary"}
            disabled={Boolean(outfit.isSaved) || Boolean(outfit.isSaving)}
            onClick={onSave}
            className={cn(
              "rounded-xl shrink-0",
              compact && "min-h-11 px-3.5 text-xs",
              outfit.isSaved && "border-success/35 bg-success-soft text-success",
            )}
          >
            {outfit.isSaving ? (
              <>
                <Loader2 className="size-4 animate-spin" aria-hidden />
                <span>Saving…</span>
              </>
            ) : outfit.isSaved ? (
              <>
                <BookmarkCheck className="size-4" aria-hidden />
                <span>{savedLabel}</span>
              </>
            ) : (
              <>
                <Plus className="size-4" aria-hidden />
                <span>{saveLabel}</span>
              </>
            )}
          </Button>
        )}

        {primaryActionsSlot}
      </div>

      {/* 4. Smoothly Expandable Details Panel */}
      <div
        id={detailsPanelId}
        role="region"
        aria-label={`Details for ${outfit.title}`}
        aria-hidden={!isExpanded}
        inert={!isExpanded || undefined}
        data-details-expanded={isExpanded ? "true" : "false"}
        className={cn(
          "grid overflow-hidden",
          !reducedMotion &&
            "transition-[grid-template-rows,opacity,margin] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]",
          isExpanded
            ? "mt-5 grid-rows-[1fr] opacity-100"
            : "mt-0 grid-rows-[0fr] opacity-0 pointer-events-none",
        )}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="space-y-5 border-t border-border pt-5">
            {/* Occasion & Aesthetic Metadata */}
            {hasMetadataChips && (
              <div className="flex flex-wrap items-center gap-2">
                {outfit.occasion && (
                  <span className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface-muted/70 px-2.5 py-1 text-xs font-medium capitalize text-foreground">
                    <span className="text-muted">Occasion:</span> {outfit.occasion}
                  </span>
                )}
                {outfit.styleTags?.map((tag) => (
                  <span
                    key={tag}
                    className="inline-flex items-center rounded-lg bg-accent-soft/60 px-2.5 py-1 text-xs font-medium capitalize text-accent"
                  >
                    {humanise(tag)}
                  </span>
                ))}
              </div>
            )}

            {/* Individual Garments Breakdown */}
            {outfit.items.length > 0 ? (
              <div className="space-y-2.5">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted">
                  Garments in This Look ({outfit.items.length})
                </h4>
                <ul className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border bg-background/60">
                  {outfit.items.map((item) => {
                    const subMeta = [
                      humanise(item.category),
                      item.material,
                      item.style ? humanise(item.style) : null,
                    ].filter(Boolean);
                    const colours = [
                      item.primaryColour,
                      ...(item.secondaryColours ?? []),
                    ].filter((c): c is string => Boolean(c));

                    return (
                      <li
                        key={item.id}
                        className="flex flex-wrap items-center justify-between gap-3 p-3 text-xs"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="relative size-11 shrink-0 overflow-hidden rounded-lg border border-border bg-surface-muted">
                            <ItemImage
                              url={item.imageUrl ?? undefined}
                              alt={item.name}
                              sizes="44px"
                              className="size-full object-cover"
                            />
                          </div>
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-foreground">
                              {item.name}
                            </p>
                            {subMeta.length > 0 && (
                              <p className="truncate text-[11px] capitalize text-muted">
                                {subMeta.join(" · ")}
                              </p>
                            )}
                          </div>
                        </div>

                        {colours.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1">
                            {colours.slice(0, 3).map((colour) => (
                              <span
                                key={colour}
                                className="rounded-md border border-border/80 bg-surface px-2 py-0.5 text-[11px] font-medium capitalize text-muted"
                              >
                                {humanise(colour)}
                              </span>
                            ))}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : (
              <p className="rounded-xl border border-border bg-surface-muted/40 p-3 text-xs text-muted">
                No individual garment breakdown is attached to this outfit.
              </p>
            )}

            {/* Styling Explanation */}
            {outfit.explanation && (
              <div className="space-y-1.5 rounded-xl border border-border bg-surface-muted/45 p-4">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                  <Sparkles className="size-3.5 text-accent" aria-hidden />
                  <span>Why This Works</span>
                </div>
                <p className="text-xs leading-relaxed text-muted">
                  {outfit.explanation}
                </p>
              </div>
            )}

            {/* Styling Pro Tip */}
            {outfit.stylingTip && (
              <div className="space-y-1 rounded-xl border border-warning/35 bg-warning-soft/80 p-4">
                <p className="text-xs font-bold text-warning">Stylist Tip</p>
                <p className="text-xs font-medium leading-relaxed text-foreground">
                  {outfit.stylingTip}
                </p>
              </div>
            )}

            {/* Optional Missing Pieces / Accessory Suggestions */}
            {outfit.missingPieces && outfit.missingPieces.length > 0 && (
              <div className="space-y-2.5 rounded-xl border border-border-strong bg-surface-muted/60 p-4">
                <div className="flex items-center justify-between gap-2 text-xs font-semibold text-foreground">
                  <span>Complete the Look</span>
                  <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-semibold text-accent">
                    Optional Additions
                  </span>
                </div>
                <div className="space-y-2">
                  {outfit.missingPieces.map((mp, idx) => (
                    <div
                      key={`${mp.name}-${idx}`}
                      className="rounded-lg border border-border bg-surface p-3 text-xs space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2 font-semibold text-foreground">
                        <span>{mp.name}</span>
                        <span className="rounded bg-surface-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wider text-muted">
                          {humanise(mp.category)}
                        </span>
                      </div>
                      {(mp.reason || mp.inspirationUrl) && (
                        <div className="flex items-center justify-between gap-2">
                          {mp.reason ? (
                            <p className="text-[11px] leading-normal text-muted">
                              {mp.reason}
                            </p>
                          ) : (
                            <span />
                          )}
                          {mp.inspirationUrl && (
                            <a
                              href={mp.inspirationUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-accent hover:underline"
                            >
                              <span>Inspo</span>
                              <ExternalLink className="size-3 opacity-70" aria-hidden />
                            </a>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Existing Section-Specific Actions */}
            {expandedActionsSlot && (
              <div className="pt-1">{expandedActionsSlot}</div>
            )}

            {/* Easy Mobile Collapse Control */}
            <div className="flex justify-center border-t border-border/60 pt-3">
              <button
                type="button"
                onClick={onToggleExpand}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-full px-4 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-surface-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
              >
                <ChevronUp className="size-3.5" aria-hidden />
                <span>Collapse details</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

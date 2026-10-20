"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Search, Sparkles, X, Shirt, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ItemImage } from "@/components/wardrobe/item-image";
import { categoryGroup, categoryLabel } from "@/lib/wardrobe/categories";
import type { OutfitWithItems } from "@/lib/outfits/queries";
import type { WardrobeItem } from "@/lib/wardrobe/queries";

const INITIAL_PAGE_SIZE = 16;
const BATCH_SIZE = 12;

interface FlatlayItemDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  wardrobeItems: WardrobeItem[];
  itemImageUrls: Record<string, string>;
  selectedItemIds: string[];
  onToggleItem: (item: WardrobeItem) => void;
  savedOutfits: OutfitWithItems[];
  onImportOutfit: (outfit: OutfitWithItems) => void;
}

export function FlatlayItemDrawer({
  isOpen,
  onClose,
  wardrobeItems,
  itemImageUrls,
  selectedItemIds,
  onToggleItem,
  savedOutfits,
  onImportOutfit,
}: FlatlayItemDrawerProps) {
  const [tab, setTab] = useState<"wardrobe" | "outfits">("wardrobe");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [visibleCount, setVisibleCount] = useState<number>(INITIAL_PAGE_SIZE);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Filter wardrobe items by category group and search text
  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return wardrobeItems.filter((item) => {
      if (categoryFilter !== "all" && categoryGroup(item.category) !== categoryFilter) {
        return false;
      }
      if (!q) return true;
      return (
        item.name.toLowerCase().includes(q) ||
        item.category.toLowerCase().includes(q) ||
        (item.subcategory && item.subcategory.toLowerCase().includes(q)) ||
        (item.primaryColour && item.primaryColour.toLowerCase().includes(q)) ||
        (item.material && item.material.toLowerCase().includes(q)) ||
        (item.style && item.style.toLowerCase().includes(q))
      );
    });
  }, [wardrobeItems, categoryFilter, searchQuery]);

  // Storing previous filter key to reset pagination during render instead of in an effect
  const [prevFilterKey, setPrevFilterKey] = useState("wardrobe:all:");
  const currentFilterKey = `${tab}:${categoryFilter}:${searchQuery}`;

  if (currentFilterKey !== prevFilterKey) {
    setPrevFilterKey(currentFilterKey);
    setVisibleCount(INITIAL_PAGE_SIZE);
  }

  // Reset scroll position whenever filters or tabs change
  useEffect(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = 0;
    }
  }, [categoryFilter, searchQuery, tab]);

  // Infinite scroll trigger: IntersectionObserver sentinel
  useEffect(() => {
    const container = scrollContainerRef.current;
    const sentinel = sentinelRef.current;
    if (!container || !sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setVisibleCount((prev) => Math.min(prev + BATCH_SIZE, filteredItems.length));
        }
      },
      { root: container, rootMargin: "250px" },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [filteredItems.length]);

  // Fallback scroll listener for infinite scrolling
  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - scrollTop - clientHeight < 250) {
      if (visibleCount < filteredItems.length) {
        setVisibleCount((prev) => Math.min(prev + BATCH_SIZE, filteredItems.length));
      }
    }
  };

  if (!isOpen) return null;

  const visibleItems = filteredItems.slice(0, visibleCount);
  const hasMore = visibleCount < filteredItems.length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in"
      role="dialog"
      aria-modal="true"
    >
      <div className="relative flex h-[88vh] max-h-[820px] w-full max-w-4xl flex-col rounded-3xl border border-border bg-surface p-6 shadow-2xl space-y-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border pb-3 shrink-0">
          <div>
            <h2 className="text-xl font-medium tracking-tight text-foreground">Add Garments to Canvas</h2>
            <p className="text-xs text-muted">
              Choose pieces from your wardrobe or load a styled outfit directly onto the board.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid size-9 place-items-center rounded-full hover:bg-surface-muted text-muted hover:text-foreground transition"
            aria-label="Close dialog"
          >
            <X className="size-5" />
          </button>
        </div>

        {/* Source Tabs & Search Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant={tab === "wardrobe" ? "primary" : "outline"}
              onClick={() => setTab("wardrobe")}
              className="text-xs"
            >
              Wardrobe Items ({wardrobeItems.length})
            </Button>
            {savedOutfits.length > 0 && (
              <Button
                type="button"
                size="sm"
                variant={tab === "outfits" ? "primary" : "outline"}
                onClick={() => setTab("outfits")}
                className="text-xs"
              >
                Saved Outfits ({savedOutfits.length})
              </Button>
            )}
          </div>

          {tab === "wardrobe" && (
            <div className="relative w-full sm:w-64">
              <Search className="absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted pointer-events-none" />
              <input
                type="text"
                placeholder="Search garments..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8.5 w-full rounded-xl border border-border bg-surface-muted/60 pl-8.5 pr-8 text-xs text-foreground placeholder:text-muted focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              )}
            </div>
          )}
        </div>

        {tab === "wardrobe" ? (
          <>
            {/* Category Filter Pills */}
            <div className="flex flex-wrap gap-1.5 text-xs shrink-0">
              {["all", "top", "bottom", "outerwear", "footwear", "accessory", "fullbody"].map(
                (grp) => (
                  <button
                    key={grp}
                    type="button"
                    onClick={() => setCategoryFilter(grp)}
                    className={`rounded-lg px-3 py-1 capitalize font-medium text-xs transition ${
                      categoryFilter === grp
                        ? "bg-foreground text-background shadow-xs"
                        : "bg-surface-muted text-muted hover:text-foreground hover:bg-surface-muted/80"
                    }`}
                  >
                    {grp}
                  </button>
                ),
              )}
            </div>

            {/* Scrollable Garments Container with Infinite Scroll */}
            <div
              ref={scrollContainerRef}
              onScroll={handleScroll}
              className="flex-1 overflow-y-auto pr-1 min-h-0"
            >
              {filteredItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center text-muted">
                  <Shirt className="size-10 mb-2 opacity-40" />
                  <p className="text-sm font-medium">No garments found</p>
                  <p className="text-xs text-muted mt-1">Try selecting another category or clear your search.</p>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3.5 sm:grid-cols-3 md:grid-cols-4 pb-4">
                    {visibleItems.map((item) => {
                      const isSelected = selectedItemIds.includes(item.id);
                      const displayUrl =
                        (item.beautifiedImagePath && itemImageUrls[item.beautifiedImagePath]) ||
                        itemImageUrls[item.imagePath];

                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => onToggleItem(item)}
                          className={`group relative flex flex-col w-full overflow-hidden rounded-2xl border text-left bg-surface transition hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
                            isSelected
                              ? "border-accent ring-2 ring-accent/30 shadow-sm"
                              : "border-border hover:border-foreground/30"
                          }`}
                        >
                          {/* Spacious square photo box */}
                          <div className="relative aspect-square w-full shrink-0 overflow-hidden bg-surface-muted">
                            <ItemImage
                              url={displayUrl}
                              alt={item.name}
                              className="size-full object-cover transition duration-300 group-hover:scale-105"
                              sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 220px"
                            />
                            {isSelected && (
                              <div className="absolute right-2 top-2 grid size-6 place-items-center rounded-full bg-accent text-white shadow-md ring-2 ring-white">
                                <Check className="size-3.5 stroke-[2.5]" />
                              </div>
                            )}
                          </div>

                          {/* Garment Details */}
                          <div className="p-2.5 w-full space-y-0.5">
                            <p className="truncate text-xs font-semibold text-foreground group-hover:text-accent transition-colors">
                              {item.name}
                            </p>
                            <div className="flex items-center gap-1.5 text-[11px] text-muted">
                              <span className="capitalize">{categoryLabel(item.category)}</span>
                              {item.primaryColour && (
                                <>
                                  <span>·</span>
                                  <span className="capitalize">{item.primaryColour}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {/* Infinite scroll sentinel & loading indicator */}
                  <div ref={sentinelRef} className="py-4 flex justify-center">
                    {hasMore ? (
                      <div className="flex items-center gap-2 text-xs text-muted">
                        <Loader2 className="size-4 animate-spin text-accent" />
                        <span>Loading more garments...</span>
                      </div>
                    ) : (
                      <span className="text-[11px] text-muted">
                        Showing all {filteredItems.length} garments
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>
          </>
        ) : (
          /* Saved Outfits Grid */
          <div className="flex-1 overflow-y-auto pr-1 min-h-0">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 pb-4">
              {savedOutfits.map((outfit) => (
                <div
                  key={outfit.id}
                  className="flex flex-col justify-between rounded-2xl border border-border bg-surface-muted/30 p-4 transition hover:border-accent/40"
                >
                  <div>
                    <h4 className="text-sm font-medium text-foreground">{outfit.name}</h4>
                    <p className="text-xs text-muted mb-3">
                      {outfit.items.length} garments in this look
                    </p>
                    <div className="flex -space-x-2.5 overflow-hidden py-1">
                      {outfit.items.slice(0, 5).map((i) => {
                        const displayUrl =
                          (i.beautifiedImagePath && itemImageUrls[i.beautifiedImagePath]) ||
                          itemImageUrls[i.imagePath];

                        return (
                          <div
                            key={i.id}
                            className="relative size-12 shrink-0 rounded-full border-2 border-surface overflow-hidden bg-surface shadow-xs"
                          >
                            <ItemImage
                              url={displayUrl}
                              alt={i.name}
                              className="size-full object-cover"
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      onImportOutfit(outfit);
                      onClose();
                    }}
                    className="mt-4 w-full text-xs gap-1.5"
                  >
                    <Sparkles className="size-3.5 text-accent" />
                    <span>Load Entire Outfit onto Board</span>
                  </Button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-border pt-3 shrink-0">
          <div className="flex items-center gap-2 text-xs text-muted">
            <span className="font-medium text-foreground">{selectedItemIds.length}</span>
            <span>{selectedItemIds.length === 1 ? "garment" : "garments"} on canvas</span>
          </div>
          <Button type="button" variant="primary" size="sm" onClick={onClose} className="px-5">
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}

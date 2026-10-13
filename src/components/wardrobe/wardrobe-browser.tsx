"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Grid2X2, Grid3X3, Layers } from "lucide-react";
import { ItemCard } from "@/components/wardrobe/item-card";
import { categoryLabel } from "@/lib/wardrobe/categories";
import type { WardrobeQuery } from "@/lib/validation/wardrobe";
import type { WardrobeItem } from "@/lib/wardrobe/queries";

export type WardrobeViewMode = "standard" | "compact" | "grouped";

const VIEW_MODE_STORAGE_KEY = "closetai_wardrobe_view_mode";

function categoryFilterHref(query: WardrobeQuery, category: string | null): string {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (category) params.set("category", category);
  if (query.colour) params.set("colour", query.colour);
  if (query.status) params.set("status", query.status);
  if (query.favouritesOnly) params.set("favourites", "1");
  if (query.sort !== "newest") params.set("sort", query.sort);
  const qs = params.toString();
  return qs ? `/wardrobe?${qs}` : "/wardrobe";
}

export function WardrobeBrowser({
  items,
  imageUrls,
  query,
  categoryCounts,
  totalUnfiltered,
}: {
  items: WardrobeItem[];
  imageUrls: Record<string, string>;
  query: WardrobeQuery;
  categoryCounts: Record<string, number>;
  totalUnfiltered: number;
}) {
  const [viewMode, setViewMode] = useState<WardrobeViewMode>("standard");

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        const saved = window.localStorage.getItem(VIEW_MODE_STORAGE_KEY) as WardrobeViewMode | null;
        if (saved === "standard" || saved === "compact" || saved === "grouped") {
          setViewMode(saved);
        }
      } catch {
        // Ignore storage errors
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  function selectViewMode(mode: WardrobeViewMode) {
    setViewMode(mode);
    try {
      window.localStorage.setItem(VIEW_MODE_STORAGE_KEY, mode);
    } catch {
      // Ignore storage errors
    }
  }

  const populatedCategories = Object.entries(categoryCounts).sort(
    (a, b) => b[1] - a[1],
  );

  // Group items by category when in "grouped" mode
  const groupedItems = items.reduce<Record<string, WardrobeItem[]>>((acc, item) => {
    const cat = item.category || "other";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {});

  return (
    <div className="space-y-5">
      {/* Quick Category Pills + View Density Switcher */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* One-tap Category Pills */}
        <div
          role="navigation"
          aria-label="Quick category filter"
          className="flex flex-wrap items-center gap-1.5"
        >
          <Link
            href={categoryFilterHref(query, null)}
            className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
              !query.category
                ? "bg-foreground text-background"
                : "border border-border bg-surface text-muted hover:border-border-strong hover:text-foreground"
            }`}
          >
            <span>All</span>
            <span className="opacity-75">({totalUnfiltered})</span>
          </Link>
          {populatedCategories.map(([cat, count]) => {
            const active = query.category === cat;
            return (
              <Link
                key={cat}
                href={categoryFilterHref(query, active ? null : cat)}
                className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? "bg-accent text-white"
                    : "border border-border bg-surface text-muted hover:border-border-strong hover:text-foreground"
                }`}
              >
                <span>{categoryLabel(cat)}</span>
                <span className="opacity-75">({count})</span>
              </Link>
            );
          })}
        </div>

        {/* View Mode Switcher (Standard 4-col, Compact 6-col, Grouped by Category) */}
        <div
          role="group"
          aria-label="Wardrobe layout density"
          className="inline-flex shrink-0 self-start sm:self-auto items-center rounded-xl border border-border bg-surface p-1"
        >
          <button
            type="button"
            onClick={() => selectViewMode("standard")}
            aria-pressed={viewMode === "standard"}
            title="Standard grid (4 per row)"
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
              viewMode === "standard"
                ? "bg-accent-soft text-accent"
                : "text-muted hover:text-foreground"
            }`}
          >
            <Grid2X2 className="size-3.5" aria-hidden />
            <span>Grid</span>
          </button>
          <button
            type="button"
            onClick={() => selectViewMode("compact")}
            aria-pressed={viewMode === "compact"}
            title="Compact grid for 100+ items (6 per row)"
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
              viewMode === "compact"
                ? "bg-accent-soft text-accent"
                : "text-muted hover:text-foreground"
            }`}
          >
            <Grid3X3 className="size-3.5" aria-hidden />
            <span>Compact</span>
          </button>
          <button
            type="button"
            onClick={() => selectViewMode("grouped")}
            aria-pressed={viewMode === "grouped"}
            title="Group garments by category"
            className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors cursor-pointer ${
              viewMode === "grouped"
                ? "bg-accent-soft text-accent"
                : "text-muted hover:text-foreground"
            }`}
          >
            <Layers className="size-3.5" aria-hidden />
            <span>By Category</span>
          </button>
        </div>
      </div>

      {/* Render items according to selected view mode */}
      {viewMode === "grouped" ? (
        <div className="space-y-8">
          {Object.entries(groupedItems).map(([cat, group]) => (
            <section key={cat} aria-labelledby={`cat-heading-${cat}`} className="space-y-3">
              <div className="flex items-center justify-between border-b border-border pb-2">
                <h2 id={`cat-heading-${cat}`} className="font-serif text-xl text-foreground">
                  {categoryLabel(cat)}{" "}
                  <span className="font-sans text-sm font-normal text-muted">
                    ({group.length})
                  </span>
                </h2>
              </div>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-5">
                {group.map((item) => (
                  <li key={item.id}>
                    <ItemCard item={item} imageUrl={imageUrls[item.imagePath]} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      ) : (
        <ul
          className={
            viewMode === "compact"
              ? "grid grid-cols-3 gap-2.5 sm:grid-cols-4 md:grid-cols-5 xl:grid-cols-6"
              : "grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 xl:grid-cols-4"
          }
        >
          {items.map((item) => (
            <li key={item.id}>
              <ItemCard item={item} imageUrl={imageUrls[item.imagePath]} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

"use client";

import { useState } from "react";
import {
  Check,
  CheckSquare,
  Layers,
  Loader2,
  Sparkles,
  UserCheck,
  Wand2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { DetectedClothingItem } from "@/lib/ai/schemas";
import { humanise } from "@/lib/wardrobe/categories";

export interface MultiItemExtractOptions {
  studioExtraction: "catalog-flatlay" | "clean-cutout" | "crop-only";
  bundleAsOutfit: boolean;
  outfitName: string;
  markWornToday: boolean;
}

export function MultiItemCard({
  sourcePreviewUrl,
  sourceFileName,
  items,
  photoType = "screenshot",
  outfitTitle = null,
  loading,
  loadingStep,
  onConfirm,
  onDismiss,
}: {
  sourcePreviewUrl: string;
  sourceFileName: string;
  items: DetectedClothingItem[];
  photoType?: "ootd" | "screenshot" | "flatlay";
  outfitTitle?: string | null;
  loading: boolean;
  loadingStep?: string | null;
  onConfirm: (selected: DetectedClothingItem[], options: MultiItemExtractOptions) => void;
  onDismiss: () => void;
}) {
  const isOotd = photoType === "ootd" || items.some((it) => it.wornOnBody);

  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(
    () => new Set(items.map((_, i) => i)),
  );
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null);

  const [studioExtraction, setStudioExtraction] = useState<
    "catalog-flatlay" | "clean-cutout" | "crop-only"
  >(isOotd ? "catalog-flatlay" : "clean-cutout");

  const [bundleAsOutfit, setBundleAsOutfit] = useState<boolean>(isOotd);
  const [outfitName, setOutfitName] = useState<string>(
    outfitTitle ||
      (isOotd
        ? `OOTD · ${new Date().toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
        : "Saved Look"),
  );
  const [markWornToday, setMarkWornToday] = useState<boolean>(isOotd);

  const toggleIndex = (index: number) => {
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const selectAll = () => {
    setSelectedIndices(new Set(items.map((_, i) => i)));
  };

  const deselectAll = () => {
    setSelectedIndices(new Set());
  };

  const handleImport = () => {
    const selected = items.filter((_, i) => selectedIndices.has(i));
    if (selected.length === 0) return;
    onConfirm(selected, {
      studioExtraction,
      bundleAsOutfit: bundleAsOutfit && selected.length >= 2,
      outfitName: outfitName.trim() || "Today's OOTD",
      markWornToday: bundleAsOutfit && markWornToday,
    });
  };

  return (
    <Card className="p-5 sm:p-6 border-accent/40 bg-surface">
      <div className="flex flex-col gap-6 lg:flex-row">
        {/* Source Photo Preview with Interactive Garment Bounding Boxes */}
        <div className="w-full shrink-0 lg:w-64 flex flex-col items-center">
          <div className="relative inline-block max-w-full overflow-hidden rounded-xl border border-border bg-surface-muted">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={sourcePreviewUrl}
              alt={`Outfit scan ${sourceFileName}`}
              className="block max-h-96 w-auto max-w-full object-contain"
            />

            {/* Bounding-box overlays */}
            {items.map((it, idx) => {
              const isSelected = selectedIndices.has(idx);
              const isHovered = hoveredIdx === idx;
              const [ymin, xmin, ymax, xmax] = it.box2d;
              const topPct = Math.max(0, Math.min(96, ymin / 10));
              const leftPct = Math.max(0, Math.min(96, xmin / 10));
              const heightPct = Math.max(4, Math.min(100 - topPct, (ymax - ymin) / 10));
              const widthPct = Math.max(4, Math.min(100 - leftPct, (xmax - xmin) / 10));

              return (
                <button
                  key={idx}
                  type="button"
                  onClick={() => toggleIndex(idx)}
                  onMouseEnter={() => setHoveredIdx(idx)}
                  onMouseLeave={() => setHoveredIdx(null)}
                  title={`${idx + 1}. ${it.suggestion.name}`}
                  style={{
                    top: `${topPct}%`,
                    left: `${leftPct}%`,
                    width: `${widthPct}%`,
                    height: `${heightPct}%`,
                  }}
                  className={`absolute rounded-md border transition-all cursor-pointer ${
                    isHovered
                      ? "border-2 border-accent bg-accent/20 z-20"
                      : isSelected
                        ? "border-accent/85 bg-accent/5 z-10"
                        : "border-white/50 bg-black/20 opacity-50"
                  }`}
                >
                  <span
                    className={`absolute -top-2 -left-2 flex size-5 items-center justify-center rounded-full text-[10px] font-bold shadow-xs ${
                      isSelected
                        ? "bg-accent text-accent-contrast"
                        : "bg-surface text-muted border border-border"
                    }`}
                  >
                    {idx + 1}
                  </span>
                </button>
              );
            })}

            <span className="absolute right-2 top-2 z-30 inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-0.5 text-[11px] font-semibold text-accent-contrast shadow-xs">
              {isOotd ? (
                <>
                  <UserCheck className="size-3" aria-hidden />
                  <span>OOTD · {items.length} pieces</span>
                </>
              ) : (
                <>
                  <Layers className="size-3" aria-hidden />
                  <span>{items.length} garments</span>
                </>
              )}
            </span>
          </div>
          <p className="mt-1.5 text-[11px] text-muted text-center">
            Tap boxes on photo or cards on the right to select pieces.
          </p>
        </div>

        {/* Multi-Garment Selector & Extraction Options */}
        <div className="min-w-0 flex-1 space-y-4">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h3 className="text-base font-semibold text-foreground">
                {isOotd
                  ? `Extracted ${items.length} worn pieces from your OOTD`
                  : `Detected ${items.length} garments in image`}
              </h3>
              <p className="text-xs text-muted">
                {isOotd
                  ? "Select the pieces you're wearing to extract them into clean standalone wardrobe items."
                  : "Select the garments you want to crop and import into separate review cards."}
              </p>
            </div>
            <div className="flex gap-2 text-xs shrink-0">
              <button
                type="button"
                onClick={selectAll}
                className="text-accent underline underline-offset-4 hover:opacity-80"
              >
                Select all
              </button>
              <span className="text-muted">·</span>
              <button
                type="button"
                onClick={deselectAll}
                className="text-muted hover:text-foreground"
              >
                Deselect all
              </button>
            </div>
          </div>

          {/* Detected Garments Grid */}
          <div className="grid gap-2 sm:grid-cols-2">
            {items.map((it, idx) => {
              const isChecked = selectedIndices.has(idx);
              const sugg = it.suggestion;
              return (
                <div
                  key={idx}
                  onClick={() => toggleIndex(idx)}
                  onMouseEnter={() => setHoveredIdx(idx)}
                  onMouseLeave={() => setHoveredIdx(null)}
                  className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition-colors ${
                    isChecked
                      ? "border-accent bg-accent-soft/40 text-foreground"
                      : "border-border bg-surface-muted/30 text-muted opacity-75"
                  }`}
                >
                  <div className="mt-0.5 shrink-0">
                    {isChecked ? (
                      <div className="flex size-5 items-center justify-center rounded-md bg-accent text-accent-contrast text-[10px] font-bold">
                        <Check className="size-3" />
                      </div>
                    ) : (
                      <div className="flex size-5 items-center justify-center rounded-md border border-border-strong bg-surface text-[10px] text-muted">
                        {idx + 1}
                      </div>
                    )}
                  </div>
                  <div className="min-w-0 flex-1 text-xs space-y-1">
                    <p className="font-semibold text-foreground truncate">
                      <span className="text-muted mr-1">#{idx + 1}</span>
                      {sugg.name || `Garment ${idx + 1}`}
                    </p>
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                      <span className="rounded bg-surface-muted px-1.5 py-0.5 font-medium text-foreground">
                        {humanise(sugg.category)}
                      </span>
                      {sugg.primaryColour ? (
                        <span className="rounded border border-border px-1.5 py-0.5 text-muted">
                          {humanise(sugg.primaryColour)}
                        </span>
                      ) : null}
                      {it.wornOnBody && (
                        <span className="rounded bg-accent-soft/80 px-1.5 py-0.5 text-[10px] font-medium text-accent">
                          Worn
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Garment Extraction Mode */}
          <div className="rounded-xl border border-border bg-background/60 p-3.5 space-y-2.5">
            <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Wand2 className="size-3.5 text-accent" />
              <span>How should ClosetAI extract each garment?</span>
            </p>
            <div className="grid gap-2 sm:grid-cols-3 text-xs">
              <button
                type="button"
                disabled={loading}
                onClick={() => setStudioExtraction("catalog-flatlay")}
                className={`rounded-xl border p-2.5 text-left transition-colors ${
                  studioExtraction === "catalog-flatlay"
                    ? "border-accent bg-accent-soft/40"
                    : "border-border bg-surface hover:bg-surface-muted/50"
                }`}
              >
                <div className="flex items-center gap-1.5 font-semibold text-foreground">
                  <Sparkles className="size-3.5 text-accent shrink-0" />
                  <span>De-Body Flat-Lay</span>
                </div>
                <p className="text-[11px] text-muted mt-0.5 leading-snug">
                  Removes arms, legs &amp; skin into an unworn studio flat-lay. Best for OOTDs.
                </p>
              </button>

              <button
                type="button"
                disabled={loading}
                onClick={() => setStudioExtraction("clean-cutout")}
                className={`rounded-xl border p-2.5 text-left transition-colors ${
                  studioExtraction === "clean-cutout"
                    ? "border-accent bg-accent-soft/40"
                    : "border-border bg-surface hover:bg-surface-muted/50"
                }`}
              >
                <div className="flex items-center gap-1.5 font-semibold text-foreground">
                  <Wand2 className="size-3.5 text-accent shrink-0" />
                  <span>Background Cutout</span>
                </div>
                <p className="text-[11px] text-muted mt-0.5 leading-snug">
                  Crops each item and removes background cleanly. Fast &amp; crisp for screenshots.
                </p>
              </button>

              <button
                type="button"
                disabled={loading}
                onClick={() => setStudioExtraction("crop-only")}
                className={`rounded-xl border p-2.5 text-left transition-colors ${
                  studioExtraction === "crop-only"
                    ? "border-accent bg-accent-soft/40"
                    : "border-border bg-surface hover:bg-surface-muted/50"
                }`}
              >
                <div className="font-semibold text-foreground">Smart Crop Only</div>
                <p className="text-[11px] text-muted mt-0.5 leading-snug">
                  Crops each bounding box directly with zero studio retouching.
                </p>
              </button>
            </div>
          </div>

          {/* Bundle OOTD into Saved Outfit */}
          {selectedIndices.size >= 2 && (
            <div className="rounded-xl border border-border bg-background/60 p-3.5 space-y-2.5">
              <label className="flex items-center gap-2.5 text-xs font-semibold text-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={bundleAsOutfit}
                  disabled={loading}
                  onChange={(e) => setBundleAsOutfit(e.target.checked)}
                  className="size-4 accent-[var(--accent)] rounded"
                />
                <span>
                  Also link these pieces together as an Outfit (attaching your OOTD photo)
                </span>
              </label>

              {bundleAsOutfit && (
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 pl-6 pt-0.5">
                  <input
                    type="text"
                    value={outfitName}
                    disabled={loading}
                    onChange={(e) => setOutfitName(e.target.value)}
                    placeholder="Outfit title (e.g. Friday Smart-Casual OOTD)"
                    maxLength={90}
                    className="flex-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs text-foreground placeholder:text-muted focus:border-accent focus:outline-hidden"
                  />
                  <label className="flex items-center gap-2 text-xs text-muted hover:text-foreground cursor-pointer shrink-0">
                    <input
                      type="checkbox"
                      checked={markWornToday}
                      disabled={loading}
                      onChange={(e) => setMarkWornToday(e.target.checked)}
                      className="size-4 accent-[var(--accent)] rounded"
                    />
                    <span>Log as worn today</span>
                  </label>
                </div>
              )}
            </div>
          )}

          {/* Action buttons */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={loading}
              onClick={onDismiss}
            >
              Keep whole photo as 1 item
            </Button>

            <Button
              type="button"
              loading={loading}
              disabled={loading || selectedIndices.size === 0}
              onClick={handleImport}
            >
              {loading ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  <span>{loadingStep || "Extracting & preparing garments…"}</span>
                </>
              ) : (
                <>
                  <CheckSquare className="size-4" aria-hidden />
                  <span>
                    Extract {selectedIndices.size} selected{" "}
                    {selectedIndices.size === 1 ? "piece" : "pieces"}
                  </span>
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

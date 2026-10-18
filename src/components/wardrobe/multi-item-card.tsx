"use client";

import { useState } from "react";
import { Check, CheckSquare, Layers, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { DetectedClothingItem } from "@/lib/ai/schemas";
import { humanise } from "@/lib/wardrobe/categories";

export function MultiItemCard({
  sourcePreviewUrl,
  sourceFileName,
  items,
  loading,
  onConfirm,
  onDismiss,
}: {
  sourcePreviewUrl: string;
  sourceFileName: string;
  items: DetectedClothingItem[];
  loading: boolean;
  onConfirm: (selected: DetectedClothingItem[]) => void;
  onDismiss: () => void;
}) {
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(
    () => new Set(items.map((_, i) => i)),
  );

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
    onConfirm(selected);
  };

  return (
    <Card className="p-5 sm:p-6 border-accent/40 bg-surface">
      <div className="flex flex-col gap-5 sm:flex-row">
        {/* Source Screenshot Preview */}
        <div className="relative w-full shrink-0 sm:w-48">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={sourcePreviewUrl}
            alt={`Screenshot ${sourceFileName}`}
            className="aspect-square w-full rounded-xl border border-border bg-surface-muted object-contain"
          />
          <span className="absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-accent px-2.5 py-0.5 text-xs font-semibold text-accent-foreground shadow-xs">
            <Layers className="size-3" aria-hidden />
            {items.length} garments detected
          </span>
        </div>

        {/* Multi-Garment Selector */}
        <div className="min-w-0 flex-1 space-y-4">
          <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-base font-semibold text-foreground">
                Detected {items.length} garments in screenshot
              </h3>
              <p className="text-xs text-muted">
                ClosetAI identified multiple items in this order screenshot. Select the garments you want to import as separate review cards:
              </p>
            </div>
            <div className="flex gap-2 text-xs">
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

          {/* List of items */}
          <div className="grid gap-2 sm:grid-cols-2">
            {items.map((it, idx) => {
              const isChecked = selectedIndices.has(idx);
              const sugg = it.suggestion;
              return (
                <div
                  key={idx}
                  onClick={() => toggleIndex(idx)}
                  className={`flex items-start gap-3 rounded-xl border p-3 cursor-pointer transition-colors ${
                    isChecked
                      ? "border-accent bg-accent-soft/40 text-foreground"
                      : "border-border bg-surface-muted/30 text-muted opacity-75"
                  }`}
                >
                  <div className="mt-0.5 shrink-0">
                    {isChecked ? (
                      <div className="flex size-4.5 items-center justify-center rounded bg-accent text-accent-foreground">
                        <Check className="size-3" />
                      </div>
                    ) : (
                      <div className="size-4.5 rounded border border-border-strong bg-surface" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1 text-xs space-y-1">
                    <p className="font-semibold text-foreground truncate">
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
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Action buttons */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                disabled={loading}
                onClick={onDismiss}
              >
                Keep whole screenshot as 1 item
              </Button>
            </div>
            <Button
              type="button"
              loading={loading}
              disabled={loading || selectedIndices.size === 0}
              onClick={handleImport}
            >
              {loading ? (
                <>
                  <Loader2 className="size-4 animate-spin" aria-hidden />
                  Cropping &amp; preparing items…
                </>
              ) : (
                <>
                  <CheckSquare className="size-4" aria-hidden />
                  Import {selectedIndices.size} selected{" "}
                  {selectedIndices.size === 1 ? "garment" : "garments"}
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

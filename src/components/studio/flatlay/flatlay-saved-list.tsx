"use client";

import { useTransition } from "react";
import { Edit3, Sparkles, Trash2, Calendar, Layout } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, EmptyState } from "@/components/ui/card";
import { ItemImage } from "@/components/wardrobe/item-image";
import type { FlatlayComposition } from "@/lib/flatlay/types";
import { deleteFlatlayAction } from "@/app/(app)/studio/flatlay/actions";

interface FlatlaySavedListProps {
  compositions: FlatlayComposition[];
  itemImageUrls: Record<string, string>;
  onEditComposition: (comp: FlatlayComposition) => void;
  onCreateNew: () => void;
  onCompositionDeleted?: (id: string) => void;
}

export function FlatlaySavedList({
  compositions,
  itemImageUrls,
  onEditComposition,
  onCreateNew,
  onCompositionDeleted,
}: FlatlaySavedListProps) {
  const [isPending, startTransition] = useTransition();

  const handleDelete = (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete "${name}"?`)) return;

    startTransition(async () => {
      const res = await deleteFlatlayAction(id);
      if (res.ok) {
        onCompositionDeleted?.(id);
      } else {
        alert(res.error || "Could not delete flatlay.");
      }
    });
  };

  if (compositions.length === 0) {
    return (
      <EmptyState
        title="No saved flatlay boards yet"
        icon={Sparkles}
        action={
          <Button type="button" onClick={onCreateNew}>
            Create your first flatlay
          </Button>
        }
      >
        Compose fashion magazine layouts and aesthetic collages from your wardrobe items. You can save, reopen, edit, and export them anytime.
      </EmptyState>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
      {compositions.map((comp) => {
        const previewItems = comp.items.slice(0, 4);

        return (
          <Card
            key={comp.id}
            className="flex flex-col justify-between overflow-hidden p-5 space-y-4 hover:border-accent/40 transition-colors"
          >
            <div className="space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-medium text-foreground">{comp.name}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    <span className="rounded-md bg-accent-soft px-2 py-0.5 text-[10px] font-semibold text-accent uppercase tracking-wide">
                      {comp.preset}
                    </span>
                    <span className="text-xs text-muted">
                      {comp.items.length} {comp.items.length === 1 ? "garment" : "garments"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Garment Images Preview Box */}
              <div
                className="relative flex aspect-[4/3] w-full items-center justify-center overflow-hidden rounded-xl border border-border p-3"
                style={{ backgroundColor: comp.backgroundColor || "#fcfaf7" }}
              >
                <div className="grid grid-cols-2 gap-2 w-full">
                  {previewItems.map((item) => (
                    <div
                      key={item.id}
                      className="relative overflow-hidden rounded-lg bg-surface/80 p-1 border border-border/50 shadow-2xs"
                    >
                      <ItemImage
                        url={itemImageUrls[item.imagePath]}
                        alt={item.name}
                        className="aspect-square w-full rounded-md object-cover"
                      />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-between border-t border-border pt-3">
              <span className="text-[11px] text-muted">
                Updated {new Date(comp.updatedAt).toLocaleDateString()}
              </span>

              <div className="flex items-center gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onEditComposition(comp)}
                  className="h-8 gap-1.5 text-xs"
                >
                  <Edit3 className="size-3 text-accent" />
                  <span>Open & Edit</span>
                </Button>
                <button
                  type="button"
                  onClick={() => handleDelete(comp.id, comp.name)}
                  disabled={isPending}
                  className="grid size-8 place-items-center rounded-lg text-muted hover:text-danger hover:bg-danger-soft transition"
                  title="Delete board"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}

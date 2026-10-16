"use client";

import { useMemo, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { Check, Layers, Plus, Search, Shirt, Sparkles, X } from "lucide-react";
import { shareInConversationAction } from "@/app/(app)/connect/actions";
import type {
  Message,
  SharedItemCardData,
  SharedOutfitCardData,
} from "@/lib/connect/queries";
import { cn } from "@/lib/utils/cn";

interface Props {
  conversationId: string;
  otherMemberName: string;
  items: SharedItemCardData[];
  outfits: SharedOutfitCardData[];
  disabled?: boolean;
  onShared: (message: Message) => void;
}

export function SharePickerDialog({
  conversationId,
  otherMemberName,
  items,
  outfits,
  disabled = false,
  onShared,
}: Props) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"items" | "outfits">("items");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [selectedOutfitIds, setSelectedOutfitIds] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const item of items) {
      if (item.category) set.add(item.category);
    }
    return ["all", ...Array.from(set)];
  }, [items]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => {
      if (categoryFilter !== "all" && it.category !== categoryFilter) return false;
      if (!q) return true;
      return (
        it.name.toLowerCase().includes(q) ||
        it.category.toLowerCase().includes(q) ||
        (it.primaryColour?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [items, search, categoryFilter]);

  const filteredOutfits = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return outfits;
    return outfits.filter(
      (o) =>
        o.name.toLowerCase().includes(q) ||
        (o.occasion?.toLowerCase().includes(q) ?? false) ||
        (o.styleDescription?.toLowerCase().includes(q) ?? false),
    );
  }, [outfits, search]);

  const toggleItem = (id: string) => {
    setError(null);
    setSelectedItemIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 8) {
        setError("You can share up to 8 clothing items in a single message.");
        return prev;
      }
      return [...prev, id];
    });
  };

  const toggleOutfit = (id: string) => {
    setError(null);
    setSelectedOutfitIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 4) {
        setError("You can share up to 4 saved outfits in a single message.");
        return prev;
      }
      return [...prev, id];
    });
  };

  const resetAndClose = () => {
    setOpen(false);
    setError(null);
    setSearch("");
    setCategoryFilter("all");
  };

  const handleSubmit = () => {
    if (selectedItemIds.length === 0 && selectedOutfitIds.length === 0) {
      setError("Select at least one clothing item or saved outfit to share.");
      return;
    }

    setError(null);
    startTransition(async () => {
      const res = await shareInConversationAction({
        conversationId,
        body: note.trim() || undefined,
        itemIds: selectedItemIds,
        outfitIds: selectedOutfitIds,
      });

      if (!res.ok || !res.data?.message) {
        setError(res.ok ? "Could not share items." : res.error);
        return;
      }

      onShared(res.data.message);
      setSelectedItemIds([]);
      setSelectedOutfitIds([]);
      setNote("");
      resetAndClose();
    });
  };

  const totalSelected = selectedItemIds.length + selectedOutfitIds.length;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        aria-label="Share clothes or saved outfits"
        title="Share clothes or saved outfits"
        className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl border border-border-strong bg-background px-3 text-xs font-medium text-foreground transition-colors hover:bg-surface-muted disabled:opacity-40"
      >
        <Plus className="size-4 text-accent" aria-hidden />
        <span className="hidden sm:inline">Share closet</span>
      </button>

      {open && (() => {
        const modal = (
          <div
            className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-0 sm:items-center sm:p-4 backdrop-blur-xs"
            role="dialog"
            aria-modal="true"
            aria-labelledby="share-picker-title"
          >
            <div className="flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-border bg-surface shadow-xl sm:rounded-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-4 py-3.5 sm:px-5 sm:py-4">
              <div className="min-w-0 flex-1 pr-2">
                <h2 id="share-picker-title" className="truncate text-sm sm:text-base font-semibold text-foreground">
                  Share with {otherMemberName}
                </h2>
                <p className="line-clamp-1 text-xs text-muted sm:line-clamp-none">
                  Only the items or outfits you select will be visible in this conversation.
                </p>
              </div>
              <button
                type="button"
                onClick={resetAndClose}
                aria-label="Close share picker"
                className="grid size-8 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-muted hover:text-foreground"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>

            {/* Tabs + Search */}
            <div className="border-b border-border px-4 py-3 sm:px-5 space-y-3">
              <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar sm:overflow-visible sm:pb-0">
                <button
                  type="button"
                  onClick={() => setTab("items")}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                    tab === "items"
                      ? "bg-accent text-accent-foreground"
                      : "bg-surface-muted text-muted hover:text-foreground",
                  )}
                >
                  <Shirt className="size-3.5 shrink-0" aria-hidden />
                  <span>Clothing Items</span> ({items.length})
                  {selectedItemIds.length > 0 && (
                    <span className="ml-1 rounded-full bg-background/20 px-1.5 py-0.2 text-[0.65rem]">
                      {selectedItemIds.length}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setTab("outfits")}
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                    tab === "outfits"
                      ? "bg-accent text-accent-foreground"
                      : "bg-surface-muted text-muted hover:text-foreground",
                  )}
                >
                  <Layers className="size-3.5 shrink-0" aria-hidden />
                  <span>Saved Outfits</span> ({outfits.length})
                  {selectedOutfitIds.length > 0 && (
                    <span className="ml-1 rounded-full bg-background/20 px-1.5 py-0.2 text-[0.65rem]">
                      {selectedOutfitIds.length}
                    </span>
                  )}
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative flex-1 min-w-[180px]">
                  <Search
                    className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted"
                    aria-hidden
                  />
                  <input
                    type="search"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder={
                      tab === "items"
                        ? "Search items by name, category, colour…"
                        : "Search saved outfits…"
                    }
                    className="w-full rounded-lg border border-border bg-background py-1.5 pl-8 pr-3 text-xs text-foreground placeholder:text-muted focus-visible:border-accent focus-visible:outline-none"
                  />
                </div>

                {tab === "items" && categories.length > 2 && (
                  <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
                    {categories.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setCategoryFilter(cat)}
                        className={cn(
                          "rounded-full px-2.5 py-1 text-[0.7rem] font-medium capitalize transition-colors",
                          categoryFilter === cat
                            ? "bg-foreground text-background"
                            : "bg-surface-muted text-muted hover:text-foreground",
                        )}
                      >
                        {cat}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Picker Grid */}
            <div className="flex-1 overflow-y-auto p-5">
              {tab === "items" ? (
                filteredItems.length === 0 ? (
                  <p className="py-12 text-center text-sm text-muted">
                    {items.length === 0
                      ? "Your wardrobe doesn't have any items yet."
                      : "No clothing items match your search."}
                  </p>
                ) : (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
                    {filteredItems.map((item) => {
                      const selected = selectedItemIds.includes(item.id);
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => toggleItem(item.id)}
                          aria-pressed={selected}
                          className={cn(
                            "group relative flex flex-col overflow-hidden rounded-xl border text-left transition-all",
                            selected
                              ? "border-accent ring-2 ring-accent/30 bg-accent-soft/20"
                              : "border-border bg-background hover:border-border-strong",
                          )}
                        >
                          <div className="relative aspect-square w-full overflow-hidden bg-surface-muted">
                            {item.imageUrl ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={item.imageUrl}
                                alt={item.name}
                                className="size-full object-cover transition-transform group-hover:scale-105"
                              />
                            ) : (
                              <div className="grid size-full place-items-center text-muted">
                                <Shirt className="size-6" aria-hidden />
                              </div>
                            )}
                            <span
                              className={cn(
                                "absolute right-2 top-2 grid size-6 place-items-center rounded-full border text-xs transition-colors",
                                selected
                                  ? "border-accent bg-accent text-accent-foreground"
                                  : "border-border bg-surface/90 text-transparent",
                              )}
                              aria-hidden
                            >
                              <Check className="size-3.5" />
                            </span>
                          </div>
                          <div className="p-2.5">
                            <p className="truncate text-xs font-semibold text-foreground">
                              {item.name}
                            </p>
                            <p className="mt-0.5 truncate text-[0.68rem] capitalize text-muted">
                              {item.category}
                              {item.primaryColour ? ` · ${item.primaryColour}` : ""}
                            </p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )
              ) : filteredOutfits.length === 0 ? (
                <p className="py-12 text-center text-sm text-muted">
                  {outfits.length === 0
                    ? "You don't have any saved outfits yet."
                    : "No saved outfits match your search."}
                </p>
              ) : (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {filteredOutfits.map((outfit) => {
                    const selected = selectedOutfitIds.includes(outfit.id);
                    return (
                      <button
                        key={outfit.id}
                        type="button"
                        onClick={() => toggleOutfit(outfit.id)}
                        aria-pressed={selected}
                        className={cn(
                          "flex flex-col justify-between rounded-xl border p-3 text-left transition-all",
                          selected
                            ? "border-accent ring-2 ring-accent/30 bg-accent-soft/20"
                            : "border-border bg-background hover:border-border-strong",
                        )}
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="truncate text-xs font-semibold text-foreground">
                                {outfit.name}
                              </p>
                              <p className="text-[0.68rem] capitalize text-muted">
                                {outfit.occasion ?? "Any occasion"} · {outfit.items.length}{" "}
                                {outfit.items.length === 1 ? "piece" : "pieces"}
                              </p>
                            </div>
                            <span
                              className={cn(
                                "grid size-6 shrink-0 place-items-center rounded-full border",
                                selected
                                  ? "border-accent bg-accent text-accent-foreground"
                                  : "border-border bg-surface text-transparent",
                              )}
                              aria-hidden
                            >
                              <Check className="size-3.5" />
                            </span>
                          </div>

                          {/* Constituent item thumbnails */}
                          <div className="mt-2.5 flex items-center gap-1.5 overflow-x-auto">
                            {outfit.items.slice(0, 4).map((it) => (
                              <div
                                key={it.id}
                                className="size-12 shrink-0 overflow-hidden rounded-lg border border-border bg-surface-muted"
                                title={it.name}
                              >
                                {it.imageUrl ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={it.imageUrl}
                                    alt={it.name}
                                    className="size-full object-cover"
                                  />
                                ) : (
                                  <div className="grid size-full place-items-center text-muted">
                                    <Shirt className="size-4" aria-hidden />
                                  </div>
                                )}
                              </div>
                            ))}
                            {outfit.items.length > 4 && (
                              <span className="px-1.5 text-[0.68rem] font-medium text-muted">
                                +{outfit.items.length - 4}
                              </span>
                            )}
                          </div>
                        </div>

                        {outfit.stylingTip && (
                          <p className="mt-2 line-clamp-1 text-[0.68rem] text-muted">
                            <Sparkles className="mr-1 inline size-3 text-accent" aria-hidden />
                            {outfit.stylingTip}
                          </p>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Optional Note + Actions */}
            <div className="border-t border-border bg-surface px-5 py-3.5 space-y-2.5">
              {error && (
                <p className="text-xs font-medium text-danger" role="alert">
                  {error}
                </p>
              )}

              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={`Add an optional note for ${otherMemberName}…`}
                maxLength={500}
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-xs text-foreground placeholder:text-muted focus-visible:border-accent focus-visible:outline-none"
              />

              <div className="flex flex-wrap items-center justify-between gap-2.5">
                <p className="min-w-0 flex-1 truncate text-xs text-muted">
                  {totalSelected === 0
                    ? "No items or outfits selected"
                    : `${selectedItemIds.length} item(s), ${selectedOutfitIds.length} outfit(s) selected`}
                </p>

                <div className="flex shrink-0 items-center gap-2 ml-auto">
                  <button
                    type="button"
                    onClick={resetAndClose}
                    className="rounded-lg px-3 py-2 text-xs font-medium text-muted hover:bg-surface-muted hover:text-foreground"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={totalSelected === 0 || isPending}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-accent-foreground transition-opacity hover:bg-accent-hover disabled:opacity-40"
                  >
                    {isPending ? "Sharing…" : `Share (${totalSelected})`}
                  </button>
                </div>
              </div>
            </div>
          </div>
          </div>
        );
        return typeof document !== "undefined" ? createPortal(modal, document.body) : modal;
      })()}
    </>
  );
}

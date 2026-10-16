"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Search, Send, Shirt, Sparkles } from "lucide-react";
import { sendGrantRecommendationAction } from "@/app/(app)/connect/actions";
import type {
  SharedItemCardData,
  WardrobeGrantSummary,
} from "@/lib/connect/queries";
import { cn } from "@/lib/utils/cn";

interface Props {
  grant: WardrobeGrantSummary;
  items: SharedItemCardData[];
  isGrantee: boolean;
}

export function SharedWardrobeBrowser({ grant, items, isGrantee }: Props) {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("all");
  const [selectedNames, setSelectedNames] = useState<string[]>([]);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const categories = useMemo(() => {
    const s = new Set<string>();
    for (const item of items) {
      if (item.category) s.add(item.category);
    }
    return ["all", ...Array.from(s)];
  }, [items]);

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => {
      if (category !== "all" && it.category !== category) return false;
      if (!q) return true;
      return (
        it.name.toLowerCase().includes(q) ||
        it.category.toLowerCase().includes(q) ||
        (it.primaryColour?.toLowerCase().includes(q) ?? false) ||
        (it.style?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [items, search, category]);

  const canRecommend = isGrantee && grant.canRecommend;

  const toggleSelect = (name: string) => {
    if (!canRecommend) return;
    setError(null);
    setSelectedNames((prev) => {
      if (prev.includes(name)) return prev.filter((x) => x !== name);
      if (prev.length >= 8) {
        setError("You can combine up to 8 items in a single recommendation.");
        return prev;
      }
      return [...prev, name];
    });
  };

  const handleSendRecommendation = () => {
    if (selectedNames.length === 0) return;
    setError(null);

    startTransition(async () => {
      const res = await sendGrantRecommendationAction({
        grantId: grant.id,
        itemNames: selectedNames,
        note: note.trim() || undefined,
      });

      if (!res.ok || !res.data?.conversationId) {
        setError(res.ok ? "Could not send recommendation." : res.error);
        return;
      }

      router.push(`/connect/${res.data.conversationId}`);
    });
  };

  const ownerName = grant.ownerName ?? "Owner";

  return (
    <div className="space-y-6">
      {/* Search + Category filters */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-4">
        <div className="relative flex-1 min-w-[220px]">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted"
            aria-hidden
          />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Search ${ownerName}'s shared wardrobe…`}
            className="w-full rounded-xl border border-border bg-background py-2 pl-9 pr-3 text-sm text-foreground placeholder:text-muted focus-visible:border-accent focus-visible:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {categories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategory(cat)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-medium capitalize transition-colors",
                category === cat
                  ? "bg-accent text-accent-foreground"
                  : "bg-surface-muted text-muted hover:text-foreground",
              )}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Recommendation Builder Bar (when can_recommend is granted) */}
      {canRecommend && (
        <div className="rounded-2xl border border-accent/30 bg-accent-soft/30 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-accent" aria-hidden />
              <p className="text-xs font-semibold text-foreground">
                Recommend an Outfit for {ownerName} ({selectedNames.length} selected)
              </p>
            </div>
            {selectedNames.length > 0 && (
              <button
                type="button"
                onClick={() => setSelectedNames([])}
                className="text-xs font-medium text-muted hover:text-foreground"
              >
                Clear selection
              </button>
            )}
          </div>

          <p className="text-xs text-muted">
            Click clothing cards below to assemble a look, add a styling note, and send it to
            your conversation with {ownerName}.
          </p>

          {selectedNames.length > 0 && (
            <div className="flex flex-col gap-2 sm:flex-row">
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={`Why this combination works for ${ownerName}…`}
                maxLength={500}
                className="flex-1 rounded-xl border border-border bg-surface px-3 py-2 text-xs text-foreground placeholder:text-muted focus-visible:border-accent focus-visible:outline-none"
              />
              <button
                type="button"
                onClick={handleSendRecommendation}
                disabled={isPending}
                className="inline-flex shrink-0 items-center justify-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-accent-foreground hover:bg-accent-hover disabled:opacity-40"
              >
                <Send className="size-3.5" aria-hidden />
                {isPending ? "Sending…" : "Send Recommendation"}
              </button>
            </div>
          )}

          {error && (
            <p className="text-xs font-medium text-danger" role="alert">
              {error}
            </p>
          )}
        </div>
      )}

      {/* Items Grid */}
      {filteredItems.length === 0 ? (
        <div className="rounded-2xl border border-border bg-surface p-12 text-center text-sm text-muted">
          No shared clothing items match your filter.
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4">
          {filteredItems.map((item) => {
            const selected = selectedNames.includes(item.name);
            return (
              <div
                key={item.id}
                onClick={() => toggleSelect(item.name)}
                role={canRecommend ? "button" : undefined}
                tabIndex={canRecommend ? 0 : undefined}
                onKeyDown={(e) => {
                  if (canRecommend && (e.key === "Enter" || e.key === " ")) {
                    e.preventDefault();
                    toggleSelect(item.name);
                  }
                }}
                aria-pressed={canRecommend ? selected : undefined}
                className={cn(
                  "flex flex-col overflow-hidden rounded-2xl border bg-surface transition-all",
                  canRecommend && "cursor-pointer hover:border-border-strong",
                  selected
                    ? "border-accent ring-2 ring-accent/30"
                    : "border-border",
                )}
              >
                <div className="relative aspect-square w-full bg-surface-muted">
                  {item.imageUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      className="size-full object-cover"
                    />
                  ) : (
                    <div className="grid size-full place-items-center text-muted">
                      <Shirt className="size-8" aria-hidden />
                    </div>
                  )}

                  {canRecommend && (
                    <span
                      className={cn(
                        "absolute right-2.5 top-2.5 grid size-6 place-items-center rounded-full border",
                        selected
                          ? "border-accent bg-accent text-accent-foreground"
                          : "border-border bg-surface/90 text-transparent",
                      )}
                      aria-hidden
                    >
                      <Check className="size-3.5" />
                    </span>
                  )}
                </div>

                <div className="p-3 space-y-1">
                  <div className="flex items-center gap-1.5">
                    <span className="rounded-md bg-accent-soft px-1.5 py-0.5 text-[0.62rem] font-semibold uppercase tracking-wide text-accent">
                      {item.category}
                    </span>
                    {item.primaryColour && (
                      <span className="truncate text-[0.68rem] capitalize text-muted">
                        {item.primaryColour}
                      </span>
                    )}
                  </div>
                  <p className="truncate text-sm font-semibold text-foreground">
                    {item.name}
                  </p>
                  {(item.style || item.material || item.occasions.length > 0) && (
                    <p className="truncate text-xs capitalize text-muted">
                      {[item.style, item.material, item.occasions[0]]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

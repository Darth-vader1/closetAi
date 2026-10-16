"use client";

import { useState, useTransition } from "react";
import { Check, Lock, ShieldCheck, Shirt, Trash2, X } from "lucide-react";
import {
  revokeWardrobeGrantAction,
  upsertWardrobeGrantAction,
} from "@/app/(app)/connect/actions";
import type {
  SharedItemCardData,
  WardrobeGrantSummary,
} from "@/lib/connect/queries";
import { cn } from "@/lib/utils/cn";

interface Props {
  granteeId: string;
  granteeName: string;
  conversationId?: string | null;
  existingGrant: WardrobeGrantSummary | null;
  myItems: SharedItemCardData[];
  triggerLabel?: string;
}

export function WardrobeAccessDialog({
  granteeId,
  granteeName,
  conversationId = null,
  existingGrant,
  myItems,
  triggerLabel,
}: Props) {
  const [open, setOpen] = useState(false);
  const [scope, setScope] = useState<"selected_items" | "wardrobe">(
    existingGrant?.scope ?? "selected_items",
  );
  const [canViewItems, setCanViewItems] = useState<boolean>(
    existingGrant?.canViewItems ?? true,
  );
  const [canRecommend, setCanRecommend] = useState<boolean>(
    existingGrant?.canRecommend ?? true,
  );
  const [canSubmitForApproval, setCanSubmitForApproval] = useState<boolean>(
    existingGrant?.canSubmitForApproval ?? false,
  );
  const [canCollaborateRequest, setCanCollaborateRequest] = useState<boolean>(
    existingGrant?.canCollaborateRequest ?? false,
  );
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>(
    existingGrant?.selectedItemIds ?? [],
  );
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const toggleItem = (id: string) => {
    setError(null);
    setSelectedItemIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const handleSave = () => {
    setError(null);
    setSavedNotice(null);

    if (scope === "selected_items" && selectedItemIds.length === 0) {
      setError("Select at least one item to share, or switch scope to 'Entire wardrobe'.");
      return;
    }

    startTransition(async () => {
      const res = await upsertWardrobeGrantAction({
        granteeId,
        conversationId,
        scope,
        canViewItems,
        canRecommend,
        canSubmitForApproval,
        canCollaborateRequest,
        itemIds: scope === "selected_items" ? selectedItemIds : [],
      });

      if (!res.ok) {
        setError(res.error);
        return;
      }

      setSavedNotice("Access permissions updated.");
      setTimeout(() => {
        setSavedNotice(null);
        setOpen(false);
      }, 650);
    });
  };

  const handleRevoke = () => {
    if (!existingGrant) return;
    setError(null);
    startTransition(async () => {
      const res = await revokeWardrobeGrantAction(existingGrant.id);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setConfirmRevoke(false);
      setOpen(false);
    });
  };

  const isActive = Boolean(existingGrant);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setSavedNotice(null);
          setConfirmRevoke(false);
          setOpen(true);
        }}
        className={cn(
          "inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-xl border px-2.5 sm:px-3 py-1.5 text-xs font-medium transition-colors",
          isActive
            ? "border-accent/40 bg-accent-soft text-accent hover:bg-accent-soft/80"
            : "border-border bg-surface text-foreground hover:bg-surface-muted",
        )}
      >
        {isActive ? (
          <ShieldCheck className="size-3.5 shrink-0 text-accent" aria-hidden />
        ) : (
          <Lock className="size-3.5 shrink-0 text-muted" aria-hidden />
        )}
        <span className="hidden sm:inline">
          {triggerLabel ??
            (isActive
              ? existingGrant?.scope === "wardrobe"
                ? "Wardrobe Shared"
                : `${existingGrant?.selectedItemIds.length ?? 0} Items Shared`
              : "Wardrobe Access")}
        </span>
        <span className="sm:hidden">
          {triggerLabel ? (
            triggerLabel
          ) : isActive ? (
            existingGrant?.scope === "wardrobe" ? (
              "Shared"
            ) : (
              `${existingGrant?.selectedItemIds.length ?? 0} Items`
            )
          ) : (
            "Access"
          )}
        </span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-0 sm:items-center sm:p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="wardrobe-access-title"
        >
          <div className="flex max-h-[90dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-2xl border border-border bg-surface shadow-xl sm:rounded-2xl">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border px-4 py-3.5 sm:px-5 sm:py-4">
              <div className="min-w-0 flex-1 pr-2">
                <h2 id="wardrobe-access-title" className="truncate text-sm sm:text-base font-semibold text-foreground">
                  Wardrobe Access for {granteeName}
                </h2>
                <p className="line-clamp-1 text-xs text-muted sm:line-clamp-none">
                  Control what {granteeName} can view or recommend. Your wardrobe stays read-only.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close wardrobe access dialog"
                className="grid size-8 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-muted hover:text-foreground"
              >
                <X className="size-4" aria-hidden />
              </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5">
              {/* Scope Selector */}
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                  1. Sharing Scope
                </p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => setScope("selected_items")}
                    className={cn(
                      "rounded-xl border p-3 text-left transition-all",
                      scope === "selected_items"
                        ? "border-accent bg-accent-soft/30 ring-1 ring-accent"
                        : "border-border bg-background hover:border-border-strong",
                    )}
                  >
                    <p className="text-xs font-semibold text-foreground">Selected Items Only</p>
                    <p className="mt-0.5 text-[0.7rem] text-muted">
                      Only specific clothes you pick below can be seen.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setScope("wardrobe")}
                    className={cn(
                      "rounded-xl border p-3 text-left transition-all",
                      scope === "wardrobe"
                        ? "border-accent bg-accent-soft/30 ring-1 ring-accent"
                        : "border-border bg-background hover:border-border-strong",
                    )}
                  >
                    <p className="text-xs font-semibold text-foreground">Entire Wardrobe</p>
                    <p className="mt-0.5 text-[0.7rem] text-muted">
                      Let {granteeName} browse all items in your closet.
                    </p>
                  </button>
                </div>
              </div>

              {/* Selected Items Picker */}
              {scope === "selected_items" && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                      Select Clothes to Share ({selectedItemIds.length} chosen)
                    </p>
                    {myItems.length > 0 && (
                      <button
                        type="button"
                        onClick={() =>
                          setSelectedItemIds(
                            selectedItemIds.length === myItems.length
                              ? []
                              : myItems.map((i) => i.id),
                          )
                        }
                        className="text-xs font-medium text-accent hover:underline"
                      >
                        {selectedItemIds.length === myItems.length ? "Clear all" : "Select all"}
                      </button>
                    )}
                  </div>

                  {myItems.length === 0 ? (
                    <p className="rounded-xl border border-border bg-background p-4 text-xs text-muted">
                      You have no clothing items in your wardrobe yet.
                    </p>
                  ) : (
                    <div className="grid max-h-52 grid-cols-3 gap-2 overflow-y-auto rounded-xl border border-border bg-background p-2.5 sm:grid-cols-4">
                      {myItems.map((item) => {
                        const checked = selectedItemIds.includes(item.id);
                        return (
                          <button
                            key={item.id}
                            type="button"
                            onClick={() => toggleItem(item.id)}
                            aria-pressed={checked}
                            className={cn(
                              "relative flex flex-col overflow-hidden rounded-lg border text-left transition-all",
                              checked
                                ? "border-accent ring-1 ring-accent bg-accent-soft/20"
                                : "border-border bg-surface hover:border-border-strong",
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
                                  <Shirt className="size-4" aria-hidden />
                                </div>
                              )}
                              {checked && (
                                <span className="absolute right-1.5 top-1.5 grid size-5 place-items-center rounded-full bg-accent text-accent-foreground">
                                  <Check className="size-3" aria-hidden />
                                </span>
                              )}
                            </div>
                            <p className="truncate px-1.5 py-1 text-[0.68rem] font-medium text-foreground">
                              {item.name}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Independent Permission Flags */}
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted">
                  2. Independent Permissions
                </p>

                <div className="divide-y divide-border rounded-xl border border-border bg-background">
                  <label className="flex cursor-pointer items-start justify-between gap-3 p-3">
                    <div>
                      <p className="text-xs font-semibold text-foreground">
                        View shared clothing items
                      </p>
                      <p className="text-[0.7rem] text-muted">
                        Allows {granteeName} to inspect photos, colours, and categories of shared clothes.
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={canViewItems}
                      onChange={(e) => setCanViewItems(e.target.checked)}
                      className="mt-0.5 size-4 accent-accent"
                    />
                  </label>

                  <label className="flex cursor-pointer items-start justify-between gap-3 p-3">
                    <div>
                      <p className="text-xs font-semibold text-foreground">
                        Create outfit recommendations
                      </p>
                      <p className="text-[0.7rem] text-muted">
                        Allows {granteeName} to assemble outfit suggestions from your shared items.
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={canRecommend}
                      onChange={(e) => setCanRecommend(e.target.checked)}
                      className="mt-0.5 size-4 accent-accent"
                    />
                  </label>

                  <label className="flex cursor-pointer items-start justify-between gap-3 p-3">
                    <div>
                      <p className="text-xs font-semibold text-foreground">
                        Send recommendations for approval
                      </p>
                      <p className="text-[0.7rem] text-muted">
                        Allows {granteeName} to submit styled looks for you to approve or reject.
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={canSubmitForApproval}
                      onChange={(e) => setCanSubmitForApproval(e.target.checked)}
                      className="mt-0.5 size-4 accent-accent"
                    />
                  </label>

                  <label className="flex cursor-pointer items-start justify-between gap-3 p-3">
                    <div>
                      <p className="text-xs font-semibold text-foreground">
                        Request collaborative styling
                      </p>
                      <p className="text-[0.7rem] text-muted">
                        Allows {granteeName} to invite you into a live styling session.
                      </p>
                    </div>
                    <input
                      type="checkbox"
                      checked={canCollaborateRequest}
                      onChange={(e) => setCanCollaborateRequest(e.target.checked)}
                      className="mt-0.5 size-4 accent-accent"
                    />
                  </label>
                </div>
              </div>

              {/* Revoke Confirmation Box */}
              {isActive && (
                <div className="rounded-xl border border-danger/25 bg-danger-soft/40 p-3.5">
                  {!confirmRevoke ? (
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-xs font-semibold text-foreground">Revoke all access</p>
                        <p className="text-[0.7rem] text-muted">
                          Immediately blocks {granteeName} from viewing your shared wardrobe.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setConfirmRevoke(true)}
                        className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-danger/40 bg-surface px-3 py-1.5 text-xs font-semibold text-danger hover:bg-danger-soft"
                      >
                        <Trash2 className="size-3.5" aria-hidden />
                        Revoke
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      <p className="text-xs font-medium text-danger">
                        Are you sure? {granteeName} will immediately lose access to your shared wardrobe items.
                      </p>
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setConfirmRevoke(false)}
                          className="rounded-lg px-2.5 py-1 text-xs font-medium text-muted hover:text-foreground"
                        >
                          Keep access
                        </button>
                        <button
                          type="button"
                          onClick={handleRevoke}
                          disabled={isPending}
                          className="rounded-lg bg-danger px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
                        >
                          {isPending ? "Revoking…" : "Yes, revoke access"}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="border-t border-border bg-surface px-5 py-3.5 space-y-2">
              {error && (
                <p className="text-xs font-medium text-danger" role="alert">
                  {error}
                </p>
              )}
              {savedNotice && (
                <p className="text-xs font-medium text-accent" role="status">
                  {savedNotice}
                </p>
              )}

              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="rounded-lg px-3 py-2 text-xs font-medium text-muted hover:bg-surface-muted hover:text-foreground"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={isPending}
                  className="rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-accent-foreground hover:bg-accent-hover disabled:opacity-40"
                >
                  {isPending
                    ? "Saving…"
                    : isActive
                      ? "Save Permissions"
                      : "Grant Wardrobe Access"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

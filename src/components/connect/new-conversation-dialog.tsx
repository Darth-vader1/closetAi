"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Search, X } from "lucide-react";
import { searchUsersAction, startConversationAction } from "@/app/(app)/connect/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

interface Props {
  onClose: () => void;
}

export function NewConversationDialog({ onClose }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Array<{ id: string; displayName: string | null; tag: string; closetId: string | null }>>([]);
  const [searching, setSearching] = useState(false);
  const [starting, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Focus input on mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const handleSearch = (q: string) => {
    setQuery(q);
    setError(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!q.trim()) { setResults([]); return; }

    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      const res = await searchUsersAction(q);
      setSearching(false);
      if (res.ok) setResults(res.data ?? []);
    }, 350);
  };

  const handleSelect = (userId: string) => {
    setError(null);
    startTransition(async () => {
      const result = await startConversationAction(userId);
      // If startConversationAction succeeds it calls redirect() which throws
      // a Next.js NEXT_REDIRECT — that propagates automatically. We only land
      // here if something went wrong.
      if (result && !result.ok) {
        setError(result.error);
      }
    });
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40 bg-foreground/30 backdrop-blur-sm"
        aria-hidden
        onClick={onClose}
      />

      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Start a new conversation"
        className="fixed inset-x-4 top-1/4 z-50 mx-auto max-w-md rounded-[1.25rem] border border-border bg-surface shadow-xl focus:outline-none"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <h2 className="text-base font-semibold text-foreground">Start a conversation</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-8 place-items-center rounded-full text-muted hover:bg-surface-muted hover:text-foreground"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        {/* Search input */}
        <div className="px-5 py-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-3 size-4 text-muted" aria-hidden />
            <input
              ref={inputRef}
              type="search"
              placeholder="Search by name or Closet ID…"
              value={query}
              onChange={(e) => handleSearch(e.target.value)}
              className="w-full rounded-xl border border-border-strong bg-background py-2.5 pl-10 pr-4 text-sm text-foreground placeholder:text-muted/70 focus-visible:border-accent focus-visible:outline-none"
              aria-label="Search users"
              autoComplete="off"
            />
          </div>
        </div>

        {/* Results */}
        <div className="max-h-60 overflow-y-auto px-3 pb-4">
          {searching && (
            <p className="py-4 text-center text-sm text-muted">Searching…</p>
          )}

          {!searching && query.trim() && results.length === 0 && (
            <p className="py-4 text-center text-sm text-muted">
              No users found for &quot;{query}&quot;
            </p>
          )}

          {!searching && results.length > 0 && (
            <ul role="listbox" aria-label="Search results" className="space-y-1">
              {results.map((user) => {
                const name = user.displayName ?? "Unknown User";
                return (
                  <li key={user.id} role="option" aria-selected={false}>
                    <button
                      type="button"
                      disabled={starting}
                      onClick={() => handleSelect(user.id)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
                        "hover:bg-surface-muted focus-visible:bg-surface-muted focus-visible:outline-none",
                        starting && "opacity-50 pointer-events-none",
                      )}
                    >
                      {/* Avatar */}
                      <span
                        className="grid size-9 shrink-0 place-items-center rounded-full bg-accent-soft text-sm font-semibold text-accent"
                        aria-hidden
                      >
                        {(Array.from(name)[0] ?? "?").toUpperCase()}
                      </span>

                      {/* Name + unique Closet ID */}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-foreground">{name}</p>
                        <p className="font-mono text-xs text-muted">
                          {user.closetId ?? user.tag}
                        </p>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {!searching && !query.trim() && (
            <p className="py-4 text-center text-xs text-muted">
              Type a name or Closet ID (e.g. <span className="font-mono">CLOS-A3F8C249</span>) to find other ClosetAI users.
            </p>
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="border-t border-danger/20 bg-danger-soft px-5 py-3 text-xs text-danger" role="alert">
            {error}
          </div>
        )}

        {/* Footer */}
        <div className="border-t border-border px-5 py-3 flex justify-end">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </>
  );
}

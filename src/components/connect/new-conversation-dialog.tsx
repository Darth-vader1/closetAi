"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { Search, X } from "lucide-react";
import { searchUsersAction, startConversationAction } from "@/app/(app)/connect/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

interface Props {
  onClose: () => void;
}

export function NewConversationDialog({ onClose }: Props) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Array<{ id: string; displayName: string | null; closetId: string | null }>>([]);
  const [searching, setSearching] = useState(false);
  const [starting, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const requestIdRef = useRef(0);

  useEffect(() => {
    previouslyFocusedRef.current = (document.activeElement as HTMLElement | null) ?? null;
    inputRef.current?.focus();
    return () => {
      previouslyFocusedRef.current?.focus?.();
    };
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const trapFocus = (e: React.KeyboardEvent) => {
    if (e.key !== "Tab" || !dialogRef.current) return;
    const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    if (focusables.length === 0) return;
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey) {
      if (document.activeElement === first) {
        e.preventDefault();
        last.focus();
      }
    } else {
      if (document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  };

  const handleSearch = (q: string) => {
    setQuery(q);
    setError(null);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    const trimmed = q.trim();
    if (trimmed.length < 3) {
      setResults([]);
      setSearching(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      const reqId = ++requestIdRef.current;
      setSearching(true);
      try {
        const res = await searchUsersAction(trimmed);
        if (reqId !== requestIdRef.current) return;
        if (res.ok) setResults(res.data ?? []);
        else setError(res.error);
      } finally {
        if (reqId === requestIdRef.current) setSearching(false);
      }
    }, 350);
  };

  const handleSelect = (userId: string) => {
    setError(null);
    startTransition(async () => {
      const result = await startConversationAction(userId);
      if (result && !result.ok) {
        setError(result.error);
      }
    });
  };

  const content = (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-start sm:items-center sm:justify-center bg-background sm:bg-black/55 sm:p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label="Start a new conversation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        ref={dialogRef}
        onKeyDown={trapFocus}
        className="w-full sm:max-w-md h-full sm:h-auto sm:max-h-[85vh] flex flex-col overflow-hidden sm:rounded-[1.25rem] border-0 sm:border border-border bg-surface shadow-2xl focus:outline-none pt-[env(safe-area-inset-top)] sm:pt-0"
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-5 sm:py-4 shrink-0">
          <h2 className="text-base font-semibold text-foreground">Start a conversation</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid size-9 place-items-center rounded-full text-muted hover:bg-surface-muted hover:text-foreground"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>

        <div className="px-4 py-3 sm:px-5 sm:py-4 shrink-0">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-3.5 size-4 text-muted" aria-hidden />
            <input
              ref={inputRef}
              type="search"
              placeholder="Search by exact Closet ID or name (3+ chars)…"
              value={query}
              onChange={(e) => handleSearch(e.target.value)}
              className="w-full rounded-xl border border-border-strong bg-background py-2.5 pl-10 pr-4 text-base sm:text-sm text-foreground placeholder:text-muted/70 focus-visible:border-accent focus-visible:outline-none"
              aria-label="Search users"
              autoComplete="off"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck="false"
            />
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto px-4 pb-6 sm:px-3 sm:pb-4 sm:max-h-64">
          {searching && (
            <p className="py-4 text-center text-sm text-muted">Searching…</p>
          )}

          {!searching && query.trim().length > 0 && query.trim().length < 3 && (
            <p className="py-4 text-center text-xs text-muted">
              Type at least 3 characters to search by name, or paste an exact Closet ID.
            </p>
          )}

          {!searching && query.trim().length >= 3 && results.length === 0 && (
            <p className="py-4 text-center text-sm text-muted">
              No users found for &quot;{query.trim()}&quot;
            </p>
          )}

          {!searching && results.length > 0 && (
            <ul role="list" aria-label="Search results" className="space-y-1">
              {results.map((user) => {
                const name = user.displayName ?? "Unknown User";
                return (
                  <li key={user.id}>
                    <button
                      type="button"
                      disabled={starting}
                      onClick={() => handleSelect(user.id)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-xl px-3 py-3 sm:py-2.5 text-left transition-colors",
                        "hover:bg-surface-muted active:bg-surface-muted focus-visible:bg-surface-muted focus-visible:outline-none",
                        starting && "opacity-50 pointer-events-none",
                      )}
                    >
                      <span
                        className="grid size-9 shrink-0 place-items-center rounded-full bg-accent-soft text-sm font-semibold text-accent"
                        aria-hidden
                      >
                        {(Array.from(name)[0] ?? "?").toUpperCase()}
                      </span>

                      <div className="flex min-w-0 flex-1 items-center gap-2">
                        <p className="truncate text-sm font-medium text-foreground">{name}</p>
                        <span className="shrink-0 font-mono text-xs text-muted">
                          {user.closetId ?? ""}
                        </span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {!searching && !query.trim() && (
            <p className="py-4 text-center text-xs text-muted">
              Search by exact Closet ID (e.g.{" "}
              <span className="font-mono">CLOS-A3F8C249</span>) or by name (if they enabled name discovery).
            </p>
          )}
        </div>

        {error && (
          <div className="border-t border-danger/20 bg-danger-soft px-5 py-3 text-xs text-danger shrink-0" role="alert">
            {error}
          </div>
        )}

        <div className="hidden sm:flex border-t border-border px-5 py-3 justify-end shrink-0">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );

  if (typeof document !== "undefined") {
    return createPortal(content, document.body);
  }

  return content;
}

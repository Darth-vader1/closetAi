"use client";

import { useState } from "react";
import { Check, Copy, Link as LinkIcon } from "lucide-react";

interface Props {
  /** The user's stored Closet ID, e.g. "CLOS-A3F8C249" */
  closetId: string;
  /** Optional shareable conversation or profile link */
  shareUrl?: string;
}

/**
 * Displays the current user's Closet ID with copy buttons.
 * Used on the Connect inbox and in Settings.
 */
export function ClosetIdCard({ closetId, shareUrl }: Props) {
  const [copiedId, setCopiedId] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  const copyText = async (text: string, setter: (v: boolean) => void) => {
    try {
      await navigator.clipboard.writeText(text);
      setter(true);
      setTimeout(() => setter(false), 2000);
    } catch {
      // Clipboard unavailable (non-HTTPS in dev) — silently ignore.
    }
  };

  return (
    <div className="mb-6 rounded-xl border border-border bg-surface-muted/50 px-4 py-4">
      <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted">
        Your Closet ID
      </p>
      <div className="flex items-center justify-between gap-3">
        <p className="font-mono text-lg font-bold tracking-wider text-foreground">
          {closetId}
        </p>
        <button
          type="button"
          onClick={() => copyText(closetId, setCopiedId)}
          aria-label={copiedId ? "Copied Closet ID" : "Copy Closet ID"}
          className="grid size-9 shrink-0 place-items-center rounded-full border border-border bg-surface text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
        >
          {copiedId
            ? <Check className="size-4 text-success" aria-hidden />
            : <Copy className="size-4" aria-hidden />}
        </button>
      </div>
      <p className="mt-1.5 text-xs text-muted">
        Share this with friends so they can find the right you.
      </p>

      {/* Optional share link */}
      {shareUrl && (
        <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-border bg-background px-3 py-2">
          <p className="min-w-0 truncate font-mono text-xs text-muted">{shareUrl}</p>
          <button
            type="button"
            onClick={() => copyText(shareUrl, setCopiedLink)}
            aria-label={copiedLink ? "Copied link" : "Copy conversation link"}
            className="grid size-8 shrink-0 place-items-center rounded-full text-muted transition-colors hover:text-foreground"
          >
            {copiedLink
              ? <Check className="size-3.5 text-success" aria-hidden />
              : <LinkIcon className="size-3.5" aria-hidden />}
          </button>
        </div>
      )}
    </div>
  );
}

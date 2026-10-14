"use client";

import { useState } from "react";
import { Check, Copy } from "lucide-react";

interface Props {
  tag: string;
}

/**
 * Shows the current user their own Connect tag so they can share it with
 * friends who want to find them by name in the recipient search dialog.
 */
export function MyTagCard({ tag }: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(tag);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API not available (e.g. non-HTTPS in dev). Silently ignore.
    }
  };

  return (
    <div className="mb-6 flex items-center justify-between gap-4 rounded-xl border border-border bg-surface-muted/50 px-4 py-3">
      <div className="min-w-0">
        <p className="text-xs font-medium text-muted">Your Connect tag</p>
        <p className="mt-0.5 font-mono text-base font-semibold text-foreground">
          {tag}
        </p>
        <p className="mt-0.5 text-xs text-muted">
          Share this with friends so they can find the right you.
        </p>
      </div>
      <button
        type="button"
        onClick={handleCopy}
        aria-label={copied ? "Copied" : "Copy Connect tag"}
        className="grid size-9 shrink-0 place-items-center rounded-full border border-border bg-surface text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
      >
        {copied ? (
          <Check className="size-4 text-success" aria-hidden />
        ) : (
          <Copy className="size-4" aria-hidden />
        )}
      </button>
    </div>
  );
}

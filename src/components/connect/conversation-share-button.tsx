"use client";

import { useState } from "react";
import { Check, Share2 } from "lucide-react";

interface Props {
  shareUrl: string;
}

/**
 * Small button in the conversation header that copies the direct link
 * to this conversation so the user can share it with the other participant.
 */
export function ConversationShareButton({ shareUrl }: Props) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable — silently ignore.
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      aria-label={copied ? "Link copied" : "Copy conversation link"}
      title={copied ? "Link copied!" : "Copy link to this conversation"}
      className="grid size-9 shrink-0 place-items-center rounded-full border border-border bg-surface text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
    >
      {copied
        ? <Check className="size-4 text-success" aria-hidden />
        : <Share2 className="size-4" aria-hidden />}
    </button>
  );
}

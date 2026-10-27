"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ChevronRight, Pin, Sparkles } from "lucide-react";
import type {
  StylistChatMessage,
  StylistInboxSummary,
} from "@/lib/connect/stylist-chat-queries";

interface PinnedStylistCardProps {
  currentUserId: string;
  initialSummary: StylistInboxSummary;
}

export function PinnedStylistCard({
  currentUserId,
  initialSummary,
}: PinnedStylistCardProps) {
  const [summary, setSummary] = useState<StylistInboxSummary>(initialSummary);

  // If DB summary is empty (e.g. before migration is run), check localStorage for latest message preview
  useEffect(() => {
    if (initialSummary.lastMessageBody) return;
    try {
      const cached = localStorage.getItem(`closetai_stylist_chat_v1_${currentUserId}`);
      if (!cached) return;
      const parsed = JSON.parse(cached) as StylistChatMessage[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        const last = parsed[parsed.length - 1];
        setSummary({
          lastMessageBody: last.body,
          lastMessageRole: last.role,
          lastMessageAt: last.createdAt,
          lastMessageAtLabel: "Recent",
        });
      }
    } catch {
      // ignore
    }
  }, [currentUserId, initialSummary.lastMessageBody]);

  const previewText = summary.lastMessageBody
    ? `${summary.lastMessageRole === "user" ? "You: " : ""}${
        summary.lastMessageBody.length > 85
          ? summary.lastMessageBody.slice(0, 82) + "…"
          : summary.lastMessageBody
      }`
    : "Ask for fashion advice, share clothes & outfits from your closet, or build a look together.";

  return (
    <section className="mb-6" aria-label="Pinned AI Stylist conversation">
      <div className="mb-2 flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted">
          <Pin className="size-3.5 text-accent" aria-hidden />
          <span>Pinned AI Stylist</span>
        </span>
      </div>

      <Link
        href="/connect/stylist"
        className="group flex items-center gap-4 rounded-[1.25rem] border border-accent/35 bg-surface px-5 py-4 shadow-2xs transition-all hover:border-accent hover:bg-accent-soft/20 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
      >
        <span
          className="relative grid size-12 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground shadow-xs"
          aria-hidden
        >
          <Sparkles className="size-5" />
          <span
            className="absolute -bottom-0.5 -right-0.5 size-3 rounded-full border-2 border-surface bg-success"
            title="Online"
          />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              <p className="truncate text-sm font-semibold text-foreground group-hover:text-accent transition-colors">
                ClosetAI Stylist
              </p>
              <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[0.65rem] font-bold text-accent">
                AI Fashion Bot
              </span>
              <span className="hidden font-mono text-xs text-muted sm:inline">
                @stylist
              </span>
            </div>

            {summary.lastMessageAtLabel ? (
              <span className="shrink-0 text-xs text-muted">
                {summary.lastMessageAtLabel}
              </span>
            ) : (
              <span className="shrink-0 rounded-full bg-accent-soft/70 px-2.5 py-0.5 text-[0.68rem] font-semibold text-accent">
                Chat now
              </span>
            )}
          </div>

          <p className="mt-1 truncate text-sm text-muted">{previewText}</p>
        </div>

        <ChevronRight
          className="size-4 shrink-0 text-muted transition-transform group-hover:translate-x-0.5 group-hover:text-accent"
          aria-hidden
        />
      </Link>
    </section>
  );
}

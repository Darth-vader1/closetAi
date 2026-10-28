"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  ArrowLeft,
  BookmarkCheck,
  Check,
  CloudSun,
  Layers,
  Loader2,
  Plus,
  Search,
  Send,
  Shirt,
  Sparkles,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import { saveStylistOutfitAction } from "@/app/(app)/stylist/actions";
import type {
  SharedItemCardData,
  SharedOutfitCardData,
} from "@/lib/connect/queries";
import type {
  StylistChatMessage,
  StylistProposedOutfitCard,
} from "@/lib/connect/stylist-chat-queries";
import { formatMessageDayLabel, formatMessageTime } from "@/lib/connect/format-relative";
import { useVisualViewport } from "@/lib/hooks/use-visual-viewport";
import { cn } from "@/lib/utils/cn";

const STARTER_PROMPTS = [
  {
    label: "✨ What should I wear today?",
    prompt: "What should I wear today based on my clean clothes and the weather?",
  },
  {
    label: "🧥 Style a specific item",
    openPicker: true,
    prompt: "How can I style this piece in 2 different ways?",
  },
  {
    label: "🍷 Dinner / Date Night look",
    prompt: "Put together an elevated dinner or date night outfit from my closet.",
  },
  {
    label: "🎉 Owambe / Celebration",
    prompt: "Help me style a standout celebration or Owambe look from my wardrobe.",
  },
  {
    label: "💼 Smart Work Outfit",
    prompt: "Build a polished work or smart-casual outfit from my clean pieces.",
  },
  {
    label: "🔍 Audit my wardrobe gaps",
    prompt: "Looking at my current closet, what key versatile pieces am I missing?",
  },
];

// ─── Inline Markdown Formatter (**bold**) ────────────────────────────────────

function renderFormattedText(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, idx) => {
    if (part.startsWith("**") && part.endsWith("**") && part.length > 4) {
      return (
        <strong key={idx} className="font-semibold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={idx}>{part}</span>;
  });
}

// ─── Shared Item & Outfit Cards inside Chat ──────────────────────────────────

function ChatSharedItemCard({ item }: { item: SharedItemCardData }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface text-foreground shadow-xs">
      <div className="flex items-center gap-3 p-2.5">
        <div className="size-14 shrink-0 overflow-hidden rounded-lg border border-border bg-surface-muted">
          {item.imageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={item.imageUrl}
              alt={item.name}
              className="size-full object-cover"
            />
          ) : (
            <div className="grid size-full place-items-center text-muted">
              <Shirt className="size-5" aria-hidden />
            </div>
          )}
        </div>
        <div className="min-w-0 flex-1">
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
          <p className="mt-0.5 truncate text-xs font-semibold text-foreground">
            {item.name}
          </p>
          {(item.style || item.material) && (
            <p className="mt-0.5 truncate text-[0.68rem] capitalize text-muted">
              {[item.style, item.material].filter(Boolean).join(" · ")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function ChatSharedOutfitCard({ outfit }: { outfit: SharedOutfitCardData }) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-surface p-3 text-foreground shadow-xs space-y-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-md bg-accent-soft px-1.5 py-0.5 text-[0.62rem] font-semibold uppercase tracking-wide text-accent">
              <Layers className="size-3" aria-hidden />
              Shared Outfit
            </span>
            {outfit.occasion && (
              <span className="truncate text-[0.68rem] capitalize text-muted">
                {outfit.occasion}
              </span>
            )}
          </div>
          <p className="mt-1 truncate text-xs font-semibold text-foreground">
            {outfit.name}
          </p>
        </div>
      </div>

      {outfit.items.length > 0 && (
        <div className="grid grid-cols-1 gap-1.5 min-[380px]:grid-cols-2 sm:grid-cols-3">
          {outfit.items.map((it) => (
            <div
              key={it.id}
              className="flex items-center gap-2 rounded-lg border border-border bg-background p-1.5"
            >
              <div className="size-9 shrink-0 overflow-hidden rounded-md bg-surface-muted">
                {it.imageUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={it.imageUrl}
                    alt={it.name}
                    className="size-full object-cover"
                  />
                ) : (
                  <div className="grid size-full place-items-center text-muted">
                    <Shirt className="size-3.5" aria-hidden />
                  </div>
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate text-[0.68rem] font-medium text-foreground">
                  {it.name}
                </p>
                <p className="truncate text-[0.62rem] capitalize text-muted">
                  {it.category}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProposedOutfitCardView({
  outfit,
}: {
  outfit: StylistProposedOutfitCard;
}) {
  const [saving, setSaving] = useState(false);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const handleSaveOutfit = async () => {
    if (saving || savedId) return;
    setSaving(true);
    setSaveError(null);
    const res = await saveStylistOutfitAction({
      name: outfit.name,
      occasion: outfit.occasion,
      itemIds: outfit.items.map((i) => i.id),
      styleDescription: outfit.styleDescription,
      explanation: outfit.explanation,
      stylingTip: outfit.stylingTip,
    });
    setSaving(false);
    if (res.ok) {
      setSavedId(res.id);
    } else {
      setSaveError(res.error);
    }
  };

  return (
    <div className="overflow-hidden rounded-2xl border border-accent/30 bg-surface p-3.5 text-foreground shadow-xs space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-md bg-accent-soft px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-wider text-accent">
              <Sparkles className="size-3" aria-hidden />
              Stylist Look
            </span>
            {outfit.occasion && (
              <span className="truncate text-[0.68rem] font-medium capitalize text-muted">
                · {outfit.occasion}
              </span>
            )}
          </div>
          <p className="mt-1 text-sm font-semibold text-foreground">
            {outfit.name}
          </p>
          {outfit.styleDescription && (
            <p className="text-xs text-muted">{outfit.styleDescription}</p>
          )}
        </div>

        <button
          type="button"
          onClick={handleSaveOutfit}
          disabled={saving || Boolean(savedId)}
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors",
            savedId
              ? "bg-success-soft text-success border border-success/30"
              : "bg-accent text-accent-foreground hover:bg-accent-hover disabled:opacity-50",
          )}
        >
          {saving ? (
            <>
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
              <span>Saving…</span>
            </>
          ) : savedId ? (
            <>
              <BookmarkCheck className="size-3.5" aria-hidden />
              <span>Saved</span>
            </>
          ) : (
            <>
              <Plus className="size-3.5" aria-hidden />
              <span>Save Outfit</span>
            </>
          )}
        </button>
      </div>

      {/* Outfit pieces grid */}
      <div className="grid grid-cols-1 gap-2 min-[380px]:grid-cols-2 sm:grid-cols-3">
        {outfit.items.map((it) => (
          <div
            key={it.id}
            className="flex items-center gap-2.5 rounded-xl border border-border bg-background p-2"
          >
            <div className="size-11 shrink-0 overflow-hidden rounded-lg border border-border bg-surface-muted">
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
            <div className="min-w-0">
              <p className="truncate text-xs font-semibold text-foreground">
                {it.name}
              </p>
              <p className="truncate text-[0.65rem] capitalize text-muted">
                {it.category}
                {it.primaryColour ? ` · ${it.primaryColour}` : ""}
              </p>
            </div>
          </div>
        ))}
      </div>

      {outfit.explanation && (
        <p className="text-xs leading-relaxed text-foreground/90">
          {outfit.explanation}
        </p>
      )}

      {outfit.stylingTip && (
        <div className="rounded-xl bg-accent-soft/35 px-3 py-2 text-[0.72rem] leading-snug text-foreground">
          <Sparkles className="mr-1.5 inline size-3.5 text-accent" aria-hidden />
          <span className="font-semibold">Styling tip:</span> {outfit.stylingTip}
        </div>
      )}

      {saveError && (
        <p className="text-xs text-danger" role="alert">
          {saveError}
        </p>
      )}
    </div>
  );
}

// ─── Main StylistChatThread Component ─────────────────────────────────────────

interface StylistChatThreadProps {
  currentUserId: string;
  initialMessages: StylistChatMessage[];
  shareableItems: SharedItemCardData[];
  shareableOutfits: SharedOutfitCardData[];
  weatherSummary: string | null;
  cleanCount: number;
  referenceNowMs: number;
  timeZone: string;
}

function makeOptimisticUserId(): string {
  return `optimistic-user-${Date.now()}`;
}

export function StylistChatThread({
  currentUserId,
  initialMessages,
  shareableItems,
  shareableOutfits,
  weatherSummary,
  cleanCount,
  referenceNowMs,
  timeZone,
}: StylistChatThreadProps) {
  const storageKey = `closetai_stylist_chat_v1_${currentUserId}`;
  const [messages, setMessages] = useState<StylistChatMessage[]>(initialMessages);
  const [body, setBody] = useState("");
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const [selectedOutfitIds, setSelectedOutfitIds] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTab, setPickerTab] = useState<"items" | "outfits">("items");
  const [pickerSearch, setPickerSearch] = useState("");
  const [pickerCategory, setPickerCategory] = useState("all");
  const [isSending, setIsSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const initialScrollDone = useRef(false);
  const { isKeyboardOpen } = useVisualViewport();

  const itemMap = useMemo(
    () => new Map(shareableItems.map((it) => [it.id, it])),
    [shareableItems],
  );
  const outfitMap = useMemo(
    () => new Map(shareableOutfits.map((o) => [o.id, o])),
    [shareableOutfits],
  );

  // Hydrate from localStorage if DB returned empty (e.g. before migration is applied)
  useEffect(() => {
    if (initialMessages.length > 0) {
      try {
        localStorage.setItem(storageKey, JSON.stringify(initialMessages.slice(-40)));
      } catch {
        // ignore storage quota errors
      }
      return;
    }
    try {
      const cached = localStorage.getItem(storageKey);
      if (cached) {
        const parsed = JSON.parse(cached) as StylistChatMessage[];
        if (Array.isArray(parsed) && parsed.length > 0) {
          queueMicrotask(() => {
            setMessages(parsed);
          });
        }
      }
    } catch {
      // ignore invalid cache
    }
  }, [initialMessages, storageKey]);

  const persistMessagesLocally = (next: StylistChatMessage[]) => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(next.slice(-40)));
    } catch {
      // ignore
    }
  };

  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    const el = scrollContainerRef.current;
    if (!el) return;
    if (el.scrollHeight <= el.clientHeight) {
      el.scrollTop = 0;
      return;
    }
    el.scrollTo({
      top: el.scrollHeight,
      behavior,
    });
  };

  useEffect(() => {
    if (!initialScrollDone.current && messages.length > 0) {
      scrollToBottom("auto");
      initialScrollDone.current = true;
    } else {
      scrollToBottom("smooth");
    }
  }, [messages.length, isSending]);

  useEffect(() => {
    if (isKeyboardOpen) {
      const timer = setTimeout(() => scrollToBottom("smooth"), 60);
      return () => clearTimeout(timer);
    }
  }, [isKeyboardOpen]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const item of shareableItems) {
      if (item.category) set.add(item.category);
    }
    return ["all", ...Array.from(set)];
  }, [shareableItems]);

  const filteredItems = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    return shareableItems.filter((it) => {
      if (pickerCategory !== "all" && it.category !== pickerCategory) return false;
      if (!q) return true;
      return (
        it.name.toLowerCase().includes(q) ||
        it.category.toLowerCase().includes(q) ||
        (it.primaryColour?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [shareableItems, pickerSearch, pickerCategory]);

  const filteredOutfits = useMemo(() => {
    const q = pickerSearch.trim().toLowerCase();
    if (!q) return shareableOutfits;
    return shareableOutfits.filter(
      (o) =>
        o.name.toLowerCase().includes(q) ||
        (o.occasion?.toLowerCase().includes(q) ?? false) ||
        (o.styleDescription?.toLowerCase().includes(q) ?? false),
    );
  }, [shareableOutfits, pickerSearch]);

  const toggleItem = (id: string) => {
    setSelectedItemIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 8) return prev;
      return [...prev, id];
    });
  };

  const toggleOutfit = (id: string) => {
    setSelectedOutfitIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 4) return prev;
      return [...prev, id];
    });
  };

  const selectedItems = selectedItemIds
    .map((id) => itemMap.get(id))
    .filter((x): x is SharedItemCardData => Boolean(x));

  const selectedOutfits = selectedOutfitIds
    .map((id) => outfitMap.get(id))
    .filter((x): x is SharedOutfitCardData => Boolean(x));

  const handleSend = async (overridePrompt?: string) => {
    const textToSend = (overridePrompt ?? body).trim();
    if (
      isSending ||
      (!textToSend && selectedItemIds.length === 0 && selectedOutfitIds.length === 0)
    ) {
      return;
    }

    const itemIdsToSend = [...selectedItemIds];
    const outfitIdsToSend = [...selectedOutfitIds];
    const attachedItemsPreview = [...selectedItems];
    const attachedOutfitsPreview = [...selectedOutfits];

    const effectiveBody =
      textToSend ||
      (attachedOutfitsPreview.length > 0 && attachedItemsPreview.length > 0
        ? "What do you think of these pieces and saved outfits? How should I style them?"
        : attachedOutfitsPreview.length > 0
          ? attachedOutfitsPreview.length === 1
            ? `What do you think of my "${attachedOutfitsPreview[0].name}" outfit? How can I style or elevate it?`
            : "Which of these saved outfits works best, and how would you style them?"
          : attachedItemsPreview.length === 1
            ? `How can I style my ${attachedItemsPreview[0].name} using pieces from my closet?`
            : "How can I style these pieces from my closet together or into outfits?");

    const optimisticUserMsg: StylistChatMessage = {
      id: makeOptimisticUserId(),
      role: "user",
      body: effectiveBody,
      createdAt: new Date().toISOString(),
      attachedItems: attachedItemsPreview,
      attachedOutfits: attachedOutfitsPreview,
      referencedItems: [],
      proposedOutfits: [],
      quickReplies: [],
    };

    const historyPayload = messages.slice(-14).map((m) => ({
      role: m.role,
      body: m.body,
      attachedItemNames: m.attachedItems.map((i) => i.name),
      attachedOutfitNames: m.attachedOutfits.map((o) => o.name),
    }));

    setBody("");
    setSelectedItemIds([]);
    setSelectedOutfitIds([]);
    setSendError(null);
    setIsSending(true);
    if (textareaRef.current) {
      textareaRef.current.style.height = "44px";
    }

    const withOptimistic = [...messages, optimisticUserMsg];
    setMessages(withOptimistic);

    try {
      const res = await fetch("/api/ai/stylist/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: effectiveBody,
          itemIds: itemIdsToSend,
          outfitIds: outfitIdsToSend,
          history: historyPayload,
          weather: weatherSummary ?? undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.status !== "ok") {
        throw new Error(data.error || data.reason || "Could not reach @ClosetAI Stylist.");
      }

      const confirmedUser = data.userMessage as StylistChatMessage;
      const assistantMsg = data.assistantMessage as StylistChatMessage;

      setMessages((prev) => {
        const withoutOptimistic = prev.filter((m) => m.id !== optimisticUserMsg.id);
        const updated = [...withoutOptimistic, confirmedUser, assistantMsg];
        persistMessagesLocally(updated);
        return updated;
      });
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Something went wrong. Please try again.";
      setSendError(msg);
      // Roll back optimistic message and restore composer state
      setMessages((prev) => prev.filter((m) => m.id !== optimisticUserMsg.id));
      if (!overridePrompt) setBody(textToSend);
      setSelectedItemIds(itemIdsToSend);
      setSelectedOutfitIds(outfitIdsToSend);
    } finally {
      setIsSending(false);
    }
  };

  const handleClearChat = async () => {
    setMessages([]);
    setSendError(null);
    try {
      localStorage.removeItem(storageKey);
    } catch {
      // ignore
    }
    await fetch("/api/ai/stylist/chat", { method: "DELETE" }).catch(() => {});
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Group messages by day
  type DayGroup = { day: string; messages: StylistChatMessage[] };
  const groups: DayGroup[] = [];
  for (const msg of messages) {
    const day = formatMessageDayLabel(msg.createdAt, referenceNowMs, timeZone);
    const last = groups[groups.length - 1];
    if (last && last.day === day) {
      last.messages.push(msg);
    } else {
      groups.push({ day, messages: [msg] });
    }
  }

  const lastMessage = messages[messages.length - 1];
  const activeQuickReplies =
    !isSending && lastMessage?.role === "assistant" ? lastMessage.quickReplies : [];

  const totalSelected = selectedItemIds.length + selectedOutfitIds.length;

  return (
    <div className="flex flex-col h-full min-h-0 flex-1 overflow-hidden">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between gap-2 border-b border-border bg-surface/95 px-3 py-2.5 sm:mb-3 sm:border-b-0 sm:bg-transparent sm:px-0 sm:py-0 backdrop-blur-sm pt-[max(0.5rem,env(safe-area-inset-top))] sm:pt-0">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
          <Link
            href="/connect"
            className="inline-flex min-h-11 shrink-0 items-center gap-2 text-sm font-medium text-muted hover:text-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden />
            <span className="sr-only sm:not-sr-only">Inbox</span>
          </Link>

          <span
            className="relative grid size-9 sm:size-10 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground shadow-xs"
            aria-hidden
          >
            <Sparkles className="size-4 sm:size-5" />
            <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-surface bg-success" />
          </span>

          <div className="min-w-0">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <p className="truncate text-sm font-semibold text-foreground">
                ClosetAI Stylist
              </p>
              <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[0.65rem] font-bold text-accent">
                AI Stylist
              </span>
              <span className="hidden font-mono text-xs text-muted md:inline">
                @stylist
              </span>
            </div>
            <p className="truncate text-[0.7rem] text-muted">
              Knows your {cleanCount} clean {cleanCount === 1 ? "piece" : "pieces"}
              {weatherSummary ? ` · ${weatherSummary}` : " · Share clothes & outfits anytime"}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <Link
            href="/stylist"
            className="inline-flex min-h-9 items-center gap-1.5 rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-foreground transition-colors hover:bg-surface-muted"
            title="Open 3D Outfit Studio & Generator"
          >
            <Wand2 className="size-3.5 text-accent" aria-hidden />
            <span className="hidden sm:inline">3D Studio</span>
          </Link>

          {messages.length > 0 && (
            <button
              type="button"
              onClick={handleClearChat}
              title="Clear chat history"
              aria-label="Clear chat history"
              className="inline-flex min-h-9 items-center gap-1 rounded-xl border border-border bg-surface px-2.5 py-1.5 text-xs font-medium text-muted transition-colors hover:border-danger/40 hover:bg-danger-soft hover:text-danger"
            >
              <Trash2 className="size-3.5" aria-hidden />
              <span className="hidden md:inline">Clear</span>
            </button>
          )}
        </div>
      </div>

      {/* Main Chat Container */}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-none sm:rounded-[1.25rem] border-0 sm:border border-border bg-surface">
        {/* Scrollable Message History */}
        <div
          ref={scrollContainerRef}
          className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-3 py-4 sm:px-4 space-y-6"
          role="log"
          aria-label="Stylist chat history"
          aria-live="polite"
        >
          {groups.length === 0 ? (
            <div className="mx-auto max-w-xl py-6 sm:py-10 space-y-6">
              <div className="rounded-2xl border border-accent/25 bg-accent-soft/25 p-5 text-center space-y-2.5">
                <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-accent text-accent-foreground shadow-sm">
                  <Sparkles className="size-6" aria-hidden />
                </div>
                <h2 className="text-base font-semibold text-foreground">
                  Chat with @ClosetAI Stylist
                </h2>
                <p className="text-xs leading-relaxed text-muted max-w-md mx-auto">
                  Ask for fashion advice, tap <strong>Share closet</strong> below to attach
                  specific clothes or saved outfits, or let me build a complete look from
                  your real wardrobe.
                </p>
                {weatherSummary && (
                  <p className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-[0.7rem] font-medium text-foreground">
                    <CloudSun className="size-3.5 text-accent" aria-hidden />
                    <span>{weatherSummary}</span>
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <p className="text-center text-xs font-semibold uppercase tracking-wider text-muted">
                  Try asking or sharing
                </p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {STARTER_PROMPTS.map((item) => (
                    <button
                      key={item.label}
                      type="button"
                      onClick={() => {
                        if (item.openPicker) {
                          setBody(item.prompt);
                          setPickerOpen(true);
                        } else {
                          handleSend(item.prompt);
                        }
                      }}
                      className="flex items-center justify-between gap-2 rounded-xl border border-border bg-background px-3.5 py-3 text-left text-xs font-medium text-foreground transition-colors hover:border-accent/50 hover:bg-surface-muted"
                    >
                      <span>{item.label}</span>
                      <span className="text-accent" aria-hidden>
                        →
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.day} className="space-y-4">
                <div
                  className="flex items-center gap-3"
                  aria-label={`Messages from ${group.day}`}
                >
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-xs text-muted">{group.day}</span>
                  <div className="h-px flex-1 bg-border" />
                </div>

                {group.messages.map((msg) => {
                  const isMine = msg.role === "user";
                  const isOptimistic = msg.id.startsWith("optimistic-");

                  return (
                    <div
                      key={msg.id}
                      className={cn(
                        "flex gap-2.5 w-full",
                        isMine ? "justify-end" : "justify-start",
                      )}
                    >
                      {!isMine && (
                        <span
                          className="mt-auto grid size-7 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground shadow-2xs"
                          aria-hidden
                        >
                          <Sparkles className="size-3.5" />
                        </span>
                      )}

                      <div
                        className={cn(
                          "max-w-[88%] sm:max-w-[78%] space-y-2 flex flex-col",
                          isMine ? "items-end" : "items-start",
                        )}
                      >
                        <div
                          className={cn(
                            "rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                            isMine
                              ? "rounded-br-sm bg-accent text-accent-foreground"
                              : "rounded-bl-sm bg-surface-muted text-foreground",
                            isOptimistic && "opacity-75",
                          )}
                        >
                          <p className="whitespace-pre-wrap break-words">
                            {renderFormattedText(msg.body)}
                          </p>
                        </div>

                        {/* User-shared Clothing Items */}
                        {msg.attachedItems.length > 0 && (
                          <div className="w-full max-w-md space-y-2">
                            {msg.attachedItems.map((it) => (
                              <ChatSharedItemCard key={it.id} item={it} />
                            ))}
                          </div>
                        )}

                        {/* User-shared Saved Outfits */}
                        {msg.attachedOutfits.length > 0 && (
                          <div className="w-full max-w-md space-y-2">
                            {msg.attachedOutfits.map((o) => (
                              <ChatSharedOutfitCard key={o.id} outfit={o} />
                            ))}
                          </div>
                        )}

                        {/* AI-referenced Closet Items */}
                        {!isMine && msg.referencedItems.length > 0 && (
                          <div className="w-full max-w-md space-y-1.5">
                            <p className="px-1 text-[0.68rem] font-semibold uppercase tracking-wider text-muted">
                              From your closet
                            </p>
                            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                              {msg.referencedItems.map((it) => (
                                <ChatSharedItemCard key={it.id} item={it} />
                              ))}
                            </div>
                          </div>
                        )}

                        {/* AI-proposed Complete Outfits */}
                        {!isMine && msg.proposedOutfits.length > 0 && (
                          <div className="w-full max-w-lg space-y-2.5">
                            {msg.proposedOutfits.map((po, idx) => (
                              <ProposedOutfitCardView
                                key={`${msg.id}-outfit-${idx}`}
                                outfit={po}
                              />
                            ))}
                          </div>
                        )}

                        <span className="px-1 text-[0.65rem] text-muted">
                          {formatMessageTime(msg.createdAt, timeZone)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))
          )}

          {/* Typing indicator while AI is thinking */}
          {isSending && (
            <div className="flex items-end gap-2.5 justify-start animate-in fade-in duration-150">
              <span
                className="grid size-7 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground"
                aria-hidden
              >
                <Sparkles className="size-3.5" />
              </span>
              <div className="rounded-2xl rounded-bl-sm bg-surface-muted px-4 py-3 text-xs text-muted flex items-center gap-2">
                <Loader2 className="size-3.5 animate-spin text-accent" aria-hidden />
                <span>Looking through your closet &amp; styling…</span>
              </div>
            </div>
          )}

          {/* Follow-up Quick Replies */}
          {activeQuickReplies.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 pt-1 pl-9">
              {activeQuickReplies.map((qr) => (
                <button
                  key={qr}
                  type="button"
                  onClick={() => handleSend(qr)}
                  className="inline-flex items-center gap-1.5 rounded-full border border-accent/35 bg-accent-soft/30 px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-accent hover:bg-accent-soft"
                >
                  <Sparkles className="size-3 text-accent" aria-hidden />
                  <span>{qr}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Error Banner */}
        {sendError && (
          <div
            className="border-t border-danger/20 bg-danger-soft px-4 py-2 text-xs text-danger"
            role="alert"
          >
            {sendError}
          </div>
        )}

        {/* Composer */}
        <div
          className={cn(
            "border-t border-border bg-surface px-3 py-2.5 sm:px-4 sm:py-3 shrink-0 transition-[padding] duration-150",
            isKeyboardOpen
              ? "pb-2.5 sm:pb-3"
              : "pb-[max(0.625rem,env(safe-area-inset-bottom))] sm:pb-3",
          )}
        >
          {/* Attached Items & Outfits Preview Chips */}
          {(selectedItems.length > 0 || selectedOutfits.length > 0) && (
            <div className="mb-2.5 flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
              {selectedItems.map((item) => (
                <div
                  key={item.id}
                  className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-accent/40 bg-accent-soft/30 p-1.5 pr-2.5 text-xs"
                >
                  <div className="size-7 shrink-0 overflow-hidden rounded-lg bg-surface-muted">
                    {item.imageUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={item.imageUrl}
                        alt={item.name}
                        className="size-full object-cover"
                      />
                    ) : (
                      <div className="grid size-full place-items-center text-muted">
                        <Shirt className="size-3.5" aria-hidden />
                      </div>
                    )}
                  </div>
                  <span className="max-w-[120px] truncate font-medium text-foreground">
                    {item.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleItem(item.id)}
                    aria-label={`Remove ${item.name}`}
                    className="rounded-full p-0.5 text-muted hover:bg-surface hover:text-foreground"
                  >
                    <X className="size-3" aria-hidden />
                  </button>
                </div>
              ))}

              {selectedOutfits.map((outfit) => (
                <div
                  key={outfit.id}
                  className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-accent/40 bg-accent-soft/30 px-2.5 py-1.5 text-xs"
                >
                  <Layers className="size-3.5 text-accent" aria-hidden />
                  <span className="max-w-[130px] truncate font-medium text-foreground">
                    {outfit.name}
                  </span>
                  <button
                    type="button"
                    onClick={() => toggleOutfit(outfit.id)}
                    aria-label={`Remove ${outfit.name}`}
                    className="rounded-full p-0.5 text-muted hover:bg-surface hover:text-foreground"
                  >
                    <X className="size-3" aria-hidden />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-end gap-2">
            <button
              type="button"
              onClick={() => setPickerOpen(true)}
              disabled={isSending}
              aria-label="Share clothes or saved outfits with AI Stylist"
              title="Share clothes or saved outfits with AI Stylist"
              className={cn(
                "inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl border px-3 text-xs font-medium transition-colors disabled:opacity-40",
                totalSelected > 0
                  ? "border-accent bg-accent-soft/40 text-accent"
                  : "border-border-strong bg-background text-foreground hover:bg-surface-muted",
              )}
            >
              <Plus className="size-4 text-accent" aria-hidden />
              <span className="hidden sm:inline">
                {totalSelected > 0 ? `Shared (${totalSelected})` : "Share closet"}
              </span>
            </button>

            <textarea
              ref={textareaRef}
              value={body}
              disabled={isSending}
              onFocus={() => setTimeout(() => scrollToBottom("smooth"), 100)}
              onChange={(e) => {
                const prevHeight = e.target.style.height;
                setBody(e.target.value);
                e.target.style.height = "auto";
                const newHeight = `${Math.min(e.target.scrollHeight, 140)}px`;
                e.target.style.height = newHeight;
                if (prevHeight !== newHeight) {
                  scrollToBottom("auto");
                }
              }}
              onKeyDown={handleKeyDown}
              placeholder={
                totalSelected > 0
                  ? "Ask a question about these pieces, or press Send…"
                  : "Ask @ClosetAI Stylist for fashion advice, outfit ideas…"
              }
              aria-label="Message @ClosetAI Stylist"
              rows={1}
              className="flex-1 resize-none overflow-hidden rounded-xl border border-border-strong bg-background px-4 py-2.5 text-base sm:text-sm leading-relaxed text-foreground placeholder:text-muted/70 focus-visible:border-accent focus-visible:outline-none disabled:opacity-50"
              style={{ minHeight: "44px", maxHeight: "140px" }}
            />

            <button
              type="button"
              onClick={() => handleSend()}
              disabled={(!body.trim() && totalSelected === 0) || isSending}
              aria-label="Send message"
              className="grid size-11 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground transition-opacity disabled:opacity-40 hover:bg-accent-hover"
            >
              {isSending ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : (
                <Send className="size-4" aria-hidden />
              )}
            </button>
          </div>

          <p className="mt-1.5 hidden text-[0.65rem] text-muted sm:block">
            Enter to send · Shift+Enter for new line · Use &ldquo;Share closet&rdquo; to attach
            clothes or outfits for styling advice
          </p>
        </div>
      </div>

      {/* Share Closet Modal Picker */}
      {pickerOpen &&
        (() => {
          const modal = (
            <div
              className="fixed inset-0 z-50 flex items-end justify-center bg-black/55 p-0 sm:items-center sm:p-4 backdrop-blur-xs"
              role="dialog"
              aria-modal="true"
              aria-labelledby="stylist-share-picker-title"
            >
              <div className="flex max-h-[90dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl border border-border bg-surface shadow-xl sm:rounded-2xl">
                <div className="flex items-center justify-between border-b border-border px-4 py-3.5 sm:px-5 sm:py-4">
                  <div className="min-w-0 flex-1 pr-2">
                    <h2
                      id="stylist-share-picker-title"
                      className="truncate text-sm sm:text-base font-semibold text-foreground"
                    >
                      Share with @ClosetAI Stylist
                    </h2>
                    <p className="line-clamp-1 text-xs text-muted sm:line-clamp-none">
                      Select clothes or saved outfits to ask how to style, pair, or compare them.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setPickerOpen(false)}
                    aria-label="Close closet picker"
                    className="grid size-8 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-muted hover:text-foreground"
                  >
                    <X className="size-4" aria-hidden />
                  </button>
                </div>

                {/* Tabs & Search */}
                <div className="border-b border-border px-4 py-3 sm:px-5 space-y-3">
                  <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar sm:overflow-visible sm:pb-0">
                    <button
                      type="button"
                      onClick={() => setPickerTab("items")}
                      className={cn(
                        "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                        pickerTab === "items"
                          ? "bg-accent text-accent-foreground"
                          : "bg-surface-muted text-muted hover:text-foreground",
                      )}
                    >
                      <Shirt className="size-3.5 shrink-0" aria-hidden />
                      <span>Clothing Items</span> ({shareableItems.length})
                      {selectedItemIds.length > 0 && (
                        <span className="ml-1 rounded-full bg-background/20 px-1.5 py-0.2 text-[0.65rem]">
                          {selectedItemIds.length}
                        </span>
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={() => setPickerTab("outfits")}
                      className={cn(
                        "inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors",
                        pickerTab === "outfits"
                          ? "bg-accent text-accent-foreground"
                          : "bg-surface-muted text-muted hover:text-foreground",
                      )}
                    >
                      <Layers className="size-3.5 shrink-0" aria-hidden />
                      <span>Saved Outfits</span> ({shareableOutfits.length})
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
                        value={pickerSearch}
                        onChange={(e) => setPickerSearch(e.target.value)}
                        placeholder={
                          pickerTab === "items"
                            ? "Search items by name, category, colour…"
                            : "Search saved outfits…"
                        }
                        className="w-full rounded-lg border border-border bg-background py-1.5 pl-8 pr-3 text-xs text-foreground placeholder:text-muted focus-visible:border-accent focus-visible:outline-none"
                      />
                    </div>

                    {pickerTab === "items" && categories.length > 2 && (
                      <div className="flex items-center gap-1 overflow-x-auto pb-0.5">
                        {categories.map((cat) => (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => setPickerCategory(cat)}
                            className={cn(
                              "rounded-full px-2.5 py-1 text-[0.7rem] font-medium capitalize transition-colors",
                              pickerCategory === cat
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

                {/* Grid */}
                <div className="flex-1 overflow-y-auto p-5">
                  {pickerTab === "items" ? (
                    filteredItems.length === 0 ? (
                      <p className="py-12 text-center text-sm text-muted">
                        {shareableItems.length === 0
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
                      {shareableOutfits.length === 0
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
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="border-t border-border bg-surface px-5 py-3.5 flex flex-wrap items-center justify-between gap-2.5">
                  <p className="min-w-0 flex-1 truncate text-xs text-muted">
                    {totalSelected === 0
                      ? "Select up to 8 items and 4 outfits"
                      : `${selectedItemIds.length} item(s), ${selectedOutfitIds.length} outfit(s) attached`}
                  </p>
                  <div className="flex shrink-0 items-center gap-2 ml-auto">
                    {totalSelected > 0 && (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedItemIds([]);
                          setSelectedOutfitIds([]);
                        }}
                        className="rounded-lg px-3 py-2 text-xs font-medium text-muted hover:bg-surface-muted hover:text-foreground"
                      >
                        Clear
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => {
                        setPickerOpen(false);
                        setTimeout(() => textareaRef.current?.focus(), 80);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-accent-foreground transition-opacity hover:bg-accent-hover"
                    >
                      {totalSelected > 0 ? `Done (${totalSelected})` : "Close"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
          return typeof document !== "undefined" ? createPortal(modal, document.body) : modal;
        })()}
    </div>
  );
}

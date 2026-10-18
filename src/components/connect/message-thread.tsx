"use client";

import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  deleteMessageAction,
  hydrateMessageAttachmentsAction,
  loadMoreMessagesAction,
  markReadAction,
  revokeAttachmentAction,
  sendMessageAction,
} from "@/app/(app)/connect/actions";
import type {
  Message,
  MessageAttachment,
  SharedItemCardData,
  SharedOutfitCardData,
} from "@/lib/connect/queries";
import { formatMessageDayLabel, formatMessageTime } from "@/lib/connect/format-relative";
import { SharePickerDialog } from "@/components/connect/share-picker-dialog";
import { PendingRequestActions } from "@/components/connect/conversation-safety-menu";
import {
  ChevronUp,
  EyeOff,
  Layers,
  Loader2,
  Reply,
  Send,
  ShieldAlert,
  Shirt,
  Sparkles,
  Trash2,
  WifiOff,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";

// ─── Attachment Card Subcomponents ────────────────────────────────────────────

function SharedAttachmentView({
  attachment,
  isOwner,
  onRevoke,
  revokingId,
}: {
  attachment: MessageAttachment;
  isOwner: boolean;
  onRevoke: (attachmentId: string) => void;
  revokingId: string | null;
}) {
  if (attachment.revokedAt || (!attachment.item && !attachment.outfit)) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-border bg-surface-muted/70 px-3 py-2 text-xs text-muted">
        <EyeOff className="size-3.5 shrink-0" aria-hidden />
        <span>
          Shared {attachment.kind === "outfit" ? "outfit" : "clothing item"} is no longer
          available.
        </span>
      </div>
    );
  }

  if (attachment.kind === "item" && attachment.item) {
    const item = attachment.item;
    return (
      <div className="overflow-hidden rounded-xl border border-border bg-surface text-foreground shadow-xs">
        <div className="flex items-center gap-3 p-2.5">
          <div className="size-16 shrink-0 overflow-hidden rounded-lg border border-border bg-surface-muted">
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
            {(item.style || item.material || item.occasions.length > 0) && (
              <p className="mt-0.5 truncate text-[0.68rem] capitalize text-muted">
                {[item.style, item.material, item.occasions[0]]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            )}
          </div>

          {isOwner && (
            <button
              type="button"
              onClick={() => onRevoke(attachment.id)}
              disabled={revokingId === attachment.id}
              title="Unshare this item from the conversation"
              className="shrink-0 rounded-lg border border-border px-2.5 py-1.5 sm:px-2 sm:py-1 min-h-[30px] sm:min-h-0 text-[0.68rem] font-medium text-muted transition-colors hover:border-danger/40 hover:bg-danger-soft hover:text-danger disabled:opacity-40"
            >
              {revokingId === attachment.id ? "…" : "Unshare"}
            </button>
          )}
        </div>
      </div>
    );
  }

  if (attachment.kind === "outfit" && attachment.outfit) {
    const outfit = attachment.outfit;
    return (
      <div className="overflow-hidden rounded-xl border border-border bg-surface p-3 text-foreground shadow-xs space-y-2.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="inline-flex items-center gap-1 rounded-md bg-accent-soft px-1.5 py-0.5 text-[0.62rem] font-semibold uppercase tracking-wide text-accent">
                <Layers className="size-3" aria-hidden />
                Saved Outfit
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

          {isOwner && (
            <button
              type="button"
              onClick={() => onRevoke(attachment.id)}
              disabled={revokingId === attachment.id}
              title="Unshare this outfit from the conversation"
              className="shrink-0 rounded-lg border border-border px-2.5 py-1.5 sm:px-2 sm:py-1 min-h-[30px] sm:min-h-0 text-[0.68rem] font-medium text-muted transition-colors hover:border-danger/40 hover:bg-danger-soft hover:text-danger disabled:opacity-40"
            >
              {revokingId === attachment.id ? "…" : "Unshare"}
            </button>
          )}
        </div>

        {/* Constituent items */}
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

        {(outfit.styleDescription || outfit.stylingTip) && (
          <p className="text-[0.7rem] leading-snug text-muted">
            <Sparkles className="mr-1 inline size-3 text-accent" aria-hidden />
            {outfit.stylingTip ?? outfit.styleDescription}
          </p>
        )}
      </div>
    );
  }

  return null;
}

// ─── WhatsApp-style Quoted Reply Parsing ──────────────────────────────────────

export interface MessageReplyContext {
  id: string;
  senderName: string;
  snippet: string;
}

export function parseMessageBody(rawBody: string): {
  reply: MessageReplyContext | null;
  text: string;
} {
  if (!rawBody) return { reply: null, text: "" };
  const match = rawBody.match(/^<!--reply:(\{.*?\})-->\s*(?:> [^\n]*(?:\n> [^\n]*)*\s*)?([\s\S]*)$/);
  if (match) {
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed && typeof parsed === "object" && parsed.sender) {
        return {
          reply: {
            id: String(parsed.id || ""),
            senderName: String(parsed.sender || ""),
            snippet: String(parsed.snippet || ""),
          },
          text: match[2].trim(),
        };
      }
    } catch {
      // ignore JSON parse error, fallback to raw text
    }
  }
  return { reply: null, text: rawBody };
}

export function getMessagePreviewText(msg: Message): string {
  if (msg.deletedAt) return "This message was deleted.";
  const { text } = parseMessageBody(msg.body);
  if (text.trim()) return text;
  if (msg.attachments && msg.attachments.length > 0) {
    const first = msg.attachments[0];
    if (first.kind === "outfit" && first.outfit) {
      return `Saved outfit: ${first.outfit.name}`;
    }
    if (first.kind === "item" && first.item) {
      return `Clothing item: ${first.item.name}`;
    }
    return "Shared attachment";
  }
  return "Message";
}

// ─── Swipeable Message Row (WhatsApp swipe-to-reply) ──────────────────────────

interface SwipeableMessageRowProps {
  msg: Message;
  isMine: boolean;
  isOptimistic: boolean;
  isDeleted: boolean;
  hoveredMsgId: string | null;
  setHoveredMsgId: (id: string | null) => void;
  onReply: (msg: Message) => void;
  onDelete: (id: string) => void;
  onJumpToQuoted: (id: string) => void;
  timeZone: string;
  otherMemberName: string;
  onRevokeAttachment: (attachmentId: string) => void;
  revokingId: string | null;
  currentUserId: string;
}

function SwipeableMessageRow({
  msg,
  isMine,
  isOptimistic,
  isDeleted,
  hoveredMsgId,
  setHoveredMsgId,
  onReply,
  onDelete,
  onJumpToQuoted,
  timeZone,
  otherMemberName,
  onRevokeAttachment,
  revokingId,
  currentUserId,
}: SwipeableMessageRowProps) {
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const touchStartPos = useRef<{ x: number; y: number } | null>(null);
  const isHorizontalSwipe = useRef<boolean | null>(null);
  const vibratedRef = useRef(false);

  const parsed = parseMessageBody(msg.body);
  const attachments = msg.attachments ?? [];
  const SWIPE_THRESHOLD = 45;

  const handleTouchStart = (e: React.TouchEvent) => {
    if (isDeleted || isOptimistic) return;
    const t = e.touches[0];
    touchStartPos.current = { x: t.clientX, y: t.clientY };
    isHorizontalSwipe.current = null;
    vibratedRef.current = false;
    setIsSwiping(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!touchStartPos.current || isDeleted || isOptimistic) return;
    const t = e.touches[0];
    const dx = t.clientX - touchStartPos.current.x;
    const dy = t.clientY - touchStartPos.current.y;

    if (isHorizontalSwipe.current === null) {
      if (Math.abs(dy) > 7 && Math.abs(dy) > Math.abs(dx)) {
        // Natural vertical scroll: do not intercept
        isHorizontalSwipe.current = false;
        return;
      }
      if (dx > 7 && dx > Math.abs(dy)) {
        // Intentional swipe right to reply
        isHorizontalSwipe.current = true;
      }
    }

    if (isHorizontalSwipe.current) {
      // Elastic resistance curve, capping at 72px
      const offset = Math.min(Math.max(0, dx * 0.55), 72);
      setSwipeOffset(offset);

      if (offset >= SWIPE_THRESHOLD && !vibratedRef.current) {
        vibratedRef.current = true;
        if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
          try {
            navigator.vibrate(15);
          } catch {
            // Mobile browser may restrict vibration without user gesture
          }
        }
      } else if (offset < SWIPE_THRESHOLD) {
        vibratedRef.current = false;
      }
    }
  };

  const handleTouchEnd = () => {
    if (isHorizontalSwipe.current && swipeOffset >= SWIPE_THRESHOLD) {
      onReply(msg);
    }
    touchStartPos.current = null;
    isHorizontalSwipe.current = null;
    vibratedRef.current = false;
    setIsSwiping(false);
    setSwipeOffset(0);
  };

  const isReadyToTrigger = swipeOffset >= SWIPE_THRESHOLD;

  return (
    <div
      id={`msg-${msg.id}`}
      className="relative w-full overflow-hidden select-none sm:select-auto touch-pan-y"
    >
      {/* WhatsApp swipe-to-reply reveal indicator */}
      <div
        className={cn(
          "absolute left-2 sm:left-3 top-1/2 -translate-y-1/2 z-10 grid size-8 place-items-center rounded-full transition-all pointer-events-none",
          isReadyToTrigger
            ? "bg-accent text-accent-foreground scale-110 shadow-sm ring-2 ring-accent/30"
            : "bg-surface-muted/90 text-muted border border-border scale-90",
        )}
        style={{
          opacity: Math.min(swipeOffset / 26, 1),
          transform: `translateY(-50%) scale(${0.7 + Math.min(swipeOffset / SWIPE_THRESHOLD, 1) * 0.35})`,
        }}
        aria-hidden
      >
        <Reply className="size-4 shrink-0" />
      </div>

      {/* Sliding message row */}
      <div
        className={cn("group flex gap-2 w-full", isMine ? "justify-end" : "justify-start")}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={handleTouchEnd}
        onMouseEnter={() => !isDeleted && !isOptimistic && setHoveredMsgId(msg.id)}
        onMouseLeave={() => setHoveredMsgId(null)}
        style={{
          transform: swipeOffset > 0 ? `translateX(${swipeOffset}px)` : undefined,
          transition: isSwiping ? "none" : "transform 0.22s cubic-bezier(0.18, 0.89, 0.32, 1.28)",
          willChange: swipeOffset > 0 ? "transform" : undefined,
        }}
      >
        {/* Other person's avatar */}
        {!isMine && (
          <span
            className="mt-auto grid size-7 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-semibold text-accent"
            aria-hidden
          >
            {(Array.from(otherMemberName)[0] ?? "?").toUpperCase()}
          </span>
        )}

        <div
          className={cn(
            "max-w-[82%] sm:max-w-[75%] space-y-1.5",
            isMine ? "items-end" : "items-start",
            "flex flex-col",
          )}
        >
          {/* Bubble row — text bubble + action buttons */}
          <div className={cn("flex items-end gap-1.5", isMine && "flex-row-reverse")}>
            {/* Action buttons on desktop hover */}
            {!isDeleted && !isOptimistic && hoveredMsgId === msg.id && (
              <div className="mb-1 flex items-center gap-0.5 animate-in fade-in duration-100">
                {/* Desktop Reply button */}
                <button
                  type="button"
                  onClick={() => onReply(msg)}
                  aria-label="Reply to message"
                  title="Reply"
                  className="grid size-6 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-surface-muted hover:text-accent"
                >
                  <Reply className="size-3" aria-hidden />
                </button>

                {/* Delete button: own messages only */}
                {isMine && (
                  <button
                    type="button"
                    onClick={() => onDelete(msg.id)}
                    aria-label="Delete message"
                    title="Delete"
                    className="grid size-6 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-surface-muted hover:text-danger"
                  >
                    <Trash2 className="size-3" aria-hidden />
                  </button>
                )}
              </div>
            )}

            {/* Text bubble */}
            <div
              className={cn(
                "rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                isMine
                  ? "rounded-br-sm bg-accent text-accent-foreground"
                  : "rounded-bl-sm bg-surface-muted text-foreground",
                isOptimistic && "opacity-70",
                isDeleted && "italic opacity-60",
              )}
            >
              {/* Quoted WhatsApp Reply preview card inside bubble */}
              {!isDeleted && parsed.reply && (
                <button
                  type="button"
                  onClick={() => onJumpToQuoted(parsed.reply!.id)}
                  title="Jump to quoted message"
                  className={cn(
                    "mb-2 w-full text-left rounded-lg p-2 text-xs border-l-[3px] transition-all hover:opacity-90 active:scale-[0.99] block cursor-pointer",
                    isMine
                      ? "bg-black/15 dark:bg-black/25 border-accent-foreground/70 text-accent-foreground"
                      : "bg-surface border-accent text-foreground shadow-2xs",
                  )}
                >
                  <div className="flex items-center gap-1.5 font-semibold text-[0.72rem] opacity-95">
                    <Reply className="size-3 shrink-0" aria-hidden />
                    <span className="truncate">{parsed.reply.senderName}</span>
                  </div>
                  <p className="mt-0.5 truncate text-[0.68rem] opacity-80">
                    {parsed.reply.snippet}
                  </p>
                </button>
              )}

              <p className="whitespace-pre-wrap break-words">
                {isDeleted ? "This message was deleted." : parsed.text}
              </p>
            </div>
          </div>

          {/* Rich Shared Item & Outfit Attachment Cards */}
          {attachments.length > 0 && (
            <div className="w-full max-w-md space-y-2">
              {attachments.map((att) => (
                <SharedAttachmentView
                  key={att.id}
                  attachment={att}
                  isOwner={att.ownerId === currentUserId}
                  onRevoke={onRevokeAttachment}
                  revokingId={revokingId}
                />
              ))}
            </div>
          )}

          <span className="px-1 text-[0.65rem] text-muted">
            {formatMessageTime(msg.createdAt, timeZone)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── Main MessageThread Component ─────────────────────────────────────────────

interface Props {
  conversationId: string;
  currentUserId: string;
  initialMessages: Message[];
  initialHasMore?: boolean;
  initialNextCursor?: string | null;
  conversationStatus?: "pending" | "active";
  requesterId?: string | null;
  otherMemberId?: string;
  otherMemberName: string;
  otherMemberClosetId?: string;
  shareableItems?: SharedItemCardData[];
  shareableOutfits?: SharedOutfitCardData[];
  /** From the server fetch so day/time labels match on hydration. */
  referenceNowMs: number;
  timeZone: string;
}

export function MessageThread({
  conversationId,
  currentUserId,
  initialMessages,
  initialHasMore = false,
  initialNextCursor = null,
  conversationStatus = "active",
  requesterId = null,
  otherMemberId = "",
  otherMemberName,
  otherMemberClosetId = "",
  shareableItems = [],
  shareableOutfits = [],
  referenceNowMs,
  timeZone,
}: Props) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [nextCursor, setNextCursor] = useState<string | null>(initialNextCursor);
  const [loadingOlder, setLoadingOlder] = useState(false);

  const [status, setStatus] = useState<"pending" | "active">(conversationStatus);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [hoveredMsgId, setHoveredMsgId] = useState<string | null>(null);
  const [realtimeStatus, setRealtimeStatus] = useState<"connecting" | "connected" | "disconnected">(
    "connecting",
  );

  const [optimisticMessages, addOptimistic] = useOptimistic(
    messages,
    (state: Message[], newMsg: Message) => {
      // If the message is already present or already confirmed in state, do not append a duplicate
      if (
        state.some(
          (m) =>
            m.id === newMsg.id ||
            (m.senderId === newMsg.senderId &&
              m.body === newMsg.body &&
              Math.abs(new Date(m.createdAt).getTime() - new Date(newMsg.createdAt).getTime()) < 15000),
        )
      ) {
        return state;
      }
      return [...state, newMsg];
    },
  );
  const [body, setBody] = useState("");
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const initialScrollDone = useRef(false);

  // ── Scroll to bottom handler (WhatsApp-like behavior) ─────────────────
  // Only scrolls if there are enough messages to overflow the visible area.
  // Scrolls the message container directly without displacing window or header.
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

  // Jump to quoted message with temporary highlight flash
  const handleJumpToQuoted = (quotedId: string) => {
    if (!quotedId) return;
    const target = document.getElementById(`msg-${quotedId}`);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      target.classList.add("ring-2", "ring-accent", "rounded-2xl", "transition-all", "duration-500");
      setTimeout(() => {
        target.classList.remove("ring-2", "ring-accent");
      }, 1400);
    }
  };

  // When replyingTo is set, automatically focus composer textarea and ensure bottom is visible
  useEffect(() => {
    if (replyingTo) {
      textareaRef.current?.focus();
      setTimeout(() => {
        scrollToBottom("smooth");
      }, 100);
    }
  }, [replyingTo]);

  // ── Scroll to bottom on initial mount or new messages ─────────────────
  useEffect(() => {
    if (!initialScrollDone.current && optimisticMessages.length > 0) {
      scrollToBottom("auto");
      initialScrollDone.current = true;
    } else {
      scrollToBottom("smooth");
    }
  }, [optimisticMessages.length]);

  const handleFocus = () => {
    if (typeof window !== "undefined") {
      window.scrollTo(0, 0);
    }
    setTimeout(() => {
      if (typeof window !== "undefined") {
        window.scrollTo(0, 0);
      }
      scrollToBottom("smooth");
    }, 150);
  };

  // ── Supabase Realtime subscription ──────────────────────────────────────
  useEffect(() => {
    const supabase = createClient();

    const refreshAttachments = async (msgId: string) => {
      const res = await hydrateMessageAttachmentsAction(conversationId, msgId);
      if (res.ok && res.data) {
        const hydrated = res.data.attachments;
        setMessages((prev) =>
          prev.map((m) => (m.id === msgId ? { ...m, attachments: hydrated } : m)),
        );
      }
    };

    const channel = supabase
      .channel(`connect:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "connect_messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const row = payload.new as {
            id: string;
            conversation_id: string;
            sender_id: string;
            body: string;
            created_at: string;
            deleted_at: string | null;
          };

          setMessages((prev) => {
            if (prev.some((m) => m.id === row.id)) return prev;
            // Also clean up any matching optimistic placeholder if this is our message arriving via Realtime
            const base = row.sender_id === currentUserId
              ? prev.filter((m) => !(m.id.startsWith("optimistic-") && m.body === row.body))
              : prev;
            const newMsg: Message = {
              id: row.id,
              conversationId: row.conversation_id,
              senderId: row.sender_id,
              senderName: row.sender_id === currentUserId ? "You" : otherMemberName,
              senderClosetId: row.sender_id === currentUserId ? null : otherMemberClosetId,
              body: row.body,
              createdAt: row.created_at,
              deletedAt: row.deleted_at,
              attachments: [],
            };
            return [...base, newMsg];
          });

          setTimeout(() => {
            refreshAttachments(row.id).catch(() => {});
          }, 300);

          if (row.sender_id !== currentUserId) {
            markReadAction(conversationId).catch(() => {});
          }
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "connect_message_attachments",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const rec = (payload.new ?? payload.old) as { message_id?: string } | undefined;
          if (rec?.message_id) {
            refreshAttachments(rec.message_id).catch(() => {});
          }
        },
      )
      .subscribe((sub) => {
        if (sub === "SUBSCRIBED") setRealtimeStatus("connected");
        else if (sub === "CLOSED" || sub === "CHANNEL_ERROR") setRealtimeStatus("disconnected");
        else setRealtimeStatus("connecting");
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, currentUserId, otherMemberName, otherMemberClosetId]);

  // ── Load Older Messages (Pagination) ────────────────────────────────────
  const handleLoadOlder = async () => {
    if (!nextCursor || loadingOlder) return;
    setLoadingOlder(true);
    const res = await loadMoreMessagesAction(conversationId, nextCursor);
    setLoadingOlder(false);
    if (res.ok && res.data) {
      const older = res.data.messages;
      setMessages((prev) => {
        const existingIds = new Set(prev.map((m) => m.id));
        const uniqueOlder = older.filter((m) => !existingIds.has(m.id));
        return [...uniqueOlder, ...prev];
      });
      setHasMore(res.data.hasMore);
      setNextCursor(res.data.nextCursor);
    }
  };

  // ── Revoke Shared Attachment ────────────────────────────────────────────
  const handleRevokeAttachment = async (attachmentId: string) => {
    setRevokingId(attachmentId);
    const res = await revokeAttachmentAction(attachmentId, conversationId);
    setRevokingId(null);
    if (res.ok) {
      const nowIso = new Date().toISOString();
      setMessages((prev) =>
        prev.map((m) => ({
          ...m,
          attachments: (m.attachments ?? []).map((a) =>
            a.id === attachmentId
              ? { ...a, revokedAt: nowIso, item: null, outfit: null }
              : a,
          ),
        })),
      );
    } else {
      setSendError(res.error);
    }
  };

  // ── Delete own message ──────────────────────────────────────────────────
  const handleDelete = (messageId: string) => {
    // Optimistic soft-delete immediately so UI responds without waiting
    setMessages((prev) =>
      prev.map((m) =>
        m.id === messageId ? { ...m, deletedAt: new Date().toISOString() } : m,
      ),
    );
    deleteMessageAction(messageId).then((res) => {
      if (!res.ok) {
        // Rollback on failure
        setMessages((prev) =>
          prev.map((m) => (m.id === messageId ? { ...m, deletedAt: null } : m)),
        );
        setSendError(res.error);
      }
    });
  };

  // ── Send handler ─────────────────────────────────────────────────────────
  const handleSend = () => {
    const trimmed = body.trim();
    if (!trimmed || isPending) return;

    let finalBody = trimmed;
    if (replyingTo) {
      const snippet = getMessagePreviewText(replyingTo);
      const replyMeta = JSON.stringify({
        id: replyingTo.id,
        sender: replyingTo.senderId === currentUserId ? "You" : replyingTo.senderName,
        snippet: snippet.length > 120 ? snippet.slice(0, 117) + "…" : snippet,
      });
      finalBody = `<!--reply:${replyMeta}-->\n${trimmed}`;
      setReplyingTo(null);
    }

    const tempId = `optimistic-${Date.now()}`;
    const optimisticMsg: Message = {
      id: tempId,
      conversationId,
      senderId: currentUserId,
      senderName: "You",
      senderClosetId: null,
      body: finalBody,
      createdAt: new Date().toISOString(),
      deletedAt: null,
      attachments: [],
    };

    setBody("");
    setSendError(null);

    startTransition(async () => {
      addOptimistic(optimisticMsg);
      const result = await sendMessageAction(conversationId, finalBody);
      if (!result.ok) {
        setSendError(result.error);
        setBody(trimmed);
      } else if (result.data?.message) {
        const confirmedMsg = result.data.message;
        setMessages((prev) => {
          if (prev.some((m) => m.id === confirmedMsg.id)) return prev;
          return [...prev, confirmedMsg];
        });
      }
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ── Group messages by day ────────────────────────────────────────────────
  type DayGroup = { day: string; messages: Message[] };
  const groups: DayGroup[] = [];
  const seenIds = new Set<string>();
  for (const msg of optimisticMessages) {
    if (seenIds.has(msg.id)) continue;
    seenIds.add(msg.id);
    const day = formatMessageDayLabel(msg.createdAt, referenceNowMs, timeZone);
    const last = groups[groups.length - 1];
    if (last && last.day === day) {
      last.messages.push(msg);
    } else {
      groups.push({ day, messages: [msg] });
    }
  }

  const isRecipientOfPending =
    status === "pending" && requesterId !== null && requesterId !== currentUserId;
  const isRequesterOfPending =
    status === "pending" && requesterId === currentUserId;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-none sm:rounded-[1.25rem] border-0 sm:border border-border bg-surface">
      {/* ── Realtime connection status ──────────────────────────────── */}
      {realtimeStatus === "disconnected" && (
        <div className="flex items-center justify-center gap-2 border-b border-warning/30 bg-warning-soft px-4 py-2 text-xs font-medium text-warning">
          <WifiOff className="size-3.5" aria-hidden />
          Reconnecting… new messages may be delayed.
        </div>
      )}
      {realtimeStatus === "connecting" && (
        <div className="flex items-center justify-center gap-2 border-b border-border bg-surface-muted px-4 py-1.5 text-xs text-muted">
          <Loader2 className="size-3 animate-spin" aria-hidden />
          Connecting…
        </div>
      )}

      {/* Consent Banner for Pending Conversations */}
      {isRecipientOfPending && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-accent-soft/40 px-4 py-3">
          <div className="flex items-center gap-2.5 text-xs text-foreground">
            <ShieldAlert className="size-4 shrink-0 text-accent" aria-hidden />
            <span>
              <strong>{otherMemberName}</strong>{" "}
              {otherMemberClosetId && (
                <span className="font-mono text-muted">({otherMemberClosetId})</span>
              )}{" "}
              sent you a conversation request.
            </span>
          </div>
          <PendingRequestActions
            conversationId={conversationId}
            otherUserId={otherMemberId}
            otherName={otherMemberName}
            otherClosetId={otherMemberClosetId}
            onAccepted={() => setStatus("active")}
          />
        </div>
      )}

      {isRequesterOfPending && (
        <div className="flex items-center justify-between gap-2 border-b border-border bg-surface-muted px-4 py-2 text-xs text-muted">
          <span>
            Waiting for them to accept —{" "}
            <strong>{otherMemberName}</strong>{" "}
            {otherMemberClosetId && (
              <span className="font-mono">({otherMemberClosetId})</span>
            )}
          </span>
          <span className="shrink-0 rounded-full bg-surface px-2.5 py-0.5 text-[0.68rem] font-medium">
            1 intro message limit
          </span>
        </div>
      )}

      {/* Message history */}
      <div
        ref={scrollContainerRef}
        className="flex-1 min-h-0 overflow-y-auto overscroll-y-contain px-3 py-4 sm:px-4 space-y-6"
        role="log"
        aria-label="Message history"
        aria-live="polite"
      >
        {hasMore && (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={handleLoadOlder}
              disabled={loadingOlder}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3.5 py-1.5 text-xs font-medium text-muted transition-colors hover:bg-surface-muted hover:text-foreground disabled:opacity-50"
            >
              <ChevronUp className="size-3.5" aria-hidden />
              {loadingOlder ? "Loading older messages…" : "Load older messages"}
            </button>
          </div>
        )}

        {groups.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted">
            No messages yet. Say hello to {otherMemberName}{" "}
            {otherMemberClosetId ? `(${otherMemberClosetId})` : ""}!
          </p>
        ) : (
          groups.map((group) => (
            <div key={group.day} className="space-y-3">
              {/* Day divider */}
              <div className="flex items-center gap-3" aria-label={`Messages from ${group.day}`}>
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs text-muted">{group.day}</span>
                <div className="h-px flex-1 bg-border" />
              </div>

              {group.messages.map((msg) => {
                const isMine = msg.senderId === currentUserId;
                const isOptimistic = msg.id.startsWith("optimistic-");
                const isDeleted = Boolean(msg.deletedAt);

                return (
                  <SwipeableMessageRow
                    key={msg.id}
                    msg={msg}
                    isMine={isMine}
                    isOptimistic={isOptimistic}
                    isDeleted={isDeleted}
                    hoveredMsgId={hoveredMsgId}
                    setHoveredMsgId={setHoveredMsgId}
                    onReply={(m) => setReplyingTo(m)}
                    onDelete={handleDelete}
                    onJumpToQuoted={handleJumpToQuoted}
                    timeZone={timeZone}
                    otherMemberName={otherMemberName}
                    onRevokeAttachment={handleRevokeAttachment}
                    revokingId={revokingId}
                    currentUserId={currentUserId}
                  />
                );
              })}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Error banner */}
      {sendError && (
        <div
          className="border-t border-danger/20 bg-danger-soft px-4 py-2 text-xs text-danger"
          role="alert"
        >
          {sendError}
        </div>
      )}

      {/* Composer */}
      <div className="border-t border-border bg-surface px-3 py-2.5 sm:px-4 sm:py-3 pb-[max(0.625rem,env(safe-area-inset-bottom))] sm:pb-3 shrink-0">
        {/* Reply preview bar */}
        {replyingTo && (
          <div className="mb-2 flex items-center justify-between gap-2.5 rounded-xl border border-border bg-surface-muted/90 px-3 py-2 text-xs backdrop-blur-sm animate-in fade-in slide-in-from-bottom-2 duration-150">
            <div className="flex items-center gap-2.5 min-w-0 border-l-[3px] border-accent pl-2.5">
              <Reply className="size-3.5 shrink-0 text-accent" aria-hidden />
              <div className="min-w-0">
                <p className="font-semibold text-accent truncate text-[0.72rem]">
                  Replying to {replyingTo.senderId === currentUserId ? "yourself" : replyingTo.senderName}
                </p>
                <p className="text-[0.68rem] text-muted truncate">
                  {getMessagePreviewText(replyingTo)}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setReplyingTo(null)}
              className="grid size-6 shrink-0 place-items-center rounded-full text-muted hover:bg-surface hover:text-foreground transition-colors"
              aria-label="Cancel reply"
            >
              <X className="size-3.5" aria-hidden />
            </button>
          </div>
        )}

        <div className="flex items-end gap-2">
          <SharePickerDialog
            conversationId={conversationId}
            otherMemberName={otherMemberName}
            items={shareableItems}
            outfits={shareableOutfits}
            disabled={isRecipientOfPending}
            onShared={(newMsg) => {
              setMessages((prev) =>
                prev.some((m) => m.id === newMsg.id) ? prev : [...prev, newMsg],
              );
            }}
          />

          <textarea
            ref={textareaRef}
            value={body}
            disabled={isRecipientOfPending}
            onFocus={handleFocus}
            onChange={(e) => {
              setBody(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`;
            }}
            onKeyDown={handleKeyDown}
            placeholder={
              isRecipientOfPending
                ? `Accept ${otherMemberName}'s request above to reply…`
                : `Message ${otherMemberName}…`
            }
            aria-label="Message composer"
            rows={1}
            className="flex-1 resize-none overflow-hidden rounded-xl border border-border-strong bg-background px-4 py-2.5 text-base sm:text-sm leading-relaxed text-foreground placeholder:text-muted/70 focus-visible:border-accent focus-visible:outline-none disabled:opacity-50"
            style={{ minHeight: "44px", maxHeight: "140px" }}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!body.trim() || isPending || isRecipientOfPending}
            aria-label="Send message"
            className="grid size-11 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground transition-opacity disabled:opacity-40 hover:bg-accent-hover"
          >
            <Send className="size-4" aria-hidden />
          </button>
        </div>
        <p className="mt-1.5 hidden text-[0.65rem] text-muted sm:block">
          Enter to send · Shift+Enter for new line · Use &ldquo;Share closet&rdquo; to attach
          clothes or outfits
        </p>
      </div>
    </div>
  );
}

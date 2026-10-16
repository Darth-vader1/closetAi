"use client";

import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  acceptConversationAction,
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
import {
  CheckCircle2,
  ChevronUp,
  EyeOff,
  Layers,
  Loader2,
  Send,
  ShieldAlert,
  Shirt,
  Sparkles,
  Trash2,
  WifiOff,
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
              className="shrink-0 rounded-lg border border-border px-2 py-1 text-[0.68rem] font-medium text-muted transition-colors hover:border-danger/40 hover:bg-danger-soft hover:text-danger disabled:opacity-40"
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
              className="shrink-0 rounded-lg border border-border px-2 py-1 text-[0.68rem] font-medium text-muted transition-colors hover:border-danger/40 hover:bg-danger-soft hover:text-danger disabled:opacity-40"
            >
              {revokingId === attachment.id ? "…" : "Unshare"}
            </button>
          )}
        </div>

        {outfit.items.length > 0 && (
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
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

// ─── Main MessageThread Component ─────────────────────────────────────────────

type RealtimeStatus = "connecting" | "connected" | "disconnected";

interface Props {
  conversationId: string;
  currentUserId: string;
  initialMessages: Message[];
  initialHasMore?: boolean;
  initialNextCursor?: string | null;
  conversationStatus?: "pending" | "active";
  requesterId?: string | null;
  otherMemberName: string;
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
  otherMemberName,
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
  const [accepting, setAccepting] = useState(false);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [hoveredMsgId, setHoveredMsgId] = useState<string | null>(null);

  // Realtime connection status
  const [realtimeStatus, setRealtimeStatus] = useState<RealtimeStatus>("connecting");

  const [optimisticMessages, addOptimistic] = useOptimistic(
    messages,
    (prev: Message[], newMsg: Message) => [...prev, newMsg],
  );
  const [body, setBody] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ── Scroll to bottom on new messages ────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [optimisticMessages.length]);

  // ── Supabase Realtime subscription ──────────────────────────────────────
  useEffect(() => {
    const supabase = createClient();

    const refreshAttachments = async (msgId: string) => {
      const res = await hydrateMessageAttachmentsAction(conversationId, msgId);
      if (res.ok && res.data) {
        setMessages((prev) =>
          prev.map((m) => (m.id === msgId ? { ...m, attachments: res.data!.attachments } : m)),
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
            return [
              ...prev,
              {
                id: row.id,
                conversationId: row.conversation_id,
                senderId: row.sender_id,
                senderName: row.sender_id === currentUserId ? "You" : otherMemberName,
                body: row.body,
                createdAt: row.created_at,
                deletedAt: row.deleted_at,
                attachments: [],
              },
            ];
          });

          setTimeout(() => refreshAttachments(row.id).catch(() => {}), 300);

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
          if (rec?.message_id) refreshAttachments(rec.message_id).catch(() => {});
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
  }, [conversationId, currentUserId, otherMemberName]);

  // ── Accept pending conversation ──────────────────────────────────────────
  const handleAcceptRequest = async () => {
    setAccepting(true);
    setSendError(null);
    const res = await acceptConversationAction(conversationId);
    setAccepting(false);
    if (!res.ok) { setSendError(res.error); return; }
    setStatus("active");
  };

  // ── Load older messages ──────────────────────────────────────────────────
  const handleLoadOlder = async () => {
    if (!nextCursor || loadingOlder) return;
    const scrollEl = scrollRef.current;
    const prevScrollHeight = scrollEl?.scrollHeight ?? 0;

    setLoadingOlder(true);
    const res = await loadMoreMessagesAction(conversationId, nextCursor);
    setLoadingOlder(false);

    if (res.ok && res.data) {
      setMessages((prev) => {
        const existingIds = new Set(prev.map((m) => m.id));
        return [...res.data!.messages.filter((m) => !existingIds.has(m.id)), ...prev];
      });
      setHasMore(res.data.hasMore);
      setNextCursor(res.data.nextCursor);
      // Restore scroll position after prepend
      requestAnimationFrame(() => {
        if (scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight - prevScrollHeight;
      });
    }
  };

  // ── Delete own message ───────────────────────────────────────────────────
  const handleDelete = (messageId: string) => {
    // Optimistic soft-delete
    setMessages((prev) =>
      prev.map((m) => m.id === messageId ? { ...m, deletedAt: new Date().toISOString() } : m),
    );
    deleteMessageAction(messageId).then((res) => {
      if (!res.ok) {
        // Rollback
        setMessages((prev) =>
          prev.map((m) => m.id === messageId ? { ...m, deletedAt: null } : m),
        );
        setSendError(res.error);
      }
    });
  };

  // ── Revoke shared attachment ─────────────────────────────────────────────
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
            a.id === attachmentId ? { ...a, revokedAt: nowIso, item: null, outfit: null } : a,
          ),
        })),
      );
    } else {
      setSendError(res.error);
    }
  };

  // ── Send ─────────────────────────────────────────────────────────────────
  const handleSend = () => {
    const trimmed = body.trim();
    if (!trimmed || isPending) return;

    const tempId = `optimistic-${Date.now()}`;
    const optimisticMsg: Message = {
      id: tempId,
      conversationId,
      senderId: currentUserId,
      senderName: "You",
      body: trimmed,
      createdAt: new Date().toISOString(),
      deletedAt: null,
      attachments: [],
    };

    setBody("");
    setSendError(null);
    if (textareaRef.current) textareaRef.current.style.height = "44px";

    startTransition(async () => {
      addOptimistic(optimisticMsg);
      const result = await sendMessageAction(conversationId, trimmed);
      if (!result.ok) {
        setSendError(result.error);
        setBody(trimmed);
      } else {
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
      }
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // ── Day grouping ─────────────────────────────────────────────────────────
  type DayGroup = { day: string; messages: Message[] };
  const groups: DayGroup[] = [];
  for (const msg of optimisticMessages) {
    const day = formatMessageDayLabel(msg.createdAt, referenceNowMs, timeZone);
    const last = groups[groups.length - 1];
    if (last && last.day === day) last.messages.push(msg);
    else groups.push({ day, messages: [msg] });
  }

  const isRecipientOfPending = status === "pending" && requesterId !== null && requesterId !== currentUserId;
  const isRequesterOfPending = status === "pending" && requesterId === currentUserId;

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[1.25rem] border border-border bg-surface">

      {/* ── Realtime connection status ───────────────────────────────── */}
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

      {/* ── Consent banner (pending conversation) ───────────────────── */}
      {isRecipientOfPending && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border bg-accent-soft/40 px-4 py-3">
          <div className="flex items-center gap-2.5 text-xs text-foreground">
            <ShieldAlert className="size-4 shrink-0 text-accent" aria-hidden />
            <span>
              <strong>{otherMemberName}</strong> sent you a conversation request. Accept to
              reply and share wardrobe items.
            </span>
          </div>
          <button
            type="button"
            onClick={handleAcceptRequest}
            disabled={accepting}
            className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-3.5 py-1.5 text-xs font-semibold text-accent-foreground hover:bg-accent-hover disabled:opacity-50"
          >
            <CheckCircle2 className="size-3.5" aria-hidden />
            {accepting ? "Accepting…" : "Accept request"}
          </button>
        </div>
      )}
      {isRequesterOfPending && (
        <div className="border-b border-border bg-surface-muted px-4 py-2 text-xs text-muted">
          Waiting for <strong>{otherMemberName}</strong> to accept your request. You can send
          one introductory message until they accept.
        </div>
      )}

      {/* ── Message history ───────────────────────────────────────────── */}
      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-6"
        role="log"
        aria-label="Message history"
        aria-live="polite"
      >
        {/* Load older messages */}
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
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <span className="mb-3 text-3xl" aria-hidden>👋</span>
            <p className="text-sm font-medium text-foreground">Say hello to {otherMemberName}!</p>
            <p className="mt-1 text-xs text-muted">This is the start of your conversation.</p>
          </div>
        ) : (
          groups.map((group) => (
            <div key={group.day} className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs text-muted">{group.day}</span>
                <div className="h-px flex-1 bg-border" />
              </div>

              {group.messages.map((msg) => {
                const isMine = msg.senderId === currentUserId;
                const isOptimistic = msg.id.startsWith("optimistic-");
                const isDeleted = Boolean(msg.deletedAt);
                const isHovered = hoveredMsgId === msg.id;
                const attachments = msg.attachments ?? [];

                return (
                  <div
                    key={msg.id}
                    className={cn("group flex items-end gap-2", isMine ? "justify-end" : "justify-start")}
                    onMouseEnter={() => !isDeleted && !isOptimistic && setHoveredMsgId(msg.id)}
                    onMouseLeave={() => setHoveredMsgId(null)}
                  >
                    {/* Other person avatar */}
                    {!isMine && (
                      <span
                        className="mb-1 grid size-7 shrink-0 place-items-center rounded-full bg-accent-soft text-xs font-semibold text-accent"
                        aria-hidden
                      >
                        {(Array.from(otherMemberName)[0] ?? "?").toUpperCase()}
                      </span>
                    )}

                    <div
                      className={cn(
                        "flex max-w-[82%] sm:max-w-[75%] flex-col gap-1.5",
                        isMine ? "items-end" : "items-start",
                      )}
                    >
                      {/* Bubble row with delete button */}
                      <div className={cn("flex items-end gap-1.5", isMine && "flex-row-reverse")}>
                        {/* Delete button — own, non-deleted, non-optimistic, on hover */}
                        {isMine && !isDeleted && !isOptimistic && isHovered && (
                          <button
                            type="button"
                            onClick={() => handleDelete(msg.id)}
                            aria-label="Delete message"
                            className="mb-1 grid size-6 shrink-0 place-items-center rounded-full text-muted transition-colors hover:bg-surface-muted hover:text-danger"
                          >
                            <Trash2 className="size-3" aria-hidden />
                          </button>
                        )}

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
                          <p className="whitespace-pre-wrap break-words">
                            {isDeleted ? "This message was deleted." : msg.body}
                          </p>
                        </div>
                      </div>

                      {/* Attachment cards */}
                      {attachments.length > 0 && (
                        <div className="w-full max-w-md space-y-2">
                          {attachments.map((att) => (
                            <SharedAttachmentView
                              key={att.id}
                              attachment={att}
                              isOwner={att.ownerId === currentUserId}
                              onRevoke={handleRevokeAttachment}
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
                );
              })}
            </div>
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* ── Error banner ──────────────────────────────────────────────── */}
      {sendError && (
        <div className="border-t border-danger/20 bg-danger-soft px-4 py-2 text-xs text-danger" role="alert">
          {sendError} —{" "}
          <button type="button" className="underline" onClick={() => setSendError(null)}>
            dismiss
          </button>
        </div>
      )}

      {/* ── Composer ──────────────────────────────────────────────────── */}
      <div className="border-t border-border px-3 py-3 sm:px-4">
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
            className="flex-1 resize-none overflow-hidden rounded-2xl border border-border-strong bg-background px-4 py-2.5 text-sm leading-relaxed text-foreground placeholder:text-muted/70 focus-visible:border-accent focus-visible:outline-none disabled:opacity-50"
            style={{ minHeight: "44px", maxHeight: "140px" }}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!body.trim() || isPending || isRecipientOfPending}
            aria-label="Send message"
            className="grid size-11 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground transition-all disabled:opacity-40 hover:bg-accent-hover active:scale-95"
          >
            {isPending
              ? <Loader2 className="size-4 animate-spin" aria-hidden />
              : <Send className="size-4" aria-hidden />}
          </button>
        </div>
        {/* Desktop only hint — Enter to send does not apply on mobile keyboards */}
        <p className="mt-1.5 hidden text-[0.65rem] text-muted sm:block">
          Enter to send · Shift+Enter for new line · Use &ldquo;Share closet&rdquo; to attach
          clothes or outfits
        </p>
      </div>
    </div>
  );
}

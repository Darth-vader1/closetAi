"use client";

import { useEffect, useOptimistic, useRef, useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { sendMessageAction, markReadAction } from "@/app/(app)/connect/actions";
import type { Message } from "@/lib/connect/queries";
import { formatMessageDayLabel, formatMessageTime } from "@/lib/connect/format-relative";
import { Send } from "lucide-react";
import { cn } from "@/lib/utils/cn";

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  conversationId: string;
  currentUserId: string;
  initialMessages: Message[];
  otherMemberName: string;
  /** From the server fetch so day/time labels match on hydration (avoids mobile crashes). */
  referenceNowMs: number;
  timeZone: string;
}

export function MessageThread({
  conversationId,
  currentUserId,
  initialMessages,
  otherMemberName,
}: Props) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [optimisticMessages, addOptimistic] = useOptimistic(
    messages,
    (prev: Message[], newMsg: Message) => [...prev, newMsg],
  );
  const [body, setBody] = useState("");
  const [sendError, setSendError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // ── Scroll to bottom on new messages ────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [optimisticMessages.length]);

  // ── Supabase Realtime subscription ──────────────────────────────────────
  useEffect(() => {
    const supabase = createClient();

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

          // Deduplicate: skip messages we already have (sent optimistically)
          setMessages((prev) => {
            if (prev.some((m) => m.id === row.id)) return prev;
            const newMsg: Message = {
              id: row.id,
              conversationId: row.conversation_id,
              senderId: row.sender_id,
              senderName: row.sender_id === currentUserId ? "You" : otherMemberName,
              body: row.body,
              createdAt: row.created_at,
              deletedAt: row.deleted_at,
            };
            return [...prev, newMsg];
          });

          // Mark read when a new message arrives and the user is viewing the thread
          if (row.sender_id !== currentUserId) {
            markReadAction(conversationId).catch(() => {/* non-critical */});
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId, currentUserId, otherMemberName]);

  // ── Send handler ─────────────────────────────────────────────────────────
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
    };

    setBody("");
    setSendError(null);

    startTransition(async () => {
      addOptimistic(optimisticMsg);
      const result = await sendMessageAction(conversationId, trimmed);
      if (!result.ok) {
        setSendError(result.error);
        // Restore the message body so the user can retry
        setBody(trimmed);
      } else {
        // Replace optimistic entry with the real one from Realtime; if Realtime
        // delivers it before this point the deduplication above handles it.
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

  // ── Group messages by day ────────────────────────────────────────────────
  type DayGroup = { day: string; messages: Message[] };
  const groups: DayGroup[] = [];
  for (const msg of optimisticMessages) {
    const day = formatDay(msg.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.day === day) {
      last.messages.push(msg);
    } else {
      groups.push({ day, messages: [msg] });
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[1.25rem] border border-border bg-surface">
      {/* Message history */}
      <div
        className="flex-1 overflow-y-auto px-4 py-4 space-y-6"
        role="log"
        aria-label="Message history"
        aria-live="polite"
      >
        {groups.length === 0 ? (
          <p className="py-16 text-center text-sm text-muted">
            No messages yet. Say hello to {otherMemberName}!
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
                return (
                  <div
                    key={msg.id}
                    className={cn("flex gap-2", isMine ? "justify-end" : "justify-start")}
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
                        "max-w-[75%] space-y-1",
                        isMine ? "items-end" : "items-start",
                        "flex flex-col",
                      )}
                    >
                      <div
                        className={cn(
                          "rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                          isMine
                            ? "rounded-br-sm bg-accent text-accent-foreground"
                            : "rounded-bl-sm bg-surface-muted text-foreground",
                          isOptimistic && "opacity-70",
                          msg.deletedAt && "italic text-muted",
                        )}
                      >
                        {msg.body}
                      </div>
                      <span className="px-1 text-[0.65rem] text-muted">
                        {formatTime(msg.createdAt)}
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

      {/* Error banner */}
      {sendError && (
        <div className="border-t border-danger/20 bg-danger-soft px-4 py-2 text-xs text-danger" role="alert">
          {sendError} — edit your message and try again.
        </div>
      )}

      {/* Composer */}
      <div className="border-t border-border px-4 py-3">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={body}
            onChange={(e) => {
              setBody(e.target.value);
              // Auto-resize
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(e.target.scrollHeight, 140)}px`;
            }}
            onKeyDown={handleKeyDown}
            placeholder={`Message ${otherMemberName}…`}
            aria-label="Message composer"
            rows={1}
            className="flex-1 resize-none overflow-hidden rounded-xl border border-border-strong bg-background px-4 py-2.5 text-sm leading-relaxed text-foreground placeholder:text-muted/70 focus-visible:border-accent focus-visible:outline-none"
            style={{ minHeight: "44px", maxHeight: "140px" }}
          />
          <button
            type="button"
            onClick={handleSend}
            disabled={!body.trim() || isPending}
            aria-label="Send message"
            className="grid size-11 shrink-0 place-items-center rounded-full bg-accent text-accent-foreground transition-opacity disabled:opacity-40 hover:bg-accent-hover"
          >
            <Send className="size-4" aria-hidden />
          </button>
        </div>
        <p className="mt-1.5 text-[0.65rem] text-muted">
          Enter to send · Shift+Enter for new line
        </p>
      </div>
    </div>
  );
}

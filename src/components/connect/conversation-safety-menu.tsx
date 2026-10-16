"use client";

import { useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  Ban,
  Check,
  Flag,
  MoreVertical,
  X,
} from "lucide-react";
import {
  acceptConversationAction,
  blockUserAction,
  declineConversationAction,
  reportUserAction,
} from "@/app/(app)/connect/actions";

interface MenuProps {
  conversationId: string;
  otherUserId: string;
  otherName: string;
  otherClosetId: string;
}

/**
 * Header safety menu for a conversation: Block user or Report user.
 */
export function ConversationSafetyMenu({
  conversationId,
  otherUserId,
  otherName,
  otherClosetId,
}: MenuProps) {
  const router = useRouter();
  const [menuOpen, setMenuOpen] = useState(false);
  const [modalMode, setModalMode] = useState<"block" | "report" | null>(null);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleBlock = () => {
    setError(null);
    startTransition(async () => {
      const res = await blockUserAction(otherUserId, conversationId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setModalMode(null);
      router.push("/connect");
      router.refresh();
    });
  };

  const handleReport = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      setError("Please describe why you are reporting this user.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const res = await reportUserAction({
        reportedUserId: otherUserId,
        conversationId,
        reason: reason.trim(),
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setNotice("Report submitted. Thank you for helping keep ClosetAI safe.");
      setReason("");
      setTimeout(() => {
        setNotice(null);
        setModalMode(null);
      }, 1200);
    });
  };

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setMenuOpen((o) => !o)}
        aria-label={`Safety options for ${otherName}`}
        aria-expanded={menuOpen}
        className="inline-flex size-9 items-center justify-center rounded-xl border border-border bg-surface text-muted transition-colors hover:bg-surface-muted hover:text-foreground"
      >
        <MoreVertical className="size-4" aria-hidden />
      </button>

      {menuOpen && (
        <>
          <div
            className="fixed inset-0 z-30"
            onClick={() => setMenuOpen(false)}
            aria-hidden
          />
          <div
            role="menu"
            className="absolute right-0 top-11 z-40 w-48 overflow-hidden rounded-xl border border-border bg-surface py-1 shadow-lg"
          >
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                setError(null);
                setNotice(null);
                setModalMode("report");
              }}
              className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-medium text-foreground hover:bg-surface-muted"
            >
              <Flag className="size-3.5 text-muted" aria-hidden />
              <span>Report {otherName}</span>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                setError(null);
                setNotice(null);
                setModalMode("block");
              }}
              className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-xs font-medium text-danger hover:bg-danger-soft"
            >
              <Ban className="size-3.5" aria-hidden />
              <span>Block {otherName}</span>
            </button>
          </div>
        </>
      )}

      {modalMode &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 p-4 backdrop-blur-xs"
            role="dialog"
            aria-modal="true"
            aria-labelledby="safety-modal-title"
            onClick={(e) => {
              if (e.target === e.currentTarget) setModalMode(null);
            }}
          >
            <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-5 shadow-xl space-y-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 id="safety-modal-title" className="text-base font-semibold text-foreground">
                    {modalMode === "block" ? `Block ${otherName}?` : `Report ${otherName}`}
                  </h2>
                  <p className="font-mono text-xs text-muted">{otherClosetId}</p>
                </div>
                <button
                  type="button"
                  onClick={() => setModalMode(null)}
                  aria-label="Close dialog"
                  className="grid size-8 place-items-center rounded-full text-muted hover:bg-surface-muted hover:text-foreground"
                >
                  <X className="size-4" aria-hidden />
                </button>
              </div>

              {modalMode === "block" ? (
                <div className="space-y-4">
                  <p className="text-xs leading-relaxed text-muted">
                    Blocking <strong>{otherName}</strong> ({otherClosetId}) immediately prevents
                    them from sending you messages, starting conversations with you, or viewing any
                    shared wardrobe items.
                  </p>

                  {error && (
                    <p className="text-xs font-medium text-danger" role="alert">
                      {error}
                    </p>
                  )}

                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setModalMode(null)}
                      className="rounded-lg px-3 py-2 text-xs font-medium text-muted hover:bg-surface-muted hover:text-foreground"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleBlock}
                      disabled={isPending}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-danger px-4 py-2 text-xs font-semibold text-white hover:opacity-90 disabled:opacity-50"
                    >
                      <Ban className="size-3.5" aria-hidden />
                      {isPending ? "Blocking…" : "Block user"}
                    </button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleReport} className="space-y-4">
                  <p className="text-xs leading-relaxed text-muted">
                    Let us know what happened with <strong>{otherName}</strong> ({otherClosetId}).
                    You can submit up to 5 reports per day and have one open report per user.
                  </p>

                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Describe the issue (spam, harassment, inappropriate content)…"
                    rows={3}
                    maxLength={1000}
                    required
                    className="w-full rounded-xl border border-border bg-background p-3 text-xs text-foreground placeholder:text-muted focus-visible:border-accent focus-visible:outline-none"
                  />

                  {error && (
                    <p className="text-xs font-medium text-danger" role="alert">
                      {error}
                    </p>
                  )}
                  {notice && (
                    <p className="text-xs font-medium text-accent" role="status">
                      {notice}
                    </p>
                  )}

                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setModalMode(null)}
                      className="rounded-lg px-3 py-2 text-xs font-medium text-muted hover:bg-surface-muted hover:text-foreground"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={isPending || !reason.trim()}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-accent-foreground hover:bg-accent-hover disabled:opacity-50"
                    >
                      <Flag className="size-3.5" aria-hidden />
                      {isPending ? "Submitting…" : "Submit report"}
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

/**
 * Inline action bar for incoming pending conversation requests in the inbox list:
 * Accept / Decline / Block / Report.
 */
export function PendingRequestActions({
  conversationId,
  otherUserId,
  otherName,
  otherClosetId,
  onAccepted,
}: MenuProps & { onAccepted?: () => void }) {
  const router = useRouter();
  const [reportOpen, setReportOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleAccept = () => {
    setError(null);
    startTransition(async () => {
      const res = await acceptConversationAction(conversationId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      onAccepted?.();
      router.refresh();
    });
  };

  const handleDecline = () => {
    setError(null);
    startTransition(async () => {
      const res = await declineConversationAction(conversationId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      router.push("/connect");
      router.refresh();
    });
  };

  const handleBlock = () => {
    setError(null);
    startTransition(async () => {
      const res = await blockUserAction(otherUserId, conversationId);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      await declineConversationAction(conversationId).catch(() => {});
      router.push("/connect");
      router.refresh();
    });
  };

  const handleReport = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) return;
    setError(null);
    startTransition(async () => {
      const res = await reportUserAction({
        reportedUserId: otherUserId,
        conversationId,
        reason: reason.trim(),
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setNotice("Report submitted.");
      setReason("");
      setTimeout(() => {
        setReportOpen(false);
        setNotice(null);
      }, 900);
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleAccept}
          disabled={isPending}
          className="inline-flex items-center gap-1 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground hover:bg-accent-hover disabled:opacity-50"
        >
          <Check className="size-3.5" aria-hidden />
          Accept
        </button>

        <button
          type="button"
          onClick={handleDecline}
          disabled={isPending}
          className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-surface-muted disabled:opacity-50"
        >
          <X className="size-3.5" aria-hidden />
          Decline
        </button>

        <button
          type="button"
          onClick={handleBlock}
          disabled={isPending}
          className="inline-flex items-center gap-1 rounded-lg border border-danger/30 bg-background px-3 py-1.5 text-xs font-medium text-danger hover:bg-danger-soft disabled:opacity-50"
        >
          <Ban className="size-3.5" aria-hidden />
          Block
        </button>

        <button
          type="button"
          onClick={() => {
            setError(null);
            setNotice(null);
            setReportOpen((v) => !v);
          }}
          disabled={isPending}
          className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-muted hover:bg-surface-muted hover:text-foreground disabled:opacity-50"
        >
          <Flag className="size-3.5" aria-hidden />
          Report
        </button>
      </div>

      {reportOpen && (
        <form
          onSubmit={handleReport}
          className="mt-2 flex flex-col gap-2 rounded-xl border border-border bg-background p-3 sm:flex-row sm:items-center"
        >
          <input
            type="text"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder={`Reason for reporting ${otherName} (${otherClosetId})…`}
            maxLength={1000}
            required
            className="flex-1 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs text-foreground placeholder:text-muted focus-visible:border-accent focus-visible:outline-none"
          />
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => setReportOpen(false)}
              className="rounded-lg px-2.5 py-1.5 text-xs text-muted hover:text-foreground"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending || !reason.trim()}
              className="rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground hover:bg-accent-hover disabled:opacity-50"
            >
              Send Report
            </button>
          </div>
        </form>
      )}

      {error && (
        <p className="text-xs font-medium text-danger" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="text-xs font-medium text-accent" role="status">
          {notice}
        </p>
      )}
    </div>
  );
}

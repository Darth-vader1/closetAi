import Link from "next/link";
import type { ConversationSummary } from "@/lib/connect/queries";
import { PendingRequestActions } from "@/components/connect/conversation-safety-menu";
import { cn } from "@/lib/utils/cn";

interface Props {
  conversations: ConversationSummary[];
  currentUserId: string;
}

export function ConversationList({ conversations, currentUserId }: Props) {
  const pendingRequests = conversations.filter((c) => c.status === "pending");
  const activeConversations = conversations.filter((c) => c.status !== "pending");

  return (
    <div className="space-y-8">
      {/* Separate "Requests" section for pending conversations */}
      {pendingRequests.length > 0 && (
        <section className="space-y-3" aria-labelledby="connect-requests-heading">
          <div className="flex items-center justify-between">
            <h2
              id="connect-requests-heading"
              className="text-sm font-semibold uppercase tracking-wider text-muted"
            >
              Requests ({pendingRequests.length})
            </h2>
          </div>

          <ul
            className="divide-y divide-border rounded-[1.25rem] border border-border bg-surface overflow-hidden"
            role="list"
          >
            {pendingRequests.map((conv) => {
              const name = conv.otherMember.displayName ?? "Unknown User";
              const closetId = conv.otherMember.closetId;
              const initial = (Array.from(name.trim())[0] ?? "?").toUpperCase();

              const preview = conv.lastMessage
                ? conv.lastMessage.body.length > 80
                  ? conv.lastMessage.body.slice(0, 77) + "…"
                  : conv.lastMessage.body
                : "Sent a conversation request";

              const isIncoming =
                conv.requesterId !== null && conv.requesterId !== currentUserId;

              return (
                <li key={conv.id} className="px-5 py-4 space-y-3">
                  <div className="flex items-start justify-between gap-4">
                    <Link
                      href={`/connect/${conv.id}`}
                      className="flex min-w-0 flex-1 items-center gap-3.5 group"
                    >
                      <span
                        className="grid size-11 shrink-0 place-items-center rounded-full bg-accent-soft text-base font-semibold text-accent"
                        aria-hidden
                      >
                        {initial}
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="truncate text-sm font-semibold text-foreground group-hover:underline">
                            {name}
                          </p>
                          <span className="font-mono text-xs text-muted">
                            {closetId}
                          </span>
                          {!isIncoming && (
                            <span className="rounded-full bg-surface-muted px-2.5 py-0.5 text-[0.68rem] font-medium text-muted">
                              Waiting for them to accept
                            </span>
                          )}
                        </div>
                        <p className="mt-0.5 truncate text-sm text-muted">
                          {preview}
                        </p>
                      </div>
                    </Link>

                    {conv.lastMessageAtLabel && (
                      <span className="shrink-0 text-xs text-muted">
                        {conv.lastMessageAtLabel}
                      </span>
                    )}
                  </div>

                  {isIncoming && (
                    <div className="pl-14">
                      <PendingRequestActions
                        conversationId={conv.id}
                        otherUserId={conv.otherMember.userId}
                        otherName={name}
                        otherClosetId={closetId}
                      />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* Active Conversations section */}
      {activeConversations.length > 0 && (
        <section className="space-y-3" aria-labelledby="connect-active-heading">
          {pendingRequests.length > 0 && (
            <h2
              id="connect-active-heading"
              className="text-sm font-semibold uppercase tracking-wider text-muted"
            >
              Conversations ({activeConversations.length})
            </h2>
          )}

          <ul
            className="divide-y divide-border rounded-[1.25rem] border border-border bg-surface overflow-hidden"
            role="list"
          >
            {activeConversations.map((conv) => {
              const name = conv.otherMember.displayName ?? "Unknown User";
              const closetId = conv.otherMember.closetId;
              const initial = (Array.from(name.trim())[0] ?? "?").toUpperCase();

              const preview = conv.lastMessage
                ? conv.lastMessage.body.length > 60
                  ? conv.lastMessage.body.slice(0, 57) + "…"
                  : conv.lastMessage.body
                : "No messages yet";

              return (
                <li key={conv.id}>
                  <Link
                    href={`/connect/${conv.id}`}
                    className="flex items-center gap-4 px-5 py-4 transition-colors hover:bg-surface-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <span
                      className="grid size-11 shrink-0 place-items-center rounded-full bg-accent-soft text-base font-semibold text-accent"
                      aria-hidden
                    >
                      {initial}
                    </span>

                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <p className="truncate text-sm font-semibold text-foreground">
                            {name}
                          </p>
                          <span className="shrink-0 font-mono text-xs text-muted">
                            {closetId}
                          </span>
                        </div>
                        {conv.lastMessageAtLabel && (
                          <span className="shrink-0 text-xs text-muted">
                            {conv.lastMessageAtLabel}
                          </span>
                        )}
                      </div>
                      <p
                        className={cn(
                          "mt-0.5 truncate text-sm",
                          conv.unreadCount > 0 ? "font-medium text-foreground" : "text-muted",
                        )}
                      >
                        {preview}
                      </p>
                    </div>

                    {conv.unreadCount > 0 && (
                      <span
                        className="grid size-5 shrink-0 place-items-center rounded-full bg-accent text-[0.65rem] font-bold text-accent-foreground"
                        aria-label={`${conv.unreadCount} unread`}
                      >
                        {conv.unreadCount > 9 ? "9+" : conv.unreadCount}
                      </span>
                    )}
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}

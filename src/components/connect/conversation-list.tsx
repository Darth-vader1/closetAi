import Link from "next/link";
import type { ConversationSummary } from "@/lib/connect/queries";
import { cn } from "@/lib/utils/cn";

interface Props {
  conversations: ConversationSummary[];
  currentUserId: string;
}

export function ConversationList({ conversations }: Props) {
  return (
    <ul className="divide-y divide-border rounded-[1.25rem] border border-border bg-surface overflow-hidden" role="list">
      {conversations.map((conv) => {
        const name = conv.otherMember.displayName ?? "Unknown User";
        // Use Array.from to take the first full code point (emoji/astral chars are
        // surrogate pairs — charAt(0) would slice them and break SSR hydration).
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
                  <p className="truncate text-sm font-semibold text-foreground">{name}</p>
                  {conv.lastMessageAtLabel && (
                    <span className="shrink-0 text-xs text-muted">
                      {conv.lastMessageAtLabel}
                    </span>
                  )}
                </div>
                <p className={cn(
                  "mt-0.5 truncate text-sm",
                  conv.unreadCount > 0 ? "font-medium text-foreground" : "text-muted",
                )}>
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
  );
}
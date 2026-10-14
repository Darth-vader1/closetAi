import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { MessageThread } from "@/components/connect/message-thread";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getConversation, listMessages } from "@/lib/connect/queries";
import { markReadAction } from "@/app/(app)/connect/actions";

export const metadata: Metadata = { title: "Conversation · ClosetAI" };

type Params = Promise<{ id: string }>;

export default async function ConversationPage({ params }: { params: Params }) {
  const user = await requireUser();
  const { id } = await params;

  const supabase = await createClient();
  const [conversation, messages] = await Promise.all([
    getConversation(supabase, user.id, id),
    listMessages(supabase, user.id, id, 40),
  ]);

  if (!conversation) notFound();

  // Mark as read server-side on load
  await markReadAction(id);

  // Messages from the query come newest-first; reverse for display
  const orderedMessages = [...messages].reverse();

  const otherName = conversation.otherMember.displayName ?? "User";

  return (
    <div className="flex flex-col" style={{ height: "calc(100dvh - 6rem)" }}>
      {/* Header */}
      <div className="mb-4 flex items-center gap-3">
        <Link
          href="/connect"
          className="inline-flex min-h-11 items-center gap-2 text-sm font-medium text-muted hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          <span className="sr-only sm:not-sr-only">Inbox</span>
        </Link>
        <div className="flex items-center gap-3">
          {/* Avatar initials */}
          <span
            className="grid size-9 shrink-0 place-items-center rounded-full bg-accent-soft text-sm font-semibold text-accent"
            aria-hidden
          >
            {otherName.charAt(0).toUpperCase()}
          </span>
          <div>
            <p className="text-sm font-semibold text-foreground">{otherName}</p>
          </div>
        </div>
      </div>

      {/* Message thread — handles input + Realtime */}
      <MessageThread
        conversationId={id}
        currentUserId={user.id}
        initialMessages={orderedMessages}
        otherMemberName={otherName}
      />
    </div>
  );
}

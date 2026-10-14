import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { MessageThread } from "@/components/connect/message-thread";
import { ConversationShareButton } from "@/components/connect/conversation-share-button";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getConversation, listMessages } from "@/lib/connect/queries";
import { markReadAction } from "@/app/(app)/connect/actions";
import { userTag } from "@/lib/connect/user-tag";
import { getAppUrl } from "@/lib/env";

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

  const orderedMessages = [...messages].reverse();
  const otherName = conversation.otherMember.displayName ?? "User";

  // Fetch other member's closet_id for display in the header
  const { data: otherProfile } = await supabase
    .from("profiles")
    .select("closet_id")
    .eq("id", conversation.otherMember.userId)
    .maybeSingle();

  const otherClosetId =
    (otherProfile?.closet_id as string | null | undefined) ??
    userTag(conversation.otherMember.userId);

  // Shareable direct link to this conversation (both participants can use it)
  const shareUrl = `${getAppUrl()}/connect/${id}`;

  return (
    <div className="flex flex-col" style={{ height: "calc(100dvh - 6rem)" }}>
      {/* Header */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/connect"
            className="inline-flex min-h-11 shrink-0 items-center gap-2 text-sm font-medium text-muted hover:text-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden />
            <span className="sr-only sm:not-sr-only">Inbox</span>
          </Link>

          {/* Avatar + name + Closet ID */}
          <span
            className="grid size-9 shrink-0 place-items-center rounded-full bg-accent-soft text-sm font-semibold text-accent"
            aria-hidden
          >
            {otherName.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{otherName}</p>
            <p className="font-mono text-xs text-muted">{otherClosetId}</p>
          </div>
        </div>

        {/* Share this conversation */}
        <ConversationShareButton shareUrl={shareUrl} />
      </div>

      {/* Message thread */}
      <MessageThread
        conversationId={id}
        currentUserId={user.id}
        initialMessages={orderedMessages}
        otherMemberName={otherName}
      />
    </div>
  );
}

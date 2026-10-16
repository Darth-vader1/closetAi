import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Shirt } from "lucide-react";
import { MessageThread } from "@/components/connect/message-thread";
import { ConversationShareButton } from "@/components/connect/conversation-share-button";
import { ConversationSafetyMenu } from "@/components/connect/conversation-safety-menu";
import { WardrobeAccessDialog } from "@/components/connect/wardrobe-access-dialog";
import { requireUser, getProfile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import {
  getConversation,
  listMessages,
  listShareableWardrobeAndOutfits,
  listWardrobeGrantsForUser,
  markConversationRead,
} from "@/lib/connect/queries";
import { getAppUrl } from "@/lib/env";

export const metadata: Metadata = { title: "Conversation · ClosetAI" };

type Params = Promise<{ id: string }>;

export default async function ConversationPage({ params }: { params: Params }) {
  const user = await requireUser();
  const { id } = await params;

  const supabase = await createClient();
  const [conversation, messagePage, profile, shareable, grants] = await Promise.all([
    getConversation(supabase, user.id, id),
    listMessages(supabase, user.id, id, 40),
    getProfile(),
    listShareableWardrobeAndOutfits(supabase, user.id),
    listWardrobeGrantsForUser(supabase, user.id),
  ]);

  if (!conversation) notFound();

  await markConversationRead(supabase, user.id, id);

  const orderedMessages = [...messagePage.messages].reverse();
  const timeZone = profile?.timezone?.trim() || "UTC";
  const otherName = conversation.otherMember.displayName ?? "User";
  const otherUserId = conversation.otherMember.userId;
  const otherClosetId = conversation.otherMember.closetId;

  const myGrantForPartner =
    grants.grantedByMe.find((g) => g.granteeId === otherUserId) ?? null;
  const partnerGrantForMe =
    grants.grantedToMe.find((g) => g.ownerId === otherUserId) ?? null;

  const shareUrl = `${getAppUrl()}/connect/${id}`;

  return (
    <div className="flex flex-col h-[calc(100dvh-13.5rem)] lg:h-[calc(100dvh-7.5rem)]">
      {/* Header */}
      <div className="mb-3 flex items-center justify-between gap-2 sm:gap-3">
        <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
          <Link
            href="/connect"
            className="inline-flex min-h-11 shrink-0 items-center gap-2 text-sm font-medium text-muted hover:text-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden />
            <span className="sr-only sm:not-sr-only">Inbox</span>
          </Link>

          <span
            className="grid size-8 sm:size-9 shrink-0 place-items-center rounded-full bg-accent-soft text-xs sm:text-sm font-semibold text-accent"
            aria-hidden
          >
            {(Array.from(otherName)[0] ?? "?").toUpperCase()}
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 sm:gap-2">
              <p className="truncate text-sm font-semibold text-foreground">{otherName}</p>
              <span className="hidden font-mono text-xs text-muted sm:inline">{otherClosetId}</span>
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <WardrobeAccessDialog
            granteeId={otherUserId}
            granteeName={otherName}
            conversationId={id}
            existingGrant={myGrantForPartner}
            myItems={shareable.items}
          />
          <ConversationShareButton shareUrl={shareUrl} />
          <ConversationSafetyMenu
            conversationId={id}
            otherUserId={otherUserId}
            otherName={otherName}
            otherClosetId={otherClosetId}
          />
        </div>
      </div>

      {/* Partner shared wardrobe banner */}
      {partnerGrantForMe && partnerGrantForMe.canViewItems && (
        <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-accent/30 bg-accent-soft/40 px-4 py-2.5 text-xs">
          <div className="flex items-center gap-2 text-foreground">
            <Shirt className="size-4 shrink-0 text-accent" aria-hidden />
            <span>
              <strong>{otherName}</strong>{" "}
              <span className="font-mono text-muted">({otherClosetId})</span> shared{" "}
              {partnerGrantForMe.scope === "wardrobe"
                ? "their wardrobe"
                : `${partnerGrantForMe.selectedItemIds.length} clothing item(s)`}{" "}
              with you.
            </span>
          </div>
          <Link
            href={`/connect/shared/${partnerGrantForMe.id}`}
            className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-accent px-3 py-1.5 font-semibold text-accent-foreground hover:bg-accent-hover"
          >
            <span>Browse &amp; Style</span>
            <ExternalLink className="size-3" aria-hidden />
          </Link>
        </div>
      )}

      {/* Message thread */}
      <MessageThread
        conversationId={id}
        currentUserId={user.id}
        initialMessages={orderedMessages}
        initialHasMore={messagePage.hasMore}
        initialNextCursor={messagePage.nextCursor}
        conversationStatus={conversation.status}
        requesterId={conversation.requesterId}
        otherMemberId={otherUserId}
        otherMemberName={otherName}
        otherMemberClosetId={otherClosetId}
        shareableItems={shareable.items}
        shareableOutfits={shareable.outfits}
        referenceNowMs={messagePage.referenceNowMs}
        timeZone={timeZone}
      />
    </div>
  );
}

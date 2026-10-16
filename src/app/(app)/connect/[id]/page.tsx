import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, Shirt } from "lucide-react";
import { MessageThread } from "@/components/connect/message-thread";
import { ConversationShareButton } from "@/components/connect/conversation-share-button";
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
import { userTag } from "@/lib/connect/user-tag";
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

  // Fetch other member's closet_id via the restricted connect_user_profiles view
  const { data: otherProfile } = await supabase
    .from("connect_user_profiles")
    .select("closet_id")
    .eq("id", otherUserId)
    .maybeSingle();

  const otherClosetId =
    (otherProfile?.closet_id as string | null | undefined) ??
    userTag(otherUserId);

  const myGrantForPartner =
    grants.grantedByMe.find((g) => g.granteeId === otherUserId) ?? null;
  const partnerGrantForMe =
    grants.grantedToMe.find((g) => g.ownerId === otherUserId) ?? null;

  const shareUrl = `${getAppUrl()}/connect/${id}`;

  return (
    <div className="flex flex-col" style={{ height: "calc(100dvh - 7.5rem)" }}>
      {/* Header */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <Link
            href="/connect"
            className="inline-flex min-h-11 shrink-0 items-center gap-2 text-sm font-medium text-muted hover:text-foreground"
          >
            <ArrowLeft className="size-4" aria-hidden />
            <span className="sr-only sm:not-sr-only">Inbox</span>
          </Link>

          <span
            className="grid size-9 shrink-0 place-items-center rounded-full bg-accent-soft text-sm font-semibold text-accent"
            aria-hidden
          >
            {(Array.from(otherName)[0] ?? "?").toUpperCase()}
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-foreground">{otherName}</p>
            <p className="font-mono text-xs text-muted">{otherClosetId}</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <WardrobeAccessDialog
            granteeId={otherUserId}
            granteeName={otherName}
            conversationId={id}
            existingGrant={myGrantForPartner}
            myItems={shareable.items}
          />
          <ConversationShareButton shareUrl={shareUrl} />
        </div>
      </div>

      {/* Partner shared wardrobe banner */}
      {partnerGrantForMe && partnerGrantForMe.canViewItems && (
        <div className="mb-3 flex items-center justify-between gap-3 rounded-xl border border-accent/30 bg-accent-soft/40 px-4 py-2.5 text-xs">
          <div className="flex items-center gap-2 text-foreground">
            <Shirt className="size-4 shrink-0 text-accent" aria-hidden />
            <span>
              <strong>{otherName}</strong> shared{" "}
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
        otherMemberName={otherName}
        shareableItems={shareable.items}
        shareableOutfits={shareable.outfits}
        referenceNowMs={messagePage.referenceNowMs}
        timeZone={timeZone}
      />
    </div>
  );
}

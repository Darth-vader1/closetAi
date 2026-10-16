import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck, Users } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/card";
import { ConversationList } from "@/components/connect/conversation-list";
import { NewConversationButton } from "@/components/connect/new-conversation-button";
import { ClosetIdCard } from "@/components/connect/closet-id-card";
import { ConnectPushPrompt } from "@/components/connect/connect-notification-provider";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import {
  listConversations,
  listWardrobeGrantsForUser,
} from "@/lib/connect/queries";
import { userTag } from "@/lib/connect/user-tag";
import { getAppUrl } from "@/lib/env";

export const metadata: Metadata = { title: "Connect · ClosetAI" };

export default async function ConnectPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const [conversations, profileRow, grants] = await Promise.all([
    listConversations(supabase, user.id).catch(() => []),
    supabase
      .from("profiles")
      .select("closet_id")
      .eq("id", user.id)
      .maybeSingle(),
    listWardrobeGrantsForUser(supabase, user.id).catch(() => ({
      grantedByMe: [],
      grantedToMe: [],
    })),
  ]);

  const closetId =
    (profileRow.data?.closet_id as string | null | undefined) ??
    userTag(user.id);

  const shareUrl = `${getAppUrl()}/connect?invite=${user.id}`;

  return (
    <>
      <PageHeader
        title="Connect"
        description="Message friends, share outfits, and collaborate on style."
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Link
              href="/connect/sharing"
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border bg-surface px-3.5 py-2 text-xs font-semibold text-foreground transition-colors hover:bg-surface-muted"
            >
              <ShieldCheck className="size-4 text-accent" aria-hidden />
              <span>Wardrobe Access</span>
              {(grants.grantedByMe.length > 0 || grants.grantedToMe.length > 0) && (
                <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[0.68rem] font-bold text-accent">
                  {grants.grantedByMe.length + grants.grantedToMe.length}
                </span>
              )}
            </Link>
            <NewConversationButton />
          </div>
        }
      />

      {/* Push notification opt-in prompt */}
      <div className="mb-4">
        <ConnectPushPrompt />
      </div>

      {/* Closet ID card — always visible so users can share their ID with friends */}
      <ClosetIdCard closetId={closetId} shareUrl={shareUrl} />

      {conversations.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No conversations yet"
          action={<NewConversationButton label="Start your first conversation" />}
        >
          Share your Closet ID with a friend so they can find the right you.
        </EmptyState>
      ) : (
        <ConversationList
          conversations={conversations}
          currentUserId={user.id}
        />
      )}
    </>
  );
}

import type { Metadata } from "next";
import { Users } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/card";
import { ConversationList } from "@/components/connect/conversation-list";
import { NewConversationButton } from "@/components/connect/new-conversation-button";
import { ClosetIdCard } from "@/components/connect/closet-id-card";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { listConversations } from "@/lib/connect/queries";
import { userTag } from "@/lib/connect/user-tag";
import { getAppUrl } from "@/lib/env";

export const metadata: Metadata = { title: "Connect · ClosetAI" };

export default async function ConnectPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const [conversations, profileRow] = await Promise.all([
    listConversations(supabase, user.id).catch(() => []),
    supabase
      .from("profiles")
      .select("closet_id")
      .eq("id", user.id)
      .maybeSingle(),
  ]);

  // Use DB closet_id when available; fall back to UUID-derived tag for
  // pre-migration deployments.
  const closetId =
    (profileRow.data?.closet_id as string | null | undefined) ??
    userTag(user.id);

  // The shareable link lets a user send their inbox directly to a friend.
  const shareUrl = `${getAppUrl()}/connect?invite=${user.id}`;

  return (
    <>
      <PageHeader
        title="Connect"
        description="Message friends, share outfits, and collaborate on style."
        action={<NewConversationButton />}
      />

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
        <ConversationList conversations={conversations} currentUserId={user.id} />
      )}
    </>
  );
}

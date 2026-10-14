import type { Metadata } from "next";
import { Users } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { EmptyState } from "@/components/ui/card";
import { ConversationList } from "@/components/connect/conversation-list";
import { NewConversationButton } from "@/components/connect/new-conversation-button";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { listConversations } from "@/lib/connect/queries";

export const metadata: Metadata = { title: "Connect · ClosetAI" };

export default async function ConnectPage() {
  const user = await requireUser();
  const supabase = await createClient();
  const conversations = await listConversations(supabase, user.id).catch(() => []);

  return (
    <>
      <PageHeader
        title="Connect"
        description="Message friends, share outfits, and collaborate on style."
        action={<NewConversationButton />}
      />

      {conversations.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No conversations yet"
          action={<NewConversationButton label="Start your first conversation" />}
        >
          Find a friend on ClosetAI and start sharing outfit ideas.
        </EmptyState>
      ) : (
        <ConversationList conversations={conversations} currentUserId={user.id} />
      )}
    </>
  );
}

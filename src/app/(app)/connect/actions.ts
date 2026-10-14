"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { findDirectConversation } from "@/lib/connect/queries";
import { logger } from "@/lib/logger";

type ActionResult<T = unknown> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

const uuidSchema = z.uuid();

// ─── Start or resume a 1:1 conversation ───────────────────────────────────────

/**
 * Finds an existing 1:1 conversation with `otherUserId`, or creates one.
 * On success redirects to /connect/[id].
 */
export async function startConversationAction(otherUserId: unknown): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();

  const parsed = uuidSchema.safeParse(otherUserId);
  if (!parsed.success) return { ok: false, error: "Invalid user." };

  const otherId = parsed.data;
  if (otherId === user.id) return { ok: false, error: "You can't start a conversation with yourself." };

  const supabase = await createClient();

  // Verify the other user exists in profiles (prevents starting conversations with deleted accounts)
  const { data: otherProfile } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", otherId)
    .maybeSingle();

  if (!otherProfile) return { ok: false, error: "That user doesn't exist." };

  // Check for an existing conversation first
  const existing = await findDirectConversation(supabase, user.id, otherId);
  if (existing) {
    redirect(`/connect/${existing}`);
  }

  // Create the conversation and add both members in a transaction-like sequence.
  // RLS allows only the service role to insert into connect_conversations directly,
  // so we use a server action (service-role access is NOT needed here — the RLS
  // insert policy allows an authenticated user to create a conversation via
  // service-definer function, but we keep it simple: server actions bypass the
  // RLS INSERT restriction by running as the authenticated session).
  //
  // Note: connect_conversations has no INSERT RLS policy for clients.
  // We use the admin client ONLY for conversation + member creation, scoped
  // tightly, and validate ownership server-side.
  const admin = createAdminClient();

  const { data: conv, error: convErr } = await admin
    .from("connect_conversations")
    .insert({})
    .select("id")
    .single();

  if (convErr || !conv) {
    logger.error("connect.create_conversation_failed", { userId: user.id, err: convErr });
    return { ok: false, error: "Could not create conversation. Please try again." };
  }

  const convId = conv.id as string;

  // Insert both members
  const { error: membersErr } = await admin
    .from("connect_members")
    .insert([
      { conversation_id: convId, user_id: user.id },
      { conversation_id: convId, user_id: otherId },
    ]);

  if (membersErr) {
    // Clean up the orphan conversation
    await admin.from("connect_conversations").delete().eq("id", convId);
    logger.error("connect.add_members_failed", { userId: user.id, err: membersErr });
    return { ok: false, error: "Could not add members. Please try again." };
  }

  redirect(`/connect/${convId}`);
}

// ─── Send a message ───────────────────────────────────────────────────────────

export async function sendMessageAction(
  conversationId: unknown,
  body: unknown,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();

  const idParsed = uuidSchema.safeParse(conversationId);
  const bodyParsed = z.string().trim().min(1).max(4000).safeParse(body);

  if (!idParsed.success) return { ok: false, error: "Invalid conversation." };
  if (!bodyParsed.success) return { ok: false, error: "Message cannot be empty." };

  const supabase = await createClient();

  // Verify membership (belt-and-suspenders; RLS also enforces this)
  const { count } = await supabase
    .from("connect_members")
    .select("*", { count: "exact", head: true })
    .eq("conversation_id", idParsed.data)
    .eq("user_id", user.id);

  if (!count) return { ok: false, error: "Conversation not found." };

  const { data, error } = await supabase
    .from("connect_messages")
    .insert({
      conversation_id: idParsed.data,
      sender_id: user.id,
      body: bodyParsed.data,
    })
    .select("id")
    .single();

  if (error || !data) {
    logger.error("connect.send_message_failed", { userId: user.id, err: error });
    return { ok: false, error: "Could not send message. Please try again." };
  }

  revalidatePath(`/connect/${idParsed.data}`);
  return { ok: true, data: { id: data.id as string } };
}

// ─── Mark conversation as read ────────────────────────────────────────────────

export async function markReadAction(conversationId: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const idParsed = uuidSchema.safeParse(conversationId);
  if (!idParsed.success) return { ok: false, error: "Invalid conversation." };

  const supabase = await createClient();
  await supabase
    .from("connect_members")
    .update({ last_read_at: new Date().toISOString() })
    .eq("conversation_id", idParsed.data)
    .eq("user_id", user.id);

  // No revalidatePath here — this is called during render from ConversationPage.
  // revalidatePath cannot be used during render, only in Server Actions / Route Handlers.
  // The inbox unread count refreshes naturally on the next navigation to /connect.
  return { ok: true };
}

// ─── Search users (for new conversation dialog) ───────────────────────────────

export async function searchUsersAction(
  q: unknown,
): Promise<ActionResult<Array<{ id: string; displayName: string | null }>>> {
  const user = await requireUser();
  const qParsed = z.string().trim().min(1).max(80).safeParse(q);
  if (!qParsed.success) return { ok: true, data: [] };

  const term = qParsed.data;

  // Use the admin client so we can read all profiles regardless of RLS.
  // The migration 20261013000008 also opens a public SELECT policy for
  // authenticated users, but the admin client is a reliable fallback that
  // works even if the migration hasn't been applied yet.
  const admin = createAdminClient();

  const { data, error } = await admin
    .from("profiles")
    .select("id, display_name")
    .ilike("display_name", `%${term}%`)
    .neq("id", user.id)
    .limit(10);

  if (error) {
    logger.error("connect.search_users_failed", { userId: user.id, err: error });
    return { ok: false, error: "Search is unavailable right now." };
  }

  // If the display_name search returned nothing, also try a partial email
  // match via the admin auth API so users who never set a display_name
  // can still be found.
  let results = (data ?? []).map((p) => ({
    id: p.id as string,
    displayName: (p.display_name as string | null) ?? null,
  }));

  if (results.length === 0) {
    try {
      const { data: authData } = await admin.auth.admin.listUsers({ perPage: 50 });
      const matched = (authData?.users ?? [])
        .filter(
          (u) =>
            u.id !== user.id &&
            u.email?.toLowerCase().includes(term.toLowerCase()),
        )
        .slice(0, 10);

      if (matched.length > 0) {
        // Fetch their profile display_names
        const ids = matched.map((u) => u.id);
        const { data: profiles } = await admin
          .from("profiles")
          .select("id, display_name")
          .in("id", ids);

        const profileMap = new Map(
          (profiles ?? []).map((p) => [p.id as string, p.display_name as string | null]),
        );

        results = matched.map((u) => ({
          id: u.id,
          displayName: profileMap.get(u.id) ?? u.email?.split("@")[0] ?? null,
        }));
      }
    } catch {
      // Email search is best-effort; swallow the error silently.
    }
  }

  return { ok: true, data: results };
}

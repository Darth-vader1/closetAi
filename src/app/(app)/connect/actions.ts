"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { markConversationRead } from "@/lib/connect/queries";
import { logger } from "@/lib/logger";

type ActionResult<T = unknown> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

const uuidSchema = z.uuid();

// ─── Start or resume a 1:1 conversation ───────────────────────────────────────

/**
 * Finds an existing 1:1 conversation with `otherUserId`, or creates one.
 * Delegates to the SECURITY DEFINER RPC start_direct_conversation(), which
 * atomically creates the conversation + both members and reuses an existing
 * 1:1 conversation. On success redirects to /connect/[id].
 */
export async function startConversationAction(otherUserId: unknown): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();

  const parsed = uuidSchema.safeParse(otherUserId);
  if (!parsed.success) return { ok: false, error: "Invalid user." };

  const otherId = parsed.data;
  if (otherId === user.id) return { ok: false, error: "You can't start a conversation with yourself." };

  const supabase = await createClient();

  const { data: convId, error } = await supabase.rpc("start_direct_conversation", {
    p_other_user_id: otherId,
  });

  if (error || !convId) {
    logger.error("connect.start_conversation_failed", { userId: user.id, err: error });
    const msg = error?.message ?? "";
    if (msg.includes("yourself")) return { ok: false, error: "You can't start a conversation with yourself." };
    if (msg.includes("not found")) return { ok: false, error: "That user doesn't exist." };
    if (msg.includes("blocked") || msg.includes("cannot start a conversation")) return { ok: false, error: "You cannot message this user." };
    if (msg.includes("RATE_LIMITED")) return { ok: false, error: "You've started too many conversations recently. Try again later." };
    return { ok: false, error: "Could not create conversation. Please try again." };
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
    const msg = error?.message ?? "";
    if (msg.includes("accept this conversation")) return { ok: false, error: "The other person needs to accept this conversation first." };
    if (msg.includes("one message until")) return { ok: false, error: "You can only send one message until they accept." };
    if (msg.includes("RATE_LIMITED")) return { ok: false, error: "You're sending messages too quickly. Slow down." };
    if (msg.includes("cannot send messages")) return { ok: false, error: "You cannot message this user." };
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
  await markConversationRead(supabase, user.id, idParsed.data);

  return { ok: true };
}

// ─── Search users (for new conversation dialog) ───────────────────────────────

export async function searchUsersAction(
  q: unknown,
): Promise<ActionResult<Array<{ id: string; displayName: string | null; closetId: string | null }>>> {
  const user = await requireUser();
  const qParsed = z.string().trim().min(1).max(80).safeParse(q);
  if (!qParsed.success) return { ok: true, data: [] };

  const supabase = await createClient();

  // Search via the SECURITY DEFINER RPC connect_search_users(), which:
  //   • matches closet_id exactly (case-insensitive),
  //   • matches display_name only for profiles with discoverable = true,
  //   • rate-limits to 20 searches/minute/user,
  //   • never returns email or other private profile data.
  const { data: rows, error } = await supabase.rpc("connect_search_users", {
    p_term: qParsed.data,
  });

  if (error) {
    logger.error("connect.search_users_failed", { userId: user.id, err: error });
    if (error.message?.includes("RATE_LIMITED")) {
      return { ok: false, error: "You're searching too quickly. Slow down." };
    }
    return { ok: false, error: "Search is unavailable right now." };
  }

  const data = (rows ?? []).map((r: Record<string, unknown>) => ({
    id: r.id as string,
    displayName: (r.display_name as string | null) ?? null,
    closetId: (r.closet_id as string | null) ?? null,
  }));

  return { ok: true, data };
}

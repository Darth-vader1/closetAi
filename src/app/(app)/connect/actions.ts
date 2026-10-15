"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { markConversationRead } from "@/lib/connect/queries";
import { userTag } from "@/lib/connect/user-tag";
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
): Promise<ActionResult<Array<{ id: string; displayName: string | null; tag: string; closetId: string | null }>>> {
  const user = await requireUser();
  const qParsed = z.string().trim().min(1).max(80).safeParse(q);
  if (!qParsed.success) return { ok: true, data: [] };

  const term = qParsed.data;
  const supabase = await createClient();

  // Search by display_name OR closet_id via the restricted connect_user_profiles
  // view (exposes only id + display_name + closet_id to authenticated users).
  // closet_id is stored uppercase; ilike is case-insensitive so "clos-a3f8c249"
  // matches "CLOS-A3F8C249".
  const safeTerm = term.replace(/[%_\\]/g, (c) => `\\${c}`);
  const { data: profileRows, error } = await supabase
    .from("connect_user_profiles")
    .select("id, display_name, closet_id")
    .or(`display_name.ilike.%${safeTerm}%,closet_id.ilike.%${safeTerm}%`)
    .neq("id", user.id)
    .limit(10);

  if (error) {
    logger.error("connect.search_users_failed", { userId: user.id, err: error });
    return { ok: false, error: "Search is unavailable right now." };
  }

  let results = (profileRows ?? []).map((p) => ({
    id: p.id as string,
    displayName: (p.display_name as string | null) ?? null,
    closetId: (p.closet_id as string | null) ?? null,
    tag: userTag(p.id as string), // fallback only
  }));

  // If display_name search returned nothing, fall back to email search
  // so users who haven't set a display name can still be found.
  if (results.length === 0) {
    try {
      const admin = createAdminClient();
      const { data: authData } = await admin.auth.admin.listUsers({ perPage: 1000 });
      const matched = (authData?.users ?? [])
        .filter((u) =>
          u.id !== user.id &&
          u.email?.toLowerCase().includes(term.toLowerCase()),
        )
        .slice(0, 10);

      if (matched.length > 0) {
        const ids = matched.map((u) => u.id);
        const { data: profiles } = await supabase
          .from("connect_user_profiles")
          .select("id, display_name, closet_id")
          .in("id", ids);

        const profileMap = new Map(
          (profiles ?? []).map((p) => [
            p.id as string,
            { displayName: p.display_name as string | null, closetId: p.closet_id as string | null },
          ]),
        );

        results = matched.map((u) => ({
          id: u.id,
          displayName: profileMap.get(u.id)?.displayName ?? u.email?.split("@")[0] ?? null,
          closetId: profileMap.get(u.id)?.closetId ?? null,
          tag: userTag(u.id),
        }));
      }
    } catch {
      // Email fallback is best-effort.
    }
  }

  return { ok: true, data: results };
}

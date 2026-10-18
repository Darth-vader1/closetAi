"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import {
  hydrateAttachmentsForMessages,
  listMessages,
  markConversationRead,
  type Message,
} from "@/lib/connect/queries";
import { logger } from "@/lib/logger";

type ActionResult<T = unknown> =
  | { ok: true; data?: T }
  | { ok: false; error: string };

const uuidSchema = z.uuid();

// ─── Start or resume a 1:1 conversation ───────────────────────────────────────

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

// ─── Accept a pending conversation request ────────────────────────────────────

export async function acceptConversationAction(
  conversationId: unknown,
): Promise<ActionResult> {
  const user = await requireUser();
  const idParsed = uuidSchema.safeParse(conversationId);
  if (!idParsed.success) return { ok: false, error: "Invalid conversation." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("accept_conversation", {
    p_conversation_id: idParsed.data,
  });

  if (error) {
    logger.error("connect.accept_conversation_failed", { userId: user.id, err: error });
    const msg = error.message ?? "";
    if (msg.includes("Only the recipient")) {
      return { ok: false, error: "Only the recipient can accept this request." };
    }
    return { ok: false, error: "Could not accept conversation request." };
  }

  revalidatePath(`/connect/${idParsed.data}`);
  revalidatePath("/connect");
  return { ok: true };
}

// ─── Send a message ───────────────────────────────────────────────────────────

export async function sendMessageAction(
  conversationId: unknown,
  body: unknown,
): Promise<ActionResult<{ id: string; message: Message }>> {
  const user = await requireUser();

  const idParsed = uuidSchema.safeParse(conversationId);
  const bodyParsed = z.string().trim().min(1).max(4000).safeParse(body);

  if (!idParsed.success) return { ok: false, error: "Invalid conversation." };
  if (!bodyParsed.success) return { ok: false, error: "Message cannot be empty." };

  const supabase = await createClient();

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
    .select("id, conversation_id, sender_id, body, created_at, deleted_at")
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

  const message: Message = {
    id: data.id as string,
    conversationId: data.conversation_id as string,
    senderId: user.id,
    senderName: "You",
    senderClosetId: null,
    body: data.body as string,
    createdAt: data.created_at as string,
    deletedAt: null,
    attachments: [],
  };

  revalidatePath(`/connect/${idParsed.data}`);
  return { ok: true, data: { id: data.id as string, message } };
}

// ─── Share wardrobe items & saved outfits in a conversation ───────────────────

const shareInConversationSchema = z.object({
  conversationId: z.uuid(),
  body: z.string().trim().max(4000).optional(),
  itemIds: z.array(z.uuid()).max(8).default([]),
  outfitIds: z.array(z.uuid()).max(4).default([]),
});

export async function shareInConversationAction(
  rawInput: unknown,
): Promise<ActionResult<{ message: Message }>> {
  const user = await requireUser();
  const parsed = shareInConversationSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: "Invalid share request." };
  }

  const { conversationId, body, itemIds, outfitIds } = parsed.data;
  const uniqueItems = [...new Set(itemIds)];
  const uniqueOutfits = [...new Set(outfitIds)];

  if (uniqueItems.length === 0 && uniqueOutfits.length === 0) {
    return { ok: false, error: "Select at least one clothing item or saved outfit to share." };
  }

  const parts: string[] = [];
  if (uniqueItems.length > 0) {
    parts.push(`${uniqueItems.length} ${uniqueItems.length === 1 ? "clothing item" : "clothing items"}`);
  }
  if (uniqueOutfits.length > 0) {
    parts.push(`${uniqueOutfits.length} ${uniqueOutfits.length === 1 ? "saved outfit" : "saved outfits"}`);
  }
  const finalBody = body && body.length > 0 ? body : `Shared ${parts.join(" and ")}`;

  const supabase = await createClient();

  // 1. Insert the parent message (RLS + consent + rate limit triggers apply)
  const { data: msgRow, error: msgErr } = await supabase
    .from("connect_messages")
    .insert({
      conversation_id: conversationId,
      sender_id: user.id,
      body: finalBody,
    })
    .select("id, conversation_id, sender_id, body, created_at, deleted_at")
    .single();

  if (msgErr || !msgRow) {
    logger.error("connect.share_message_failed", { userId: user.id, err: msgErr });
    const msg = msgErr?.message ?? "";
    if (msg.includes("accept this conversation")) {
      return { ok: false, error: "Accept this conversation request before sharing items." };
    }
    if (msg.includes("one message until")) {
      return { ok: false, error: "You can only send one message until they accept." };
    }
    if (msg.includes("RATE_LIMITED")) {
      return { ok: false, error: "You're sending messages too quickly. Slow down." };
    }
    return { ok: false, error: "Could not share in this conversation." };
  }

  const messageId = msgRow.id as string;

  // 2. Insert attachment rows (DB trigger verifies item/outfit ownership)
  const attachmentPayloads = [
    ...uniqueItems.map((itemId) => ({
      message_id: messageId,
      conversation_id: conversationId,
      owner_id: user.id,
      kind: "item" as const,
      item_id: itemId,
      outfit_id: null,
    })),
    ...uniqueOutfits.map((outfitId) => ({
      message_id: messageId,
      conversation_id: conversationId,
      owner_id: user.id,
      kind: "outfit" as const,
      item_id: null,
      outfit_id: outfitId,
    })),
  ];

  const { error: attErr } = await supabase
    .from("connect_message_attachments")
    .insert(attachmentPayloads);

  if (attErr) {
    logger.error("connect.share_attachments_failed", { userId: user.id, err: attErr });
    // Roll back the message so no empty orphan message remains
    await supabase.from("connect_messages").delete().eq("id", messageId);
    return { ok: false, error: "You can only share clothing items and outfits that you own." };
  }

  const attachmentsMap = await hydrateAttachmentsForMessages(supabase, [messageId]);

  const hydratedMessage: Message = {
    id: messageId,
    conversationId,
    senderId: user.id,
    senderName: "You",
    senderClosetId: null,
    body: msgRow.body as string,
    createdAt: msgRow.created_at as string,
    deletedAt: null,
    attachments: attachmentsMap.get(messageId) ?? [],
  };

  revalidatePath(`/connect/${conversationId}`);
  return { ok: true, data: { message: hydratedMessage } };
}

// ─── Revoke a shared message attachment ───────────────────────────────────────

export async function revokeAttachmentAction(
  attachmentId: unknown,
  conversationId?: unknown,
): Promise<ActionResult> {
  const user = await requireUser();
  const idParsed = uuidSchema.safeParse(attachmentId);
  if (!idParsed.success) return { ok: false, error: "Invalid attachment." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("connect_message_attachments")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", idParsed.data)
    .eq("owner_id", user.id);

  if (error) {
    logger.error("connect.revoke_attachment_failed", { userId: user.id, err: error });
    return { ok: false, error: "Could not unshare item." };
  }

  if (typeof conversationId === "string" && uuidSchema.safeParse(conversationId).success) {
    revalidatePath(`/connect/${conversationId}`);
  }
  revalidatePath("/connect");
  return { ok: true };
}

// ─── Load older messages (cursor pagination) ──────────────────────────────────

export async function loadMoreMessagesAction(
  conversationId: unknown,
  cursor: unknown,
): Promise<
  ActionResult<{
    messages: Message[];
    hasMore: boolean;
    nextCursor: string | null;
  }>
> {
  const user = await requireUser();
  const idParsed = uuidSchema.safeParse(conversationId);
  const cursorParsed = z.string().min(1).max(64).safeParse(cursor);

  if (!idParsed.success || !cursorParsed.success) {
    return { ok: false, error: "Invalid pagination request." };
  }

  const supabase = await createClient();
  const page = await listMessages(supabase, user.id, idParsed.data, 40, cursorParsed.data);

  return {
    ok: true,
    data: {
      messages: [...page.messages].reverse(),
      hasMore: page.hasMore,
      nextCursor: page.nextCursor,
    },
  };
}

// ─── Hydrate attachments for a Realtime message ───────────────────────────────

export async function hydrateMessageAttachmentsAction(
  conversationId: unknown,
  messageId: unknown,
): Promise<ActionResult<{ attachments: Message["attachments"] }>> {
  const user = await requireUser();
  const convParsed = uuidSchema.safeParse(conversationId);
  const msgParsed = uuidSchema.safeParse(messageId);
  if (!convParsed.success || !msgParsed.success) {
    return { ok: false, error: "Invalid message." };
  }

  const supabase = await createClient();
  const { count } = await supabase
    .from("connect_members")
    .select("*", { count: "exact", head: true })
    .eq("conversation_id", convParsed.data)
    .eq("user_id", user.id);

  if (!count) return { ok: false, error: "Unauthorized." };

  const map = await hydrateAttachmentsForMessages(supabase, [msgParsed.data]);
  return { ok: true, data: { attachments: map.get(msgParsed.data) ?? [] } };
}

// ─── Controlled Wardrobe-Sharing Grants ───────────────────────────────────────

const upsertGrantSchema = z.object({
  granteeId: z.uuid(),
  conversationId: z.uuid().nullable().optional(),
  scope: z.enum(["selected_items", "wardrobe"]),
  canViewItems: z.boolean().default(true),
  canRecommend: z.boolean().default(false),
  canSubmitForApproval: z.boolean().default(false),
  canCollaborateRequest: z.boolean().default(false),
  itemIds: z.array(z.uuid()).max(200).default([]),
});

export async function upsertWardrobeGrantAction(
  rawInput: unknown,
): Promise<ActionResult<{ grantId: string }>> {
  const user = await requireUser();
  const parsed = upsertGrantSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: "Invalid sharing permissions." };
  }

  const {
    granteeId,
    conversationId,
    scope,
    canViewItems,
    canRecommend,
    canSubmitForApproval,
    canCollaborateRequest,
    itemIds,
  } = parsed.data;

  if (granteeId === user.id) {
    return { ok: false, error: "You cannot grant wardrobe access to yourself." };
  }

  const uniqueItemIds = [...new Set(itemIds)];
  if (scope === "selected_items" && uniqueItemIds.length === 0) {
    return { ok: false, error: "Pick at least one item to share, or choose 'Entire wardrobe'." };
  }

  const supabase = await createClient();

  // Check if an active grant already exists for (owner_id, grantee_id)
  const { data: existing } = await supabase
    .from("connect_wardrobe_grants")
    .select("id")
    .eq("owner_id", user.id)
    .eq("grantee_id", granteeId)
    .is("revoked_at", null)
    .maybeSingle();

  let grantId: string;

  if (existing?.id) {
    grantId = existing.id as string;
    const { error: updErr } = await supabase
      .from("connect_wardrobe_grants")
      .update({
        conversation_id: conversationId ?? null,
        scope,
        can_view_items: canViewItems,
        can_recommend: canRecommend,
        can_submit_for_approval: canSubmitForApproval,
        can_collaborate_request: canCollaborateRequest,
      })
      .eq("id", grantId)
      .eq("owner_id", user.id);

    if (updErr) {
      logger.error("connect.update_grant_failed", { userId: user.id, err: updErr });
      return { ok: false, error: "Could not update wardrobe access." };
    }
  } else {
    const { data: inserted, error: insErr } = await supabase
      .from("connect_wardrobe_grants")
      .insert({
        owner_id: user.id,
        grantee_id: granteeId,
        conversation_id: conversationId ?? null,
        scope,
        can_view_items: canViewItems,
        can_recommend: canRecommend,
        can_submit_for_approval: canSubmitForApproval,
        can_collaborate_request: canCollaborateRequest,
      })
      .select("id")
      .single();

    if (insErr || !inserted) {
      logger.error("connect.insert_grant_failed", { userId: user.id, err: insErr });
      return { ok: false, error: "Could not grant wardrobe access." };
    }
    grantId = inserted.id as string;
  }

  // Sync connect_grant_items
  await supabase
    .from("connect_grant_items")
    .delete()
    .eq("grant_id", grantId)
    .eq("owner_id", user.id);

  if (scope === "selected_items" && uniqueItemIds.length > 0) {
    const rows = uniqueItemIds.map((itemId) => ({
      grant_id: grantId,
      item_id: itemId,
      owner_id: user.id,
    }));
    const { error: itemsErr } = await supabase.from("connect_grant_items").insert(rows);
    if (itemsErr) {
      logger.error("connect.grant_items_failed", { userId: user.id, err: itemsErr });
      return { ok: false, error: "You can only grant access to items you own." };
    }
  }

  revalidatePath("/connect/sharing");
  revalidatePath(`/connect/shared/${grantId}`);
  if (conversationId) revalidatePath(`/connect/${conversationId}`);
  revalidatePath("/connect");

  return { ok: true, data: { grantId } };
}

export async function revokeWardrobeGrantAction(
  grantId: unknown,
): Promise<ActionResult> {
  const user = await requireUser();
  const idParsed = uuidSchema.safeParse(grantId);
  if (!idParsed.success) return { ok: false, error: "Invalid access grant." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("connect_wardrobe_grants")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", idParsed.data)
    .eq("owner_id", user.id);

  if (error) {
    logger.error("connect.revoke_grant_failed", { userId: user.id, err: error });
    return { ok: false, error: "Could not revoke access." };
  }

  revalidatePath("/connect/sharing");
  revalidatePath(`/connect/shared/${idParsed.data}`);
  revalidatePath("/connect");
  return { ok: true };
}

// ─── Send an outfit recommendation from a shared wardrobe grant ───────────────

const sendGrantRecommendationSchema = z.object({
  grantId: z.uuid(),
  itemNames: z.array(z.string().trim().min(1).max(120)).min(1).max(8),
  note: z.string().trim().max(1500).optional(),
});

export async function sendGrantRecommendationAction(
  rawInput: unknown,
): Promise<ActionResult<{ conversationId: string }>> {
  const user = await requireUser();
  const parsed = sendGrantRecommendationSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: "Select at least one item to recommend." };
  }

  const { grantId, itemNames, note } = parsed.data;
  const supabase = await createClient();

  const { data: grant, error: grantErr } = await supabase
    .from("connect_wardrobe_grants")
    .select("id, owner_id, grantee_id, can_recommend, revoked_at")
    .eq("id", grantId)
    .eq("grantee_id", user.id)
    .is("revoked_at", null)
    .maybeSingle();

  if (grantErr || !grant) {
    return { ok: false, error: "This wardrobe share is no longer active." };
  }

  if (!grant.can_recommend) {
    return { ok: false, error: "You don't have permission to send recommendations for this wardrobe." };
  }

  const { data: convId, error: convErr } = await supabase.rpc("start_direct_conversation", {
    p_other_user_id: grant.owner_id,
  });

  if (convErr || !convId) {
    return { ok: false, error: "Could not open conversation with the wardrobe owner." };
  }

  const pieceList = itemNames.map((n) => `• ${n}`).join("\n");
  const body = note
    ? `✨ Styling suggestion from your shared wardrobe:\n${pieceList}\n\nNote: ${note}`
    : `✨ Styling suggestion from your shared wardrobe:\n${pieceList}`;

  const { error: msgErr } = await supabase.from("connect_messages").insert({
    conversation_id: convId as string,
    sender_id: user.id,
    body,
  });

  if (msgErr) {
    const msg = msgErr.message ?? "";
    if (msg.includes("accept this conversation")) {
      return { ok: false, error: "Accept the conversation request with this user first." };
    }
    return { ok: false, error: "Could not send recommendation message." };
  }

  revalidatePath(`/connect/${convId as string}`);
  return { ok: true, data: { conversationId: convId as string } };
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

// ─── Delete own message ──────────────────────────────────────────────────────

export async function deleteMessageAction(messageId: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const idParsed = uuidSchema.safeParse(messageId);
  if (!idParsed.success) return { ok: false, error: "Invalid message." };

  const supabase = await createClient();

  // RLS policy (connect_messages_delete_own) enforces FOR DELETE where sender_id = auth.uid().
  // Note: connect_conversations.request_messages_sent is monotonic so deleting a pending
  // intro message does not reset the 1-message limit.
  const { data, error } = await supabase
    .from("connect_messages")
    .delete()
    .eq("id", idParsed.data)
    .eq("sender_id", user.id)
    .select("conversation_id")
    .maybeSingle();

  if (error) {
    logger.error("connect.delete_message_failed", { userId: user.id, err: error });
    return { ok: false, error: "Could not delete that message." };
  }
  if (!data) return { ok: false, error: "Message not found or already deleted." };

  revalidatePath(`/connect/${data.conversation_id as string}`);
  return { ok: true };
}

// ─── Load earlier messages (pagination) ──────────────────────────────────────

export async function loadEarlierMessagesAction(
  conversationId: unknown,
  cursor: unknown,
): Promise<ActionResult<{ messages: Message[]; hasMore: boolean }>> {
  const user = await requireUser();
  const idParsed = uuidSchema.safeParse(conversationId);
  const cursorParsed = z.string().min(1).safeParse(cursor);
  if (!idParsed.success) return { ok: false, error: "Invalid conversation." };
  if (!cursorParsed.success) return { ok: false, error: "Invalid cursor." };

  const supabase = await createClient();
  const PAGE = 40;

  const { messages } = await listMessages(
    supabase,
    user.id,
    idParsed.data,
    PAGE + 1,
    cursorParsed.data,
  );

  const hasMore = messages.length > PAGE;
  return {
    ok: true,
    data: { messages: hasMore ? messages.slice(0, PAGE) : messages, hasMore },
  };
}

export async function searchUsersAction(
  q: unknown,
): Promise<ActionResult<Array<{ id: string; displayName: string | null; closetId: string | null }>>> {
  const user = await requireUser();
  const qParsed = z.string().trim().min(1).max(80).safeParse(q);
  if (!qParsed.success) return { ok: true, data: [] };

  const supabase = await createClient();

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

// ─── Decline a pending conversation request ───────────────────────────────────

export async function declineConversationAction(
  conversationId: unknown,
): Promise<ActionResult> {
  const user = await requireUser();
  const idParsed = uuidSchema.safeParse(conversationId);
  if (!idParsed.success) return { ok: false, error: "Invalid conversation." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("decline_conversation", {
    p_conv_id: idParsed.data,
  });

  if (error) {
    logger.error("connect.decline_conversation_failed", { userId: user.id, err: error });
    const msg = error.message ?? "";
    if (msg.includes("Only the recipient")) {
      return { ok: false, error: "Only the recipient can decline this request." };
    }
    return { ok: false, error: "Could not decline conversation request." };
  }

  revalidatePath("/connect");
  return { ok: true };
}

// ─── Block a user ─────────────────────────────────────────────────────────────

export async function blockUserAction(
  blockedUserId: unknown,
  conversationId?: unknown,
): Promise<ActionResult> {
  const user = await requireUser();
  const idParsed = uuidSchema.safeParse(blockedUserId);
  if (!idParsed.success) return { ok: false, error: "Invalid user." };
  if (idParsed.data === user.id) return { ok: false, error: "You cannot block yourself." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("connect_blocks")
    .insert({ blocker: user.id, blocked: idParsed.data });

  if (error && !error.message?.includes("duplicate key")) {
    logger.error("connect.block_user_failed", { userId: user.id, err: error });
    return { ok: false, error: "Could not block this user." };
  }

  if (typeof conversationId === "string" && uuidSchema.safeParse(conversationId).success) {
    revalidatePath(`/connect/${conversationId}`);
  }
  revalidatePath("/connect");
  revalidatePath("/connect/sharing");
  return { ok: true };
}

// ─── Report a user (must share a conversation, 5/day limit, 1 open per pair) ──

const reportUserSchema = z.object({
  reportedUserId: z.uuid(),
  conversationId: z.uuid().nullable().optional(),
  reason: z.string().trim().min(1, "Please provide a reason.").max(1000),
});

export async function reportUserAction(
  rawInput: unknown,
): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = reportUserSchema.safeParse(rawInput);
  if (!parsed.success) {
    return { ok: false, error: "Please provide a brief reason for your report (1–1000 characters)." };
  }

  const { reportedUserId, conversationId, reason } = parsed.data;
  if (reportedUserId === user.id) {
    return { ok: false, error: "You cannot report yourself." };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("connect_reports").insert({
    reporter: user.id,
    reported_user: reportedUserId,
    conversation_id: conversationId ?? null,
    reason,
  });

  if (error) {
    logger.error("connect.report_user_failed", { userId: user.id, err: error });
    const msg = error.message ?? "";
    if (msg.includes("open report") || msg.includes("connect_reports_one_open_per_pair_idx")) {
      return { ok: false, error: "You already have an open report for this user." };
    }
    if (msg.includes("RATE_LIMITED")) {
      return { ok: false, error: "You have reached the daily report limit (5/day). Try again tomorrow." };
    }
    if (msg.includes("share a conversation")) {
      return { ok: false, error: "You can only report someone you share a conversation with." };
    }
    return { ok: false, error: "Could not submit report. Please try again." };
  }

  return { ok: true };
}


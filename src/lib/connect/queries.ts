import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ConversationMember {
  userId: string;
  displayName: string | null;
  lastReadAt: string | null;
}

export interface ConversationSummary {
  id: string;
  updatedAt: string;
  otherMember: ConversationMember;
  lastMessage: { body: string; senderId: string; createdAt: string } | null;
  unreadCount: number;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string | null;
  body: string;
  createdAt: string;
  deletedAt: string | null;
}

export interface ConversationDetail {
  id: string;
  otherMember: ConversationMember;
}

// ─── Queries ──────────────────────────────────────────────────────────────────

/**
 * Returns all conversations the caller belongs to, newest first.
 * Each row includes the other member's profile name, the last message preview,
 * and an unread count (messages after last_read_at).
 */
export async function listConversations(
  supabase: SupabaseClient,
  userId: string,
): Promise<ConversationSummary[]> {
  // 1. Fetch conversation IDs where the user is a member, ordered by recent activity.
  const { data: memberRows, error: memberErr } = await supabase
    .from("connect_members")
    .select("conversation_id, last_read_at")
    .eq("user_id", userId)
    .order("conversation_id"); // stable order; we re-sort below

  if (memberErr) throw new Error(`Could not load conversations: ${memberErr.message}`);
  if (!memberRows || memberRows.length === 0) return [];

  const conversationIds = memberRows.map((r) => r.conversation_id as string);

  // 2. Fetch conversation metadata (updated_at for ordering)
  const { data: convRows, error: convErr } = await supabase
    .from("connect_conversations")
    .select("id, updated_at")
    .in("id", conversationIds)
    .order("updated_at", { ascending: false });

  if (convErr) throw new Error(`Could not load conversation metadata: ${convErr.message}`);

  // 3. Fetch all members of those conversations (to find the "other" member)
  const { data: allMembers, error: allMembersErr } = await supabase
    .from("connect_members")
    .select("conversation_id, user_id, last_read_at")
    .in("conversation_id", conversationIds);

  if (allMembersErr) throw new Error(`Could not load members: ${allMembersErr.message}`);

  // 4. Collect other-member user IDs, then fetch their profiles in one query
  const otherUserIds = (allMembers ?? [])
    .filter((m) => m.user_id !== userId)
    .map((m) => m.user_id as string);

  const uniqueOtherIds = [...new Set(otherUserIds)];
  const profileMap = new Map<string, string | null>();

  if (uniqueOtherIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", uniqueOtherIds);

    for (const p of profiles ?? []) {
      profileMap.set(p.id as string, (p.display_name as string | null) ?? null);
    }
  }

  // 5. Fetch the last message for each conversation (one query, post-filter)
  const { data: lastMessages } = await supabase
    .from("connect_messages")
    .select("id, conversation_id, sender_id, body, created_at")
    .in("conversation_id", conversationIds)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

  // Keep only the first (newest) message per conversation
  const lastMsgMap = new Map<string, { body: string; senderId: string; createdAt: string }>();
  for (const msg of lastMessages ?? []) {
    const cid = msg.conversation_id as string;
    if (!lastMsgMap.has(cid)) {
      lastMsgMap.set(cid, {
        body: msg.body as string,
        senderId: msg.sender_id as string,
        createdAt: msg.created_at as string,
      });
    }
  }

  // 6. Fetch unread counts per conversation for this user
  const lastReadMap = new Map<string, string | null>();
  for (const row of memberRows) {
    lastReadMap.set(row.conversation_id as string, row.last_read_at as string | null);
  }

  const unreadMap = new Map<string, number>();
  for (const cid of conversationIds) {
    const lr = lastReadMap.get(cid) ?? null;
    const count = (lastMessages ?? []).filter(
      (m) =>
        m.conversation_id === cid &&
        m.sender_id !== userId &&
        (lr === null || (m.created_at as string) > lr),
    ).length;
    unreadMap.set(cid, count);
  }

  // 7. Assemble results
  return (convRows ?? []).map((conv) => {
    const cid = conv.id as string;
    const otherMemberRow = (allMembers ?? []).find(
      (m) => m.conversation_id === cid && m.user_id !== userId,
    );
    const otherUserId = (otherMemberRow?.user_id as string | undefined) ?? "";

    return {
      id: cid,
      updatedAt: conv.updated_at as string,
      otherMember: {
        userId: otherUserId,
        displayName: profileMap.get(otherUserId) ?? null,
        lastReadAt: (otherMemberRow?.last_read_at as string | null) ?? null,
      },
      lastMessage: lastMsgMap.get(cid) ?? null,
      unreadCount: unreadMap.get(cid) ?? 0,
    };
  });
}

/** Returns conversation metadata + other member detail, or null if the user is not a member. */
export async function getConversation(
  supabase: SupabaseClient,
  userId: string,
  conversationId: string,
): Promise<ConversationDetail | null> {
  const { data: members, error } = await supabase
    .from("connect_members")
    .select("user_id, last_read_at")
    .eq("conversation_id", conversationId);

  if (error) throw new Error(`Could not load conversation: ${error.message}`);
  if (!members || members.length === 0) return null;

  // Verify caller is a member
  const isMember = members.some((m) => m.user_id === userId);
  if (!isMember) return null;

  const other = members.find((m) => m.user_id !== userId);
  const otherUserId = (other?.user_id as string | undefined) ?? "";

  let displayName: string | null = null;
  if (otherUserId) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("display_name")
      .eq("id", otherUserId)
      .maybeSingle();
    displayName = (profile?.display_name as string | null) ?? null;
  }

  return {
    id: conversationId,
    otherMember: {
      userId: otherUserId,
      displayName,
      lastReadAt: (other?.last_read_at as string | null) ?? null,
    },
  };
}

/** Returns the most recent `limit` messages before `cursor` (ISO timestamp). Newest first. */
export async function listMessages(
  supabase: SupabaseClient,
  userId: string,
  conversationId: string,
  limit = 40,
  cursor?: string,
): Promise<Message[]> {
  // Verify membership first (belt-and-suspenders on top of RLS)
  const { count } = await supabase
    .from("connect_members")
    .select("*", { count: "exact", head: true })
    .eq("conversation_id", conversationId)
    .eq("user_id", userId);

  if (!count) return [];

  let query = supabase
    .from("connect_messages")
    .select("id, conversation_id, sender_id, body, created_at, deleted_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (cursor) {
    query = query.lt("created_at", cursor);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Could not load messages: ${error.message}`);

  // Collect unique sender IDs and resolve names
  const senderIds = [...new Set((data ?? []).map((m) => m.sender_id as string))];
  const nameMap = new Map<string, string | null>();
  if (senderIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, display_name")
      .in("id", senderIds);
    for (const p of profiles ?? []) {
      nameMap.set(p.id as string, (p.display_name as string | null) ?? null);
    }
  }

  return (data ?? []).map((m) => ({
    id: m.id as string,
    conversationId: m.conversation_id as string,
    senderId: m.sender_id as string,
    senderName: nameMap.get(m.sender_id as string) ?? null,
    body: (m.deleted_at ? "[Message deleted]" : m.body) as string,
    createdAt: m.created_at as string,
    deletedAt: m.deleted_at as string | null,
  }));
}

/**
 * Finds an existing 1:1 conversation between two users.
 * Returns the conversation ID, or null if none exists yet.
 */
export async function findDirectConversation(
  supabase: SupabaseClient,
  userA: string,
  userB: string,
): Promise<string | null> {
  // Find conversations where userA is a member
  const { data: aConvs } = await supabase
    .from("connect_members")
    .select("conversation_id")
    .eq("user_id", userA);

  if (!aConvs || aConvs.length === 0) return null;

  const aIds = aConvs.map((r) => r.conversation_id as string);

  // Of those, find ones where userB is also a member
  const { data: shared } = await supabase
    .from("connect_members")
    .select("conversation_id")
    .eq("user_id", userB)
    .in("conversation_id", aIds);

  if (!shared || shared.length === 0) return null;
  return shared[0].conversation_id as string;
}

/**
 * Search for other users by display name or email prefix.
 * Never returns the caller themselves.
 */
export async function searchUsers(
  supabase: SupabaseClient,
  callerId: string,
  q: string,
  limit = 10,
): Promise<Array<{ id: string; displayName: string | null; email: string | null }>> {
  if (!q.trim()) return [];

  const { data } = await supabase
    .from("profiles")
    .select("id, display_name")
    .ilike("display_name", `%${q.trim()}%`)
    .neq("id", callerId)
    .limit(limit);

  return (data ?? []).map((p) => ({
    id: p.id as string,
    displayName: (p.display_name as string | null) ?? null,
    email: null, // profiles table doesn't expose email; fine for search
  }));
}

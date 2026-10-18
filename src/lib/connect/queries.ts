import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatRelative } from "@/lib/connect/format-relative";
import { userTag } from "@/lib/connect/user-tag";
import { signImageUrls } from "@/lib/wardrobe/queries";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ConversationMember {
  userId: string;
  displayName: string | null;
  closetId: string;
  lastReadAt: string | null;
}

export interface ConversationSummary {
  id: string;
  updatedAt: string;
  status: "pending" | "active";
  requesterId: string | null;
  otherMember: ConversationMember;
  lastMessage: { body: string; senderId: string; createdAt: string } | null;
  /** Precomputed on the server so list UI does not call impure time APIs during render. */
  lastMessageAtLabel: string | null;
  unreadCount: number;
}

export interface SharedItemCardData {
  id: string;
  name: string;
  category: string;
  subcategory: string | null;
  primaryColour: string | null;
  secondaryColours: string[];
  pattern: string | null;
  material: string | null;
  style: string | null;
  occasions: string[];
  seasons: string[];
  imagePath: string;
  imageUrl: string | null;
}

export interface SharedOutfitCardData {
  id: string;
  name: string;
  occasion: string | null;
  styleDescription: string | null;
  explanation: string | null;
  stylingTip: string | null;
  photoPath: string | null;
  photoUrl: string | null;
  items: SharedItemCardData[];
}

export interface MessageAttachment {
  id: string;
  messageId: string;
  conversationId: string;
  ownerId: string;
  kind: "item" | "outfit";
  itemId: string | null;
  outfitId: string | null;
  revokedAt: string | null;
  createdAt: string;
  item: SharedItemCardData | null;
  outfit: SharedOutfitCardData | null;
}

export interface Message {
  id: string;
  conversationId: string;
  senderId: string;
  senderName: string | null;
  senderClosetId: string | null;
  body: string;
  createdAt: string;
  deletedAt: string | null;
  attachments: MessageAttachment[];
}

export interface ConversationDetail {
  id: string;
  status: "pending" | "active";
  requesterId: string | null;
  otherMember: ConversationMember;
}

export interface WardrobeGrantSummary {
  id: string;
  ownerId: string;
  ownerName: string | null;
  ownerClosetId: string;
  granteeId: string;
  granteeName: string | null;
  granteeClosetId: string;
  conversationId: string | null;
  scope: "selected_items" | "wardrobe";
  canViewItems: boolean;
  canRecommend: boolean;
  canSubmitForApproval: boolean;
  canCollaborateRequest: boolean;
  excludedCategories: string[];
  selectedItemIds: string[];
  createdAt: string;
  updatedAt: string;
}

// ─── Internal Helpers ─────────────────────────────────────────────────────────

interface PartnerProfileInfo {
  displayName: string | null;
  closetId: string;
}

/**
 * Resolves display_name and closet_id for users who share a conversation or
 * active wardrobe grant with the caller via the SECURITY DEFINER RPC
 * connect_resolve_partner_profiles().
 */
export async function resolvePartnerProfiles(
  supabase: SupabaseClient,
  userIds: string[],
): Promise<Map<string, PartnerProfileInfo>> {
  const uniqueIds = [...new Set(userIds.filter(Boolean))];
  const map = new Map<string, PartnerProfileInfo>();
  if (uniqueIds.length === 0) return map;

  const { data } = await supabase.rpc("connect_resolve_partner_profiles", {
    p_user_ids: uniqueIds,
  });

  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    const id = row.id as string;
    map.set(id, {
      displayName: (row.display_name as string | null) ?? null,
      closetId: (row.closet_id as string | null) ?? userTag(id),
    });
  }

  for (const id of uniqueIds) {
    if (!map.has(id)) {
      map.set(id, { displayName: null, closetId: userTag(id) });
    }
  }

  return map;
}

interface RawItemRow {
  id: string;
  user_id?: string;
  name: string;
  category: string;
  subcategory: string | null;
  primary_colour: string | null;
  secondary_colours: string[] | null;
  pattern: string | null;
  material: string | null;
  style: string | null;
  occasions?: string[] | null;
  seasons?: string[] | null;
  image_path: string;
  thumbnail_path?: string | null;
  medium_path?: string | null;
}

const SHARED_ITEM_COLUMNS =
  "id, user_id, name, category, subcategory, primary_colour, secondary_colours, pattern, material, style, image_path, thumbnail_path, medium_path";

function mapRawItem(row: RawItemRow, urlMap: Map<string, string>): SharedItemCardData {
  const bestPath = row.thumbnail_path ?? row.medium_path ?? row.image_path;
  return {
    id: row.id,
    name: row.name,
    category: row.category,
    subcategory: row.subcategory,
    primaryColour: row.primary_colour,
    secondaryColours: row.secondary_colours ?? [],
    pattern: row.pattern,
    material: row.material,
    style: row.style,
    occasions: row.occasions ?? [],
    seasons: row.seasons ?? [],
    imagePath: row.image_path,
    imageUrl: urlMap.get(bestPath) ?? urlMap.get(row.image_path) ?? null,
  };
}

// ─── Queries ──────────────────────────────────────────────────────────────────

/**
 * Returns all conversations the caller belongs to, newest first.
 * Excludes conversations where the caller has blocked the other member.
 */
export async function listConversations(
  supabase: SupabaseClient,
  userId: string,
): Promise<ConversationSummary[]> {
  const [{ data: memberRows, error: memberErr }, { data: blockRows }] = await Promise.all([
    supabase
      .from("connect_members")
      .select("conversation_id, last_read_at")
      .eq("user_id", userId)
      .order("conversation_id"),
    supabase
      .from("connect_blocks")
      .select("blocked")
      .eq("blocker", userId),
  ]);

  if (memberErr) throw new Error(`Could not load conversations: ${memberErr.message}`);
  if (!memberRows || memberRows.length === 0) return [];

  const blockedByMe = new Set((blockRows ?? []).map((b) => b.blocked as string));
  const conversationIds = memberRows.map((r) => r.conversation_id as string);

  const [convRes, allMembersRes, lastMessagesRes] = await Promise.all([
    supabase
      .from("connect_conversations")
      .select("id, updated_at, status, requester")
      .in("id", conversationIds)
      .order("updated_at", { ascending: false }),
    supabase
      .from("connect_members")
      .select("conversation_id, user_id, last_read_at")
      .in("conversation_id", conversationIds),
    supabase
      .from("connect_messages")
      .select("id, conversation_id, sender_id, body, created_at")
      .in("conversation_id", conversationIds)
      .is("deleted_at", null)
      .order("created_at", { ascending: false }),
  ]);

  if (convRes.error) throw new Error(`Could not load conversation metadata: ${convRes.error.message}`);
  if (allMembersRes.error) throw new Error(`Could not load members: ${allMembersRes.error.message}`);

  const convRows = convRes.data ?? [];
  const allMembers = allMembersRes.data ?? [];
  const lastMessages = lastMessagesRes.data ?? [];

  const otherUserIds = allMembers
    .filter((m) => m.user_id !== userId)
    .map((m) => m.user_id as string);

  const profileMap = await resolvePartnerProfiles(supabase, otherUserIds);

  const lastMsgMap = new Map<string, { body: string; senderId: string; createdAt: string }>();
  for (const msg of lastMessages) {
    const cid = msg.conversation_id as string;
    if (!lastMsgMap.has(cid)) {
      lastMsgMap.set(cid, {
        body: msg.body as string,
        senderId: msg.sender_id as string,
        createdAt: msg.created_at as string,
      });
    }
  }

  const lastReadMap = new Map<string, string | null>();
  for (const row of memberRows) {
    lastReadMap.set(row.conversation_id as string, row.last_read_at as string | null);
  }

  const unreadMap = new Map<string, number>();
  for (const cid of conversationIds) {
    const lr = lastReadMap.get(cid) ?? null;
    const count = lastMessages.filter(
      (m) =>
        m.conversation_id === cid &&
        m.sender_id !== userId &&
        (lr === null || (m.created_at as string) > lr),
    ).length;
    unreadMap.set(cid, count);
  }

  const nowMs = Date.now();
  const summaries: ConversationSummary[] = [];

  for (const conv of convRows) {
    const cid = conv.id as string;
    const otherMemberRow = allMembers.find(
      (m) => m.conversation_id === cid && m.user_id !== userId,
    );
    const otherUserId = (otherMemberRow?.user_id as string | undefined) ?? "";

    // Hide conversations with users the caller has blocked
    if (otherUserId && blockedByMe.has(otherUserId)) continue;

    const partnerProfile = profileMap.get(otherUserId);
    const lastMessage = lastMsgMap.get(cid) ?? null;

    summaries.push({
      id: cid,
      updatedAt: conv.updated_at as string,
      status: (conv.status === "pending" ? "pending" : "active") as "pending" | "active",
      requesterId: (conv.requester as string | null) ?? null,
      otherMember: {
        userId: otherUserId,
        displayName: partnerProfile?.displayName ?? null,
        closetId: partnerProfile?.closetId ?? userTag(otherUserId),
        lastReadAt: (otherMemberRow?.last_read_at as string | null) ?? null,
      },
      lastMessage,
      lastMessageAtLabel: lastMessage
        ? formatRelative(lastMessage.createdAt, nowMs)
        : null,
      unreadCount: unreadMap.get(cid) ?? 0,
    });
  }

  return summaries;
}

/** Returns conversation metadata + other member detail, or null if the user is not a member. */
export async function getConversation(
  supabase: SupabaseClient,
  userId: string,
  conversationId: string,
): Promise<ConversationDetail | null> {
  const [{ data: members, error }, { data: convRow }] = await Promise.all([
    supabase
      .from("connect_members")
      .select("user_id, last_read_at")
      .eq("conversation_id", conversationId),
    supabase
      .from("connect_conversations")
      .select("id, status, requester")
      .eq("id", conversationId)
      .maybeSingle(),
  ]);

  if (error) throw new Error(`Could not load conversation: ${error.message}`);
  if (!members || members.length === 0 || !convRow) return null;

  const isMember = members.some((m) => m.user_id === userId);
  if (!isMember) return null;

  const other = members.find((m) => m.user_id !== userId);
  const otherUserId = (other?.user_id as string | undefined) ?? "";

  const profileMap = otherUserId
    ? await resolvePartnerProfiles(supabase, [otherUserId])
    : new Map<string, PartnerProfileInfo>();
  const partnerProfile = profileMap.get(otherUserId);

  return {
    id: conversationId,
    status: convRow.status === "pending" ? "pending" : "active",
    requesterId: (convRow.requester as string | null) ?? null,
    otherMember: {
      userId: otherUserId,
      displayName: partnerProfile?.displayName ?? null,
      closetId: partnerProfile?.closetId ?? userTag(otherUserId),
      lastReadAt: (other?.last_read_at as string | null) ?? null,
    },
  };
}

/** Returns the most recent `limit` messages before `cursor` (ISO timestamp). Newest first. */
export interface MessagePage {
  messages: Message[];
  hasMore: boolean;
  nextCursor: string | null;
  /** Fixed at fetch time so thread timestamps hydrate consistently. */
  referenceNowMs: number;
}

export async function markConversationRead(
  supabase: SupabaseClient,
  userId: string,
  conversationId: string,
): Promise<void> {
  await supabase
    .from("connect_members")
    .update({ last_read_at: new Date().toISOString() })
    .eq("conversation_id", conversationId)
    .eq("user_id", userId);
}

/**
 * Hydrates attachments for a list of message IDs, resolving shared wardrobe items,
 * saved outfits, and batch-signing their thumbnail URLs via RLS.
 */
export async function hydrateAttachmentsForMessages(
  supabase: SupabaseClient,
  messageIds: string[],
): Promise<Map<string, MessageAttachment[]>> {
  const byMessage = new Map<string, MessageAttachment[]>();
  if (messageIds.length === 0) return byMessage;

  const { data: attRows, error: attErr } = await supabase
    .from("connect_message_attachments")
    .select("id, message_id, conversation_id, owner_id, kind, item_id, outfit_id, revoked_at, created_at")
    .in("message_id", messageIds)
    .order("created_at", { ascending: true });

  if (attErr || !attRows || attRows.length === 0) return byMessage;

  const activeItemIds = [
    ...new Set(
      attRows
        .filter((a) => !a.revoked_at && a.kind === "item" && a.item_id)
        .map((a) => a.item_id as string),
    ),
  ];

  const activeOutfitIds = [
    ...new Set(
      attRows
        .filter((a) => !a.revoked_at && a.kind === "outfit" && a.outfit_id)
        .map((a) => a.outfit_id as string),
    ),
  ];

  const [itemsResult, outfitsResult] = await Promise.all([
    activeItemIds.length > 0
      ? supabase.from("shared_wardrobe_items").select(SHARED_ITEM_COLUMNS).in("id", activeItemIds)
      : Promise.resolve({ data: [] as RawItemRow[] }),
    activeOutfitIds.length > 0
      ? supabase
          .from("outfits")
          .select(`
            id, name, occasion, style_description, explanation, styling_tip, photo_path,
            outfit_items (
              position,
              item_id
            )
          `)
          .in("id", activeOutfitIds)
      : Promise.resolve({ data: [] }),
  ]);

  const rawItems = (itemsResult.data ?? []) as RawItemRow[];
  type RawSharedOutfit = {
    id: string;
    name: string;
    occasion: string | null;
    style_description: string | null;
    explanation: string | null;
    styling_tip: string | null;
    photo_path: string | null;
    outfit_items?: Array<{
      position: number;
      item_id: string;
    }>;
  };
  const rawOutfits = (outfitsResult.data ?? []) as unknown as RawSharedOutfit[];

  const outfitMemberItemIds = [
    ...new Set(
      rawOutfits.flatMap((o) => (o.outfit_items ?? []).map((link) => link.item_id).filter(Boolean)),
    ),
  ];

  const outfitItemsResult =
    outfitMemberItemIds.length > 0
      ? await supabase
          .from("shared_wardrobe_items")
          .select(SHARED_ITEM_COLUMNS)
          .in("id", outfitMemberItemIds)
      : { data: [] as RawItemRow[] };

  const rawOutfitItems = (outfitItemsResult.data ?? []) as RawItemRow[];

  const pathsToSign: string[] = [];
  for (const it of rawItems) {
    const p = it.thumbnail_path ?? it.medium_path ?? it.image_path;
    if (p) pathsToSign.push(p);
  }
  for (const it of rawOutfitItems) {
    const p = it.thumbnail_path ?? it.medium_path ?? it.image_path;
    if (p) pathsToSign.push(p);
  }
  for (const o of rawOutfits) {
    if (o.photo_path) pathsToSign.push(o.photo_path);
  }

  const signedUrls =
    pathsToSign.length > 0
      ? await signImageUrls(supabase, pathsToSign, "thumbnail")
      : new Map<string, string>();

  const itemMap = new Map<string, SharedItemCardData>();
  for (const it of rawItems) {
    itemMap.set(it.id, mapRawItem(it, signedUrls));
  }

  const outfitItemMap = new Map<string, SharedItemCardData>();
  for (const it of rawOutfitItems) {
    outfitItemMap.set(it.id, mapRawItem(it, signedUrls));
  }

  const outfitMap = new Map<string, SharedOutfitCardData>();
  for (const o of rawOutfits) {
    const outfitItems = (o.outfit_items ?? [])
      .slice()
      .sort((a, b) => a.position - b.position)
      .flatMap((link) => {
        const card = outfitItemMap.get(link.item_id);
        return card ? [card] : [];
      });
    outfitMap.set(o.id, {
      id: o.id,
      name: o.name,
      occasion: o.occasion,
      styleDescription: o.style_description,
      explanation: o.explanation,
      stylingTip: o.styling_tip,
      photoPath: o.photo_path,
      photoUrl: o.photo_path ? (signedUrls.get(o.photo_path) ?? null) : null,
      items: outfitItems,
    });
  }

  for (const row of attRows) {
    const msgId = row.message_id as string;
    const revokedAt = (row.revoked_at as string | null) ?? null;
    const itemId = (row.item_id as string | null) ?? null;
    const outfitId = (row.outfit_id as string | null) ?? null;
    const attachment: MessageAttachment = {
      id: row.id as string,
      messageId: msgId,
      conversationId: row.conversation_id as string,
      ownerId: row.owner_id as string,
      kind: row.kind === "outfit" ? "outfit" : "item",
      itemId,
      outfitId,
      revokedAt,
      createdAt: row.created_at as string,
      item: !revokedAt && itemId ? (itemMap.get(itemId) ?? null) : null,
      outfit: !revokedAt && outfitId ? (outfitMap.get(outfitId) ?? null) : null,
    };

    const existing = byMessage.get(msgId) ?? [];
    existing.push(attachment);
    byMessage.set(msgId, existing);
  }

  return byMessage;
}

export async function listMessages(
  supabase: SupabaseClient,
  userId: string,
  conversationId: string,
  limit = 40,
  cursor?: string,
): Promise<MessagePage> {
  const { count } = await supabase
    .from("connect_members")
    .select("*", { count: "exact", head: true })
    .eq("conversation_id", conversationId)
    .eq("user_id", userId);

  const referenceNowMs = Date.now();
  if (!count) return { messages: [], hasMore: false, nextCursor: null, referenceNowMs };

  let query = supabase
    .from("connect_messages")
    .select("id, conversation_id, sender_id, body, created_at, deleted_at")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .limit(limit + 1);

  if (cursor) {
    query = query.lt("created_at", cursor);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Could not load messages: ${error.message}`);

  const rows = data ?? [];
  const hasMore = rows.length > limit;
  const pageRows = hasMore ? rows.slice(0, limit) : rows;
  const nextCursor =
    hasMore && pageRows.length > 0
      ? (pageRows[pageRows.length - 1].created_at as string)
      : null;

  const senderIds = [...new Set(pageRows.map((m) => m.sender_id as string))];
  const messageIds = pageRows.map((m) => m.id as string);

  const [profileMap, attachmentsMap] = await Promise.all([
    resolvePartnerProfiles(supabase, senderIds),
    hydrateAttachmentsForMessages(supabase, messageIds),
  ]);

  const messages: Message[] = pageRows.map((m) => {
    const id = m.id as string;
    const senderId = m.sender_id as string;
    const isDeleted = Boolean(m.deleted_at);
    const senderProfile = profileMap.get(senderId);
    return {
      id,
      conversationId: m.conversation_id as string,
      senderId,
      senderName: senderProfile?.displayName ?? null,
      senderClosetId: senderProfile?.closetId ?? userTag(senderId),
      body: (isDeleted ? "[Message deleted]" : m.body) as string,
      createdAt: m.created_at as string,
      deletedAt: m.deleted_at as string | null,
      attachments: isDeleted ? [] : (attachmentsMap.get(id) ?? []),
    };
  });

  return { messages, hasMore, nextCursor, referenceNowMs };
}

/**
 * Fetches the caller's own wardrobe items and saved outfits (with signed thumbnails)
 * so the Share Picker modal can display them immediately.
 */
export async function listShareableWardrobeAndOutfits(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ items: SharedItemCardData[]; outfits: SharedOutfitCardData[] }> {
  const [itemsRes, outfitsRes] = await Promise.all([
    supabase
      .from("wardrobe_items")
      .select(SHARED_ITEM_COLUMNS)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase
      .from("outfits")
      .select(`
        id, name, occasion, style_description, explanation, styling_tip, photo_path,
        outfit_items (
          position,
          wardrobe_items (
            id, name, category, subcategory, primary_colour, secondary_colours,
            pattern, material, style, occasions, seasons, image_path
          )
        )
      `)
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const HIDDEN_CATEGORIES = new Set(["underwear", "intimates", "swimwear"]);
  const isShareableItem = (it: RawItemRow) =>
    !HIDDEN_CATEGORIES.has((it.category ?? "").trim().toLowerCase()) &&
    !HIDDEN_CATEGORIES.has((it.subcategory ?? "").trim().toLowerCase());

  const rawItems = ((itemsRes.data ?? []) as RawItemRow[]).filter(isShareableItem);
  type RawOutfit = {
    id: string;
    name: string;
    occasion: string | null;
    style_description: string | null;
    explanation: string | null;
    styling_tip: string | null;
    photo_path: string | null;
    outfit_items?: Array<{
      position: number;
      wardrobe_items: RawItemRow | null;
    }>;
  };
  const rawOutfits = (outfitsRes.data ?? []) as unknown as RawOutfit[];

  const paths: string[] = [];
  for (const it of rawItems) {
    if (it.image_path) paths.push(it.image_path);
  }
  for (const o of rawOutfits) {
    if (o.photo_path) paths.push(o.photo_path);
    for (const link of o.outfit_items ?? []) {
      if (link.wardrobe_items?.image_path && isShareableItem(link.wardrobe_items)) {
        paths.push(link.wardrobe_items.image_path);
      }
    }
  }

  const signedUrls =
    paths.length > 0
      ? await signImageUrls(supabase, paths, "thumbnail")
      : new Map<string, string>();

  const items = rawItems.map((it) => mapRawItem(it, signedUrls));
  const outfits: SharedOutfitCardData[] = rawOutfits.map((o) => ({
    id: o.id,
    name: o.name,
    occasion: o.occasion,
    styleDescription: o.style_description,
    explanation: o.explanation,
    stylingTip: o.styling_tip,
    photoPath: o.photo_path,
    photoUrl: o.photo_path ? (signedUrls.get(o.photo_path) ?? null) : null,
    items: (o.outfit_items ?? [])
      .slice()
      .sort((a, b) => a.position - b.position)
      .flatMap((l) =>
        l.wardrobe_items && isShareableItem(l.wardrobe_items)
          ? [mapRawItem(l.wardrobe_items, signedUrls)]
          : [],
      ),
  }));

  return { items, outfits };
}

/**
 * Lists active wardrobe-sharing grants granted BY the user and granted TO the user.
 */
export async function listWardrobeGrantsForUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<{
  grantedByMe: WardrobeGrantSummary[];
  grantedToMe: WardrobeGrantSummary[];
}> {
  const { data: grantRows, error } = await supabase
    .from("connect_wardrobe_grants")
    .select(`
      id, owner_id, grantee_id, conversation_id, scope,
      can_view_items, can_recommend, can_submit_for_approval, can_collaborate_request,
      excluded_categories,
      created_at, updated_at,
      connect_grant_items ( item_id )
    `)
    .is("revoked_at", null)
    .order("updated_at", { ascending: false });

  if (error || !grantRows || grantRows.length === 0) {
    return { grantedByMe: [], grantedToMe: [] };
  }

  const profileIds = [
    ...new Set(
      grantRows.flatMap((g) => [g.owner_id as string, g.grantee_id as string]),
    ),
  ];

  const profileMap = await resolvePartnerProfiles(supabase, profileIds);

  type RawGrantRow = {
    id: string;
    owner_id: string;
    grantee_id: string;
    conversation_id: string | null;
    scope: "selected_items" | "wardrobe";
    can_view_items: boolean;
    can_recommend: boolean;
    can_submit_for_approval: boolean;
    can_collaborate_request: boolean;
    excluded_categories?: string[] | null;
    created_at: string;
    updated_at: string;
    connect_grant_items?: Array<{ item_id: string }>;
  };

  const summaries: WardrobeGrantSummary[] = (grantRows as unknown as RawGrantRow[]).map((g) => {
    const ownerProfile = profileMap.get(g.owner_id);
    const granteeProfile = profileMap.get(g.grantee_id);
    return {
      id: g.id,
      ownerId: g.owner_id,
      ownerName: ownerProfile?.displayName ?? null,
      ownerClosetId: ownerProfile?.closetId ?? userTag(g.owner_id),
      granteeId: g.grantee_id,
      granteeName: granteeProfile?.displayName ?? null,
      granteeClosetId: granteeProfile?.closetId ?? userTag(g.grantee_id),
      conversationId: g.conversation_id,
      scope: g.scope === "wardrobe" ? "wardrobe" : "selected_items",
      canViewItems: Boolean(g.can_view_items),
      canRecommend: Boolean(g.can_recommend),
      canSubmitForApproval: Boolean(g.can_submit_for_approval),
      canCollaborateRequest: Boolean(g.can_collaborate_request),
      excludedCategories: Array.isArray(g.excluded_categories) ? g.excluded_categories : [],
      selectedItemIds: (g.connect_grant_items ?? []).map((gi) => gi.item_id),
      createdAt: g.created_at,
      updatedAt: g.updated_at,
    };
  });

  return {
    grantedByMe: summaries.filter((g) => g.ownerId === userId),
    grantedToMe: summaries.filter((g) => g.granteeId === userId),
  };
}

/**
 * Loads an active shared wardrobe grant and the authorized wardrobe items for a grantee
 * from the least-privilege shared_wardrobe_items view.
 */
export async function getSharedWardrobeByGrant(
  supabase: SupabaseClient,
  callerId: string,
  grantId: string,
): Promise<{ grant: WardrobeGrantSummary; items: SharedItemCardData[] } | null> {
  const { grantedByMe, grantedToMe } = await listWardrobeGrantsForUser(supabase, callerId);
  const grant =
    grantedToMe.find((g) => g.id === grantId) ??
    grantedByMe.find((g) => g.id === grantId) ??
    null;

  if (!grant || !grant.canViewItems) return null;

  let query = supabase
    .from("shared_wardrobe_items")
    .select(SHARED_ITEM_COLUMNS)
    .eq("user_id", grant.ownerId)
    .order("name", { ascending: true })
    .limit(250);

  if (grant.scope === "selected_items") {
    if (grant.selectedItemIds.length === 0) {
      return { grant, items: [] };
    }
    query = query.in("id", grant.selectedItemIds);
  }

  const { data: rows, error } = await query;
  if (error || !rows) return { grant, items: [] };

  const rawItems = rows as RawItemRow[];
  const signedUrls =
    rawItems.length > 0
      ? await signImageUrls(
          supabase,
          rawItems.map((r) => r.thumbnail_path ?? r.medium_path ?? r.image_path),
          "thumbnail",
        )
      : new Map<string, string>();

  return {
    grant,
    items: rawItems.map((r) => mapRawItem(r, signedUrls)),
  };
}

/**
 * Finds an existing 1:1 conversation between two users.
 */
export async function findDirectConversation(
  supabase: SupabaseClient,
  userA: string,
  userB: string,
): Promise<string | null> {
  const { data: aConvs } = await supabase
    .from("connect_members")
    .select("conversation_id")
    .eq("user_id", userA);

  if (!aConvs || aConvs.length === 0) return null;

  const aIds = aConvs.map((r) => r.conversation_id as string);

  const { data: shared } = await supabase
    .from("connect_members")
    .select("conversation_id")
    .eq("user_id", userB)
    .in("conversation_id", aIds);

  if (!shared || shared.length === 0) return null;
  return shared[0].conversation_id as string;
}

/**
 * Search for other users via the connect_search_users RPC.
 */
export async function searchUsers(
  supabase: SupabaseClient,
  _callerId: string,
  q: string,
  limit = 10,
): Promise<Array<{ id: string; displayName: string | null; closetId: string | null }>> {
  if (!q.trim()) return [];

  const { data } = await supabase
    .rpc("connect_search_users", { p_term: q.trim() })
    .limit(limit);

  return (data ?? []).map((p: Record<string, unknown>) => ({
    id: p.id as string,
    displayName: (p.display_name as string | null) ?? null,
    closetId: (p.closet_id as string | null) ?? null,
  }));
}

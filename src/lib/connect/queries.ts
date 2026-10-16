import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { formatRelative } from "@/lib/connect/format-relative";
import { signImageUrls } from "@/lib/wardrobe/queries";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ConversationMember {
  userId: string;
  displayName: string | null;
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
  ownerClosetId: string | null;
  granteeId: string;
  granteeName: string | null;
  granteeClosetId: string | null;
  conversationId: string | null;
  scope: "selected_items" | "wardrobe";
  canViewItems: boolean;
  canRecommend: boolean;
  canSubmitForApproval: boolean;
  canCollaborateRequest: boolean;
  selectedItemIds: string[];
  createdAt: string;
  updatedAt: string;
}

// ─── Internal Row Helpers ─────────────────────────────────────────────────────

interface RawItemRow {
  id: string;
  name: string;
  category: string;
  subcategory: string | null;
  primary_colour: string | null;
  secondary_colours: string[] | null;
  pattern: string | null;
  material: string | null;
  style: string | null;
  occasions: string[] | null;
  seasons: string[] | null;
  image_path: string;
}

const SHARED_ITEM_COLUMNS =
  "id, name, category, subcategory, primary_colour, secondary_colours, pattern, material, style, occasions, seasons, image_path";

function mapRawItem(row: RawItemRow, urlMap: Map<string, string>): SharedItemCardData {
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
    imageUrl: urlMap.get(row.image_path) ?? null,
  };
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
  // 1. Fetch conversation IDs where the user is a member
  const { data: memberRows, error: memberErr } = await supabase
    .from("connect_members")
    .select("conversation_id, last_read_at")
    .eq("user_id", userId)
    .order("conversation_id");

  if (memberErr) throw new Error(`Could not load conversations: ${memberErr.message}`);
  if (!memberRows || memberRows.length === 0) return [];

  const conversationIds = memberRows.map((r) => r.conversation_id as string);

  // 2. Fetch conversation metadata (updated_at, status, requester)
  const { data: convRows, error: convErr } = await supabase
    .from("connect_conversations")
    .select("id, updated_at, status, requester")
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
      .from("connect_user_profiles")
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

  // 7. Assemble results (one reference time keeps relative labels stable for SSR)
  const nowMs = Date.now();
  return (convRows ?? []).map((conv) => {
    const cid = conv.id as string;
    const otherMemberRow = (allMembers ?? []).find(
      (m) => m.conversation_id === cid && m.user_id !== userId,
    );
    const otherUserId = (otherMemberRow?.user_id as string | undefined) ?? "";

    const lastMessage = lastMsgMap.get(cid) ?? null;

    return {
      id: cid,
      updatedAt: conv.updated_at as string,
      status: (conv.status === "pending" ? "pending" : "active") as "pending" | "active",
      requesterId: (conv.requester as string | null) ?? null,
      otherMember: {
        userId: otherUserId,
        displayName: profileMap.get(otherUserId) ?? null,
        lastReadAt: (otherMemberRow?.last_read_at as string | null) ?? null,
      },
      lastMessage,
      lastMessageAtLabel: lastMessage
        ? formatRelative(lastMessage.createdAt, nowMs)
        : null,
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

  // Verify caller is a member
  const isMember = members.some((m) => m.user_id === userId);
  if (!isMember) return null;

  const other = members.find((m) => m.user_id !== userId);
  const otherUserId = (other?.user_id as string | undefined) ?? "";

  let displayName: string | null = null;
  if (otherUserId) {
    const { data: profile } = await supabase
      .from("connect_user_profiles")
      .select("display_name")
      .eq("id", otherUserId)
      .maybeSingle();
    displayName = (profile?.display_name as string | null) ?? null;
  }

  return {
    id: conversationId,
    status: convRow.status === "pending" ? "pending" : "active",
    requesterId: (convRow.requester as string | null) ?? null,
    otherMember: {
      userId: otherUserId,
      displayName,
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

  // Fetch directly shared items and outfits (RLS automatically scopes to authorized rows)
  const [itemsResult, outfitsResult] = await Promise.all([
    activeItemIds.length > 0
      ? supabase.from("wardrobe_items").select(SHARED_ITEM_COLUMNS).in("id", activeItemIds)
      : Promise.resolve({ data: [] as RawItemRow[] }),
    activeOutfitIds.length > 0
      ? supabase
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
      wardrobe_items: RawItemRow | null;
    }>;
  };
  const rawOutfits = (outfitsResult.data ?? []) as unknown as RawSharedOutfit[];

  // Collect all storage paths to sign in a single batch
  const pathsToSign: string[] = [];
  for (const it of rawItems) {
    if (it.image_path) pathsToSign.push(it.image_path);
  }
  for (const o of rawOutfits) {
    if (o.photo_path) pathsToSign.push(o.photo_path);
    for (const link of o.outfit_items ?? []) {
      if (link.wardrobe_items?.image_path) {
        pathsToSign.push(link.wardrobe_items.image_path);
      }
    }
  }

  const signedUrls =
    pathsToSign.length > 0
      ? await signImageUrls(supabase, pathsToSign, "thumbnail")
      : new Map<string, string>();

  const itemMap = new Map<string, SharedItemCardData>();
  for (const it of rawItems) {
    itemMap.set(it.id, mapRawItem(it, signedUrls));
  }

  const outfitMap = new Map<string, SharedOutfitCardData>();
  for (const o of rawOutfits) {
    const outfitItems = (o.outfit_items ?? [])
      .slice()
      .sort((a, b) => a.position - b.position)
      .flatMap((link) =>
        link.wardrobe_items ? [mapRawItem(link.wardrobe_items, signedUrls)] : [],
      );
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
  // Verify membership first (belt-and-suspenders on top of RLS)
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

  // Collect unique sender IDs and resolve names, plus hydrate attachments in parallel
  const senderIds = [...new Set(pageRows.map((m) => m.sender_id as string))];
  const messageIds = pageRows.map((m) => m.id as string);

  const [profilesRes, attachmentsMap] = await Promise.all([
    senderIds.length > 0
      ? supabase.from("connect_user_profiles").select("id, display_name").in("id", senderIds)
      : Promise.resolve({ data: [] }),
    hydrateAttachmentsForMessages(supabase, messageIds),
  ]);

  const nameMap = new Map<string, string | null>();
  for (const p of profilesRes.data ?? []) {
    nameMap.set(p.id as string, (p.display_name as string | null) ?? null);
  }

  const messages: Message[] = pageRows.map((m) => {
    const id = m.id as string;
    const isDeleted = Boolean(m.deleted_at);
    return {
      id,
      conversationId: m.conversation_id as string,
      senderId: m.sender_id as string,
      senderName: nameMap.get(m.sender_id as string) ?? null,
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

  const rawItems = (itemsRes.data ?? []) as RawItemRow[];
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
      if (link.wardrobe_items?.image_path) paths.push(link.wardrobe_items.image_path);
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
      .flatMap((l) => (l.wardrobe_items ? [mapRawItem(l.wardrobe_items, signedUrls)] : [])),
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

  const profileMap = new Map<string, { displayName: string | null; closetId: string | null }>();
  if (profileIds.length > 0) {
    const { data: profiles } = await supabase
      .from("connect_user_profiles")
      .select("id, display_name, closet_id")
      .in("id", profileIds);
    for (const p of profiles ?? []) {
      profileMap.set(p.id as string, {
        displayName: (p.display_name as string | null) ?? null,
        closetId: (p.closet_id as string | null) ?? null,
      });
    }
  }

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
      ownerClosetId: ownerProfile?.closetId ?? null,
      granteeId: g.grantee_id,
      granteeName: granteeProfile?.displayName ?? null,
      granteeClosetId: granteeProfile?.closetId ?? null,
      conversationId: g.conversation_id,
      scope: g.scope === "wardrobe" ? "wardrobe" : "selected_items",
      canViewItems: Boolean(g.can_view_items),
      canRecommend: Boolean(g.can_recommend),
      canSubmitForApproval: Boolean(g.can_submit_for_approval),
      canCollaborateRequest: Boolean(g.can_collaborate_request),
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
 * Loads an active shared wardrobe grant and the authorized wardrobe items for a grantee.
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
    .from("wardrobe_items")
    .select(SHARED_ITEM_COLUMNS)
    .eq("user_id", grant.ownerId)
    .order("created_at", { ascending: false })
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
          rawItems.map((r) => r.image_path),
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
 * Returns the conversation ID, or null if none exists yet.
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

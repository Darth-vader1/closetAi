import type { SupabaseClient } from "@supabase/supabase-js";
import type { SharedItemCardData, SharedOutfitCardData } from "@/lib/connect/queries";
import { formatRelative } from "@/lib/connect/format-relative";

export interface StylistProposedOutfitCard {
  name: string;
  occasion: string;
  styleDescription: string;
  explanation: string;
  stylingTip: string;
  items: SharedItemCardData[];
}

export interface StylistChatMessage {
  id: string;
  role: "user" | "assistant";
  body: string;
  createdAt: string;
  attachedItems: SharedItemCardData[];
  attachedOutfits: SharedOutfitCardData[];
  referencedItems: SharedItemCardData[];
  proposedOutfits: StylistProposedOutfitCard[];
  quickReplies: string[];
}

export interface StylistInboxSummary {
  lastMessageBody: string | null;
  lastMessageRole: "user" | "assistant" | null;
  lastMessageAt: string | null;
  lastMessageAtLabel: string | null;
}

interface RawChatRow {
  id: string;
  user_id: string;
  role: "user" | "assistant";
  body: string;
  attached_item_ids: string[] | null;
  attached_outfit_ids: string[] | null;
  referenced_item_ids: string[] | null;
  proposed_outfits: Array<{
    name?: string;
    occasion?: string;
    item_ids?: string[];
    style_description?: string;
    explanation?: string;
    styling_tip?: string;
  }> | null;
  quick_replies: string[] | null;
  created_at: string;
}

/**
 * Fetches the latest message preview for the pinned @ClosetAI Stylist row in /connect.
 * Gracefully returns an empty summary if the migration hasn't been applied yet.
 */
export async function getStylistInboxSummary(
  supabase: SupabaseClient,
  userId: string,
): Promise<StylistInboxSummary> {
  try {
    const { data, error } = await supabase
      .from("stylist_chat_messages")
      .select("role, body, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data) {
      return {
        lastMessageBody: null,
        lastMessageRole: null,
        lastMessageAt: null,
        lastMessageAtLabel: null,
      };
    }

    const createdAt = data.created_at as string;
    return {
      lastMessageBody: data.body as string,
      lastMessageRole: (data.role === "assistant" ? "assistant" : "user") as "user" | "assistant",
      lastMessageAt: createdAt,
      lastMessageAtLabel: formatRelative(createdAt, Date.now()),
    };
  } catch {
    return {
      lastMessageBody: null,
      lastMessageRole: null,
      lastMessageAt: null,
      lastMessageAtLabel: null,
    };
  }
}

/**
 * Loads the user's persisted @ClosetAI Stylist chat messages and hydrates any attached/referenced
 * items, outfits, and proposed outfits using the caller's shareable catalog.
 */
export async function listStylistChatMessages(
  supabase: SupabaseClient,
  userId: string,
  shareable: { items: SharedItemCardData[]; outfits: SharedOutfitCardData[] },
  limit = 50,
): Promise<StylistChatMessage[]> {
  try {
    const { data, error } = await supabase
      .from("stylist_chat_messages")
      .select(
        "id, user_id, role, body, attached_item_ids, attached_outfit_ids, referenced_item_ids, proposed_outfits, quick_replies, created_at",
      )
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error || !data) return [];

    const itemMap = new Map<string, SharedItemCardData>(
      shareable.items.map((it) => [it.id, it]),
    );
    const outfitMap = new Map<string, SharedOutfitCardData>(
      shareable.outfits.map((o) => [o.id, o]),
    );

    const rows = [...(data as unknown as RawChatRow[])].reverse();

    return rows.map((row) => {
      const attachedItems = (row.attached_item_ids ?? [])
        .map((id) => itemMap.get(id))
        .filter((x): x is SharedItemCardData => Boolean(x));

      const attachedOutfits = (row.attached_outfit_ids ?? [])
        .map((id) => outfitMap.get(id))
        .filter((x): x is SharedOutfitCardData => Boolean(x));

      const referencedItems = (row.referenced_item_ids ?? [])
        .map((id) => itemMap.get(id))
        .filter((x): x is SharedItemCardData => Boolean(x));

      const rawProposed = Array.isArray(row.proposed_outfits) ? row.proposed_outfits : [];
      const proposedOutfits: StylistProposedOutfitCard[] = rawProposed
        .map((po) => {
          const items = (po.item_ids ?? [])
            .map((id) => itemMap.get(id))
            .filter((x): x is SharedItemCardData => Boolean(x));
          return {
            name: po.name || "Curated Look",
            occasion: po.occasion || "Everyday",
            styleDescription: po.style_description || "Coordinated look from your closet.",
            explanation: po.explanation || "Harmonious colors and balanced silhouette.",
            stylingTip: po.styling_tip || "Wear with confidence.",
            items,
          };
        })
        .filter((po) => po.items.length > 0);

      return {
        id: row.id,
        role: row.role === "assistant" ? "assistant" : "user",
        body: row.body,
        createdAt: row.created_at,
        attachedItems,
        attachedOutfits,
        referencedItems,
        proposedOutfits,
        quickReplies: Array.isArray(row.quick_replies) ? row.quick_replies : [],
      };
    });
  } catch {
    return [];
  }
}

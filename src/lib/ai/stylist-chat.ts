import { z } from "zod";
import { AiProviderError, type AiProvider } from "@/lib/ai/types";
import { getAiProvider } from "@/lib/ai/service";
import { logger } from "@/lib/logger";

export const chatProposedOutfitSchema = z.object({
  name: z.string().trim().min(1).max(120),
  occasion: z.string().trim().max(60).catch("Everyday"),
  item_ids: z.array(z.string().trim()).min(1).max(8),
  style_description: z.string().trim().max(400).catch("Coordinated look from your closet."),
  explanation: z.string().trim().max(800).catch("Harmonious colors and balanced silhouette."),
  styling_tip: z.string().trim().max(400).catch("Wear with confidence."),
});

export const stylistChatResponseSchema = z.object({
  reply: z.string().trim().min(1).max(4000),
  referenced_item_ids: z.array(z.string().trim()).max(8).optional().catch([]),
  proposed_outfits: z.array(chatProposedOutfitSchema).max(3).optional().catch([]),
  quick_replies: z.array(z.string().trim().min(1).max(80)).max(4).optional().catch([]),
});

export type StylistChatResponse = z.infer<typeof stylistChatResponseSchema>;
export type ChatProposedOutfit = z.infer<typeof chatProposedOutfitSchema>;

export const STYLIST_CHAT_JSON_SCHEMA = {
  type: "object",
  properties: {
    reply: {
      type: "string",
      description:
        "Warm, conversational, expert fashion advice directly answering the user's message. Format with clear paragraphs or bullet points when helpful.",
    },
    referenced_item_ids: {
      type: "array",
      items: { type: "string" },
      description:
        "Optional list of specific wardrobe item UUIDs from the user's inventory that you explicitly mentioned or highlighted in your reply (up to 6).",
    },
    proposed_outfits: {
      type: "array",
      description:
        "Include 1 to 3 complete outfit combinations ONLY when the user asks for outfit ideas, how to style an item, or a look for an occasion. Leave empty [] if just answering a general question.",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "Creative name for the outfit." },
          occasion: { type: "string", description: "Target occasion (e.g. Date Night, Office, Casual, Owambe)." },
          item_ids: {
            type: "array",
            items: { type: "string" },
            description: "Exact item UUIDs from the user's wardrobe inventory that make up this outfit.",
          },
          style_description: { type: "string", description: "Short summary of the aesthetic." },
          explanation: { type: "string", description: "Why these pieces work together." },
          styling_tip: { type: "string", description: "Practical tip on how to wear, layer, cuff, or accessorize." },
        },
        required: ["name", "occasion", "item_ids", "style_description", "explanation", "styling_tip"],
      },
    },
    quick_replies: {
      type: "array",
      items: { type: "string" },
      description:
        "2 to 4 short, natural follow-up prompts the user can tap next (under 55 chars each), e.g. 'Make it more casual', 'Swap the shoes', 'What if it rains?'.",
    },
  },
  required: ["reply", "referenced_item_ids", "proposed_outfits", "quick_replies"],
} as const;

export const STYLIST_CHAT_SYSTEM_PROMPT = [
  "You are @ClosetAI Stylist, the user's personal AI fashion stylist and wardrobe confidant inside ClosetAI Connect.",
  "You chat naturally like a stylish, encouraging, and observant friend who knows every piece in the user's closet.",
  "CRITICAL STYLING & OUTFIT RULES:",
  "1. COMPLETE OUTFITS ONLY: Whenever you suggest an outfit or answer 'what can I wear with X', EVERY outfit MUST include a complete wearable silhouette: Top + Bottom (trousers, jeans, chinos, shorts, skirt) + Footwear (or a full one-piece/traditional set + Footwear). NEVER suggest a top + belt + shoes without bottoms!",
  "2. FORMALITY & AESTHETIC COHERENCE: Match formality and vibe across pieces. Do not pair streetwear graphic tees with formal leather loafers, and do not layer a short-sleeve polo over a graphic t-shirt. Only suggest a belt if the chosen bottoms have belt loops and suit a belt.",
  "3. USE 'proposed_outfits' FOR OUTFIT IDEAS: Whenever you suggest 1 to 3 outfit combinations in your reply, you MUST populate 'proposed_outfits' with those complete looks (each containing the exact item_ids for the top, bottom, footwear, and accessories from the inventory) so the user can view and save each look as a card. Only use 'referenced_item_ids' for standalone single items that are NOT already part of 'proposed_outfits'.",
  "4.SHARED ITEMS & OUTFITS: When the user attaches specific clothing items or saved outfits, inspect them closely (colour, fabric, category, style) and build your advice or outfits around them.",
  "5. LAUNDRY AWARENESS: Prefer CLEAN items when building outfits to wear right now. If a key item is WORN or DIRTY, you may still mention it with a quick heads-up that it needs a wash.",
  "6. CULTURAL & TRADITIONAL STYLING: For Nigerian/African celebrations (Owambe, Aso-Ebi, Senator, Ankara, Agbada, Lace, Kaftan, Church Thanksgiving), honor cultural aesthetics and accessories (Gele, Fila, coral beads).",
  "7. NEVER invent or hallucinate UUIDs in 'referenced_item_ids' or 'proposed_outfits[].item_ids'. Only use exact IDs from the provided inventory.",
  "8. Always include 2 to 4 helpful 'quick_replies' tailored to the conversation so the user can keep iterating effortlessly.",
].join(" ");

export interface ChatTurnInput {
  role: "user" | "assistant";
  body: string;
  attachedItemNames?: string[];
  attachedOutfitNames?: string[];
}

export interface ChatInventoryItem {
  id: string;
  name: string;
  category: string;
  subcategory?: string | null;
  primaryColour?: string | null;
  secondaryColours?: string[];
  pattern?: string | null;
  material?: string | null;
  style?: string | null;
  occasions?: string[];
  warmthLevel?: number | null;
  status?: string;
}

export interface ChatSharedOutfitContext {
  id: string;
  name: string;
  occasion: string | null;
  styleDescription: string | null;
  stylingTip: string | null;
  items: Array<{
    id: string;
    name: string;
    category: string;
    primaryColour: string | null;
  }>;
}

export interface GenerateStylistChatInput {
  userMessage: string;
  history: ChatTurnInput[];
  sharedItems: ChatInventoryItem[];
  sharedOutfits: ChatSharedOutfitContext[];
  inventory: ChatInventoryItem[];
  weather?: string | null;
  stylePreferences?: string[];
  gender?: string | null;
}

export type GenerateStylistChatResult =
  | {
      status: "ok";
      data: StylistChatResponse;
      provider: AiProvider["name"];
      isMock: boolean;
    }
  | { status: "unavailable"; reason: string }
  | { status: "failed"; message: string };

export async function generateStylistChatReply(
  input: GenerateStylistChatInput,
  options: { provider?: AiProvider; signal?: AbortSignal } = {},
): Promise<GenerateStylistChatResult> {
  let provider = options.provider;
  if (!provider) {
    const availability = getAiProvider();
    if (!availability.available) {
      return { status: "unavailable", reason: availability.reason };
    }
    provider = availability.provider;
  }

  const validItemIds = new Set(input.inventory.map((i) => i.id));

  const recentHistoryText =
    input.history.length > 0
      ? input.history
          .slice(-14)
          .map((turn) => {
            const label = turn.role === "user" ? "User" : "Stylist";
            const attachmentsNote = [
              turn.attachedItemNames?.length
                ? `[Shared Clothes: ${turn.attachedItemNames.join(", ")}]`
                : null,
              turn.attachedOutfitNames?.length
                ? `[Shared Outfits: ${turn.attachedOutfitNames.join(", ")}]`
                : null,
            ]
              .filter(Boolean)
              .join(" ");
            return `${label}${attachmentsNote ? ` ${attachmentsNote}` : ""}: ${turn.body}`;
          })
          .join("\n\n")
      : "No earlier messages in this thread.";

  const sharedItemsSection =
    input.sharedItems.length > 0
      ? [
          "ITEMS EXPLICITLY SHARED BY USER IN THIS MESSAGE (Focus on these!):",
          JSON.stringify(input.sharedItems, null, 2),
        ].join("\n")
      : null;

  const sharedOutfitsSection =
    input.sharedOutfits.length > 0
      ? [
          "SAVED OUTFITS EXPLICITLY SHARED BY USER IN THIS MESSAGE (Critique, compare, or refine these!):",
          JSON.stringify(input.sharedOutfits, null, 2),
        ].join("\n")
      : null;

  const prompt = [
    input.weather ? `Current Local Weather: ${input.weather}` : null,
    input.gender ? `User Gender / Fit Preference: ${input.gender}` : null,
    input.stylePreferences?.length
      ? `User Style Profile: ${input.stylePreferences.join(", ")}`
      : null,
    "",
    "=== RECENT CONVERSATION HISTORY ===",
    recentHistoryText,
    "",
    sharedItemsSection,
    sharedOutfitsSection,
    "",
    "=== USER'S WARDROBE INVENTORY (Use ONLY these item IDs for referenced_item_ids and proposed_outfits) ===",
    JSON.stringify(input.inventory.slice(0, 140), null, 2),
    "",
    `=== CURRENT USER MESSAGE ===\n"${input.userMessage}"`,
    "",
    "Respond in JSON matching the required schema. Be warm, specific to their real clothes, and actionable.",
  ]
    .filter((line) => line !== null)
    .join("\n");

  try {
    const raw = await provider.generateJson({
      task: "stylist_chat",
      kind: "text",
      system: STYLIST_CHAT_SYSTEM_PROMPT,
      prompt,
      jsonSchema: STYLIST_CHAT_JSON_SCHEMA,
      signal: options.signal,
    });

    const parsed = stylistChatResponseSchema.safeParse(raw);
    if (!parsed.success) {
      logger.warn("ai.stylist_chat_schema_invalid", {
        provider: provider.name,
        issuesCount: parsed.error.issues.length,
      });
      return {
        status: "failed",
        message: "The stylist couldn't format a response right now. Please try asking again.",
      };
    }

    const sanitizedOutfits = (parsed.data.proposed_outfits ?? [])
      .map((outfit) => ({
        ...outfit,
        item_ids: [...new Set(outfit.item_ids.filter((id) => validItemIds.has(id)))],
      }))
      .filter((outfit) => outfit.item_ids.length >= 2);

    const outfitItemIdsSet = new Set(
      sanitizedOutfits.flatMap((outfit) => outfit.item_ids),
    );

    // Filter out any hallucinated item IDs and avoid duplicating items already shown in proposed_outfits cards
    const sanitizedReferencedIds = (parsed.data.referenced_item_ids ?? []).filter(
      (id) => validItemIds.has(id) && !outfitItemIdsSet.has(id),
    );

    const sanitizedQuickReplies =
      parsed.data.quick_replies && parsed.data.quick_replies.length > 0
        ? parsed.data.quick_replies.slice(0, 4)
        : [
            "What should I wear today?",
            "Show me a smart casual look",
            "How can I elevate this outfit?",
          ];

    return {
      status: "ok",
      data: {
        reply: parsed.data.reply,
        referenced_item_ids: [...new Set(sanitizedReferencedIds)].slice(0, 6),
        proposed_outfits: sanitizedOutfits.slice(0, 3),
        quick_replies: sanitizedQuickReplies,
      },
      provider: provider.name,
      isMock: provider.isMock,
    };
  } catch (err) {
    if (err instanceof AiProviderError) {
      return { status: "failed", message: err.message };
    }
    logger.error("ai.stylist_chat_unexpected_error", { err });
    return {
      status: "failed",
      message: "The AI stylist encountered an unexpected error. Please try again in a moment.",
    };
  }
}

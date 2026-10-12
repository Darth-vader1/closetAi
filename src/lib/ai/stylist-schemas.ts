import { z } from "zod";

export const missingPieceSchema = z.object({
  name: z.string().trim().min(1).max(100),
  category: z.string().trim().max(60).catch("Accessory"),
  reason: z.string().trim().max(300).catch("Complements the palette and completes the silhouette."),
});

export const suggestedAdditionSchema = z.object({
  name: z.string().trim().min(1).max(100),
  category: z.string().trim().max(60).catch("Clothing"),
  why_it_helps: z.string().trim().max(300).catch("Expands your styling options with existing wardrobe items."),
  pairs_with: z.string().trim().max(300).catch("Pairs effortlessly with your current tops and bottoms."),
});

export const stylistOutfitSchema = z.object({
  name: z.string().trim().min(1).max(120),
  occasion: z.string().trim().max(60).catch("General"),
  item_ids: z.array(z.string().trim()).min(1).max(8),
  style_description: z.string().trim().max(400).catch("A coordinated, stylish ensemble."),
  explanation: z.string().trim().max(800).catch("These pieces complement each other in silhouette and color palette."),
  styling_tip: z.string().trim().max(400).catch("Wear with confidence and adjust layers as needed."),
  missing_pieces: z.array(missingPieceSchema).max(4).optional().catch([]),
});

export const stylistResponseSchema = z.object({
  outfits: z.array(stylistOutfitSchema).min(1).max(3),
  overall_advice: z.string().trim().max(600).optional().catch(undefined),
  wardrobe_gaps: z.array(suggestedAdditionSchema).max(4).optional().catch([]),
});

export type StylistResponse = z.infer<typeof stylistResponseSchema>;
export type StylistOutfit = z.infer<typeof stylistOutfitSchema>;
export type MissingPiece = z.infer<typeof missingPieceSchema>;
export type SuggestedAddition = z.infer<typeof suggestedAdditionSchema>;

export const STYLIST_JSON_SCHEMA = {
  type: "object",
  properties: {
    outfits: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "Creative name for the look, e.g. 'Effortless Monochrome Knit'." },
          occasion: { type: "string", description: "The target occasion or setting." },
          item_ids: {
            type: "array",
            items: { type: "string" },
            description: "Array of item IDs chosen strictly from the user's available inventory.",
          },
          style_description: { type: "string", description: "Brief aesthetic summary, e.g. 'Smart casual with warm earth tones'." },
          explanation: { type: "string", description: "Why these pieces harmonize: color balance, texture, silhouette." },
          styling_tip: { type: "string", description: "Actionable styling tip: how to wear, tuck, roll, or layer." },
          missing_pieces: {
            type: "array",
            description: "1 or 2 complementary items NOT in the user's wardrobe that would complete or elevate this specific outfit (e.g. minimalist white sneakers, leather belt, sunglasses).",
            items: {
              type: "object",
              properties: {
                name: { type: "string", description: "Recommended piece name, e.g. 'Clean White Leather Sneakers'." },
                category: { type: "string", description: "Category, e.g. 'Footwear', 'Outerwear', 'Accessory'." },
                reason: { type: "string", description: "Why adding this item elevates the look." },
              },
              required: ["name", "category", "reason"],
            },
          },
        },
        required: ["name", "occasion", "item_ids", "style_description", "explanation", "styling_tip"],
      },
    },
    overall_advice: { type: "string", description: "Brief opening stylist advice or greeting tailored to the weather/occasion." },
    wardrobe_gaps: {
      type: "array",
      description: "1 to 3 smart wardrobe additions/wishlist items the user does not currently own that would unlock multiple new outfits with their existing pieces.",
      items: {
        type: "object",
        properties: {
          name: { type: "string", description: "Item name, e.g. 'Navy Structured Blazer' or 'Chelsea Leather Boots'." },
          category: { type: "string", description: "Category of the piece." },
          why_it_helps: { type: "string", description: "How this piece bridges gaps in their current closet." },
          pairs_with: { type: "string", description: "Which existing pieces in their closet this will unlock." },
        },
        required: ["name", "category", "why_it_helps", "pairs_with"],
      },
    },
  },
  required: ["outfits"],
} as const;

export const STYLIST_SYSTEM_PROMPT = [
  "You are an expert personal stylist and wardrobe consultant.",
  "You are given a user's real wardrobe catalog (list of items with their IDs, names, categories, colors, fabrics, and styles).",
  "CRITICAL RULE 1: For the 'item_ids' in 'outfits', you may ONLY use item IDs that exist in the provided inventory. Never invent IDs.",
  "Create 1 to 3 cohesive, well-balanced complete looks from their available clothes.",
  "CRITICAL FEATURE 2: For each outfit, recommend 1 or 2 'missing_pieces' NOT currently in their wardrobe (e.g. specific shoes, a coat, or an accessory) that would elevate this outfit to the next level.",
  "CRITICAL FEATURE 3: Provide 1 to 3 'wardrobe_gaps' — high-value investment pieces they don't own yet that would unlock multiple new outfits with their existing garments.",
  "CULTURAL & EVENT STYLING: When the user requests Owambe, Nigerian traditional, Aso-Ebi, or cultural celebration looks, harmonize fabrics (Ankara, Aso-Oke, Agbada, Lace, Kaftan, Senator suits) with appropriate cultural accessories (Gele head tie, Fila cap, coral beads, refined footwear). Recommend complementary color pairing themes (e.g. Emerald Green & Champagne Gold, Royal Blue & Silver, Burgundy & Rose Gold).",
  "Provide actionable, realistic styling tips (e.g. whether to tuck, unbutton, cuff, drape, or layer).",
].join(" ");


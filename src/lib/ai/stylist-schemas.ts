import { z } from "zod";

export const stylistOutfitSchema = z.object({
  name: z.string().trim().min(1).max(120),
  occasion: z.string().trim().max(60).catch("General"),
  item_ids: z.array(z.string().trim()).min(1).max(8),
  style_description: z.string().trim().max(400).catch("A coordinated, stylish ensemble."),
  explanation: z.string().trim().max(800).catch("These pieces complement each other in silhouette and color palette."),
  styling_tip: z.string().trim().max(400).catch("Wear with confidence and adjust layers as needed."),
});

export const stylistResponseSchema = z.object({
  outfits: z.array(stylistOutfitSchema).min(1).max(3),
  overall_advice: z.string().trim().max(600).optional().catch(undefined),
});

export type StylistResponse = z.infer<typeof stylistResponseSchema>;
export type StylistOutfit = z.infer<typeof stylistOutfitSchema>;

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
        },
        required: ["name", "occasion", "item_ids", "style_description", "explanation", "styling_tip"],
      },
    },
    overall_advice: { type: "string", description: "Brief opening stylist advice or greeting tailored to the weather/occasion." },
  },
  required: ["outfits"],
} as const;

export const STYLIST_SYSTEM_PROMPT = [
  "You are an expert personal stylist and wardrobe consultant.",
  "You are given a user's real wardrobe catalog (list of items with their IDs, names, categories, colors, fabrics, and styles).",
  "CRITICAL RULE: You may ONLY suggest outfits composed of item IDs that exist in the provided inventory. NEVER fabricate or invent IDs.",
  "Create 1 to 3 cohesive, well-balanced complete looks (combining top + bottom + footwear, or fullbody dress + footwear, with optional outerwear/accessories) that best match the user's request, weather, and occasion.",
  "Prioritize color harmony, proportional balance, and occasion suitability.",
  "Provide actionable, realistic styling tips (e.g. whether to tuck, unbutton, cuff, or layer).",
].join(" ");

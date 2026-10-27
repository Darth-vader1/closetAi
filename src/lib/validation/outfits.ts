import { z } from "zod";
import { STYLE_VALUES } from "@/lib/wardrobe/categories";

export const createOutfitSchema = z.object({
  name: z.preprocess(
    (val) => (typeof val === "string" ? val.trim().slice(0, 120) : val),
    z.string().min(1, "Name this outfit.").max(120, "Use 120 characters or fewer."),
  ),
  itemIds: z.array(z.string().uuid()).min(1, "Select at least 1 garment to make an outfit.").max(15, "Outfits can have at most 15 items."),
  occasion: z.string().trim().max(60).nullable().optional(),
  styleDescription: z.preprocess(
    (val) => (typeof val === "string" ? val.trim().slice(0, 400) : val),
    z.string().max(400).nullable().optional(),
  ),
  explanation: z.preprocess(
    (val) => (typeof val === "string" ? val.trim().slice(0, 800) : val),
    z.string().max(800).nullable().optional(),
  ),
  stylingTip: z.preprocess(
    (val) => (typeof val === "string" ? val.trim().slice(0, 400) : val),
    z.string().max(400).nullable().optional(),
  ),
  photoPath: z.string().max(500).nullable().optional(),
  isFavourite: z.boolean().default(false),
});

export type CreateOutfitInput = z.input<typeof createOutfitSchema>;
export type CreateOutfitData = z.output<typeof createOutfitSchema>;

export const generateOutfitsQuerySchema = z.object({
  occasion: z.string().optional(),
  style: z.enum(STYLE_VALUES).optional(),
  limit: z.number().int().min(1).max(10).default(5),
});

export type GenerateOutfitsQuery = z.infer<typeof generateOutfitsQuerySchema>;

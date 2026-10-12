import { z } from "zod";
import { STYLE_VALUES } from "@/lib/wardrobe/categories";

export const createOutfitSchema = z.object({
  name: z.string().trim().min(1, "Name this outfit.").max(120, "Use 120 characters or fewer."),
  itemIds: z.array(z.string().uuid()).min(2, "Select at least 2 garments to make an outfit.").max(10, "Outfits can have at most 10 items."),
  occasion: z.string().trim().max(60).nullable().optional(),
  styleDescription: z.string().trim().max(400).nullable().optional(),
  explanation: z.string().trim().max(800).nullable().optional(),
  stylingTip: z.string().trim().max(400).nullable().optional(),
  photoPath: z.string().max(300).nullable().optional(),
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

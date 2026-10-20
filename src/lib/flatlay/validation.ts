import { z } from "zod";

export const flatlayPresetSchema = z.enum([
  "collage",
  "editorial",
  "streetwear",
  "minimal",
  "catalogue",
]);

export const flatlayAspectRatioSchema = z.enum(["1:1", "4:5", "9:16", "16:9"]);

export const flatlayBackgroundStyleSchema = z.enum([
  "plain",
  "linen",
  "limewash",
  "editorial_frame",
  "dark",
]);

export const flatlayItemSchema = z.object({
  id: z.string().min(1).max(80),
  wardrobeItemId: z.string().uuid("Invalid wardrobe item ID"),
  name: z.string().min(1).max(120),
  category: z.string().min(1).max(60),
  imagePath: z.string().min(1).max(300),
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().positive().max(3000),
  height: z.number().positive().max(3000),
  rotation: z.number().finite().default(0),
  scaleX: z.number().finite().default(1),
  scaleY: z.number().finite().default(1),
  zIndex: z.number().int().min(0).max(100).default(0),
  locked: z.boolean().optional().default(false),
  hidden: z.boolean().optional().default(false),
  shadow: z.boolean().optional().default(true),
});

export const saveFlatlaySchema = z.object({
  id: z.string().uuid().optional(), // if updating existing composition
  name: z.string().trim().min(1, "Please give this flatlay board a name.").max(120),
  preset: flatlayPresetSchema.default("collage"),
  aspectRatio: flatlayAspectRatioSchema.default("4:5"),
  canvasWidth: z.number().int().min(400).max(4000).default(1200),
  canvasHeight: z.number().int().min(400).max(4000).default(1500),
  backgroundColor: z.string().max(30).default("#fcfaf7"),
  backgroundStyle: flatlayBackgroundStyleSchema.default("plain"),
  items: z.array(flatlayItemSchema).min(1, "Select at least 1 garment to create a flatlay board.").max(30),
  thumbnailPath: z.string().max(300).nullable().optional(),
  saveAsOutfit: z.boolean().optional().default(false),
  outfitId: z.string().uuid().nullable().optional(),
});

export type FlatlayItemInput = z.infer<typeof flatlayItemSchema>;
export type SaveFlatlayInput = z.infer<typeof saveFlatlaySchema>;

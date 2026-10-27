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

const optionalUuidSchema = z.preprocess(
  (val) => (typeof val === "string" && val.trim() === "" ? undefined : val ?? undefined),
  z.string().uuid().optional(),
);

const clampedNameSchema = (fallbackMessage: string) =>
  z.preprocess(
    (val) => (typeof val === "string" ? val.trim().slice(0, 120) : val),
    z.string().min(1, fallbackMessage).max(120),
  );

export const flatlayItemSchema = z.object({
  id: z.string().min(1).max(120),
  wardrobeItemId: z.string().uuid("Invalid wardrobe item ID"),
  name: clampedNameSchema("Garment name is required."),
  category: z.string().min(1).max(80),
  imagePath: z.string().min(1).max(500),
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().positive().max(6000),
  height: z.number().positive().max(6000),
  rotation: z.number().finite().default(0),
  scaleX: z.number().finite().default(1),
  scaleY: z.number().finite().default(1),
  zIndex: z.preprocess(
    (val) =>
      typeof val === "number" && Number.isFinite(val)
        ? Math.max(0, Math.min(500, Math.round(val)))
        : 0,
    z.number().int().min(0).max(500).default(0),
  ),
  locked: z.boolean().optional().default(false),
  hidden: z.boolean().optional().default(false),
  shadow: z.boolean().optional().default(true),
});

export const saveFlatlaySchema = z.object({
  id: optionalUuidSchema, // if updating existing composition
  name: clampedNameSchema("Please give this flatlay board a name."),
  preset: flatlayPresetSchema.default("collage"),
  aspectRatio: flatlayAspectRatioSchema.default("4:5"),
  canvasWidth: z.number().int().min(200).max(6000).default(1200),
  canvasHeight: z.number().int().min(200).max(6000).default(1500),
  backgroundColor: z.string().max(40).default("#fcfaf7"),
  backgroundStyle: flatlayBackgroundStyleSchema.default("plain"),
  items: z.array(flatlayItemSchema).min(1, "Select at least 1 garment to create a flatlay board.").max(30),
  thumbnailPath: z.string().max(500).nullable().optional(),
  saveAsOutfit: z.boolean().optional().default(false),
  outfitId: optionalUuidSchema,
});

export type FlatlayItemInput = z.infer<typeof flatlayItemSchema>;
export type SaveFlatlayInput = z.infer<typeof saveFlatlaySchema>;

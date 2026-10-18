import { z } from "zod";
import { CARE_TYPES, CATEGORY_VALUES, OCCASION_VALUES, PATTERNS, SEASONS, STYLE_VALUES, WARDROBE_COLOURS } from "@/lib/wardrobe/categories";
import { LAUNDRY_STATUSES } from "@/lib/wardrobe/status";

/** Trimmed optional text: "", null, and undefined all become null. */
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use ${max} characters or fewer.`)
    .nullable()
    .optional()
    .transform((v) => (v ? v : null));

export const itemFieldsSchema = z.object({
  name: z.string().trim().min(1, "Give it a name.").max(120, "Use 120 characters or fewer."),
  category: z.enum(CATEGORY_VALUES, "Choose a category."),
  subcategory: optionalText(60),
  primaryColour: z.enum(WARDROBE_COLOURS).nullable(),
  secondaryColours: z.array(z.enum(WARDROBE_COLOURS)).max(4, "Pick up to 4 secondary colours."),
  pattern: z.enum(PATTERNS).nullable(),
  material: optionalText(60),
  style: z.enum(STYLE_VALUES).nullable(),
  occasions: z.array(z.enum(OCCASION_VALUES as [string, ...string[]])).max(10),
  seasons: z.array(z.enum(SEASONS)).max(5),
  warmthLevel: z.number().int().min(1).max(5).nullable(),
  isFavourite: z.boolean(),
  careType: z.enum(CARE_TYPES).default("WASHABLE"),
});

export const beautificationModeSchema = z.enum(["clean-cutout", "ai-enhance"]);
export const beautificationStatusSchema = z.enum([
  "NONE",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
  "RESTORED_ORIGINAL",
]);

export const createItemSchema = itemFieldsSchema.extend({
  imagePath: z.string().min(1).max(300),
  originalImagePath: z.string().min(1).max(300).optional(),
  beautifiedImagePath: z.string().min(1).max(300).nullable().optional(),
  beautificationMode: beautificationModeSchema.nullable().optional(),
  beautificationProvider: z.string().max(64).nullable().optional(),
  beautificationModel: z.string().max(120).nullable().optional(),
  beautificationStatus: beautificationStatusSchema.optional(),
  aiAnalysed: z.boolean(),
  sourceUrl: z
    .string()
    .trim()
    .max(2048)
    .refine((v) => /^https?:\/\//i.test(v), "Must be a valid http(s) URL.")
    .nullable()
    .optional(),
  sourceBrand: optionalText(120),
  sourceImageSha256: z
    .string()
    .trim()
    .regex(/^[0-9a-f]{64}$/i, "Invalid image digest.")
    .transform((v) => v.toLowerCase())
    .nullable()
    .optional(),
  allowDuplicate: z.boolean().optional(),
});

export const saveBeautifiedImageSchema = z.object({
  beautifiedPath: z.string().min(1).max(300),
  mode: beautificationModeSchema,
  provider: z.string().max(64).nullable().optional(),
  model: z.string().max(120).nullable().optional(),
});

export type ItemFieldsInput = z.input<typeof itemFieldsSchema>;
export type ItemFields = z.output<typeof itemFieldsSchema>;
export type CreateItemInput = z.input<typeof createItemSchema>;

export const statusChangeSchema = z.object({
  to: z.enum(LAUNDRY_STATUSES),
  confirmWashed: z.boolean().default(false),
});

export const uuidSchema = z.string().uuid();

// --- Wardrobe list query (search params) -------------------------------------------------------

export const SORT_OPTIONS = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "name", label: "Name A–Z" },
  { value: "least_worn", label: "Least recently worn" },
] as const;
export type SortValue = (typeof SORT_OPTIONS)[number]["value"];

export const PAGE_SIZE = 24;

export interface WardrobeQuery {
  q: string;
  category: string | null;
  colour: string | null;
  status: (typeof LAUNDRY_STATUSES)[number] | null;
  favouritesOnly: boolean;
  sort: SortValue;
  page: number;
}

type Raw = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Parse untrusted URL search params into a safe query. Unknown or malformed values are dropped. */
export function parseWardrobeQuery(raw: Raw): WardrobeQuery {
  const q = (first(raw.q) ?? "").trim().slice(0, 80);
  const category = first(raw.category);
  const colour = first(raw.colour);
  const status = first(raw.status);
  const sort = first(raw.sort);
  const page = Number.parseInt(first(raw.page) ?? "1", 10);

  return {
    q,
    category: category && (CATEGORY_VALUES as string[]).includes(category) ? category : null,
    colour: colour && (WARDROBE_COLOURS as readonly string[]).includes(colour) ? colour : null,
    status: status && (LAUNDRY_STATUSES as readonly string[]).includes(status) ? (status as WardrobeQuery["status"]) : null,
    favouritesOnly: first(raw.favourites) === "1",
    sort: SORT_OPTIONS.some((o) => o.value === sort) ? (sort as SortValue) : "newest",
    page: Number.isFinite(page) && page >= 1 && page <= 1000 ? page : 1,
  };
}

/** Escape LIKE wildcards so user text is matched literally. */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/**
 * Convert a <select> value to an optional integer. React Hook Form also runs this over the field's
 * default value, which may already be null, so null/undefined/"" must all mean "not set" (never 0).
 */
export function optionalIntFromSelect(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** Convert a <select> value to an optional string; null/undefined/"" all mean "not set". */
export function optionalStringFromSelect(value: unknown): string | null {
  return value === null || value === undefined || value === "" ? null : String(value);
}

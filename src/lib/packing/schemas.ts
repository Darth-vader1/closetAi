import { z } from "zod";

/**
 * Contract for the "Pack for..." planner (trips, school terms, work stints, events, long stays).
 * Shared by the API route (server-side validation), the deterministic builder and the client UI.
 */

// --- Limits ----------------------------------------------------------------------------------
export const MAX_DAYS = 120;
/** Stays longer than this become a laundry-cycle ROTATION plan instead of one outfit per day. */
export const DAILY_PLAN_MAX_DAYS = 14;
/** Hard caps so the AI JSON (and our response) stay bounded however long the stay is. */
export const MAX_CAPSULE_ITEMS = 20;
export const MAX_OUTFITS = 14;
export const MAX_ITEMS_PER_OUTFIT = 6;
export const MAX_SUGGESTED_ITEMS = 16;
export const MAX_PACKING_TIPS = 6;
export const MAX_EVENTS = 10;
/** Open-Meteo forecasts cover today + 15 days. */
export const FORECAST_WINDOW_DAYS = 16;
/** "1 semester" preset (16 weeks). */
export const SEMESTER_DAYS = 112;

// --- Vocabularies ----------------------------------------------------------------------------
export const PURPOSES = ["trip", "school", "work", "event", "relocation"] as const;
export type PackPurpose = (typeof PURPOSES)[number];

export const PURPOSE_LABELS: Record<PackPurpose, string> = {
  trip: "Trip / Holiday",
  school: "School / Campus",
  work: "Work / Internship",
  event: "Event or Occasion",
  relocation: "Relocation / Long stay",
};

export const DRESS_CODES = ["casual", "smart_casual", "business", "uniform_days", "formal_days", "mixed"] as const;
export type DressCode = (typeof DRESS_CODES)[number];

export const DRESS_CODE_LABELS: Record<DressCode, string> = {
  casual: "Casual",
  smart_casual: "Smart casual",
  business: "Business / corporate",
  uniform_days: "Uniform on some days",
  formal_days: "Formal presentation days",
  mixed: "A mix of everything",
};

export const LAUNDRY_OPTIONS = ["weekly", "twice_weekly", "none"] as const;
export type LaundryOption = (typeof LAUNDRY_OPTIONS)[number];

/** Days between washes. "none" still assumes a fortnightly wash so long plans stay sane. */
export const LAUNDRY_CYCLE_DAYS: Record<LaundryOption, number> = {
  twice_weekly: 4,
  weekly: 7,
  none: 14,
};

export const FORMALITIES = ["casual", "smart_casual", "formal", "traditional"] as const;
export type Formality = (typeof FORMALITIES)[number];

export const SUGGESTION_CATEGORIES = ["clothing_gaps", "weather_gear", "documents", "toiletries", "tech"] as const;
export type SuggestionCategory = (typeof SUGGESTION_CATEGORIES)[number];

export const SUGGESTION_CATEGORY_LABELS: Record<SuggestionCategory, string> = {
  clothing_gaps: "Clothing gaps",
  weather_gear: "Weather gear",
  documents: "Documents",
  toiletries: "Toiletries",
  tech: "Tech",
};

export const PRIORITIES = ["essential", "recommended", "optional"] as const;
export type SuggestionPriority = (typeof PRIORITIES)[number];

// --- Sanitisation ----------------------------------------------------------------------------
/**
 * Make free text safe to embed in a prompt as DATA: strip control characters, markup/JSON/template
 * delimiters and obvious instruction-injection phrases, collapse whitespace and cap length.
 */
export function sanitizeUserText(value: string, max: number): string {
  return value
    .normalize("NFKC")
    .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028-\u202E]/g, " ")
    .replace(/[<>{}[\]`$\\|^~]/g, "")
    .replace(/\b(ignore|disregard|forget)\b[^.]{0,40}\b(instructions?|prompts?|rules?)\b/gi, "")
    .replace(/\b(system|assistant|developer)\s*:/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

const safeText = (max: number) => z.string().transform((v) => sanitizeUserText(v, max));

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date.")
  .refine((v) => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)), "Use a valid date.");

// --- Request ---------------------------------------------------------------------------------
export const packingRequestSchema = z
  .object({
    purpose: z.enum(PURPOSES).default("trip"),
    location: safeText(80).pipe(z.string().min(2, "Tell us where you're going (a city, town or campus).")),
    days: z
      .number({ message: "Enter how many days you need to pack for." })
      .int("Use a whole number of days.")
      .min(1, "Plans must be at least 1 day.")
      .max(MAX_DAYS, `Packing plans support up to ${MAX_DAYS} days.`),
    startDate: isoDate.optional(),
    laundry: z.enum(LAUNDRY_OPTIONS).default("weekly"),
    // Trip
    tripType: safeText(80).optional(),
    // School / Work
    dressCode: z.enum(DRESS_CODES).optional(),
    // Event
    eventName: safeText(80).optional(),
    eventCount: z.number().int().min(1).max(MAX_EVENTS).optional(),
    eventDates: z.array(isoDate).max(MAX_EVENTS).optional(),
    formality: z.enum(FORMALITIES).optional(),
    photoDay: z.boolean().optional(),
    // Anything else
    notes: safeText(200).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.purpose === "event" && !v.eventName) {
      ctx.addIssue({ code: "custom", path: ["eventName"], message: "Tell us what the event is (e.g. wedding, graduation)." });
    }
    if (v.startDate) {
      const start = Date.parse(`${v.startDate}T00:00:00Z`);
      const today = Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate());
      const dayMs = 86_400_000;
      if (start < today - dayMs) ctx.addIssue({ code: "custom", path: ["startDate"], message: "The start date can't be in the past." });
      if (start > today + 365 * dayMs) ctx.addIssue({ code: "custom", path: ["startDate"], message: "Pick a start date within the next year." });
    }
  });

export type PackingRequest = z.infer<typeof packingRequestSchema>;

// --- AI response (lenient: truncate instead of failing on over-long output) -------------------
const clipped = (max: number) => z.string().transform((s) => s.trim().slice(0, max));
const clippedArray = <T extends z.ZodType>(item: T, max: number) =>
  z.array(item).transform((a) => a.slice(0, max));

export const aiOutfitSchema = z.object({
  day: z.coerce.number().int().min(1).max(MAX_OUTFITS),
  title: clipped(90),
  item_ids: clippedArray(z.string(), MAX_ITEMS_PER_OUTFIT),
  styling_tip: clipped(240).optional().default(""),
});

export const aiSuggestedItemSchema = z.object({
  name: clipped(60).pipe(z.string().min(2)),
  category: z.enum(SUGGESTION_CATEGORIES).catch("clothing_gaps"),
  reason: clipped(160).optional().default(""),
  priority: z.enum(PRIORITIES).catch("recommended"),
  alreadyOwned: z.boolean().optional().default(false),
});

export const aiPackingResponseSchema = z.object({
  capsule_item_ids: clippedArray(z.string(), MAX_CAPSULE_ITEMS + 10),
  capsule_rationale: clipped(600),
  outfits: clippedArray(aiOutfitSchema, MAX_OUTFITS + 4),
  packing_tips: clippedArray(clipped(200), MAX_PACKING_TIPS).optional().default([]),
  suggestedItems: clippedArray(aiSuggestedItemSchema, MAX_SUGGESTED_ITEMS + 6).optional().default([]),
});

export type AiPackingResponse = z.infer<typeof aiPackingResponseSchema>;

export const PACKING_JSON_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    capsule_item_ids: { type: "array", items: { type: "string" }, maxItems: MAX_CAPSULE_ITEMS },
    capsule_rationale: { type: "string" },
    outfits: {
      type: "array",
      maxItems: MAX_OUTFITS,
      items: {
        type: "object",
        properties: {
          day: { type: "number" },
          title: { type: "string" },
          item_ids: { type: "array", items: { type: "string" }, maxItems: MAX_ITEMS_PER_OUTFIT },
          styling_tip: { type: "string" },
        },
        required: ["day", "title", "item_ids", "styling_tip"],
      },
    },
    packing_tips: { type: "array", items: { type: "string" }, maxItems: MAX_PACKING_TIPS },
    suggestedItems: {
      type: "array",
      maxItems: MAX_SUGGESTED_ITEMS,
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          category: { type: "string", enum: [...SUGGESTION_CATEGORIES] },
          reason: { type: "string" },
          priority: { type: "string", enum: [...PRIORITIES] },
          alreadyOwned: { type: "boolean" },
        },
        required: ["name", "category", "reason", "priority", "alreadyOwned"],
      },
    },
  },
  required: ["capsule_item_ids", "capsule_rationale", "outfits", "packing_tips", "suggestedItems"],
};

// --- API response (what the client receives) ---------------------------------------------------
export interface PlanOutfit {
  day: number;
  title: string;
  item_ids: string[];
  styling_tip: string;
}

export interface SuggestedItem {
  name: string;
  category: SuggestionCategory;
  reason: string;
  priority: SuggestionPriority;
  alreadyOwned: boolean;
  /** Name of the wardrobe item that matched, when alreadyOwned is true. */
  ownedItemName?: string;
}

export interface PlanWeatherDay {
  date: string;
  maxC: number;
  minC: number;
  rainChance: number | null;
  condition: string;
}

export interface PlanWeather {
  /** The place name we looked up (sanitised user input). */
  query: string;
  /** Resolved place, e.g. "Ile-Ife, Osun, Nigeria". Null when geocoding failed. */
  resolvedName: string | null;
  /** Forecast days that fall inside the plan AND inside the 16-day forecast window. */
  forecast: PlanWeatherDay[];
  /** Number of plan days NOT covered by the forecast (seasonal norms are used for these). */
  daysBeyondForecast: number;
  seasonal: {
    monthLabel: string;
    avgMaxC: number | null;
    avgMinC: number | null;
    rainyDayShare: number | null;
    basis: "last_year_observed" | "general_norms";
  } | null;
  /** Plain-language notice for the user (e.g. couldn't resolve location, seasonal norms used). */
  notice: string | null;
  /** Compact text handed to the AI prompt. */
  promptSummary: string;
  flags: { rainy: boolean; cold: boolean; hot: boolean };
}

export interface PackingItem {
  id: string;
  name: string;
  category: string;
  primary_colour: string | null;
  image_path: string;
}

export interface PackingPlanResponse {
  purpose: PackPurpose;
  location: string;
  days: number;
  startDate: string;
  mode: "daily" | "rotation";
  /** Days in one repeating template (equals `days` for daily plans). */
  cycleDays: number;
  /** How many times the template repeats over the stay (1 for daily plans). */
  repeats: number;
  weather: PlanWeather;
  capsuleItems: PackingItem[];
  capsuleRationale: string;
  outfits: PlanOutfit[];
  /** Total wears per capsule item across the WHOLE stay, computed server-side. */
  wearsPerItem: Record<string, number>;
  packingTips: string[];
  suggestedItems: SuggestedItem[];
  imageUrls: Record<string, string>;
  source: "ai" | "fallback";
  notice: string | null;
}

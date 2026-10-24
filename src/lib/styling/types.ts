/**
 * Shared types for the styling intelligence layer (garment understanding, constraints, validation,
 * scoring and the recommendation pipeline). Pure TypeScript: no I/O, so everything here is unit-testable.
 */
import type { WardrobeItem } from "@/lib/wardrobe/queries";

/** The structural slot a garment fills in an outfit. */
export type GarmentRole = "top" | "bottom" | "onepiece" | "outer" | "shoes" | "accessory" | "excluded" | "unknown";

/** Controlled garment-type vocabulary. Free-text names/subcategories are normalised to these. */
export type GarmentType =
  // tops
  | "t_shirt" | "shirt" | "dress_shirt" | "polo" | "blouse" | "sweater" | "hoodie" | "cardigan" | "tank_top" | "crop_top" | "athletic_top" | "traditional_top"
  // bottoms
  | "jeans" | "chinos" | "tailored_trousers" | "cargo_pants" | "joggers" | "shorts" | "jorts" | "athletic_shorts" | "leggings" | "skirt" | "capri_pants" | "generic_trousers"
  // one-piece
  | "dress" | "jumpsuit" | "romper" | "traditional_set"
  // outer
  | "jacket" | "blazer" | "coat" | "overshirt" | "windbreaker" | "track_jacket"
  // footwear
  | "sneakers" | "loafers" | "dress_shoes" | "boots" | "sandals" | "slides" | "heels" | "flats" | "generic_shoes"
  // accessories
  | "belt" | "watch" | "bag" | "hat" | "cap" | "sunglasses" | "jewellery" | "tie" | "scarf" | "other_accessory"
  // not used for outfits
  | "socks" | "underwear" | "wig" | "unknown";

/** Dress codes the validator understands. Derived from the occasion / request. */
export type DressCode = "athletic" | "casual" | "smart_casual" | "business" | "formal" | "worship" | "traditional" | "none";

export type Silhouette = "skinny" | "slim" | "regular" | "relaxed" | "wide" | "oversized" | "cropped";

/** How much we trust a classification. Guesses are never treated as facts. */
export type Confidence = "high" | "medium" | "low" | "unknown";

export interface GarmentProfile {
  item: WardrobeItem;
  id: string;
  role: GarmentRole;
  type: GarmentType;
  /** 1 (loungewear / gym) to 5 (formal). */
  formality: number;
  /** True for activewear / athleisure pieces. */
  athletic: boolean;
  /** 1 (very light) to 5 (very warm). Null when it cannot be established. */
  warmth: number | null;
  silhouette: Silhouette | null;
  /** Legs / sleeves exposed. */
  length: "short" | "mid" | "long" | null;
  /** Colour families (lower-case) for primary colour; null when unknown. */
  colour: string | null;
  pattern: string | null;
  /** Confidence in role/type. Low or unknown means the item cannot fill an essential role. */
  confidence: Confidence;
  /** Why the classification is what it is (for debugging and the edit-attribute UI). */
  evidence: string[];
  /** Layering pieces (cardigan, hoodie, overshirt...) can sit over a base top. */
  layering: boolean;
  /** Item is usable in an outfit at all (false for underwear, socks, wigs, unknown "other"). */
  usable: boolean;
}

// -- Constraints ---------------------------------------------------------------------------------

export type ForbiddenRule = {
  /** Source text from the request, used in explanations. */
  phrase: string;
  types?: GarmentType[];
  roles?: GarmentRole[];
  colours?: string[];
  silhouettes?: Silhouette[];
  /** Matches items at or above this formality (e.g. "no formal wear"). */
  formalityAtLeast?: number;
  /** Matches activewear (e.g. "nothing sporty"). */
  athletic?: boolean;
};

export interface StylingConstraints {
  /** The text actually parsed for positive constraints (after any "actually/instead" revision). */
  effectivePrompt: string;
  revised: boolean;
  /**
   * Items the user insists on. Mandatory. Each group is a set of interchangeable alternatives
   * (e.g. two red jorts matched by "my red jorts"): the outfit must contain at least one from every group.
   */
  anchorGroups: string[][];
  /** Anchor items that exist but are currently dirty / in laundry / unavailable. */
  unavailableAnchors: Array<{ id: string; name: string; status: string }>;
  /** Mentioned an item we could not find in the wardrobe. */
  unmatchedAnchors: string[];
  forbidden: ForbiddenRule[];
  /** Strong style preference(s). */
  styles: string[];
  /** The user used "only" / "strictly": styles become mandatory. */
  styleMandatory: boolean;
  /** A palette is mandatory (e.g. all-black, or monochrome). */
  palette: { mode: "single" | "monochrome"; colours: string[]; label: string } | null;
  /** At least one clothing/footwear piece must have each of these colours (e.g. "a red outfit"). */
  requiredColours: string[];
  preferredColours: string[];
  dressCode: DressCode;
  occasion: string | null;
  /** The user wants something bold / experimental: relaxes level-2 warnings. */
  allowBold: boolean;
  simple: boolean;
  polished: boolean;
  comfortable: boolean;
  hotHint: boolean;
  coolHint: boolean;
  /** Don't repeat outfits worn/recommended in the last N days. */
  avoidRepeatDays: number | null;
  /** The user explicitly wants to repeat a favourite / previous outfit. */
  allowRepeat: boolean;
  /** Only items not worn in the last N days. */
  minDaysSinceWorn: number | null;
  wantsDifferent: boolean;
  wantsPartial: boolean;
  allowShopping: boolean;
  /** Genuine contradictions that need the user's input. */
  conflicts: string[];
  /** Phrases that looked like constraints but could not be interpreted. */
  unsupported: string[];
}

export interface WeatherContext {
  temperatureC: number | null;
  rainy: boolean;
  windy: boolean;
  humid: boolean;
}

// -- Validation ----------------------------------------------------------------------------------

export type Level = 1 | 2;

export interface Violation {
  level: Level;
  /** Machine-readable code (safe to log; contains no wardrobe data). */
  code: string;
  message: string;
  /** For level 2: how serious (1 mild, 2 notable, 3 substantial). */
  severity: number;
  itemIds: string[];
}

export interface ValidationContext {
  /** Every item the user owns (ownership check). */
  owned: ReadonlyMap<string, WardrobeItem>;
  allowRewearWorn: boolean;
  constraints: StylingConstraints;
  weather: WeatherContext | null;
  /** Whether an incomplete outfit is acceptable (e.g. shoes anchor). */
  allowPartial: boolean;
}

export type OutfitArchetype = "standard" | "onepiece" | "traditional" | "partial" | "unknown";

export interface ValidationResult {
  ok: boolean;
  archetype: OutfitArchetype;
  hard: Violation[];
  warnings: Violation[];
  /** Sum of warning severities (after bold-style relaxation). */
  warningLoad: number;
}

// -- Scoring -------------------------------------------------------------------------------------

export interface ScoreBreakdown {
  occasion: number;
  compatibility: number;
  style: number;
  colourPattern: number;
  silhouette: number;
  weather: number;
  footwearAccessories: number;
  novelty: number;
}

export interface ScoredOutfit {
  itemIds: string[];
  archetype: OutfitArchetype;
  /** 0-100. Only meaningful when validation passed. */
  score: number;
  breakdown: ScoreBreakdown;
  warnings: Violation[];
  source: "engine" | "ai";
}

export interface ProposedOutfit {
  name: string;
  occasion?: string;
  itemIds: string[];
  styleDescription?: string;
  explanation?: string;
  stylingTip?: string;
  source: "engine" | "ai";
}

export interface RejectedCandidate {
  source: "engine" | "ai";
  codes: string[];
  messages: string[];
}

export interface FinalOutfit extends ProposedOutfit {
  archetype: OutfitArchetype;
  score: number;
  breakdown: ScoreBreakdown;
  warnings: Violation[];
  /** Fact-based explanation generated from the actual garments. */
  factExplanation: string;
  caveat?: string;
}

export type FallbackKind =
  | "empty_wardrobe"
  | "no_eligible_items"
  | "too_few_items"
  | "missing_role"
  | "anchor_conflict"
  | "needs_clarification"
  | "contradictory_constraints"
  | "no_valid_combination"
  | "shopping_requested";

export interface Fallback {
  kind: FallbackKind;
  message: string;
  suggestions: string[];
  /** Optional partial combination that passed validation as a partial outfit. */
  partial?: ProposedOutfit;
}

export interface PipelineResult {
  outfits: FinalOutfit[];
  rejected: RejectedCandidate[];
  fallback: Fallback | null;
  constraints: StylingConstraints;
  /** Counts of how many wardrobe items were available per role (for diagnostics). */
  eligibleByRole: Record<string, number>;
  notices: string[];
}

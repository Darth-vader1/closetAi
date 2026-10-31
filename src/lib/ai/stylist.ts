import { STYLIST_JSON_SCHEMA, STYLIST_SYSTEM_PROMPT, stylistResponseSchema, type StylistResponse } from "@/lib/ai/stylist-schemas";
import { AiProviderError, type AiProvider } from "@/lib/ai/types";
import { getAiProvider } from "@/lib/ai/service";
import { logger } from "@/lib/logger";
import { runStylingPipeline } from "@/lib/styling/pipeline";
import type { FeedbackSignal } from "@/lib/styling/scorer";
import type { BodyShape, Fallback, ProposedOutfit, RejectedCandidate } from "@/lib/styling/types";
import type { WardrobeItem } from "@/lib/wardrobe/queries";

export interface StylistRequestOptions {
  userPrompt: string;
  occasion?: string | null;
  weather?: string | null;
  bodyBuild?: BodyShape | null;
  stylePreferences?: string[];
  allowRewearWorn?: boolean;
  anchorItemIds?: string[];
  excludeItemIds?: string[];
  feedback?: FeedbackSignal;
  /** Full WardrobeItem list when available (enables full status/ownership validation). */
  wardrobeItems?: WardrobeItem[];
  inventory: Array<{
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
  }>;
}

export type StylistResult =
  | {
      status: "ok";
      data: StylistResponse;
      provider: AiProvider["name"];
      isMock: boolean;
      rejected?: RejectedCandidate[];
      notices?: string[];
    }
  | { status: "unavailable"; reason: string }
  | {
      status: "failed";
      message: string;
      fallback?: Fallback | null;
      rejected?: RejectedCandidate[];
      notices?: string[];
    };

function inventoryToWardrobeItems(inventory: StylistRequestOptions["inventory"]): WardrobeItem[] {
  return inventory.map((i) => ({
    id: i.id,
    name: i.name,
    category: i.category,
    subcategory: i.subcategory ?? null,
    primaryColour: i.primaryColour ?? null,
    secondaryColours: i.secondaryColours ?? [],
    pattern: i.pattern ?? null,
    material: i.material ?? null,
    style: i.style ?? null,
    occasions: i.occasions ?? [],
    seasons: [],
    warmthLevel: i.warmthLevel ?? null,
    imagePath: "",
    status: "CLEAN",
    careType: "WASHABLE",
    isFavourite: false,
    aiAnalysed: true,
    wearCount: 0,
    lastWornAt: null,
    lastWashedAt: null,
    createdAt: new Date(0).toISOString(),
  }));
}

export async function generateStylistRecommendations(
  input: StylistRequestOptions,
  options: { provider?: AiProvider; signal?: AbortSignal } = {},
): Promise<StylistResult> {
  const allItems = input.wardrobeItems ?? inventoryToWardrobeItems(input.inventory);

  // Pre-flight check: if request has genuine contradictions or unavailable anchors, fail fast with an honest explanation
  const preflight = runStylingPipeline({
    allItems,
    prompt: input.userPrompt,
    occasion: input.occasion,
    weatherSummary: input.weather,
    allowRewearWorn: input.allowRewearWorn,
    anchorItemIds: input.anchorItemIds,
    excludeItemIds: input.excludeItemIds,
    feedback: { ...input.feedback, bodyBuild: input.bodyBuild },
  });

  if (
    preflight.fallback &&
    (preflight.fallback.kind === "contradictory_constraints" ||
      preflight.fallback.kind === "empty_wardrobe" ||
      preflight.fallback.kind === "no_eligible_items" ||
      preflight.fallback.kind === "anchor_conflict")
  ) {
    return {
      status: "failed",
      message: preflight.fallback.message,
      fallback: preflight.fallback,
      rejected: preflight.rejected,
      notices: preflight.notices,
    };
  }

  let provider = options.provider;
  if (!provider) {
    const availability = getAiProvider();
    if (!availability.available) {
      return { status: "unavailable", reason: availability.reason };
    }
    provider = availability.provider;
  }

  const prompt = [
    `User Request: "${input.userPrompt}"`,
    input.occasion ? `Target Occasion: ${input.occasion}` : null,
    input.weather ? `Weather Context: ${input.weather}` : null,
    input.bodyBuild === "hourglass"
      ? "Body Shape: Hourglass (balanced bust and hips with a defined waist). Highlight waist definition with belted silhouettes, high-waisted bottoms, wrap cuts, or fitted waistlines; avoid shapeless, boxy cuts."
      : input.bodyBuild === "pear"
      ? "Body Shape: Pear / Triangle (fuller hips and thighs, narrower shoulders). Draw attention upward with open/wide necklines, structured or statement tops, and balance with A-line skirts/dresses or clean darker bottoms."
      : input.bodyBuild === "apple"
      ? "Body Shape: Apple / Round (fuller bust and torso, slender legs). Elongate the silhouette with V-necks, empire waists, open vertical layers, and showcase legs with straight or tailored bottoms; avoid stiff cinched waistbands."
      : input.bodyBuild === "rectangle"
      ? "Body Shape: Rectangle / Straight (balanced bust and hips with subtle waist definition). Create dimension and curves using waist belts, crop tops with high-waisted wide bottoms, pleated or flared skirts, and contrasting layers."
      : input.bodyBuild === "inverted_triangle"
      ? "Body Shape: Inverted Triangle (broader shoulders/chest, narrower hips). Soften the shoulder line with V-necks or scoop necks, and add lower-body volume with flared skirts, A-line silhouettes, or wide-leg pants; avoid heavy shoulder padding."
      : input.bodyBuild === "athletic"
      ? "Body Build: Athletic (broad shoulders/chest, muscular thighs). Favour pieces with stretch, room through the thigh and a tapered leg; avoid restrictive, stiff or boxy cuts."
      : input.bodyBuild === "curvy"
      ? "Body Shape: Curvy (fuller curves through bust and hips). Choose garments with natural stretch, flattering drape, wrap styles, and well-tailored waistlines; avoid rigid, boxy cuts."
      : input.bodyBuild === "tall_slender"
      ? "Body Shape: Tall / Runway. Utilize long silhouettes, maxi lengths, wide-leg trousers, long coats, and bold color blocking effortlessly."
      : input.bodyBuild
      ? `Body Build: ${input.bodyBuild.replace("_", " ")}`
      : null,
    /sport|athletic|athleisure|gym|workout|training|activewear/i.test(input.userPrompt)
      ? "ACTIVITY NOTE: This is a sporty/athletic request. Build looks from activewear and athleisure only (joggers, track pants, shorts, leggings, performance or casual tees, hoodies, track jackets, trainers). Do NOT include chinos, dress trousers, jeans, loafers or tailored pieces."
      : null,
    input.stylePreferences?.length ? `User's Preferred Styles: ${input.stylePreferences.join(", ")}` : null,
    "",
    "Available Clean Wardrobe Inventory:",
    JSON.stringify(input.inventory, null, 2),
    "",
    "Recommend 1 to 3 outfits using strictly the item IDs provided above.",
  ]
    .filter(Boolean)
    .join("\n");

  let aiProposals: ProposedOutfit[] = [];
  let aiOverallAdvice: string | undefined;
  let aiWardrobeGaps: StylistResponse["wardrobe_gaps"] = [];

  try {
    const raw = await provider.generateJson({
      task: "stylist_recommendation",
      kind: "text",
      system: STYLIST_SYSTEM_PROMPT,
      prompt,
      jsonSchema: STYLIST_JSON_SCHEMA,
      signal: options.signal,
    });

    const parsed = stylistResponseSchema.safeParse(raw);
    if (parsed.success) {
      aiOverallAdvice = parsed.data.overall_advice;
      aiWardrobeGaps = parsed.data.wardrobe_gaps || [];
      aiProposals = parsed.data.outfits.map((o) => ({
        name: o.name,
        occasion: o.occasion,
        itemIds: o.item_ids,
        styleDescription: o.style_description,
        explanation: o.explanation,
        stylingTip: o.styling_tip,
        source: "ai" as const,
      }));
    } else {
      logger.warn("ai.stylist_schema_invalid", { issuesCount: parsed.error.issues.length });
    }
  } catch (err) {
    if (err instanceof AiProviderError) {
      return { status: "failed", message: err.message };
    }
    logger.error("ai.stylist_unexpected_error", { err });
    return { status: "failed", message: "The stylist encountered an unexpected error." };
  }

  // Run the validation + scoring pipeline over AI proposals + deterministic candidates
  const pipelineResult = runStylingPipeline({
    allItems,
    prompt: input.userPrompt,
    occasion: input.occasion,
    weatherSummary: input.weather,
    allowRewearWorn: input.allowRewearWorn,
    anchorItemIds: input.anchorItemIds,
    excludeItemIds: input.excludeItemIds,
    feedback: { ...input.feedback, bodyBuild: input.bodyBuild },
    aiProposals,
    limit: 3,
  });

  if (pipelineResult.rejected.length > 0) {
    logger.info("stylist.candidates_rejected", {
      rejectedCount: pipelineResult.rejected.length,
      codes: [...new Set(pipelineResult.rejected.flatMap((r) => r.codes))],
    });
  }

  if (pipelineResult.outfits.length === 0) {
    return {
      status: "failed",
      message:
        pipelineResult.fallback?.message ||
        "The stylist couldn't find a valid outfit combination from your current clothes.",
      fallback: pipelineResult.fallback,
      rejected: pipelineResult.rejected,
      notices: pipelineResult.notices,
    };
  }

  return {
    status: "ok",
    data: {
      outfits: pipelineResult.outfits.map((o) => ({
        name: o.name,
        occasion: o.occasion || input.occasion || "General",
        item_ids: o.itemIds,
        style_description: o.styleDescription || "Coordinated ensemble.",
        explanation: o.explanation || o.factExplanation,
        styling_tip: o.stylingTip || "Wear with confidence.",
        missing_pieces: [],
      })),
      overall_advice: aiOverallAdvice,
      wardrobe_gaps: aiWardrobeGaps,
    },
    provider: provider.name,
    isMock: provider.isMock,
    rejected: pipelineResult.rejected,
    notices: pipelineResult.notices,
  };
}

/**
 * Transparent fashion-compatibility scoring (Phase 4) and preference learning (Phase 6B).
 *
 * Only outfits that pass `validateOutfit` are scored. A high score in one dimension never rescues
 * an outfit that failed hard validation.
 *
 * Weights (total 100):
 *  - Occasion & dress-code suitability: 20
 *  - Garment role & pair compatibility: 20
 *  - Personal style & request alignment: 15
 *  - Colour & pattern harmony: 15
 *  - Silhouette & proportion balance: 10
 *  - Weather suitability: 10
 *  - Footwear & accessory coordination: 5
 *  - Novelty, variety & learned feedback: 5
 */
import { colourInfo, readPalette } from "@/lib/styling/colour";
import { profileGarment } from "@/lib/styling/taxonomy";
import type {
  DressCode,
  GarmentProfile,
  OutfitArchetype,
  ScoreBreakdown,
  ScoredOutfit,
  StylingConstraints,
  Violation,
  WeatherContext,
} from "@/lib/styling/types";

export interface FeedbackSignal {
  /** Item IDs from outfits the user rated 4-5 stars or explicitly liked. */
  likedItemIds?: ReadonlySet<string>;
  /** Styles from liked/top-rated outfits. */
  likedStyles?: ReadonlySet<string>;
  /** Item IDs from recently rejected/disliked outfits (decays; soft penalty, not a permanent ban). */
  dislikedItemIds?: ReadonlySet<string>;
  /** Sorted `"id1|id2|..."` keys of outfits rejected by the user. */
  rejectedComboKeys?: ReadonlySet<string>;
  /** Sorted `"id1|id2|..."` keys of outfits worn or recommended recently. */
  recentComboKeys?: ReadonlySet<string>;
  /** User's profile preferred styles. */
  userPreferredStyles?: readonly string[];
  /** User's body build preference if provided. */
  bodyBuild?: "tailored" | "athletic" | "curvy" | "tall_slender" | null;
}

export interface ScoreContext {
  constraints: StylingConstraints;
  weather: WeatherContext | null;
  feedback?: FeedbackSignal;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

const TARGET_FORMALITY: Record<DressCode, [number, number]> = {
  athletic: [1, 2],
  casual: [1, 3],
  smart_casual: [2.5, 4],
  business: [3, 4.5],
  formal: [4, 5],
  worship: [3, 5],
  traditional: [3.5, 5],
  none: [1.5, 4],
};

export function scoreOutfit(
  profiles: GarmentProfile[],
  archetype: OutfitArchetype,
  warnings: Violation[],
  ctx: ScoreContext,
  source: "engine" | "ai" = "engine",
): ScoredOutfit {
  const core = profiles.filter((p) => ["top", "bottom", "onepiece", "outer", "shoes"].includes(p.role));
  const tops = profiles.filter((p) => p.role === "top");
  const bottom = profiles.find((p) => p.role === "bottom");
  const onepiece = profiles.find((p) => p.role === "onepiece");
  const outer = profiles.find((p) => p.role === "outer");
  const shoe = profiles.find((p) => p.role === "shoes");
  const accessories = profiles.filter((p) => p.role === "accessory");

  // 1. Occasion & dress-code suitability (0..20)
  let occasionScore = 14;
  const targetOccasion = ctx.constraints.occasion;
  if (targetOccasion) {
    const matches = core.filter((p) => p.item.occasions.includes(targetOccasion)).length;
    const ratio = core.length > 0 ? matches / core.length : 0;
    occasionScore = 8 + Math.round(ratio * 12);
  }
  const [minF, maxF] = TARGET_FORMALITY[ctx.constraints.dressCode];
  const avgFormality = core.reduce((s, p) => s + p.formality, 0) / Math.max(1, core.length);
  if (avgFormality >= minF && avgFormality <= maxF) {
    occasionScore += 2;
  } else {
    const dist = avgFormality < minF ? minF - avgFormality : avgFormality - maxF;
    occasionScore -= Math.round(dist * 4);
  }
  occasionScore = clamp(occasionScore, 0, 20);

  // 2. Garment role & pair compatibility (0..20)
  let compatibilityScore = 18;
  if (tops[0] && bottom) {
    const fGap = Math.abs(tops[0].formality - bottom.formality);
    if (fGap === 0) compatibilityScore += 2;
    else if (fGap >= 2) compatibilityScore -= fGap * 3;
    if (tops[0].athletic !== bottom.athletic && !ctx.constraints.styles.includes("streetwear")) {
      compatibilityScore -= 3;
    }
  }
  if (onepiece && ctx.constraints.dressCode === "traditional" && onepiece.type === "traditional_set") {
    compatibilityScore += 2;
  }
  for (const w of warnings) {
    compatibilityScore -= w.severity * 2;
  }
  compatibilityScore = clamp(compatibilityScore, 0, 20);

  // 3. Personal style & request alignment (0..15)
  let styleScore = 9;
  const desiredStyles = new Set<string>([
    ...ctx.constraints.styles,
    ...(ctx.feedback?.userPreferredStyles ?? []),
  ]);
  if (desiredStyles.size > 0) {
    const styleHits = core.filter((p) => p.item.style && desiredStyles.has(p.item.style)).length;
    styleScore = 6 + Math.min(9, styleHits * 3);
  }
  if (ctx.constraints.simple) {
    const allSolid = core.every((p) => !p.pattern || p.pattern === "solid");
    if (allSolid && accessories.length <= 1) styleScore += 3;
    else if (!allSolid) styleScore -= 3;
  }
  if (ctx.constraints.polished) {
    if (avgFormality >= 3) styleScore += 3;
    else styleScore -= 3;
  }
  if (ctx.constraints.comfortable) {
    if (core.every((p) => p.formality <= 3 && p.silhouette !== "skinny")) styleScore += 2;
  }
  if (ctx.feedback?.likedStyles && core.some((p) => p.item.style && ctx.feedback!.likedStyles!.has(p.item.style))) {
    styleScore += 2;
  }
  styleScore = clamp(styleScore, 0, 15);

  // 4. Colour & pattern harmony (0..15)
  const palette = readPalette(core.map((p) => p.colour));
  let colourPatternScore = Math.round(palette.score * 13);
  const patternedCount = core.filter((p) => p.pattern && p.pattern !== "solid").length;
  if (patternedCount <= 1) colourPatternScore += 2;
  else if (patternedCount >= 2 && !ctx.constraints.allowBold) colourPatternScore -= 3;

  if (ctx.constraints.preferredColours.length > 0) {
    const prefHits = profiles.filter((p) => p.colour && ctx.constraints.preferredColours.includes(p.colour)).length;
    if (prefHits > 0) colourPatternScore += 2;
  }
  colourPatternScore = clamp(colourPatternScore, 0, 15);

  // 5. Silhouette & proportion balance (0..10)
  let silhouetteScore = 8;
  const primaryTop = tops[0];
  if (primaryTop && bottom) {
    const topVol = primaryTop.silhouette === "oversized" || primaryTop.silhouette === "wide";
    const botVol = bottom.silhouette === "wide" || bottom.silhouette === "oversized" || bottom.silhouette === "relaxed";
    const topFitted = primaryTop.silhouette === "slim" || primaryTop.silhouette === "cropped";
    const botFitted = bottom.silhouette === "slim" || bottom.silhouette === "skinny";

    if ((topFitted && botVol) || (topVol && (botFitted || bottom.silhouette === "regular"))) {
      silhouetteScore = 10; // Classic balanced proportion
    } else if (topVol && botVol && ctx.constraints.styles.includes("streetwear")) {
      silhouetteScore = 9; // Intentional relaxed streetwear silhouette
    } else if (bottom.silhouette === "skinny" && topVol) {
      silhouetteScore = 6;
    }
  }
  if (ctx.feedback?.bodyBuild === "athletic") {
    if (profiles.some((p) => p.silhouette === "skinny")) silhouetteScore -= 3;
    if (bottom && (bottom.silhouette === "relaxed" || bottom.silhouette === "slim" || bottom.type === "joggers" || bottom.type === "athletic_shorts")) {
      silhouetteScore += 1;
    }
  }
  silhouetteScore = clamp(silhouetteScore, 0, 10);

  // 6. Weather suitability (0..10)
  let weatherScore = 8;
  const temp = ctx.weather?.temperatureC ?? (ctx.constraints.hotHint ? 30 : ctx.constraints.coolHint ? 15 : null);
  if (temp !== null) {
    const warmths = core.map((p) => p.warmth ?? 2);
    const avgWarmth = warmths.reduce((a, b) => a + b, 0) / Math.max(1, warmths.length);
    if (temp >= 27) {
      if (avgWarmth <= 2 && !outer) weatherScore = 10;
      else if (avgWarmth > 2.5 || outer) weatherScore = 4;
    } else if (temp <= 15) {
      if (outer || avgWarmth >= 3) weatherScore = 10;
      else weatherScore = 5;
    } else {
      weatherScore = 9;
    }
  }
  if (ctx.weather?.rainy) {
    if (shoe && ["sandals", "slides", "heels"].includes(shoe.type)) weatherScore -= 3;
    if (outer && ["windbreaker", "jacket", "coat"].includes(outer.type)) weatherScore += 1;
  }
  weatherScore = clamp(weatherScore, 0, 10);

  // 7. Footwear & accessory coordination (0..5)
  let footwearAccessories = shoe ? 3 : 1;
  const belt = accessories.find((a) => a.type === "belt");
  if (shoe && belt && shoe.colour && belt.colour) {
    if (shoe.colour === belt.colour) footwearAccessories += 2;
    else if (colourInfo(shoe.colour)?.neutral && colourInfo(belt.colour)?.neutral) footwearAccessories += 1;
  } else if (accessories.length === 1 || accessories.length === 2) {
    footwearAccessories += 1;
  }
  footwearAccessories = clamp(footwearAccessories, 0, 5);

  // 8. Novelty, variety & learned feedback (0..5)
  let novelty = 3;
  const comboKey = profiles.map((p) => p.id).sort().join("|");
  if (ctx.feedback?.recentComboKeys?.has(comboKey) && !ctx.constraints.allowRepeat) {
    novelty -= 3;
  }
  if (ctx.feedback?.rejectedComboKeys?.has(comboKey)) {
    novelty -= 3;
  }
  if (ctx.feedback?.likedItemIds) {
    const likedHits = profiles.filter((p) => ctx.feedback!.likedItemIds!.has(p.id)).length;
    if (likedHits > 0) novelty += 1;
  }
  if (ctx.feedback?.dislikedItemIds) {
    const dislikedHits = profiles.filter((p) => ctx.feedback!.dislikedItemIds!.has(p.id)).length;
    novelty -= dislikedHits * 2;
  }
  // Reward items worn fewer times
  const avgWearCount = core.reduce((s, p) => s + (p.item.wearCount ?? 0), 0) / Math.max(1, core.length);
  if (avgWearCount <= 1) novelty += 1;
  novelty = clamp(novelty, 0, 5);

  const total = clamp(
    occasionScore +
      compatibilityScore +
      styleScore +
      colourPatternScore +
      silhouetteScore +
      weatherScore +
      footwearAccessories +
      novelty,
    0,
    100,
  );

  const breakdown: ScoreBreakdown = {
    occasion: occasionScore,
    compatibility: compatibilityScore,
    style: styleScore,
    colourPattern: colourPatternScore,
    silhouette: silhouetteScore,
    weather: weatherScore,
    footwearAccessories,
    novelty,
  };

  return {
    itemIds: profiles.map((p) => p.id),
    archetype,
    score: total,
    breakdown,
    warnings,
    source,
  };
}

/** Convenience helper to score raw `WardrobeItem[]`. */
export function scoreWardrobeItems(
  items: Parameters<typeof profileGarment>[0][],
  archetype: OutfitArchetype,
  warnings: Violation[],
  ctx: ScoreContext,
  source: "engine" | "ai" = "engine",
): ScoredOutfit {
  return scoreOutfit(items.map(profileGarment), archetype, warnings, ctx, source);
}

/**
 * Staged recommendation pipeline (Phase 8 & Phase 11).
 *
 * Orchestrates:
 *  1. Garment profiling & eligibility filtering
 *  2. Request parsing into structured `StylingConstraints` & `WeatherContext`
 *  3. Contradiction & wardrobe-completeness diagnosis
 *  4. Deterministic candidate generation (respecting anchors, exclusions, dress code, climate)
 *  5. Optional AI candidate merging
 *  6. Hard structural & compatibility validation (`validateOutfit`)
 *  7. Multi-dimensional scoring (`scoreOutfit`) & diversity ranking
 *  8. Final validation gate & honest fallback generation (`Fallback`) when no complete outfit is possible
 */
import { matchesForbidden, parseConstraints, parseWeather } from "@/lib/styling/constraints";
import { buildCaveat, buildFactExplanation, sanitiseExplanation } from "@/lib/styling/explainer";
import { scoreOutfit, type FeedbackSignal } from "@/lib/styling/scorer";
import { isReliable, profileGarment, typeLabel } from "@/lib/styling/taxonomy";
import type {
  Fallback,
  FinalOutfit,
  GarmentProfile,
  PipelineResult,
  ProposedOutfit,
  RejectedCandidate,
  StylingConstraints,
  ValidationContext,
} from "@/lib/styling/types";
import { validateOutfit } from "@/lib/styling/validator";
import type { WardrobeItem } from "@/lib/wardrobe/queries";
import { isEligibleStatus } from "@/lib/wardrobe/status";

export interface PipelineInput {
  /** All wardrobe items owned by the authenticated user. */
  allItems: WardrobeItem[];
  prompt?: string;
  occasion?: string | null;
  weatherSummary?: string | null;
  allowRewearWorn?: boolean;
  anchorItemIds?: string[];
  excludeItemIds?: string[];
  feedback?: FeedbackSignal;
  /** Optional AI-proposed outfits to validate, score, and merge with deterministic candidates. */
  aiProposals?: ProposedOutfit[];
  limit?: number;
}

/** Deterministic candidate generator that constructs plausible outfits before validation. */
export function buildDeterministicCandidates(
  eligibleProfiles: GarmentProfile[],
  constraints: StylingConstraints,
): ProposedOutfit[] {
  // Pre-filter items that violate hard forbidden rules or uncertain essential roles
  const usable = eligibleProfiles.filter((p) => {
    if (!p.usable) return false;
    if (["top", "bottom", "onepiece", "shoes"].includes(p.role) && !isReliable(p)) return false;
    if (constraints.forbidden.some((r) => matchesForbidden(r, p))) return false;
    return true;
  });

  const tops = usable.filter((p) => p.role === "top" && !p.layering);
  const layeringTops = usable.filter((p) => p.role === "top" && p.layering);
  const allTops = [...tops, ...layeringTops];
  const bottoms = usable.filter((p) => p.role === "bottom");
  const onepieces = usable.filter((p) => p.role === "onepiece");
  const shoes = usable.filter((p) => p.role === "shoes");
  const outers = usable.filter((p) => p.role === "outer");
  const accessories = usable.filter((p) => p.role === "accessory");

  const proposals: ProposedOutfit[] = [];

  // Helper to attach optional shoe, outer, and matching accessory
  const completeStandard = (top: GarmentProfile, bottom: GarmentProfile, shoe?: GarmentProfile, outer?: GarmentProfile) => {
    const ids = [top.id, bottom.id];
    if (shoe) ids.push(shoe.id);
    if (outer) ids.push(outer.id);

    // Optional belt only when bottom supports belts and belt matches shoe/neutral
    if (!["joggers", "leggings", "athletic_shorts", "shorts", "jorts"].includes(bottom.type)) {
      const belt = accessories.find(
        (a) => a.type === "belt" && (!shoe?.colour || !a.colour || a.colour === shoe.colour),
      );
      if (belt && !constraints.simple) ids.push(belt.id);
    }

    const name = `${top.item.name} & ${bottom.item.name}`;
    const styleDesc = top.item.style
      ? `${top.item.style.replace(/_/g, " ")} ensemble`
      : "Coordinated everyday look";
    const tip =
      bottom.type === "joggers" || bottom.type === "athletic_shorts" || bottom.type === "shorts" || bottom.type === "jorts"
        ? `Keep the ${top.item.name.toLowerCase()} relaxed and untucked with ${bottom.item.name.toLowerCase()}.`
        : top.formality >= 4 && bottom.formality >= 3
        ? `Tuck in the ${top.item.name.toLowerCase()} for a clean, structured waistline.`
        : `Pair ${top.item.name.toLowerCase()} with ${bottom.item.name.toLowerCase()} for balanced proportions.`;

    proposals.push({
      name,
      occasion: constraints.occasion ?? undefined,
      itemIds: ids,
      styleDescription: styleDesc,
      stylingTip: tip,
      source: "engine",
    });
  };

  const shoeChoices: Array<GarmentProfile | undefined> = shoes.length > 0 ? shoes.slice(0, 6) : [undefined];

  for (const top of allTops.slice(0, 12)) {
    for (const bottom of bottoms.slice(0, 12)) {
      for (const shoe of shoeChoices) {
        completeStandard(top, bottom, shoe);
        // Also try with outerwear when cool weather or formal/business blazer
        if (outers.length > 0 && (constraints.coolHint || constraints.dressCode === "formal" || constraints.dressCode === "business")) {
          completeStandard(top, bottom, shoe, outers[0]);
        }
      }
    }
  }

  for (const onepiece of onepieces.slice(0, 8)) {
    for (const shoe of shoeChoices) {
      const ids = [onepiece.id];
      if (shoe) ids.push(shoe.id);
      proposals.push({
        name: `${onepiece.item.name} Look`,
        occasion: constraints.occasion ?? undefined,
        itemIds: ids,
        styleDescription: onepiece.type === "traditional_set" ? "Traditional ensemble" : "One-piece silhouette",
        stylingTip: `Let the ${onepiece.item.name.toLowerCase()} anchor the silhouette.`,
        source: "engine",
      });
    }
  }

  return proposals;
}

/** Diagnoses why no valid complete outfit could be generated and produces an honest `Fallback`. */
function buildFallback(
  allItems: WardrobeItem[],
  eligibleProfiles: GarmentProfile[],
  constraints: StylingConstraints,
  rejected: RejectedCandidate[],
  ownedMap: ReadonlyMap<string, WardrobeItem>,
  profilesById: ReadonlyMap<string, GarmentProfile>,
): Fallback {
  if (allItems.length === 0) {
    return {
      kind: "empty_wardrobe",
      message: "Your wardrobe is currently empty, so I can't build an outfit yet.",
      suggestions: ["Add at least a top, a bottom (or dress), and a pair of shoes to get started."],
    };
  }

  if (constraints.conflicts.length > 0) {
    return {
      kind: "contradictory_constraints",
      message: constraints.conflicts[0],
      suggestions: [
        "Relax one of the conflicting constraints so I can put together a coherent look.",
      ],
    };
  }

  if (constraints.unavailableAnchors.length > 0) {
    const u = constraints.unavailableAnchors[0];
    return {
      kind: "anchor_conflict",
      message: `You asked to wear "${u.name}", but it is currently marked as ${u.status}.`,
      suggestions: [
        `Mark "${u.name}" as clean (or enable re-wearing worn items in Settings if it is WORN), or pick a different anchor piece.`,
      ],
    };
  }

  if (constraints.unmatchedAnchors.length > 0 && constraints.anchorGroups.length === 0) {
    return {
      kind: "anchor_conflict",
      message: `I couldn't find "${constraints.unmatchedAnchors[0]}" in your wardrobe.`,
      suggestions: [
        "Check that the item has been added to your wardrobe, or try styling around an item you already own.",
      ],
    };
  }

  if (eligibleProfiles.length === 0) {
    return {
      kind: "no_eligible_items",
      message: "All of your wardrobe items are currently dirty, in laundry, or unavailable.",
      suggestions: [
        "Mark washed items as clean in the Laundry tab, or enable re-wearing worn items in Settings.",
      ],
    };
  }

  const reliable = eligibleProfiles.filter((p) => isReliable(p));
  const tops = reliable.filter((p) => p.role === "top");
  const bottoms = reliable.filter((p) => p.role === "bottom");
  const onepieces = reliable.filter((p) => p.role === "onepiece");
  const shoes = reliable.filter((p) => p.role === "shoes");

  if (tops.length === 0 && bottoms.length === 0 && onepieces.length === 0) {
    return {
      kind: "missing_role",
      message: "You don't have any eligible tops, bottoms, or one-piece garments ready to wear.",
      suggestions: ["Add or wash tops and bottoms so a complete outfit can be assembled."],
    };
  }

  if (onepieces.length === 0 && (tops.length === 0 || bottoms.length === 0)) {
    const missing = tops.length === 0 ? "tops" : "bottoms";
    const available = tops.length === 0 ? bottoms : tops;
    const partialItems = [available[0], ...(shoes[0] ? [shoes[0]] : [])];
    return {
      kind: "missing_role",
      message: `I couldn't build a complete outfit because you have no eligible clean ${missing}.`,
      suggestions: [
        `Wash or add ${missing} to complete the look, or ask for a partial combination using your available ${available[0].role}s.`,
      ],
      partial: {
        name: `Partial look with ${available[0].item.name}`,
        itemIds: partialItems.map((p) => p.id),
        styleDescription: "Partial combination from currently available pieces",
        stylingTip: `Pair your ${available[0].item.name.toLowerCase()} once clean ${missing} are available.`,
        source: "engine",
      },
    };
  }

  // Anchor conflict with dress code or available pieces
  if (constraints.anchorGroups.length > 0) {
    const firstAnchorId = constraints.anchorGroups[0][0];
    const anchor = profilesById.get(firstAnchorId) ?? (ownedMap.get(firstAnchorId) ? profileGarment(ownedMap.get(firstAnchorId)!) : null);
    if (anchor) {
      return {
        kind: "anchor_conflict",
        message: `I couldn't find compatible clean pieces in your wardrobe to pair with "${anchor.item.name}" under your current constraints.`,
        suggestions: [
          `Try relaxing the occasion/colour constraint, or see alternatives that work with "${anchor.item.name}".`,
        ],
      };
    }
  }

  void rejected;
  return {
    kind: "no_valid_combination",
    message: "I couldn't build a complete outfit from your currently available clean clothes that meets all of your styling rules.",
    suggestions: [
      "Try relaxing one constraint (such as colour palette or strict dress code), or mark additional clothes as clean.",
    ],
  };
}

/**
 * Runs the end-to-end recommendation pipeline.
 * Every returned outfit in `result.outfits` has passed both initial and final hard validation.
 */
export function runStylingPipeline(input: PipelineInput): PipelineResult {
  const allowRewearWorn = input.allowRewearWorn ?? false;
  const limit = input.limit ?? 3;
  const notices: string[] = [];

  const ownedMap = new Map<string, WardrobeItem>();
  const profilesById = new Map<string, GarmentProfile>();
  const allProfiles: GarmentProfile[] = [];

  for (const item of input.allItems) {
    ownedMap.set(item.id, item);
    const p = profileGarment(item);
    profilesById.set(item.id, p);
    allProfiles.push(p);
  }

  // Flag low-confidence items so the user can review them
  const uncertainItems = allProfiles.filter((p) => p.confidence === "low");
  if (uncertainItems.length > 0) {
    notices.push(
      `${uncertainItems.length} item(s) have uncertain category metadata (e.g. "${uncertainItems[0].item.name}") and were held back from essential roles.`,
    );
  }

  // Parse request into structured constraints
  const constraints = parseConstraints(input.prompt ?? "", allProfiles, {
    occasion: input.occasion,
    allowRewearWorn,
    anchorItemIds: input.anchorItemIds,
    excludeItemIds: input.excludeItemIds,
  });

  const weather = parseWeather(input.weatherSummary, constraints);

  // Determine eligible garments
  const now = Date.now();
  const eligibleProfiles = allProfiles.filter((p) => {
    if (!isEligibleStatus(p.item.status, allowRewearWorn)) return false;
    // Respect 24h rest window unless user allows repeats or anchored the item
    const isAnchored = constraints.anchorGroups.some((g) => g.includes(p.id));
    if (!constraints.allowRepeat && !isAnchored && p.item.lastWornAt) {
      const hours = (now - new Date(p.item.lastWornAt).getTime()) / 3_600_000;
      if (hours < 24 && constraints.avoidRepeatDays !== null) return false;
    }
    return true;
  });

  const eligibleByRole: Record<string, number> = {
    top: 0,
    bottom: 0,
    onepiece: 0,
    outer: 0,
    shoes: 0,
    accessory: 0,
  };
  for (const p of eligibleProfiles) {
    if (p.role in eligibleByRole && isReliable(p)) {
      eligibleByRole[p.role] += 1;
    }
  }

  // If genuine contradictions exist in the user's request, or an explicitly anchored item is unavailable/missing, halt early and ask for clarification
  if (
    constraints.conflicts.length > 0 ||
    constraints.unavailableAnchors.length > 0 ||
    (constraints.unmatchedAnchors.length > 0 && constraints.anchorGroups.length === 0)
  ) {
    return {
      outfits: [],
      rejected: [],
      fallback: buildFallback(input.allItems, eligibleProfiles, constraints, [], ownedMap, profilesById),
      constraints,
      eligibleByRole,
      notices,
    };
  }

  const valCtx: ValidationContext = {
    owned: ownedMap,
    allowRewearWorn,
    constraints,
    weather,
    allowPartial: constraints.wantsPartial,
  };

  // Assemble candidate pool: AI proposals (if any) + deterministic candidates
  const engineCandidates = buildDeterministicCandidates(eligibleProfiles, constraints);
  const allCandidates: ProposedOutfit[] = [...(input.aiProposals ?? []), ...engineCandidates];

  const rejected: RejectedCandidate[] = [];
  const validCandidates: Array<{
    proposal: ProposedOutfit;
    profiles: GarmentProfile[];
    scored: ReturnType<typeof scoreOutfit>;
  }> = [];

  const seenComboKeys = new Set<string>();

  for (const cand of allCandidates) {
    // Deduplicate identical item combinations
    const dedupIds = [...new Set(cand.itemIds)];
    const comboKey = [...dedupIds].sort().join("|");
    if (seenComboKeys.has(comboKey)) continue;

    // Exclude recently worn/recommended combinations when avoidRepeatDays or wantsDifferent is set
    if (
      (constraints.avoidRepeatDays !== null || constraints.wantsDifferent) &&
      input.feedback?.recentComboKeys?.has(comboKey) &&
      !constraints.allowRepeat
    ) {
      rejected.push({
        source: cand.source,
        codes: ["RECENT_OUTFIT_REPEAT"],
        messages: ["Skipped because this exact outfit combination was recently worn or shown."],
      });
      continue;
    }

    const v = validateOutfit(dedupIds, valCtx, profilesById);
    if (!v.ok) {
      rejected.push({
        source: cand.source,
        codes: [...v.hard.map((h) => h.code), ...v.warnings.map((w) => w.code)],
        messages: [...v.hard.map((h) => h.message), ...v.warnings.map((w) => w.message)],
      });
      continue;
    }

    seenComboKeys.add(comboKey);
    const profiles = dedupIds.map((id) => profilesById.get(id)!).filter(Boolean);
    const scored = scoreOutfit(profiles, v.archetype, v.warnings, {
      constraints,
      weather,
      feedback: input.feedback,
    }, cand.source);

    validCandidates.push({
      proposal: { ...cand, itemIds: dedupIds },
      profiles,
      scored,
    });
  }

  // Sort by score descending (with a slight tie-breaker for AI explanations when scores are within 2 points)
  validCandidates.sort((a, b) => {
    const diff = b.scored.score - a.scored.score;
    if (Math.abs(diff) <= 2 && a.proposal.source !== b.proposal.source) {
      return a.proposal.source === "ai" ? -1 : 1;
    }
    return diff;
  });

  // Diversity ranking: avoid returning 3 outfits that share the exact same top+bottom pair
  const selected: FinalOutfit[] = [];
  const usedCorePairs = new Set<string>();

  for (const entry of validCandidates) {
    if (selected.length >= limit) break;

    const coreIds = entry.profiles
      .filter((p) => p.role === "top" || p.role === "bottom" || p.role === "onepiece")
      .map((p) => p.id)
      .sort()
      .join("|");

    if (usedCorePairs.has(coreIds) && validCandidates.length > limit) {
      continue;
    }

    // Final validation gate (Step 14 of Phase 8)
    const finalCheck = validateOutfit(entry.proposal.itemIds, valCtx, profilesById);
    if (!finalCheck.ok) {
      rejected.push({
        source: entry.proposal.source,
        codes: finalCheck.hard.map((h) => h.code),
        messages: finalCheck.hard.map((h) => h.message),
      });
      continue;
    }

    usedCorePairs.add(coreIds);
    const factExplanation = buildFactExplanation(entry.profiles, entry.scored.archetype, constraints);
    const explanation =
      entry.proposal.source === "ai"
        ? sanitiseExplanation(entry.proposal.explanation, entry.profiles, entry.scored.archetype, constraints)
        : factExplanation;

    selected.push({
      ...entry.proposal,
      explanation,
      archetype: entry.scored.archetype,
      score: entry.scored.score,
      breakdown: entry.scored.breakdown,
      warnings: entry.scored.warnings,
      factExplanation,
      caveat: buildCaveat(entry.scored.warnings),
    });
  }

  const fallback =
    selected.length === 0
      ? buildFallback(input.allItems, eligibleProfiles, constraints, rejected, ownedMap, profilesById)
      : null;

  void typeLabel;
  return {
    outfits: selected,
    rejected,
    fallback,
    constraints,
    eligibleByRole,
    notices,
  };
}

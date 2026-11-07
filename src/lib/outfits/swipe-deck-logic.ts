import type { SharedItemCardData } from "@/lib/connect/queries";
import type { StylistProposedOutfitCard } from "@/lib/connect/stylist-chat-queries";
import type { OutfitSuggestion } from "@/lib/outfits/engine";
import type { OutfitWithItems } from "@/lib/outfits/queries";
import type { PackingItem, PlanOutfit } from "@/lib/packing/schemas";
import type { WardrobeItem } from "@/lib/wardrobe/queries";

// ─── View-Model Types ─────────────────────────────────────────────────────────

export interface SwipeableGarmentItem {
  id: string;
  name: string;
  category: string;
  imageUrl?: string | null;
  primaryColour?: string | null;
  secondaryColours?: string[];
  material?: string | null;
  style?: string | null;
}

export interface SwipeableMissingPiece {
  name: string;
  category: string;
  reason?: string | null;
  inspirationUrl?: string | null;
}

export interface SwipeableOutfitCardData {
  id: string;
  title: string;
  shortDescription?: string | null;
  occasion?: string | null;
  aestheticBadge?: string | null;
  styleTags?: string[];
  photoUrl?: string | null;
  items: SwipeableGarmentItem[];
  explanation?: string | null;
  stylingTip?: string | null;
  missingPieces?: SwipeableMissingPiece[];
  isSaved?: boolean;
  isSaving?: boolean;
  isFavourite?: boolean;
}

// ─── Sanitizers & Formatters ──────────────────────────────────────────────────

export function cleanText(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function cleanList(values: Array<string | null | undefined> | null | undefined): string[] {
  if (!Array.isArray(values)) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of values) {
    const cleaned = cleanText(raw);
    if (cleaned && !seen.has(cleaned.toLowerCase())) {
      seen.add(cleaned.toLowerCase());
      out.push(cleaned);
    }
  }
  return out;
}

function mapWardrobeItemToGarment(
  item: WardrobeItem,
  imageUrls: Record<string, string>,
): SwipeableGarmentItem {
  return {
    id: item.id,
    name: cleanText(item.name) ?? "Unnamed garment",
    category: cleanText(item.category) ?? "other",
    imageUrl: item.imagePath ? (imageUrls[item.imagePath] ?? null) : null,
    primaryColour: cleanText(item.primaryColour),
    secondaryColours: cleanList(item.secondaryColours),
    material: cleanText(item.material),
    style: cleanText(item.style),
  };
}

function collectStyleTagsFromItems(items: Array<{ style?: string | null }>): string[] {
  return cleanList(items.map((i) => i.style)).slice(0, 3);
}

// ─── Section Data Adapters ────────────────────────────────────────────────────

export interface StylistOutfitSource {
  name: string;
  occasion?: string | null;
  styleDescription?: string | null;
  explanation?: string | null;
  stylingTip?: string | null;
  items: WardrobeItem[];
  missingPieces?: Array<{ name: string; category: string; reason: string }>;
}

export function adaptStylistOutfit(
  outfit: StylistOutfitSource,
  index: number,
  imageUrls: Record<string, string>,
  options: {
    isSaved?: boolean;
    isSaving?: boolean;
    generatedPhotoUrl?: string | null;
    getPinterestUrl?: (query: string) => string;
  } = {},
): SwipeableOutfitCardData {
  const items = (outfit.items ?? []).map((item) => mapWardrobeItemToGarment(item, imageUrls));
  const missingPieces: SwipeableMissingPiece[] = (outfit.missingPieces ?? [])
    .filter((mp) => Boolean(cleanText(mp.name)))
    .map((mp) => {
      const name = cleanText(mp.name) ?? "Suggested piece";
      const category = cleanText(mp.category) ?? "accessory";
      return {
        name,
        category,
        reason: cleanText(mp.reason),
        inspirationUrl: options.getPinterestUrl
          ? options.getPinterestUrl(`${name} ${category} outfit aesthetic styling`)
          : null,
      };
    });

  return {
    id: `stylist-look-${index}-${cleanText(outfit.name) ?? index}`,
    title: cleanText(outfit.name) ?? `Recommended Look ${index + 1}`,
    shortDescription: cleanText(outfit.styleDescription),
    occasion: cleanText(outfit.occasion) ?? "Recommended Look",
    aestheticBadge: `Look ${index + 1}`,
    styleTags: collectStyleTagsFromItems(outfit.items ?? []),
    photoUrl: cleanText(options.generatedPhotoUrl),
    items,
    explanation: cleanText(outfit.explanation),
    stylingTip: cleanText(outfit.stylingTip),
    missingPieces,
    isSaved: Boolean(options.isSaved),
    isSaving: Boolean(options.isSaving),
  };
}

export function adaptStudioSuggestion(
  suggestion: OutfitSuggestion,
  index: number,
  itemImageUrls: Record<string, string>,
  options: { isSaved?: boolean; isSaving?: boolean } = {},
): SwipeableOutfitCardData {
  const items = (suggestion.items ?? []).map((item) =>
    mapWardrobeItemToGarment(item, itemImageUrls),
  );
  const missingPieces: SwipeableMissingPiece[] = (suggestion.accessoryGaps ?? [])
    .filter((gap) => Boolean(cleanText(gap.category)))
    .map((gap) => ({
      name: cleanText(gap.category) ?? "Accessory",
      category: cleanText(gap.category) ?? "accessory",
      reason: cleanText(gap.reason),
    }));

  return {
    id: `studio-suggestion-${index}-${cleanText(suggestion.name) ?? index}`,
    title: cleanText(suggestion.name) ?? `Outfit Idea ${index + 1}`,
    shortDescription: cleanText(suggestion.styleDescription),
    occasion: cleanText(suggestion.occasion),
    aestheticBadge:
      typeof suggestion.score === "number" && Number.isFinite(suggestion.score)
        ? `${suggestion.score} pts`
        : null,
    styleTags: collectStyleTagsFromItems(suggestion.items ?? []),
    items,
    stylingTip: cleanText(suggestion.stylingTip),
    missingPieces,
    isSaved: Boolean(options.isSaved),
    isSaving: Boolean(options.isSaving),
  };
}

export function adaptSavedOutfit(
  outfit: OutfitWithItems,
  itemImageUrls: Record<string, string>,
  photoUrls: Record<string, string>,
): SwipeableOutfitCardData {
  const items = (outfit.items ?? []).map((item) =>
    mapWardrobeItemToGarment(item, itemImageUrls),
  );
  const sourceLabels: Record<OutfitWithItems["source"], string> = {
    AI: "AI Styled",
    ENGINE: "Auto-Generated",
    MANUAL: "Curated Look",
  };

  return {
    id: outfit.id,
    title: cleanText(outfit.name) ?? "Saved Outfit",
    shortDescription: cleanText(outfit.styleDescription),
    occasion: cleanText(outfit.occasion)?.replace(/_/g, " ") ?? null,
    aestheticBadge: sourceLabels[outfit.source] ?? null,
    styleTags: collectStyleTagsFromItems(outfit.items ?? []),
    photoUrl: outfit.photoPath ? (photoUrls[outfit.photoPath] ?? null) : null,
    items,
    explanation: cleanText(outfit.explanation),
    stylingTip: cleanText(outfit.stylingTip),
    isFavourite: Boolean(outfit.isFavourite),
    isSaved: true,
  };
}

export function adaptPackingOutfit(
  plan: PlanOutfit,
  itemsById: Map<string, PackingItem>,
  imageUrls: Record<string, string>,
  options: { isRotation?: boolean; location?: string | null } = {},
): SwipeableOutfitCardData {
  const dayItems: SwipeableGarmentItem[] = (plan.item_ids ?? [])
    .map((id) => itemsById.get(id))
    .filter((item): item is PackingItem => Boolean(item))
    .map((item) => ({
      id: item.id,
      name: cleanText(item.name) ?? "Capsule piece",
      category: cleanText(item.category) ?? "other",
      imageUrl: item.image_path ? (imageUrls[item.image_path] ?? null) : null,
      primaryColour: cleanText(item.primary_colour),
    }));

  const badgeLabel = options.isRotation ? `Rotation ${plan.day}` : `Day ${plan.day}`;
  const locationContext = cleanText(options.location);

  return {
    id: `packing-day-${plan.day}-${cleanText(plan.title) ?? plan.day}`,
    title: cleanText(plan.title) ?? `${badgeLabel} Outfit`,
    shortDescription:
      dayItems.length > 0
        ? `${dayItems.length} capsule ${dayItems.length === 1 ? "piece" : "pieces"}${locationContext ? ` for ${locationContext}` : ""}`
        : null,
    occasion: locationContext,
    aestheticBadge: badgeLabel,
    items: dayItems,
    stylingTip: cleanText(plan.styling_tip),
  };
}

export function adaptChatProposedOutfit(
  outfit: StylistProposedOutfitCard,
  messageId: string,
  index: number,
  options: { isSaved?: boolean; isSaving?: boolean } = {},
): SwipeableOutfitCardData {
  const items: SwipeableGarmentItem[] = (outfit.items ?? []).map(
    (it: SharedItemCardData) => ({
      id: it.id,
      name: cleanText(it.name) ?? "Closet piece",
      category: cleanText(it.category) ?? "other",
      imageUrl: cleanText(it.imageUrl),
      primaryColour: cleanText(it.primaryColour),
      material: cleanText(it.material),
      style: cleanText(it.style),
    }),
  );

  return {
    id: `chat-${messageId}-outfit-${index}`,
    title: cleanText(outfit.name) ?? `Stylist Look ${index + 1}`,
    shortDescription: cleanText(outfit.styleDescription),
    occasion: cleanText(outfit.occasion),
    aestheticBadge: "Stylist Look",
    styleTags: collectStyleTagsFromItems(outfit.items ?? []),
    items,
    explanation: cleanText(outfit.explanation),
    stylingTip: cleanText(outfit.stylingTip),
    isSaved: Boolean(options.isSaved),
    isSaving: Boolean(options.isSaving),
  };
}

// ─── Swipe Gesture & Navigation Physics ───────────────────────────────────────

/**
 * Navigation convention used consistently across ClosetAI:
 * - Swiping LEFT (dx < 0) advances to the NEXT outfit (index + 1).
 * - Swiping RIGHT (dx > 0) returns to the PREVIOUS outfit (index - 1).
 */
export const SWIPE_LOCK_DISTANCE_PX = 10;
export const SWIPE_COMMIT_RATIO = 0.22;
export const SWIPE_MIN_COMMIT_PX = 56;
export const SWIPE_MAX_COMMIT_PX = 105;
export const SWIPE_FLICK_VELOCITY_PX_PER_MS = 0.5;
export const SWIPE_FLICK_MIN_DISTANCE_PX = 30;
export const MAX_CARD_ROTATION_DEG = 7.5;
export const BOUNDARY_RESISTANCE = 0.26;

export type SwipeAxis = "pending" | "horizontal" | "vertical";
export type NavigationDirection = "next" | "prev";

export function clampOutfitIndex(index: number, totalCount: number): number {
  if (totalCount <= 0) return 0;
  if (!Number.isFinite(index)) return 0;
  return Math.max(0, Math.min(Math.trunc(index), totalCount - 1));
}

export function detectSwipeAxis(dx: number, dy: number): SwipeAxis {
  const absX = Math.abs(dx);
  const absY = Math.abs(dy);
  if (absX < SWIPE_LOCK_DISTANCE_PX && absY < SWIPE_LOCK_DISTANCE_PX) {
    return "pending";
  }
  if (absX > absY * 1.15) {
    return "horizontal";
  }
  return "vertical";
}

export function computeDragTransform(params: {
  dx: number;
  dy: number;
  hasPrev: boolean;
  hasNext: boolean;
  reducedMotion?: boolean;
}): {
  effectiveDx: number;
  effectiveDy: number;
  rotationDeg: number;
  directionHint: NavigationDirection | null;
  progress: number;
} {
  const { dx, dy, hasPrev, hasNext, reducedMotion = false } = params;
  const movingNext = dx < 0;
  const movingPrev = dx > 0;
  const atBoundary = (movingNext && !hasNext) || (movingPrev && !hasPrev);

  const effectiveDx = atBoundary ? dx * BOUNDARY_RESISTANCE : dx;
  const effectiveDy = reducedMotion ? 0 : Math.min(18, Math.abs(effectiveDx) * 0.035 + dy * 0.06);
  const rawRotation = effectiveDx * 0.032;
  const rotationDeg = reducedMotion
    ? 0
    : Math.max(-MAX_CARD_ROTATION_DEG, Math.min(MAX_CARD_ROTATION_DEG, rawRotation));

  let directionHint: NavigationDirection | null = null;
  if (movingNext && hasNext && Math.abs(dx) >= 28) {
    directionHint = "next";
  } else if (movingPrev && hasPrev && Math.abs(dx) >= 28) {
    directionHint = "prev";
  }

  const progress = Math.min(1, Math.abs(effectiveDx) / 110);

  return {
    effectiveDx,
    effectiveDy,
    rotationDeg,
    directionHint,
    progress,
  };
}

export function resolveSwipeRelease(params: {
  dx: number;
  durationMs: number;
  containerWidth: number;
  currentIndex: number;
  totalCount: number;
}): {
  committed: boolean;
  nextIndex: number;
  direction: NavigationDirection | null;
} {
  const { dx, durationMs, containerWidth, totalCount } = params;
  const currentIndex = clampOutfitIndex(params.currentIndex, totalCount);

  if (totalCount <= 1) {
    return { committed: false, nextIndex: currentIndex, direction: null };
  }

  const safeWidth = containerWidth > 0 ? containerWidth : 360;
  const distanceThreshold = Math.max(
    SWIPE_MIN_COMMIT_PX,
    Math.min(SWIPE_MAX_COMMIT_PX, safeWidth * SWIPE_COMMIT_RATIO),
  );
  const safeDuration = Math.max(1, durationMs);
  const velocityAbs = Math.abs(dx) / safeDuration;

  const meetsDistance = Math.abs(dx) >= distanceThreshold;
  const meetsFlick =
    Math.abs(dx) >= SWIPE_FLICK_MIN_DISTANCE_PX &&
    velocityAbs >= SWIPE_FLICK_VELOCITY_PX_PER_MS;

  if (!meetsDistance && !meetsFlick) {
    return { committed: false, nextIndex: currentIndex, direction: null };
  }

  if (dx < 0 && currentIndex < totalCount - 1) {
    return {
      committed: true,
      nextIndex: currentIndex + 1,
      direction: "next",
    };
  }

  if (dx > 0 && currentIndex > 0) {
    return {
      committed: true,
      nextIndex: currentIndex - 1,
      direction: "prev",
    };
  }

  return { committed: false, nextIndex: currentIndex, direction: null };
}

export function resolveKeyboardNavigation(
  key: string,
  currentIndex: number,
  totalCount: number,
): { nextIndex: number; direction: NavigationDirection } | null {
  if (totalCount <= 1) return null;
  const clamped = clampOutfitIndex(currentIndex, totalCount);

  if (key === "ArrowRight" && clamped < totalCount - 1) {
    return { nextIndex: clamped + 1, direction: "next" };
  }
  if (key === "ArrowLeft" && clamped > 0) {
    return { nextIndex: clamped - 1, direction: "prev" };
  }
  return null;
}

/**
 * Computes a bounded window of dot indices so collections of 20–100+ outfits
 * do not render dozens of tiny pagination buttons.
 */
export function computeWindowedDots(
  activeIndex: number,
  totalCount: number,
  maxVisible = 7,
): number[] {
  if (totalCount <= 0) return [];
  const cap = Math.max(3, maxVisible);
  if (totalCount <= cap) {
    return Array.from({ length: totalCount }, (_, i) => i);
  }
  const clamped = clampOutfitIndex(activeIndex, totalCount);
  const half = Math.floor(cap / 2);
  let start = Math.max(0, clamped - half);
  const end = Math.min(totalCount, start + cap);
  if (end - start < cap) {
    start = Math.max(0, end - cap);
  }
  return Array.from({ length: end - start }, (_, i) => start + i);
}

// ─── Deck State Machine (Pure Reducer) ────────────────────────────────────────

export interface DeckInternalState {
  deckKey: string;
  uncontrolledIndex: number;
  expandedOutfitId: string | null;
}

export type DeckAction =
  | { type: "NAVIGATE"; nextIndex: number; totalCount: number }
  | { type: "TOGGLE_DETAILS"; outfitId: string }
  | { type: "COLLAPSE_DETAILS" }
  | { type: "SYNC_DECK_KEY"; deckKey: string }
  | { type: "CLAMP_COUNT"; totalCount: number; validOutfitIds: Set<string> };

export function createInitialDeckState(deckKey = "default"): DeckInternalState {
  return {
    deckKey,
    uncontrolledIndex: 0,
    expandedOutfitId: null,
  };
}

export function deckStateReducer(
  state: DeckInternalState,
  action: DeckAction,
): DeckInternalState {
  switch (action.type) {
    case "NAVIGATE": {
      const nextIndex = clampOutfitIndex(action.nextIndex, action.totalCount);
      return {
        ...state,
        uncontrolledIndex: nextIndex,
        // Changing cards always resets expanded details
        expandedOutfitId: null,
      };
    }
    case "TOGGLE_DETAILS": {
      return {
        ...state,
        expandedOutfitId:
          state.expandedOutfitId === action.outfitId ? null : action.outfitId,
      };
    }
    case "COLLAPSE_DETAILS": {
      if (state.expandedOutfitId === null) return state;
      return { ...state, expandedOutfitId: null };
    }
    case "SYNC_DECK_KEY": {
      if (state.deckKey === action.deckKey) return state;
      return {
        deckKey: action.deckKey,
        uncontrolledIndex: 0,
        expandedOutfitId: null,
      };
    }
    case "CLAMP_COUNT": {
      const clamped = clampOutfitIndex(state.uncontrolledIndex, action.totalCount);
      const expandedStillValid =
        state.expandedOutfitId !== null &&
        action.validOutfitIds.has(state.expandedOutfitId);
      if (
        clamped === state.uncontrolledIndex &&
        (state.expandedOutfitId === null || expandedStillValid)
      ) {
        return state;
      }
      return {
        ...state,
        uncontrolledIndex: clamped,
        expandedOutfitId: expandedStillValid ? state.expandedOutfitId : null,
      };
    }
  }
}

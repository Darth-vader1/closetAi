export const OUTFIT_TIME_OF_DAY_SLOTS = [
  "MORNING",
  "AFTERNOON",
  "EVENING",
] as const;

export type OutfitTimeOfDay = (typeof OUTFIT_TIME_OF_DAY_SLOTS)[number];

export interface TimeOfDaySlotMeta {
  slot: OutfitTimeOfDay;
  label: string;
  shortLabel: string;
  timeHint: string;
  order: number;
}

export const TIME_OF_DAY_META: Record<OutfitTimeOfDay, TimeOfDaySlotMeta> = {
  MORNING: {
    slot: "MORNING",
    label: "Morning",
    shortLabel: "AM",
    timeHint: "6 AM – 12 PM",
    order: 0,
  },
  AFTERNOON: {
    slot: "AFTERNOON",
    label: "Afternoon",
    shortLabel: "PM",
    timeHint: "12 PM – 5 PM",
    order: 1,
  },
  EVENING: {
    slot: "EVENING",
    label: "Evening",
    shortLabel: "Eve",
    timeHint: "5 PM – Late",
    order: 2,
  },
};

export function normalizeOutfitTimeOfDay(val?: string | null): OutfitTimeOfDay {
  const upper = (val ?? "").trim().toUpperCase();
  if (upper === "AFTERNOON") return "AFTERNOON";
  if (upper === "EVENING") return "EVENING";
  return "MORNING";
}

export function compareTimeOfDaySlots(
  a?: string | null,
  b?: string | null,
): number {
  return (
    TIME_OF_DAY_META[normalizeOutfitTimeOfDay(a)].order -
    TIME_OF_DAY_META[normalizeOutfitTimeOfDay(b)].order
  );
}

export interface CalendarSlotItemLike {
  id: string;
  plannedFor: string;
  timeOfDay?: OutfitTimeOfDay | null;
  status: "PLANNED" | "WORN" | "SKIPPED";
}

/**
 * Returns the plans for a specific date sorted strictly in MORNING -> AFTERNOON -> EVENING order.
 */
export function getDayPlansBySlot<T extends CalendarSlotItemLike>(
  plans: readonly T[],
  dateStr: string,
): {
  MORNING: T | null;
  AFTERNOON: T | null;
  EVENING: T | null;
  ordered: T[];
  plannedCount: number;
  wornCount: number;
} {
  const slots: Record<OutfitTimeOfDay, T | null> = {
    MORNING: null,
    AFTERNOON: null,
    EVENING: null,
  };

  for (const plan of plans) {
    if (plan.plannedFor !== dateStr) continue;
    const slot = normalizeOutfitTimeOfDay(plan.timeOfDay);
    // Prefer WORN over PLANNED if duplicates ever exist before DB constraint migration
    const existing = slots[slot];
    if (!existing || (existing.status !== "WORN" && plan.status === "WORN")) {
      slots[slot] = plan;
    }
  }

  const ordered = OUTFIT_TIME_OF_DAY_SLOTS.map((s) => slots[s]).filter(
    (p): p is T => p !== null,
  );
  const wornCount = ordered.filter((p) => p.status === "WORN").length;
  const plannedCount = ordered.length;

  return {
    MORNING: slots.MORNING,
    AFTERNOON: slots.AFTERNOON,
    EVENING: slots.EVENING,
    ordered,
    plannedCount,
    wornCount,
  };
}

/**
 * Upserts a slot plan into a list of calendar plans, replacing only the matching (plannedFor, timeOfDay) slot
 * while preserving all other slots on that day and other days.
 */
export function upsertCalendarSlotPlan<T extends CalendarSlotItemLike>(
  plans: readonly T[],
  incoming: T,
): T[] {
  const targetSlot = normalizeOutfitTimeOfDay(incoming.timeOfDay);
  const filtered = plans.filter((p) => {
    if (p.id === incoming.id) return false;
    if (
      p.plannedFor === incoming.plannedFor &&
      normalizeOutfitTimeOfDay(p.timeOfDay) === targetSlot
    ) {
      return false;
    }
    return true;
  });

  const next = [...filtered, { ...incoming, timeOfDay: targetSlot }];
  next.sort((a, b) => {
    if (a.plannedFor !== b.plannedFor) {
      return a.plannedFor.localeCompare(b.plannedFor);
    }
    return compareTimeOfDaySlots(a.timeOfDay, b.timeOfDay);
  });
  return next;
}

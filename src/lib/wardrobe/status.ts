/**
 * Laundry/availability statuses and the single eligibility rule used everywhere
 * (outfit engine, AI validation, emails, manual builder). Keep this the only place
 * that decides whether a garment can be recommended.
 */
export const LAUNDRY_STATUSES = ["CLEAN", "WORN", "DIRTY", "IN_LAUNDRY", "WASHING", "DRYING", "UNAVAILABLE"] as const;
export type LaundryStatus = (typeof LAUNDRY_STATUSES)[number];

export const STATUS_LABELS: Record<LaundryStatus, string> = {
  CLEAN: "Clean",
  WORN: "Worn",
  DIRTY: "Needs washing",
  IN_LAUNDRY: "In laundry queue",
  WASHING: "Washing",
  DRYING: "Drying",
  UNAVAILABLE: "Unavailable",
};

export const STATUS_DESCRIPTIONS: Record<LaundryStatus, string> = {
  CLEAN: "Ready to wear.",
  WORN: "Worn since last wash. Wearable again only if you allow re-wearing.",
  DIRTY: "Needs washing. Won't be recommended.",
  IN_LAUNDRY: "Waiting to be washed. Won't be recommended.",
  WASHING: "In the machine right now. Won't be recommended.",
  DRYING: "Washed but not dry yet. Won't be recommended.",
  UNAVAILABLE: "Temporarily out of use. Won't be recommended.",
};

export function isLaundryStatus(value: unknown): value is LaundryStatus {
  return typeof value === "string" && (LAUNDRY_STATUSES as readonly string[]).includes(value);
}

/**
 * CLEAN is always eligible. WORN is eligible only when the user allows re-wearing.
 * Every other status is ineligible.
 */
export function isEligibleStatus(status: LaundryStatus, allowRewearWorn: boolean): boolean {
  if (status === "CLEAN") return true;
  if (status === "WORN") return allowRewearWorn;
  return false;
}

export function countByStatus(items: ReadonlyArray<{ status: LaundryStatus }>): Record<LaundryStatus, number> {
  const counts = Object.fromEntries(LAUNDRY_STATUSES.map((s) => [s, 0])) as Record<LaundryStatus, number>;
  for (const item of items) counts[item.status] += 1;
  return counts;
}

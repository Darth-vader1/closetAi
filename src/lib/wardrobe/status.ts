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

export interface StatusAction {
  label: string;
  to: LaundryStatus;
  /** True only for actions where the user is confirming a wash is complete. Sets last_washed_at. */
  confirmWashed: boolean;
  /** The main suggested next step, shown as the primary button. */
  primary?: boolean;
}

const MARK_WASHED: StatusAction = { label: "Mark washed & clean", to: "CLEAN", confirmWashed: true };

/**
 * Quick actions offered for a garment in a given status. "Washed" is only ever claimed through an
 * explicit action the user takes; returning a WORN or UNAVAILABLE item to CLEAN does not count as a wash.
 */
export function statusActions(status: LaundryStatus): StatusAction[] {
  switch (status) {
    case "CLEAN":
      return [
        { label: "Mark as worn", to: "WORN", confirmWashed: false, primary: true },
        { label: "Needs washing", to: "DIRTY", confirmWashed: false },
      ];
    case "WORN":
      return [
        { label: "Needs washing", to: "DIRTY", confirmWashed: false, primary: true },
        { label: "Mark clean", to: "CLEAN", confirmWashed: false },
      ];
    case "DIRTY":
      return [
        { label: "Add to laundry queue", to: "IN_LAUNDRY", confirmWashed: false, primary: true },
        { label: "Start washing", to: "WASHING", confirmWashed: false },
        MARK_WASHED,
      ];
    case "IN_LAUNDRY":
      return [{ label: "Start washing", to: "WASHING", confirmWashed: false, primary: true }, MARK_WASHED];
    case "WASHING":
      return [{ label: "Move to drying", to: "DRYING", confirmWashed: false, primary: true }, MARK_WASHED];
    case "DRYING":
      return [{ ...MARK_WASHED, primary: true }];
    case "UNAVAILABLE":
      return [
        { label: "Mark clean", to: "CLEAN", confirmWashed: false, primary: true },
        { label: "Needs washing", to: "DIRTY", confirmWashed: false },
      ];
  }
}

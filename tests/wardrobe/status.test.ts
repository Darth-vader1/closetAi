import { describe, expect, it } from "vitest";
import { countByStatus, isEligibleStatus, isLaundryStatus, LAUNDRY_STATUSES, type LaundryStatus } from "@/lib/wardrobe/status";

describe("isEligibleStatus", () => {
  it("always treats CLEAN as eligible", () => {
    expect(isEligibleStatus("CLEAN", false)).toBe(true);
    expect(isEligibleStatus("CLEAN", true)).toBe(true);
  });

  it("treats WORN as eligible only when re-wearing is allowed", () => {
    expect(isEligibleStatus("WORN", false)).toBe(false);
    expect(isEligibleStatus("WORN", true)).toBe(true);
  });

  it.each(["DIRTY", "IN_LAUNDRY", "WASHING", "DRYING", "UNAVAILABLE"] as LaundryStatus[])(
    "never treats %s as eligible, even when re-wearing is allowed",
    (status) => {
      expect(isEligibleStatus(status, false)).toBe(false);
      expect(isEligibleStatus(status, true)).toBe(false);
    },
  );

  it("distinguishes WORN from DIRTY", () => {
    expect(isEligibleStatus("WORN", true)).not.toBe(isEligibleStatus("DIRTY", true));
  });
});

describe("isLaundryStatus", () => {
  it("accepts every known status and rejects anything else", () => {
    for (const s of LAUNDRY_STATUSES) expect(isLaundryStatus(s)).toBe(true);
    expect(isLaundryStatus("clean")).toBe(false);
    expect(isLaundryStatus("")).toBe(false);
    expect(isLaundryStatus(null)).toBe(false);
  });
});

describe("countByStatus", () => {
  it("counts items and includes zero for absent statuses", () => {
    const counts = countByStatus([{ status: "CLEAN" }, { status: "CLEAN" }, { status: "DIRTY" }]);
    expect(counts.CLEAN).toBe(2);
    expect(counts.DIRTY).toBe(1);
    expect(counts.DRYING).toBe(0);
  });
});

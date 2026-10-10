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

import { statusActions } from "@/lib/wardrobe/status";

describe("statusActions", () => {
  it("defines actions for every status, each with exactly one primary", () => {
    for (const status of LAUNDRY_STATUSES) {
      const actions = statusActions(status);
      expect(actions.length).toBeGreaterThan(0);
      expect(actions.filter((a) => a.primary)).toHaveLength(1);
    }
  });

  it("never offers a no-op transition", () => {
    for (const status of LAUNDRY_STATUSES) {
      expect(statusActions(status).some((a) => a.to === status)).toBe(false);
    }
  });

  it("only confirms a wash when returning an item to CLEAN", () => {
    for (const status of LAUNDRY_STATUSES) {
      for (const a of statusActions(status)) {
        if (a.confirmWashed) expect(a.to).toBe("CLEAN");
      }
    }
  });

  it("does not count WORN or UNAVAILABLE items as washed when marked clean", () => {
    for (const status of ["WORN", "UNAVAILABLE"] as const) {
      const clean = statusActions(status).find((a) => a.to === "CLEAN");
      expect(clean?.confirmWashed).toBe(false);
    }
  });

  it("lets every wash-cycle status be completed with a confirmed wash", () => {
    for (const status of ["DIRTY", "IN_LAUNDRY", "WASHING", "DRYING"] as const) {
      expect(statusActions(status).some((a) => a.to === "CLEAN" && a.confirmWashed)).toBe(true);
    }
  });
});

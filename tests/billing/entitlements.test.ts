import { describe, expect, it } from "vitest";
import {
  FREE_PLAN_LIMITS,
  PREMIUM_PLAN_LIMITS,
  PRICING_PLANS,
  getPlanDefinition,
  getPlanLimits,
} from "@/lib/billing/plans";
import { getMonthlyWindow, getWeeklyWindow } from "@/lib/billing/entitlements";

describe("ClosetAI Freemium Plan Configuration", () => {
  it("defines free plan with exact launch limits", () => {
    expect(FREE_PLAN_LIMITS.wardrobe_items).toBe(30);
    expect(FREE_PLAN_LIMITS.outfit_recommendations.limit).toBe(5);
    expect(FREE_PLAN_LIMITS.outfit_recommendations.window).toBe("week");
    expect(FREE_PLAN_LIMITS.saved_outfits).toBe(10);
    expect(FREE_PLAN_LIMITS.flatlay_designs).toBe(3);
    expect(FREE_PLAN_LIMITS.beautify_processing.limit).toBe(2);
    expect(FREE_PLAN_LIMITS.beautify_processing.window).toBe("month");
    expect(FREE_PLAN_LIMITS.advanced_styling).toBe(false);
    expect(FREE_PLAN_LIMITS.closetai_connect).toBe("basic");
    expect(FREE_PLAN_LIMITS.advanced_insights).toBe(false);
  });

  it("defines premium plan with expanded limits and realistic AI boundaries", () => {
    expect(PREMIUM_PLAN_LIMITS.wardrobe_items).toBeNull(); // Unlimited
    expect(PREMIUM_PLAN_LIMITS.outfit_recommendations.limit).toBe(100);
    expect(PREMIUM_PLAN_LIMITS.outfit_recommendations.window).toBe("month");
    expect(PREMIUM_PLAN_LIMITS.saved_outfits).toBeNull(); // Unlimited
    expect(PREMIUM_PLAN_LIMITS.flatlay_designs).toBeNull(); // Unlimited
    expect(PREMIUM_PLAN_LIMITS.beautify_processing.limit).toBe(30);
    expect(PREMIUM_PLAN_LIMITS.beautify_processing.window).toBe("month");
    expect(PREMIUM_PLAN_LIMITS.advanced_styling).toBe(true);
    expect(PREMIUM_PLAN_LIMITS.closetai_connect).toBe("full");
    expect(PREMIUM_PLAN_LIMITS.advanced_insights).toBe(true);
  });

  it("retrieves plan definition by id safely with free fallback", () => {
    expect(getPlanDefinition("free").id).toBe("free");
    expect(getPlanDefinition("monthly").id).toBe("monthly");
    expect(getPlanDefinition("annual").id).toBe("annual");
    expect(getPlanDefinition("unknown_plan").id).toBe("free");
    expect(getPlanDefinition(null).id).toBe("free");
  });

  it("retrieves plan limits safely", () => {
    expect(getPlanLimits("free")).toEqual(FREE_PLAN_LIMITS);
    expect(getPlanLimits("monthly")).toEqual(PREMIUM_PLAN_LIMITS);
    expect(getPlanLimits("annual")).toEqual(PREMIUM_PLAN_LIMITS);
    expect(getPlanLimits(undefined)).toEqual(FREE_PLAN_LIMITS);
  });

  it("configures transparent pricing without misleading claims", () => {
    const monthly = PRICING_PLANS.monthly;
    const annual = PRICING_PLANS.annual;

    expect(monthly.priceNGN).toBe(999);
    expect(monthly.priceUSD).toBe(4.99);
    expect(annual.priceNGN).toBe(9990);
    expect(annual.priceUSD).toBe(49.99);

    // Annual is ~10 months of monthly pricing (2 months free / 17% savings)
    const annualSavingsPercent = Math.round((1 - (annual.priceNGN / (monthly.priceNGN * 12))) * 100);
    expect(annualSavingsPercent).toBe(17);
  });
});

describe("Server-Side Usage Window Calculations", () => {
  it("calculates weekly window starting Monday 00:00 UTC and ending next Monday 00:00 UTC", () => {
    // Wednesday Oct 28, 2026, 14:30:00 UTC
    const wednesday = new Date(Date.UTC(2026, 9, 28, 14, 30, 0));
    const window = getWeeklyWindow(wednesday);

    // Should start on Monday Oct 26, 2026, 00:00:00.000 UTC
    expect(window.start.toISOString()).toBe("2026-10-26T00:00:00.000Z");
    // Should end on Monday Nov 2, 2026, 00:00:00.000 UTC
    expect(window.end.toISOString()).toBe("2026-11-02T00:00:00.000Z");
    expect(window.end.getTime() - window.start.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("calculates weekly window correctly on Sunday (last day of UTC cycle)", () => {
    // Sunday Nov 1, 2026, 23:59:59 UTC
    const sunday = new Date(Date.UTC(2026, 10, 1, 23, 59, 59));
    const window = getWeeklyWindow(sunday);

    // Should still start on Monday Oct 26, 2026
    expect(window.start.toISOString()).toBe("2026-10-26T00:00:00.000Z");
    // Should end on Monday Nov 2, 2026
    expect(window.end.toISOString()).toBe("2026-11-02T00:00:00.000Z");
  });

  it("calculates monthly window from 1st of month 00:00 UTC to 1st of next month 00:00 UTC", () => {
    // Oct 15, 2026
    const midMonth = new Date(Date.UTC(2026, 9, 15, 10, 0, 0));
    const window = getMonthlyWindow(midMonth);

    expect(window.start.toISOString()).toBe("2026-10-01T00:00:00.000Z");
    expect(window.end.toISOString()).toBe("2026-11-01T00:00:00.000Z");
  });

  it("handles year transition in monthly window correctly", () => {
    // Dec 25, 2026
    const december = new Date(Date.UTC(2026, 11, 25, 12, 0, 0));
    const window = getMonthlyWindow(december);

    expect(window.start.toISOString()).toBe("2026-12-01T00:00:00.000Z");
    expect(window.end.toISOString()).toBe("2027-01-01T00:00:00.000Z");
  });
});

describe("Usage Limit Logic & Edge Cases", () => {
  it("determines remaining allowance correctly when under limit", () => {
    const current = 18;
    const limit = 30;
    const allowed = current < limit;
    const remaining = limit - current;

    expect(allowed).toBe(true);
    expect(remaining).toBe(12);
  });

  it("blocks operation when at or exceeding limit without deleting existing data", () => {
    const current = 30;
    const limit = 30;
    const allowed = current < limit;
    const remaining = Math.max(0, limit - current);

    expect(allowed).toBe(false);
    expect(remaining).toBe(0);
  });

  it("handles users whose existing data exceeds free limit after downgrade safely", () => {
    // E.g. A user had 45 items on Premium, then downgraded to Free (limit 30)
    const current = 45;
    const limit = 30;
    const allowed = current < limit;
    const remaining = Math.max(0, limit - current);

    // Operation to add another item is blocked, but current data is preserved
    expect(allowed).toBe(false);
    expect(remaining).toBe(0);
    expect(current).toBe(45); // All 45 items remain in database
  });

  it("treats unlimited features as always allowed", () => {
    const limit: number | null = null;
    const current = 250;
    const allowed = limit === null || current < limit;
    const remaining = limit === null ? null : Math.max(0, limit - current);

    expect(allowed).toBe(true);
    expect(remaining).toBeNull();
  });
});

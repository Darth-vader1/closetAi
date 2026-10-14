import { describe, it, expect } from "vitest";
import {
  planShape,
  eventDayIndexes,
  buildDeterministicPlan,
  finaliseSuggestions,
  computeWears,
  type InventoryRow,
  type OwnedRow,
} from "./builder";
import {
  MAX_OUTFITS,
  MAX_CAPSULE_ITEMS,
  type PackingRequest,
  type PlanWeather,
  type SuggestedItem,
} from "./schemas";

describe("Packing Builder", () => {
  describe("planShape", () => {
    it("returns daily mode for 14 days or less", () => {
      const result = planShape(14, "weekly");
      expect(result.mode).toBe("daily");
      expect(result.cycleDays).toBe(14);
      expect(result.outfitCount).toBe(14);
      expect(result.repeats).toBe(1);
    });

    it("returns rotation mode for more than 14 days", () => {
      const result = planShape(30, "weekly");
      expect(result.mode).toBe("rotation");
      expect(result.cycleDays).toBe(7); // weekly laundry
      expect(result.outfitCount).toBe(7);
      expect(result.repeats).toBe(5); // Math.ceil(30/7) = 5
    });

    it("caps outfit count at MAX_OUTFITS even for long stays", () => {
      const result = planShape(120, "none");
      expect(result.outfitCount).toBeLessThanOrEqual(MAX_OUTFITS);
    });

    it("uses correct cycle days for twice_weekly laundry", () => {
      const result = planShape(30, "twice_weekly");
      expect(result.cycleDays).toBe(4); // twice weekly = 4 day cycle
    });

    it("calculates correct repeats for 112-day semester", () => {
      const result = planShape(112, "weekly");
      expect(result.mode).toBe("rotation");
      expect(result.cycleDays).toBe(7);
      expect(result.repeats).toBe(16); // Math.ceil(112/7)
    });
  });

  describe("eventDayIndexes", () => {
    it("returns empty set for non-event purposes", () => {
      const req: PackingRequest = {
        purpose: "trip",
        location: "Paris",
        days: 5,
        laundry: "weekly",
      };
      const shape = planShape(5, "weekly");
      const result = eventDayIndexes(req, "2026-10-15", shape);
      expect(result.size).toBe(0);
    });

    it("distributes event days when no dates provided", () => {
      const req: PackingRequest = {
        purpose: "event",
        location: "Lagos",
        days: 7,
        eventName: "Conference",
        eventCount: 2,
        laundry: "weekly",
      };
      const shape = planShape(7, "weekly");
      const result = eventDayIndexes(req, "2026-10-15", shape);
      expect(result.size).toBe(2);
    });

    it("maps specific event dates correctly", () => {
      const req: PackingRequest = {
        purpose: "event",
        location: "Lagos",
        days: 7,
        eventName: "Wedding",
        eventCount: 2,
        eventDates: ["2026-10-16", "2026-10-18"],
        laundry: "weekly",
      };
      const shape = planShape(7, "weekly");
      const result = eventDayIndexes(req, "2026-10-15", shape);
      expect(result.has(1)).toBe(true); // Oct 16 is day 1
      expect(result.has(3)).toBe(true); // Oct 18 is day 3
    });

    it("wraps event days to cycle in rotation mode", () => {
      const req: PackingRequest = {
        purpose: "event",
        location: "Lagos",
        days: 30,
        eventName: "Weekly meetings",
        eventCount: 2,
        eventDates: ["2026-10-22", "2026-10-29"],
        laundry: "weekly",
      };
      const shape = planShape(30, "weekly"); // 7-day cycle
      const result = eventDayIndexes(req, "2026-10-15", shape);
      // Day 7 and day 14 both map to day 0 in the cycle
      expect(result.size).toBeGreaterThan(0);
    });
  });

  describe("buildDeterministicPlan (rotation mode)", () => {
    const mockInventory: InventoryRow[] = Array.from({ length: 30 }, (_, i) => ({
      id: `item-${i}`,
      name: `Item ${i}`,
      category: i < 10 ? "tops" : i < 20 ? "bottoms" : "footwear",
      subcategory: null,
      primary_colour: i % 2 === 0 ? "black" : "white",
      pattern: null,
      material: "cotton",
      style: null,
      occasions: ["casual"],
      warmth_level: 2,
      image_path: `path-${i}`,
      wear_count: 0,
    }));

    const mockWeather: PlanWeather = {
      query: "Paris",
      resolvedName: "Paris, France",
      forecast: [],
      daysBeyondForecast: 30,
      seasonal: {
        monthLabel: "October",
        avgMaxC: 15,
        avgMinC: 8,
        rainyDayShare: 0.3,
        basis: "last_year_observed",
      },
      notice: null,
      promptSummary: "Paris weather summary",
      flags: { rainy: false, cold: true, hot: false },
    };

    it("returns rotation plan for 30-day request", () => {
      const req: PackingRequest = {
        purpose: "trip",
        location: "Paris",
        days: 30,
        laundry: "weekly",
      };
      const shape = planShape(30, "weekly");
      const result = buildDeterministicPlan(mockInventory, req, mockWeather, "2026-10-15", shape);

      expect(result.outfits.length).toBe(shape.outfitCount);
      expect(result.outfits.length).toBeLessThanOrEqual(MAX_OUTFITS);
      expect(result.capsuleIds.length).toBeLessThanOrEqual(MAX_CAPSULE_ITEMS);
    });

    it("caps capsule items at MAX_CAPSULE_ITEMS", () => {
      const req: PackingRequest = {
        purpose: "school",
        location: "Campus",
        days: 112, // 1 semester
        laundry: "weekly",
      };
      const shape = planShape(112, "weekly");
      const result = buildDeterministicPlan(mockInventory, req, mockWeather, "2026-10-15", shape);

      expect(result.capsuleIds.length).toBeLessThanOrEqual(MAX_CAPSULE_ITEMS);
    });

    it("returns exactly outfitCount outfits", () => {
      const req: PackingRequest = {
        purpose: "work",
        location: "London",
        days: 21,
        laundry: "weekly",
      };
      const shape = planShape(21, "weekly");
      const result = buildDeterministicPlan(mockInventory, req, mockWeather, "2026-10-15", shape);

      expect(result.outfits.length).toBe(shape.outfitCount);
    });

    it("includes rationale string", () => {
      const req: PackingRequest = {
        purpose: "trip",
        location: "Paris",
        days: 30,
        laundry: "weekly",
      };
      const shape = planShape(30, "weekly");
      const result = buildDeterministicPlan(mockInventory, req, mockWeather, "2026-10-15", shape);

      expect(result.rationale).toBeTruthy();
      expect(typeof result.rationale).toBe("string");
      expect(result.rationale.length).toBeGreaterThan(10);
    });

    it("includes packing tips", () => {
      const req: PackingRequest = {
        purpose: "trip",
        location: "Paris",
        days: 30,
        laundry: "weekly",
      };
      const shape = planShape(30, "weekly");
      const result = buildDeterministicPlan(mockInventory, req, mockWeather, "2026-10-15", shape);

      expect(Array.isArray(result.tips)).toBe(true);
      expect(result.tips.length).toBeGreaterThan(0);
    });
  });

  describe("finaliseSuggestions", () => {
    const mockOwned: OwnedRow[] = [
      { name: "Umbrella", category: "accessories", subcategory: null },
      { name: "Power Bank", category: "accessories", subcategory: null },
      { name: "Sunglasses", category: "accessories", subcategory: null },
    ];

    it("marks items as alreadyOwned when matched", () => {
      const aiSuggestions: SuggestedItem[] = [
        {
          name: "Umbrella",
          category: "weather_gear",
          reason: "Rainy season",
          priority: "essential",
          alreadyOwned: false,
        },
      ];
      const ruleSuggestions: SuggestedItem[] = [];

      const result = finaliseSuggestions(aiSuggestions, ruleSuggestions, mockOwned);

      expect(result[0]?.alreadyOwned).toBe(true);
      expect(result[0]?.ownedItemName).toBe("Umbrella");
    });

    it("does NOT suggest buying items already owned", () => {
      const aiSuggestions: SuggestedItem[] = [
        {
          name: "Power bank",
          category: "tech",
          reason: "For charging",
          priority: "recommended",
          alreadyOwned: false,
        },
      ];
      const ruleSuggestions: SuggestedItem[] = [];

      const result = finaliseSuggestions(aiSuggestions, ruleSuggestions, mockOwned);

      const powerBankSuggestion = result.find((s) => s.name.toLowerCase().includes("power"));
      expect(powerBankSuggestion?.alreadyOwned).toBe(true);
    });

    it("keeps items not owned as alreadyOwned=false", () => {
      const aiSuggestions: SuggestedItem[] = [
        {
          name: "Passport holder",
          category: "documents",
          reason: "Keep documents safe",
          priority: "recommended",
          alreadyOwned: false,
        },
      ];
      const ruleSuggestions: SuggestedItem[] = [];

      const result = finaliseSuggestions(aiSuggestions, ruleSuggestions, mockOwned);

      expect(result[0]?.alreadyOwned).toBe(false);
    });

    it("merges AI and rule suggestions without duplicates", () => {
      const aiSuggestions: SuggestedItem[] = [
        {
          name: "Sunscreen",
          category: "weather_gear",
          reason: "UV protection",
          priority: "recommended",
          alreadyOwned: false,
        },
      ];
      const ruleSuggestions: SuggestedItem[] = [
        {
          name: "Sunscreen",
          category: "weather_gear",
          reason: "Hot weather",
          priority: "essential",
          alreadyOwned: false,
        },
        {
          name: "Hat",
          category: "weather_gear",
          reason: "Sun protection",
          priority: "recommended",
          alreadyOwned: false,
        },
      ];

      const result = finaliseSuggestions(aiSuggestions, ruleSuggestions, mockOwned);

      const sunscreenItems = result.filter((s) => s.name.toLowerCase().includes("sunscreen"));
      expect(sunscreenItems.length).toBe(1); // No duplicates
      // Sunscreen + Hat, plus the one generic documents reminder that is always added.
      expect(result.map((s) => s.name.toLowerCase()).sort()).toEqual(["hat", "id and key documents", "sunscreen"]);
    });

    it("case-insensitive ownership matching", () => {
      const aiSuggestions: SuggestedItem[] = [
        {
          name: "UMBRELLA",
          category: "weather_gear",
          reason: "Rain",
          priority: "essential",
          alreadyOwned: false,
        },
      ];

      const result = finaliseSuggestions(aiSuggestions, [], mockOwned);

      expect(result[0]?.alreadyOwned).toBe(true);
    });
  });

  describe("computeWears", () => {
    it("counts total wears across all outfits", () => {
      const outfits = [
        { day: 1, title: "Day 1", item_ids: ["item-1", "item-2", "item-3"], styling_tip: "" },
        { day: 2, title: "Day 2", item_ids: ["item-1", "item-2", "item-4"], styling_tip: "" },
        { day: 3, title: "Day 3", item_ids: ["item-1", "item-5", "item-6"], styling_tip: "" },
      ];

      const result = computeWears(outfits, 3);

      expect(result["item-1"]).toBe(3); // Worn every day
      expect(result["item-2"]).toBe(2); // Worn twice
      expect(result["item-3"]).toBe(1);
      expect(result["item-4"]).toBe(1);
      expect(result["item-5"]).toBe(1);
      expect(result["item-6"]).toBe(1);
    });

    it("multiplies by repeats for rotation plans", () => {
      const outfits = [
        { day: 1, title: "Template 1", item_ids: ["item-1", "item-2"], styling_tip: "" },
        { day: 2, title: "Template 2", item_ids: ["item-1", "item-3"], styling_tip: "" },
      ];

      const result = computeWears(outfits, 30); // 30 days with 2-day template = 15 repeats

      expect(result["item-1"]).toBe(30); // 2 wears per cycle × 15 cycles
      expect(result["item-2"]).toBe(15); // 1 wear per cycle × 15 cycles
      expect(result["item-3"]).toBe(15);
    });

    it("handles empty outfit list", () => {
      const result = computeWears([], 5);
      expect(Object.keys(result).length).toBe(0);
    });
  });
});

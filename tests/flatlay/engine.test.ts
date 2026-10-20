import { describe, expect, it } from "vitest";
import { generateFlatlayPlacement } from "@/lib/flatlay/engine";
import type { WardrobeItem } from "@/lib/wardrobe/queries";

const mockItems: WardrobeItem[] = [
  {
    id: "item-1-top",
    name: "Linen Shirt",
    category: "shirts",
    subcategory: null,
    primaryColour: "white",
    secondaryColours: [],
    pattern: "solid",
    material: "linen",
    style: "casual",
    occasions: ["everyday"],
    seasons: ["summer"],
    warmthLevel: 1,
    careType: "WASHABLE",
    status: "CLEAN",
    isFavourite: true,
    aiAnalysed: true,
    wearCount: 3,
    lastWornAt: null,
    lastWashedAt: null,
    createdAt: "2026-01-01",
    imagePath: "u/shirt.jpg",
  },
  {
    id: "item-2-bottom",
    name: "Pleated Trousers",
    category: "trousers",
    subcategory: null,
    primaryColour: "navy",
    secondaryColours: [],
    pattern: "solid",
    material: "wool",
    style: "smart_casual",
    occasions: ["work"],
    seasons: ["all_year"],
    warmthLevel: 3,
    careType: "WIPE_CLEAN",
    status: "CLEAN",
    isFavourite: false,
    aiAnalysed: true,
    wearCount: 1,
    lastWornAt: null,
    lastWashedAt: null,
    createdAt: "2026-01-02",
    imagePath: "u/trousers.jpg",
  },
  {
    id: "item-3-shoe",
    name: "Leather Loafers",
    category: "shoes",
    subcategory: null,
    primaryColour: "brown",
    secondaryColours: [],
    pattern: "solid",
    material: "leather",
    style: "smart_casual",
    occasions: ["work"],
    seasons: ["all_year"],
    warmthLevel: 2,
    careType: "WIPE_CLEAN",
    status: "CLEAN",
    isFavourite: false,
    aiAnalysed: true,
    wearCount: 2,
    lastWornAt: null,
    lastWashedAt: null,
    createdAt: "2026-01-03",
    imagePath: "u/shoes.jpg",
  },
  {
    id: "item-4-bag",
    name: "Leather Tote Bag",
    category: "bags",
    subcategory: null,
    primaryColour: "black",
    secondaryColours: [],
    pattern: "solid",
    material: "leather",
    style: "minimal",
    occasions: ["everyday"],
    seasons: ["all_year"],
    warmthLevel: null,
    careType: "NO_WASH",
    status: "CLEAN",
    isFavourite: false,
    aiAnalysed: true,
    wearCount: 0,
    lastWornAt: null,
    lastWashedAt: null,
    createdAt: "2026-01-04",
    imagePath: "u/bag.jpg",
  },
  {
    id: "item-5-acc",
    name: "Classic Chrono Watch",
    category: "watches",
    subcategory: null,
    primaryColour: "silver",
    secondaryColours: [],
    pattern: null,
    material: "steel",
    style: "classic",
    occasions: ["work"],
    seasons: ["all_year"],
    warmthLevel: null,
    careType: "NO_WASH",
    status: "CLEAN",
    isFavourite: false,
    aiAnalysed: true,
    wearCount: 4,
    lastWornAt: null,
    lastWashedAt: null,
    createdAt: "2026-01-05",
    imagePath: "u/watch.jpg",
  },
];

describe("generateFlatlayPlacement", () => {
  it("returns empty array when given empty wardrobe items", () => {
    expect(generateFlatlayPlacement([])).toEqual([]);
  });

  it("places all provided items onto canvas", () => {
    const placed = generateFlatlayPlacement(mockItems);
    expect(placed).toHaveLength(mockItems.length);

    const ids = placed.map((p) => p.wardrobeItemId);
    mockItems.forEach((item) => {
      expect(ids).toContain(item.id);
    });
  });

  it("is fully deterministic with the same seed and preset", () => {
    const layout1 = generateFlatlayPlacement(mockItems, { preset: "collage", seed: 42 });
    const layout2 = generateFlatlayPlacement(mockItems, { preset: "collage", seed: 42 });
    expect(layout1).toEqual(layout2);
  });

  it("generates different positions when seed changes on collage preset", () => {
    const layout1 = generateFlatlayPlacement(mockItems, { preset: "collage", seed: 42 });
    const layout2 = generateFlatlayPlacement(mockItems, { preset: "collage", seed: 999 });

    // At least some positions or angles must differ
    const matchCount = layout1.filter((l1, i) => l1.x === layout2[i]?.x && l1.y === layout2[i]?.y).length;
    expect(matchCount).toBeLessThan(layout1.length);
  });

  it.each([
    ["collage"],
    ["editorial"],
    ["streetwear"],
    ["minimal"],
    ["catalogue"],
  ] as const)("successfully generates placement for preset: %s", (preset) => {
    const placed = generateFlatlayPlacement(mockItems, { preset });
    expect(placed).toHaveLength(mockItems.length);

    placed.forEach((item) => {
      expect(item.x).toBeGreaterThan(0);
      expect(item.y).toBeGreaterThan(0);
      expect(item.width).toBeGreaterThan(0);
      expect(item.height).toBeGreaterThan(0);
      expect(typeof item.rotation).toBe("number");
      expect(item.zIndex).toBeGreaterThanOrEqual(1);
    });
  });

  it("applies zero rotation in minimal and catalogue presets", () => {
    const minimal = generateFlatlayPlacement(mockItems, { preset: "minimal" });
    minimal.forEach((item) => {
      expect(item.rotation).toBe(0);
    });

    const catalogue = generateFlatlayPlacement(mockItems, { preset: "catalogue" });
    catalogue.forEach((item) => {
      expect(item.rotation).toBe(0);
    });
  });

  it("scales smaller accessories appropriately relative to main anchors", () => {
    const placed = generateFlatlayPlacement(mockItems, { preset: "collage" });
    const top = placed.find((p) => p.wardrobeItemId === "item-1-top")!;
    const watch = placed.find((p) => p.wardrobeItemId === "item-5-acc")!;

    expect(top.width * top.height).toBeGreaterThan(watch.width * watch.height);
  });
});

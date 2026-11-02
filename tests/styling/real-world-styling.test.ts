import { describe, expect, it } from "vitest";
import { parseConstraints } from "@/lib/styling/constraints";
import { runStylingPipeline } from "@/lib/styling/pipeline";
import { profileGarment } from "@/lib/styling/taxonomy";
import type { WardrobeItem } from "@/lib/wardrobe/queries";

let n = 0;
function mk(name: string, category: string, o: Partial<WardrobeItem> = {}): WardrobeItem {
  return {
    id: `r${++n}`,
    name,
    category,
    subcategory: o.subcategory ?? null,
    primaryColour: o.primaryColour ?? "black",
    secondaryColours: [],
    pattern: "solid",
    material: null,
    style: o.style ?? "casual",
    occasions: o.occasions ?? ["everyday"],
    seasons: ["all_year"],
    warmthLevel: o.warmthLevel ?? null,
    imagePath: "x",
    status: "CLEAN",
    careType: "WASHABLE",
    isFavourite: false,
    aiAnalysed: true,
    wearCount: 0,
    lastWornAt: null,
    lastWashedAt: null,
    createdAt: "",
    ...o,
  } as WardrobeItem;
}

describe("real-world garment names", () => {
  const cases: Array<[string, string, string, string]> = [
    ["Khaki Shorts", "shorts", "bottom", "shorts"],
    ["Cream Chino Shorts", "shorts", "bottom", "shorts"],
    ["Black Jeans Shorts", "shorts", "bottom", "jorts"],
    ["Khaki Trousers", "trousers", "bottom", "chinos"],
    ["Lace Skirt and Blouse Set", "traditional", "onepiece", "traditional_set"],
    ["Wrapper and Blouse", "traditional", "onepiece", "traditional_set"],
    ["Gym Singlet", "tank-tops", "top", "athletic_top"],
    ["Plain Singlet", "tank-tops", "excluded", "underwear"],
    ["Head Tie", "headwraps", "accessory", "hat"],
    ["Sweat Shirt", "hoodies", "top", "hoodie"],
    ["Crocs", "shoes", "shoes", "slides"],
  ];
  it.each(cases)("%s (%s) -> %s/%s", (name, cat, role, type) => {
    const p = profileGarment(mk(name, cat));
    expect(p.role).toBe(role);
    expect(p.type).toBe(type);
  });
});

describe("prompt parsing", () => {
  it("does not treat 'run errands' as a gym session", () => {
    expect(parseConstraints("I need to run errands in town", [], { allowRewearWorn: false }).dressCode).not.toBe("athletic");
    expect(parseConstraints("going for a run", [], { allowRewearWorn: false }).dressCode).toBe("athletic");
  });
});

describe("dress-code guards", () => {
  const wardrobe = () => [
    mk("Black Mini Skirt", "skirts", { subcategory: "mini skirt" }),
    mk("Navy Pencil Skirt", "skirts", { primaryColour: "navy", style: "business_casual", occasions: ["work"] }),
    mk("White Blouse", "blouses", { primaryColour: "white", style: "business_casual", occasions: ["work"] }),
    mk("Black Block Heels", "heels", { style: "formal", occasions: ["work"] }),
  ];
  it("never puts a mini skirt in an interview outfit", () => {
    const items = wardrobe();
    const mini = items[0].id;
    const res = runStylingPipeline({ allItems: items, prompt: "job interview", occasion: "work", limit: 3 });
    expect(res.outfits.length).toBeGreaterThan(0);
    for (const o of res.outfits) expect(o.itemIds).not.toContain(mini);
  });
  it("keeps athletic pieces out of a church outfit", () => {
    const items = [
      mk("Arsenal Jersey", "t-shirts", { primaryColour: "red", style: "sporty" }),
      mk("Black Joggers", "trousers", { subcategory: "joggers", style: "sporty" }),
      mk("White Shirt", "shirts", { primaryColour: "white", style: "formal", occasions: ["worship"] }),
      mk("Black Chinos", "trousers", { subcategory: "chinos", occasions: ["worship"] }),
      mk("Brown Leather Shoes", "shoes", { primaryColour: "brown", style: "smart_casual", occasions: ["worship"] }),
    ];
    const res = runStylingPipeline({ allItems: items, prompt: "church on Sunday", occasion: "worship", limit: 3 });
    const bad = new Set([items[0].id, items[1].id]);
    for (const o of res.outfits) for (const id of o.itemIds) expect(bad.has(id)).toBe(false);
  });
  it("does not combine slides with a dress shirt and suit trousers", () => {
    const items = [
      mk("White Dress Shirt", "shirts", { primaryColour: "white", style: "formal" }),
      mk("Black Suit Trousers", "trousers", { subcategory: "tailored trousers", style: "formal" }),
      mk("Black Slides", "sandals", { subcategory: "slides" }),
    ];
    const res = runStylingPipeline({ allItems: items, prompt: "casual hangout", limit: 3 });
    expect(res.outfits).toHaveLength(0);
  });
});

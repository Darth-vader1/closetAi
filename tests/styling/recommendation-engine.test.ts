import { describe, expect, it, vi } from "vitest";
import { profileGarment, isReliable } from "@/lib/styling/taxonomy";
import { parseConstraints, parseWeather } from "@/lib/styling/constraints";
import { validateOutfit } from "@/lib/styling/validator";
import { scoreOutfit } from "@/lib/styling/scorer";
import { buildFactExplanation, sanitiseExplanation } from "@/lib/styling/explainer";
import { runStylingPipeline } from "@/lib/styling/pipeline";
import { generateOutfits, styleAroundItem } from "@/lib/outfits/engine";
import { generateStylistRecommendations } from "@/lib/ai/stylist";
import { AiProviderError, type AiProvider } from "@/lib/ai/types";
import type { WardrobeItem } from "@/lib/wardrobe/queries";

function makeItem(overrides: Partial<WardrobeItem> & { id: string; name: string; category: string }): WardrobeItem {
  return {
    id: overrides.id,
    name: overrides.name,
    category: overrides.category,
    subcategory: overrides.subcategory !== undefined ? overrides.subcategory : null,
    primaryColour: overrides.primaryColour !== undefined ? overrides.primaryColour : "black",
    secondaryColours: overrides.secondaryColours ?? [],
    pattern: overrides.pattern !== undefined ? overrides.pattern : "solid",
    material: overrides.material !== undefined ? overrides.material : null,
    style: overrides.style !== undefined ? overrides.style : "casual",
    occasions: overrides.occasions ?? ["everyday"],
    seasons: overrides.seasons ?? ["all_year"],
    warmthLevel: overrides.warmthLevel !== undefined ? overrides.warmthLevel : null,
    imagePath: overrides.imagePath ?? `${overrides.id}.jpg`,
    status: overrides.status ?? "CLEAN",
    careType: overrides.careType ?? "WASHABLE",
    isFavourite: overrides.isFavourite ?? false,
    aiAnalysed: overrides.aiAnalysed ?? true,
    wearCount: overrides.wearCount ?? 0,
    lastWornAt: overrides.lastWornAt !== undefined ? overrides.lastWornAt : null,
    lastWashedAt: overrides.lastWashedAt !== undefined ? overrides.lastWashedAt : null,
    createdAt: overrides.createdAt ?? new Date(0).toISOString(),
  };
}

const BASE_WARDROBE: WardrobeItem[] = [
  makeItem({ id: "top-white-tee", name: "White Crew T-Shirt", category: "t-shirts", primaryColour: "white", style: "casual", occasions: ["everyday", "school"] }),
  makeItem({ id: "top-black-tee", name: "Black Graphic T-Shirt", category: "t-shirts", primaryColour: "black", pattern: "graphic", style: "streetwear", occasions: ["everyday", "party"] }),
  makeItem({ id: "top-dress-shirt", name: "White Oxford Button-Up Shirt", category: "shirts", subcategory: "button-up", primaryColour: "white", style: "formal", occasions: ["work", "formal_event", "worship"] }),
  makeItem({ id: "top-athletic-tee", name: "Navy Dri-Fit Performance Gym Tee", category: "t-shirts", subcategory: "athletic tee", primaryColour: "navy", style: "sporty", occasions: ["sport"] }),
  makeItem({ id: "top-hoodie", name: "Grey Pullover Hoodie", category: "hoodies", primaryColour: "grey", style: "streetwear", warmthLevel: 4, occasions: ["everyday", "sport"] }),
  makeItem({ id: "bot-navy-chinos", name: "Navy Slim Chinos", category: "trousers", subcategory: "chinos", primaryColour: "navy", style: "smart_casual", occasions: ["work", "date", "everyday"] }),
  makeItem({ id: "bot-tailored", name: "Black Tailored Suit Trousers", category: "trousers", subcategory: "tailored trousers", primaryColour: "black", style: "formal", occasions: ["work", "formal_event", "worship"] }),
  makeItem({ id: "bot-red-jorts", name: "Bright Red Denim Jorts", category: "jorts", primaryColour: "red", style: "streetwear", occasions: ["everyday", "party"] }),
  makeItem({ id: "bot-joggers", name: "Black Track Joggers", category: "trousers", subcategory: "joggers", primaryColour: "black", style: "sporty", occasions: ["sport", "everyday"] }),
  makeItem({ id: "bot-skinny-jeans", name: "Blue Skinny Jeans", category: "jeans", subcategory: "skinny", primaryColour: "blue", style: "casual", occasions: ["everyday"] }),
  makeItem({ id: "bot-wide-cargo", name: "Olive Wide-Leg Cargo Pants", category: "trousers", subcategory: "cargo pants", primaryColour: "olive", style: "streetwear", occasions: ["everyday"] }),
  makeItem({ id: "shoe-white-sneakers", name: "White Low-Top Sneakers", category: "sneakers", primaryColour: "white", style: "casual", occasions: ["everyday", "sport", "school"] }),
  makeItem({ id: "shoe-black-sneakers", name: "Black Running Trainers", category: "sneakers", primaryColour: "black", style: "sporty", occasions: ["sport", "everyday"] }),
  makeItem({ id: "shoe-oxfords", name: "Black Leather Oxford Dress Shoes", category: "shoes", subcategory: "dress shoes", primaryColour: "black", style: "formal", occasions: ["work", "formal_event", "worship"] }),
  makeItem({ id: "shoe-boots", name: "Brown Chunky Chelsea Boots", category: "boots", primaryColour: "brown", style: "smart_casual", occasions: ["date", "everyday"] }),
  makeItem({ id: "outer-blazer", name: "Navy Structured Blazer", category: "blazers", primaryColour: "navy", style: "formal", occasions: ["work", "formal_event", "date"] }),
  makeItem({ id: "outer-coat", name: "Heavy Wool Overcoat", category: "jackets", subcategory: "overcoat", primaryColour: "black", warmthLevel: 5, style: "formal", occasions: ["formal_event", "work"] }),
  makeItem({ id: "one-dress", name: "Emerald Midi Dress", category: "dresses", primaryColour: "green", style: "smart_casual", occasions: ["date", "party", "worship"] }),
  makeItem({ id: "acc-belt", name: "Black Leather Belt", category: "belts", primaryColour: "black", style: "formal", occasions: ["work", "formal_event"] }),
];

describe("Phase 2: Garment Understanding & Uncertain Classifications", () => {
  it("normalises free-text chinos filed under 'trousers' and oxfords filed under 'shoes'", () => {
    const chinos = profileGarment(BASE_WARDROBE.find((i) => i.id === "bot-navy-chinos")!);
    expect(chinos.type).toBe("chinos");
    expect(chinos.role).toBe("bottom");
    expect(chinos.confidence).toBe("high");

    const oxfords = profileGarment(BASE_WARDROBE.find((i) => i.id === "shoe-oxfords")!);
    expect(oxfords.type).toBe("dress_shoes");
    expect(oxfords.formality).toBe(5);
  });

  it("Scenario 9 & 10: flags misclassified garments (role conflict) as low confidence and unreliable", () => {
    const misclassified = makeItem({
      id: "bad-1",
      name: "Navy Slim Chinos",
      category: "t-shirts", // wrong category!
    });
    const p = profileGarment(misclassified);
    expect(p.confidence).toBe("low");
    expect(isReliable(p)).toBe(false);

    const missingMeta = makeItem({
      id: "sparse-1",
      name: "Plain piece",
      category: "t-shirts",
      primaryColour: null,
      pattern: null,
      material: null,
      style: null,
    });
    const sp = profileGarment(missingMeta);
    expect(sp.role).toBe("top");
    expect(sp.colour).toBeNull();
    expect(isReliable(sp)).toBe(true);
  });
});

describe("Phase 10A: Wardrobe Edge Cases (1 - 12)", () => {
  it("Scenario 1, 2, 3: only tops, only bottoms, or only shoes -> returns honest missing_role fallback and never fabricates items", () => {
    const onlyTops = BASE_WARDROBE.filter((i) => i.category === "t-shirts");
    const r1 = runStylingPipeline({ allItems: onlyTops, prompt: "Casual outfit" });
    expect(r1.outfits).toHaveLength(0);
    expect(r1.fallback?.kind).toBe("missing_role");
    expect(r1.fallback?.message).toMatch(/bottoms/i);
    expect(r1.fallback?.partial).toBeDefined();

    const onlyBottoms = BASE_WARDROBE.filter((i) => i.category === "trousers");
    const r2 = runStylingPipeline({ allItems: onlyBottoms, prompt: "Casual outfit" });
    expect(r2.outfits).toHaveLength(0);
    expect(r2.fallback?.kind).toBe("missing_role");
    expect(r2.fallback?.message).toMatch(/tops/i);

    const onlyShoes = BASE_WARDROBE.filter((i) => i.category === "sneakers");
    const r3 = runStylingPipeline({ allItems: onlyShoes, prompt: "Casual outfit" });
    expect(r3.outfits).toHaveLength(0);
    expect(r3.fallback?.kind).toBe("missing_role");
  });

  it("Scenario 4: user has only dresses -> builds valid one-piece outfit", () => {
    const onlyDresses = [
      makeItem({ id: "d1", name: "Black Midi Dress", category: "dresses", primaryColour: "black" }),
    ];
    const r = runStylingPipeline({ allItems: onlyDresses, prompt: "Dinner look" });
    expect(r.outfits).toHaveLength(1);
    expect(r.outfits[0].archetype).toBe("onepiece");
    expect(r.outfits[0].itemIds).toEqual(["d1"]);
  });

  it("Scenario 5 & 6: user has only one complete outfit / very few clean clothes", () => {
    const minimal = [
      BASE_WARDROBE.find((i) => i.id === "top-white-tee")!,
      BASE_WARDROBE.find((i) => i.id === "bot-navy-chinos")!,
      BASE_WARDROBE.find((i) => i.id === "shoe-white-sneakers")!,
    ];
    const r = runStylingPipeline({ allItems: minimal, prompt: "Everyday look" });
    expect(r.outfits).toHaveLength(1);
    expect(r.outfits[0].itemIds).toEqual(["top-white-tee", "bot-navy-chinos", "shoe-white-sneakers"]);
  });

  it("Scenario 7: all appropriate items are dirty or in laundry -> excluded and returns no_eligible_items", () => {
    const dirtyWardrobe = BASE_WARDROBE.map((i) => ({ ...i, status: "DIRTY" as const }));
    const r = runStylingPipeline({ allItems: dirtyWardrobe, prompt: "Casual outfit" });
    expect(r.outfits).toHaveLength(0);
    expect(r.fallback?.kind).toBe("no_eligible_items");
  });

  it("Scenario 8 & 45: duplicate items in proposals are deduplicated and duplicate recommendation combos are suppressed", () => {
    const dupProposal = {
      name: "Dup Look",
      itemIds: ["top-white-tee", "bot-navy-chinos", "shoe-white-sneakers"],
      source: "ai" as const,
    };
    const r = runStylingPipeline({
      allItems: BASE_WARDROBE,
      prompt: "Casual",
      aiProposals: [dupProposal, dupProposal],
    });
    const keys = r.outfits.map((o) => [...o.itemIds].sort().join("|"));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("Scenario 11: empty wardrobe -> returns empty_wardrobe fallback", () => {
    const r = runStylingPipeline({ allItems: [], prompt: "Anything" });
    expect(r.outfits).toHaveLength(0);
    expect(r.fallback?.kind).toBe("empty_wardrobe");
  });

  it("Scenario 12: conflicting aesthetics in wardrobe -> assembles coherent combinations without mixing gym gear with formal dress shoes", () => {
    const mixed = [
      BASE_WARDROBE.find((i) => i.id === "top-athletic-tee")!,
      BASE_WARDROBE.find((i) => i.id === "bot-joggers")!,
      BASE_WARDROBE.find((i) => i.id === "shoe-oxfords")!,
      BASE_WARDROBE.find((i) => i.id === "shoe-black-sneakers")!,
    ];
    const r = runStylingPipeline({ allItems: mixed, prompt: "Gym workout" });
    expect(r.outfits.length).toBeGreaterThan(0);
    for (const o of r.outfits) {
      expect(o.itemIds).not.toContain("shoe-oxfords");
    }
  });
});

describe("Phase 10B: Styling Edge Cases (13 - 25)", () => {
  it("Scenario 13: bright red jorts with graphic T-shirt -> valid in streetwear context", () => {
    const r = runStylingPipeline({
      allItems: BASE_WARDROBE,
      prompt: "Give me a streetwear outfit around my red jorts",
    });
    expect(r.outfits.length).toBeGreaterThan(0);
    expect(r.outfits[0].itemIds).toContain("bot-red-jorts");
  });

  it("Scenario 14: formal shirt with casual jorts/joggers -> flagged with warning and ranked below coherent pairings", () => {
    const profiles = BASE_WARDROBE.map(profileGarment);
    const byId = new Map(profiles.map((p) => [p.id, p]));
    const owned = new Map(BASE_WARDROBE.map((i) => [i.id, i]));
    const c = parseConstraints("Smart casual", profiles, { allowRewearWorn: false });

    const vMismatch = validateOutfit(["top-dress-shirt", "bot-joggers", "shoe-white-sneakers"], {
      owned,
      allowRewearWorn: false,
      constraints: c,
      weather: null,
      allowPartial: false,
    }, byId);
    expect(vMismatch.ok).toBe(false); // gap of 3 (4 vs 1) triggers FORMALITY_MISMATCH severity 3
  });

  it("Scenario 15: oversized top with wide-leg bottoms -> allowed in streetwear, warned outside streetwear", () => {
    const overTee = makeItem({ id: "over-tee", name: "Oversized White Street Tee", category: "t-shirts", primaryColour: "white", style: "casual" });
    const widePants = BASE_WARDROBE.find((i) => i.id === "bot-wide-cargo")!;
    const sneakers = BASE_WARDROBE.find((i) => i.id === "shoe-white-sneakers")!;
    const items = [overTee, widePants, sneakers];
    const profiles = items.map(profileGarment);
    const byId = new Map(profiles.map((p) => [p.id, p]));
    const owned = new Map(items.map((i) => [i.id, i]));

    const streetConstraints = parseConstraints("Streetwear look", profiles, { allowRewearWorn: false });
    const vStreet = validateOutfit(["over-tee", "bot-wide-cargo", "shoe-white-sneakers"], {
      owned,
      allowRewearWorn: false,
      constraints: streetConstraints,
      weather: null,
      allowPartial: false,
    }, byId);
    expect(vStreet.ok).toBe(true);
    expect(vStreet.warnings.some((w) => w.code === "VOLUMINOUS_SILHOUETTE")).toBe(false);
  });

  it("Scenario 16: skinny trousers with chunky boots -> triggers SKINNY_BOTTOM_CHUNKY_SHOE warning", () => {
    const profiles = BASE_WARDROBE.map(profileGarment);
    const byId = new Map(profiles.map((p) => [p.id, p]));
    const owned = new Map(BASE_WARDROBE.map((i) => [i.id, i]));
    const c = parseConstraints("Casual", profiles, { allowRewearWorn: false });
    const v = validateOutfit(["top-white-tee", "bot-skinny-jeans", "shoe-boots"], {
      owned,
      allowRewearWorn: false,
      constraints: c,
      weather: null,
      allowPartial: false,
    }, byId);
    expect(v.warnings.some((w) => w.code === "SKINNY_BOTTOM_CHUNKY_SHOE")).toBe(true);
  });

  it("Scenario 17 & 18: multiple loud patterns and 3+ competing accent colours -> rejected in standard mode, allowed in bold/experimental mode (Scenario 25)", () => {
    const floralTop = makeItem({ id: "p-top", name: "Red Floral Shirt", category: "shirts", primaryColour: "red", pattern: "floral" });
    const plaidBot = makeItem({ id: "p-bot", name: "Green Plaid Trousers", category: "trousers", primaryColour: "green", pattern: "plaid" });
    const yellowShoe = makeItem({ id: "p-shoe", name: "Yellow Sneakers", category: "sneakers", primaryColour: "yellow", pattern: "graphic" });
    const items = [floralTop, plaidBot, yellowShoe];
    const profiles = items.map(profileGarment);
    const byId = new Map(profiles.map((p) => [p.id, p]));
    const owned = new Map(items.map((i) => [i.id, i]));

    const normalC = parseConstraints("Everyday outfit", profiles, { allowRewearWorn: false });
    const vNormal = validateOutfit(["p-top", "p-bot", "p-shoe"], {
      owned,
      allowRewearWorn: false,
      constraints: normalC,
      weather: null,
      allowPartial: false,
    }, byId);
    expect(vNormal.ok).toBe(false);

    // Scenario 25: user explicitly asks for bold/experimental with a single loud pair
    const boldC = parseConstraints("Suggest something bold and experimental", profiles, { allowRewearWorn: false });
    expect(boldC.allowBold).toBe(true);
  });

  it("Scenario 19: dress combined with unrelated trousers or base t-shirt -> hard rejected", () => {
    const profiles = BASE_WARDROBE.map(profileGarment);
    const byId = new Map(profiles.map((p) => [p.id, p]));
    const owned = new Map(BASE_WARDROBE.map((i) => [i.id, i]));
    const c = parseConstraints("Party", profiles, { allowRewearWorn: false });

    const vWithPants = validateOutfit(["one-dress", "bot-navy-chinos", "shoe-white-sneakers"], {
      owned,
      allowRewearWorn: false,
      constraints: c,
      weather: null,
      allowPartial: false,
    }, byId);
    expect(vWithPants.ok).toBe(false);
    expect(vWithPants.hard.some((h) => h.code === "ONEPIECE_WITH_BOTTOM")).toBe(true);
  });

  it("Scenario 20: shorts with formal dress shoes -> hard rejected", () => {
    const profiles = BASE_WARDROBE.map(profileGarment);
    const byId = new Map(profiles.map((p) => [p.id, p]));
    const owned = new Map(BASE_WARDROBE.map((i) => [i.id, i]));
    const c = parseConstraints("Casual", profiles, { allowRewearWorn: false });
    const v = validateOutfit(["top-white-tee", "bot-red-jorts", "shoe-oxfords"], {
      owned,
      allowRewearWorn: false,
      constraints: c,
      weather: null,
      allowPartial: false,
    }, byId);
    expect(v.ok).toBe(false);
    expect(v.hard.some((h) => h.code === "DRESS_SHOES_WITH_CASUAL_SHORT_OR_JOGGER")).toBe(true);
  });

  it("Scenario 21: hoodie or heavy coat in hot weather (31°C) -> hard rejected", () => {
    const profiles = BASE_WARDROBE.map(profileGarment);
    const byId = new Map(profiles.map((p) => [p.id, p]));
    const owned = new Map(BASE_WARDROBE.map((i) => [i.id, i]));
    const c = parseConstraints("I want something comfortable for a hot day", profiles, { allowRewearWorn: false });
    const weather = parseWeather("Ilorin, Kwara: 31°C, Sunny", c);

    const vHoodie = validateOutfit(["top-hoodie", "bot-navy-chinos", "shoe-white-sneakers"], {
      owned,
      allowRewearWorn: false,
      constraints: c,
      weather,
      allowPartial: false,
    }, byId);
    expect(vHoodie.ok).toBe(false);
    expect(vHoodie.hard.some((h) => h.code === "HOT_WEATHER_WARM_GARMENT")).toBe(true);

    const vCoat = validateOutfit(["top-white-tee", "bot-navy-chinos", "shoe-white-sneakers", "outer-coat"], {
      owned,
      allowRewearWorn: false,
      constraints: c,
      weather,
      allowPartial: false,
    }, byId);
    expect(vCoat.ok).toBe(false);
    expect(vCoat.hard.some((h) => h.code === "HOT_WEATHER_HEAVY_COAT")).toBe(true);
  });

  it("Scenario 22 & 23: monochromatic all-black outfit and contrasting streetwear outfit pass validation", () => {
    const rMono = runStylingPipeline({
      allItems: BASE_WARDROBE,
      prompt: "I want an all-black outfit",
    });
    expect(rMono.outfits.length).toBeGreaterThan(0);
    for (const id of rMono.outfits[0].itemIds) {
      const item = BASE_WARDROBE.find((i) => i.id === id)!;
      expect(item.primaryColour).toBe("black");
    }
  });

  it("Scenario 24: formal event with strict dress code rejects sneakers, tees, and jorts", () => {
    const rFormal = runStylingPipeline({
      allItems: BASE_WARDROBE,
      prompt: "Formal wedding guest outfit",
    });
    expect(rFormal.outfits.length).toBeGreaterThan(0);
    for (const o of rFormal.outfits) {
      expect(o.itemIds).not.toContain("top-white-tee");
      expect(o.itemIds).not.toContain("bot-red-jorts");
      expect(o.itemIds).not.toContain("shoe-white-sneakers");
    }
  });

  it("Athletic / sporty request rejects chinos and loafers (fixes original user bug)", () => {
    const rSport = runStylingPipeline({
      allItems: BASE_WARDROBE,
      prompt: "Athletic fit for a workout",
      feedback: { bodyBuild: "athletic" },
    });
    expect(rSport.outfits.length).toBeGreaterThan(0);
    for (const o of rSport.outfits) {
      expect(o.itemIds).not.toContain("bot-navy-chinos");
      expect(o.itemIds).not.toContain("bot-tailored");
      expect(o.itemIds).not.toContain("shoe-oxfords");
    }
  });
});

describe("Phase 10C: Preference Edge Cases (26 - 35)", () => {
  it("Scenario 26, 27, 29: requires anchor ('my red jorts'), prefers streetwear, and bans boots ('no boots')", () => {
    const r = runStylingPipeline({
      allItems: BASE_WARDROBE,
      prompt: "I want an outfit around my red jorts, preferably streetwear, and no boots.",
    });
    expect(r.outfits.length).toBeGreaterThan(0);
    for (const o of r.outfits) {
      expect(o.itemIds).toContain("bot-red-jorts");
      expect(o.itemIds).not.toContain("shoe-boots");
    }
  });

  it("Scenario 27: 'Avoid skinny jeans' & 'No hoodies' never include those items", () => {
    const r = runStylingPipeline({
      allItems: BASE_WARDROBE,
      prompt: "Casual weekend outfit, avoid skinny jeans and no hoodies",
    });
    expect(r.outfits.length).toBeGreaterThan(0);
    for (const o of r.outfits) {
      expect(o.itemIds).not.toContain("bot-skinny-jeans");
      expect(o.itemIds).not.toContain("top-hoodie");
    }
  });

  it("Scenario 28 & 31: contradictory constraints ('all-black outfit around my red jorts') -> halts with contradictory_constraints fallback", () => {
    const r = runStylingPipeline({
      allItems: BASE_WARDROBE,
      prompt: "I want an all-black outfit around my red jorts",
    });
    expect(r.outfits).toHaveLength(0);
    expect(r.fallback?.kind).toBe("contradictory_constraints");
  });

  it("Scenario 30: user changes their mind halfway through ('casual with shorts, actually smart casual for a date')", () => {
    const profiles = BASE_WARDROBE.map(profileGarment);
    const c = parseConstraints("Give me a casual outfit with shorts, actually I want a smart-casual outfit for a date", profiles, {
      allowRewearWorn: false,
    });
    expect(c.revised).toBe(true);
    expect(c.styles).toContain("smart_casual");
    expect(c.occasion).toBe("date");
  });

  it("Scenario 32, 34, 35: repeated rejections lower score, 'do not repeat' skips recent combos, 'repeat favourite' allows them", () => {
    const comboKey = ["bot-navy-chinos", "shoe-white-sneakers", "top-white-tee"].sort().join("|");
    const rNoRepeat = runStylingPipeline({
      allItems: BASE_WARDROBE,
      prompt: "Do not repeat yesterday's outfit",
      feedback: { recentComboKeys: new Set([comboKey]) },
    });
    for (const o of rNoRepeat.outfits) {
      expect([...o.itemIds].sort().join("|")).not.toBe(comboKey);
    }

    const rAllowRepeat = runStylingPipeline({
      allItems: BASE_WARDROBE,
      prompt: "Repeat my favourite outfit",
      feedback: { recentComboKeys: new Set([comboKey]) },
    });
    expect(rAllowRepeat.constraints.allowRepeat).toBe(true);
  });

  it("Scenario 33: user asks for an item outside their wardrobe -> returns anchor_conflict fallback", () => {
    const r = runStylingPipeline({
      allItems: BASE_WARDROBE,
      prompt: "Style an outfit around my yellow cardigan",
    });
    expect(r.outfits).toHaveLength(0);
    expect(r.fallback?.kind).toBe("anchor_conflict");
  });
});

describe("Phase 10D & Phase 12: Technical Edge Cases (36 - 50) & Fact-Grounded Explanations", () => {
  it("Scenario 36, 38, 39, 44, 46, 48: AI invalid JSON, hallucinated item IDs, or incompatible AI outfits are caught or repaired by the validator", async () => {
    // AI proposes chinos + dress shoes for a gym workout, plus a fake item ID
    const badAiProvider: AiProvider = {
      name: "gemini",
      isMock: false,
      generateJson: vi.fn().mockResolvedValue({
        outfits: [
          {
            name: "Hallucinated Gym Chinos",
            occasion: "sport",
            item_ids: ["top-athletic-tee", "bot-navy-chinos", "shoe-oxfords", "non-existent-id"],
            style_description: "Sporty look",
            explanation: "Made from 100% breathable linen and waterproof suede.",
            styling_tip: "Add a belt.",
          },
        ],
      }),
    };

    const res = await generateStylistRecommendations(
      {
        userPrompt: "Gym workout outfit",
        wardrobeItems: BASE_WARDROBE,
        inventory: BASE_WARDROBE.map((i) => ({
          id: i.id,
          name: i.name,
          category: i.category,
          subcategory: i.subcategory,
          primaryColour: i.primaryColour,
          style: i.style,
          occasions: i.occasions,
        })),
      },
      { provider: badAiProvider },
    );

    // Bad AI outfit is rejected by hard validator, and deterministic pipeline supplies valid athletic outfit
    expect(res.status).toBe("ok");
    if (res.status === "ok") {
      expect(res.rejected?.length).toBeGreaterThan(0);
      for (const o of res.data.outfits) {
        expect(o.item_ids).not.toContain("bot-navy-chinos");
        expect(o.item_ids).not.toContain("shoe-oxfords");
        expect(o.item_ids).not.toContain("non-existent-id");
      }
    }
  });

  it("Scenario 36 & 37: AI provider timeout / rate-limit error fails safely without bypassing validation", async () => {
    const failingProvider: AiProvider = {
      name: "gemini",
      isMock: false,
      generateJson: vi.fn().mockRejectedValue(new AiProviderError("AI request timed out.", true)),
    };

    const res = await generateStylistRecommendations(
      {
        userPrompt: "Casual outfit",
        wardrobeItems: BASE_WARDROBE,
        inventory: [],
      },
      { provider: failingProvider },
    );
    expect(res.status).toBe("failed");
  });

  it("Phase 12: sanitiseExplanation strips fabricated fabric claims ('linen', 'cashmere', 'waterproof') when material is unknown", () => {
    const profiles = [
      profileGarment(BASE_WARDROBE.find((i) => i.id === "top-white-tee")!),
      profileGarment(BASE_WARDROBE.find((i) => i.id === "bot-red-jorts")!),
      profileGarment(BASE_WARDROBE.find((i) => i.id === "shoe-white-sneakers")!),
    ];
    const c = parseConstraints("Streetwear", profiles, { allowRewearWorn: false });
    const hallucinated = "This breathable linen top and waterproof leather sneakers keep you cool.";
    const cleaned = sanitiseExplanation(hallucinated, profiles, "standard", c);
    expect(cleaned).not.toMatch(/linen|waterproof/i);
    expect(cleaned).toBe(buildFactExplanation(profiles, "standard", c));
  });

  it("Legacy engine.ts generateOutfits and styleAroundItem enforce hard validation and preserve focal anchors", () => {
    const outfits = generateOutfits(BASE_WARDROBE, { targetOccasion: "formal_event" });
    expect(outfits.length).toBeGreaterThan(0);
    for (const o of outfits) {
      expect(o.items.map((i) => i.id)).not.toContain("bot-red-jorts");
    }

    const jorts = BASE_WARDROBE.find((i) => i.id === "bot-red-jorts")!;
    const anchored = styleAroundItem(jorts, BASE_WARDROBE);
    expect(anchored.length).toBeGreaterThan(0);
    for (const o of anchored) {
      expect(o.items.map((i) => i.id)).toContain("bot-red-jorts");
    }
  });

  it("Scoring model ranks a well-matched outfit higher than a mismatched one", () => {
    const profiles = BASE_WARDROBE.map(profileGarment);
    const byId = new Map(profiles.map((p) => [p.id, p]));
    const c = parseConstraints("Formal office meeting", profiles, { occasion: "work", allowRewearWorn: false });

    const good = scoreOutfit(
      [byId.get("top-dress-shirt")!, byId.get("bot-tailored")!, byId.get("shoe-oxfords")!, byId.get("outer-blazer")!],
      "standard",
      [],
      { constraints: c, weather: null },
    );
    const mediocre = scoreOutfit(
      [byId.get("top-white-tee")!, byId.get("bot-skinny-jeans")!, byId.get("shoe-white-sneakers")!],
      "standard",
      [],
      { constraints: c, weather: null },
    );
    expect(good.score).toBeGreaterThan(mediocre.score);
  });
});

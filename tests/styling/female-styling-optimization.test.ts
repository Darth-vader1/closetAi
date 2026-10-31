import { describe, expect, it } from "vitest";
import { profileGarment, isUnderlayerableOnePiece, isUnderlayerTop } from "@/lib/styling/taxonomy";
import { parseConstraints } from "@/lib/styling/constraints";
import { validateOutfit } from "@/lib/styling/validator";
import { scoreOutfit } from "@/lib/styling/scorer";
import { buildFactExplanation } from "@/lib/styling/explainer";
import { runStylingPipeline } from "@/lib/styling/pipeline";
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

describe("Deeper Female Styling Optimization: Garment Understanding & Length", () => {
  it("detects mini, midi, and maxi lengths dynamically from garment names & subcategories", () => {
    const miniSkirt = makeItem({ id: "skirt-1", name: "Black Pleated Mini Skirt", category: "skirts" });
    const midiSkirt = makeItem({ id: "skirt-2", name: "Emerald Satin Midi Skirt", category: "skirts" });
    const maxiDress = makeItem({ id: "dress-1", name: "Floral Tiered Maxi Dress", category: "dresses" });
    const miniDress = makeItem({ id: "dress-2", name: "Red Bodycon Mini Dress", category: "dresses" });

    const pMiniSkirt = profileGarment(miniSkirt);
    const pMidiSkirt = profileGarment(midiSkirt);
    const pMaxiDress = profileGarment(maxiDress);
    const pMiniDress = profileGarment(miniDress);

    expect(pMiniSkirt.length).toBe("short");
    expect(pMidiSkirt.length).toBe("mid");
    expect(pMaxiDress.length).toBe("long");
    expect(pMiniDress.length).toBe("short");
  });

  it("identifies slip dresses, pinafores, and sleeveless one-pieces as underlayerable", () => {
    const slipDress = makeItem({ id: "slip-1", name: "Black Silk Slip Dress", category: "dresses" });
    const pinafore = makeItem({ id: "pin-1", name: "Denim Pinafore Overall Dress", category: "dresses" });
    const sleeveless = makeItem({ id: "sleeve-1", name: "Sleeveless Knit Tank Dress", category: "dresses" });
    const longSleeveGown = makeItem({ id: "gown-1", name: "Long Sleeve Velvet Evening Gown", category: "dresses" });

    expect(isUnderlayerableOnePiece(profileGarment(slipDress))).toBe(true);
    expect(isUnderlayerableOnePiece(profileGarment(pinafore))).toBe(true);
    expect(isUnderlayerableOnePiece(profileGarment(sleeveless))).toBe(true);
    expect(isUnderlayerableOnePiece(profileGarment(longSleeveGown))).toBe(false);
  });

  it("identifies fitted base tees, turtlenecks, and blouses as underlayer tops", () => {
    const babyTee = makeItem({ id: "tee-1", name: "White Fitted Baby Tee", category: "t-shirts", subcategory: "fitted" });
    const turtleneck = makeItem({ id: "turtle-1", name: "Black Ribbed Turtleneck Top", category: "sweaters", subcategory: "turtleneck" });
    const oversizedHoodie = makeItem({ id: "hoodie-1", name: "Oversized Heavyweight Hoodie", category: "hoodies" });
    const cardigan = makeItem({ id: "cardigan-1", name: "Chunky Knit Cardigan", category: "sweaters", subcategory: "cardigan" });

    expect(isUnderlayerTop(profileGarment(babyTee))).toBe(true);
    expect(isUnderlayerTop(profileGarment(turtleneck))).toBe(true);
    expect(isUnderlayerTop(profileGarment(oversizedHoodie))).toBe(false); // oversized hoodie cannot be layered UNDER a slip dress
    expect(isUnderlayerTop(profileGarment(cardigan))).toBe(false); // cardigans layer OVER, not under
  });
});

describe("Deeper Female Styling Optimization: 90s/Y2K Dress Layering", () => {
  const slipDress = makeItem({ id: "slip-1", name: "Black Satin Slip Dress", category: "dresses" });
  const babyTee = makeItem({ id: "tee-1", name: "White Fitted Baby Tee", category: "t-shirts" });
  const heels = makeItem({ id: "heels-1", name: "Strappy Black Heeled Sandals", category: "shoes", subcategory: "heels" });
  const longSleeveDress = makeItem({ id: "gown-1", name: "Long Sleeve Formal Gown", category: "dresses" });

  const ownedMap = new Map([
    [slipDress.id, slipDress],
    [babyTee.id, babyTee],
    [heels.id, heels],
    [longSleeveDress.id, longSleeveDress],
  ]);

  it("permits wearing a fitted baby tee under a slip dress as a valid one-piece outfit", () => {
    const constraints = parseConstraints("90s aesthetic", [profileGarment(slipDress), profileGarment(babyTee), profileGarment(heels)], { allowRewearWorn: false });
    const validation = validateOutfit([babyTee.id, slipDress.id, heels.id], {
      owned: ownedMap,
      allowRewearWorn: false,
      constraints,
      weather: null,
      allowPartial: false,
    });

    expect(validation.ok).toBe(true);
    expect(validation.archetype).toBe("onepiece");
    expect(validation.hard).toHaveLength(0);
  });

  it("still rejects pairing a base tee with a non-underlayerable long-sleeve gown", () => {
    const constraints = parseConstraints("Formal event", [profileGarment(longSleeveDress), profileGarment(babyTee), profileGarment(heels)], { allowRewearWorn: false });
    const validation = validateOutfit([babyTee.id, longSleeveDress.id, heels.id], {
      owned: ownedMap,
      allowRewearWorn: false,
      constraints,
      weather: null,
      allowPartial: false,
    });

    expect(validation.ok).toBe(false);
    expect(validation.hard.some((h) => h.code === "ONEPIECE_WITH_BASE_TOP")).toBe(true);
  });

  it("proactively generates layered slip-dress looks in the styling pipeline", () => {
    const result = runStylingPipeline({
      allItems: [slipDress, babyTee, heels],
      prompt: "Chic weekend look",
    });

    expect(result.outfits.length).toBeGreaterThan(0);
    const layeredLook = result.outfits.find((o) => o.itemIds.includes(babyTee.id) && o.itemIds.includes(slipDress.id));
    expect(layeredLook).toBeDefined();
    expect(layeredLook?.stylingTip).toMatch(/underneath/i);
  });
});

describe("Deeper Female Styling Optimization: Modesty & Coverage System", () => {
  const miniSkirt = makeItem({ id: "skirt-mini", name: "Black Pleated Mini Skirt", category: "skirts" });
  const cropTop = makeItem({ id: "crop-1", name: "White Ribbed Crop Top", category: "t-shirts", subcategory: "crop top" });
  const maxiSkirt = makeItem({ id: "skirt-maxi", name: "Navy Pleated Maxi Skirt", category: "skirts" });
  const silkBlouse = makeItem({ id: "blouse-1", name: "Cream Long-Sleeve Silk Blouse", category: "shirts", subcategory: "blouse" });
  const flats = makeItem({ id: "flats-1", name: "Pointed Leather Ballet Flats", category: "shoes", subcategory: "flats" });

  const ownedMap = new Map([
    [miniSkirt.id, miniSkirt],
    [cropTop.id, cropTop],
    [maxiSkirt.id, maxiSkirt],
    [silkBlouse.id, silkBlouse],
    [flats.id, flats],
  ]);

  it("parses modesty requests and marks constraints.modest = true", () => {
    const c1 = parseConstraints("Modest church thanksgiving look", [], { allowRewearWorn: false });
    const c2 = parseConstraints("Hijabi chic everyday outfit", [], { allowRewearWorn: false });
    const c3 = parseConstraints("Casual party fit", [], { allowRewearWorn: false });

    expect(c1.modest).toBe(true);
    expect(c2.modest).toBe(true);
    expect(c3.modest).toBe(false);
  });

  it("blocks mini skirts and crop tops when a modest look is requested", () => {
    const constraints = parseConstraints("Modest outfit", [profileGarment(miniSkirt), profileGarment(silkBlouse), profileGarment(flats)], { allowRewearWorn: false });
    const validation = validateOutfit([silkBlouse.id, miniSkirt.id, flats.id], {
      owned: ownedMap,
      allowRewearWorn: false,
      constraints,
      weather: null,
      allowPartial: false,
    });

    expect(validation.ok).toBe(false);
    expect(validation.hard.some((h) => h.code === "MODESTY_LENGTH_VIOLATION")).toBe(true);
  });

  it("approves long maxi skirt with long-sleeve blouse for modest styling", () => {
    const constraints = parseConstraints("Modest elegant look", [profileGarment(maxiSkirt), profileGarment(silkBlouse), profileGarment(flats)], { allowRewearWorn: false });
    const validation = validateOutfit([silkBlouse.id, maxiSkirt.id, flats.id], {
      owned: ownedMap,
      allowRewearWorn: false,
      constraints,
      weather: null,
      allowPartial: false,
    });

    expect(validation.ok).toBe(true);
    expect(validation.hard).toHaveLength(0);

    const fact = buildFactExplanation([profileGarment(silkBlouse), profileGarment(maxiSkirt), profileGarment(flats)], "standard", constraints);
    expect(fact).toMatch(/coverage/i);
  });
});

describe("Deeper Female Styling Optimization: Body Shape & Proportion Scoring", () => {
  const fittedTop = makeItem({ id: "top-fit", name: "Fitted Black Scoop Top", category: "t-shirts", subcategory: "fitted" });
  const wideTrousers = makeItem({ id: "bot-wide", name: "Wide-Leg High-Waist Trousers", category: "trousers", subcategory: "wide-leg" });
  const skinnyPants = makeItem({ id: "bot-skinny", name: "Patterned Skinny Pants", category: "trousers", pattern: "floral", subcategory: "skinny" });
  const oversizedShirt = makeItem({ id: "top-over", name: "Oversized Boxy Shirt", category: "shirts", subcategory: "oversized" });
  const aLineSkirt = makeItem({ id: "skirt-aline", name: "Floral A-Line Midi Skirt", category: "skirts", pattern: "floral" });
  const belt = makeItem({ id: "acc-belt", name: "Black Leather Waist Belt", category: "belts" });
  const heels = makeItem({ id: "shoe-heels", name: "Nude Block Heels", category: "shoes", subcategory: "heels" });

  it("Hourglass: rewards belted waist definition and penalizes unbelted boxy/oversized looks", () => {
    const baseConstraints = parseConstraints("Dinner look", [], { allowRewearWorn: false });
    const pFitted = profileGarment(fittedTop);
    const pWide = profileGarment(wideTrousers);
    const pBelt = profileGarment(belt);
    const pHeels = profileGarment(heels);
    const pOver = profileGarment(oversizedShirt);

    // Fitted + Wide + Belt for hourglass
    const scoredBelted = scoreOutfit([pFitted, pWide, pBelt, pHeels], "standard", [], {
      constraints: baseConstraints,
      weather: null,
      feedback: { bodyBuild: "hourglass" },
    });

    // Oversized top + wide trousers without belt for hourglass
    const scoredBoxy = scoreOutfit([pOver, pWide, pHeels], "standard", [], {
      constraints: baseConstraints,
      weather: null,
      feedback: { bodyBuild: "hourglass" },
    });

    expect(scoredBelted.breakdown.silhouette).toBe(10);
    expect(scoredBoxy.breakdown.silhouette).toBeLessThan(scoredBelted.breakdown.silhouette);
  });

  it("Pear: rewards A-line skirts and upper body visual interest while penalizing tight patterned bottoms", () => {
    const baseConstraints = parseConstraints("Brunch look", [], { allowRewearWorn: false });
    const pFitted = profileGarment(fittedTop);
    const pAline = profileGarment(aLineSkirt);
    const pSkinny = profileGarment(skinnyPants);
    const pHeels = profileGarment(heels);

    const scoredAline = scoreOutfit([pFitted, pAline, pHeels], "standard", [], {
      constraints: baseConstraints,
      weather: null,
      feedback: { bodyBuild: "pear" },
    });

    const scoredSkinny = scoreOutfit([pFitted, pSkinny, pHeels], "standard", [], {
      constraints: baseConstraints,
      weather: null,
      feedback: { bodyBuild: "pear" },
    });

    expect(scoredAline.breakdown.silhouette).toBeGreaterThan(scoredSkinny.breakdown.silhouette);
  });

  it("Inverted Triangle: rewards lower volume (wide trousers, A-line skirts)", () => {
    const baseConstraints = parseConstraints("Casual office", [], { allowRewearWorn: false });
    const pFitted = profileGarment(fittedTop);
    const pWide = profileGarment(wideTrousers);
    const pHeels = profileGarment(heels);

    const scored = scoreOutfit([pFitted, pWide, pHeels], "standard", [], {
      constraints: baseConstraints,
      weather: null,
      feedback: { bodyBuild: "inverted_triangle" },
    });

    expect(scored.breakdown.silhouette).toBe(10);
  });
});

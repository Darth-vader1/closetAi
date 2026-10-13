import { categoryGroup } from "@/lib/wardrobe/categories";
import { isEligibleStatus } from "@/lib/wardrobe/status";
import type { WardrobeItem } from "@/lib/wardrobe/queries";

export interface OutfitSuggestion {
  name: string;
  items: WardrobeItem[];
  occasion?: string | null;
  styleDescription: string;
  stylingTip: string;
  score: number;
  accessoryGaps?: AccessoryGap[];
}

export interface AccessoryGap {
  category: string;
  reason: string;
}

const NEUTRAL_COLOURS = new Set(["black", "white", "grey", "navy", "beige", "cream", "brown"]);
const FORMAL_OCCASIONS = new Set(["work", "formal", "business"]);
const CASUAL_OCCASIONS = new Set(["casual", "everyday", "weekend"]);

/** Computes color compatibility score between items */
function calculateColorHarmony(items: WardrobeItem[]): number {
  const colours = items.map((i) => i.primaryColour?.toLowerCase()).filter(Boolean) as string[];
  if (colours.length <= 1) return 10;

  let neutralCount = 0;
  for (const c of colours) {
    if (NEUTRAL_COLOURS.has(c)) neutralCount += 1;
  }

  // If most items are neutrals, they harmonize naturally
  if (neutralCount >= colours.length - 1) return 15;
  // If monochromatic
  const unique = new Set(colours);
  if (unique.size === 1) return 12;
  // Two distinct colors with at least one neutral
  if (neutralCount >= 1) return 10;
  return 5;
}

/** Evaluates occasion match */
function calculateOccasionScore(items: WardrobeItem[], targetOccasion?: string | null): number {
  if (!targetOccasion) return 5;
  let matches = 0;
  for (const item of items) {
    if (item.occasions.includes(targetOccasion)) matches += 1;
  }
  return matches * 4;
}

/** Check if occasion is formal */
function isFormalOccasion(occasion?: string | null): boolean {
  return occasion ? FORMAL_OCCASIONS.has(occasion) : false;
}

/** Score accessory diversity - penalize if same accessory used recently */
function calculateAccessoryDiversityScore(
  accessory: WardrobeItem,
  recentlyUsedAccessoryIds: Set<string>
): number {
  // Higher score for accessories not used recently
  return recentlyUsedAccessoryIds.has(accessory.id) ? -3 : 5;
}

/** Match belt to shoes and trouser formality */
function findMatchingBelt(
  belts: WardrobeItem[],
  shoe?: WardrobeItem,
  bottom?: WardrobeItem,
  occasion?: string | null,
  recentlyUsed?: Set<string>
): WardrobeItem | undefined {
  const isFormal = isFormalOccasion(occasion);
  
  let bestBelt: WardrobeItem | undefined;
  let bestScore = -Infinity;

  for (const belt of belts) {
    let score = 0;

    // Color matching with shoes (most important)
    if (shoe && belt.primaryColour === shoe.primaryColour) {
      score += 15;
    } else if (shoe && NEUTRAL_COLOURS.has(belt.primaryColour || "") && NEUTRAL_COLOURS.has(shoe.primaryColour || "")) {
      score += 8; // Neutrals work together
    }

    // Occasion matching
    if (occasion && belt.occasions.includes(occasion)) {
      score += 10;
    }

    // Style matching
    if (isFormal && belt.style && ["classic", "elegant", "minimalist"].includes(belt.style)) {
      score += 5;
    } else if (!isFormal && belt.style && ["casual", "sporty", "streetwear"].includes(belt.style)) {
      score += 5;
    }

    // Diversity bonus
    if (recentlyUsed) {
      score += calculateAccessoryDiversityScore(belt, recentlyUsed);
    }

    if (score > bestScore) {
      bestScore = score;
      bestBelt = belt;
    }
  }

  // Only return if score is reasonable
  return bestScore > 5 ? bestBelt : undefined;
}

/** Match watch to occasion formality */
function findMatchingWatch(
  watches: WardrobeItem[],
  occasion?: string | null,
  recentlyUsed?: Set<string>
): WardrobeItem | undefined {
  const isFormal = isFormalOccasion(occasion);
  
  let bestWatch: WardrobeItem | undefined;
  let bestScore = -Infinity;

  for (const watch of watches) {
    let score = 0;

    // Occasion matching (most important for watches)
    if (occasion && watch.occasions.includes(occasion)) {
      score += 15;
    }

    // Style matching
    if (isFormal && watch.style && ["classic", "elegant", "minimalist"].includes(watch.style)) {
      score += 10;
    } else if (!isFormal && watch.style && ["casual", "sporty", "streetwear"].includes(watch.style)) {
      score += 10;
    }

    // Diversity bonus
    if (recentlyUsed) {
      score += calculateAccessoryDiversityScore(watch, recentlyUsed);
    }

    if (score > bestScore) {
      bestScore = score;
      bestWatch = watch;
    }
  }

  return bestScore > 5 ? bestWatch : undefined;
}

/** Match bag to occasion */
function findMatchingBag(
  bags: WardrobeItem[],
  occasion?: string | null,
  primaryColor?: string | null,
  recentlyUsed?: Set<string>
): WardrobeItem | undefined {
  let bestBag: WardrobeItem | undefined;
  let bestScore = -Infinity;

  for (const bag of bags) {
    let score = 0;

    // Occasion matching (most important for bags)
    if (occasion && bag.occasions.includes(occasion)) {
      score += 15;
    }

    // Color harmony - neutral bags work with everything
    if (NEUTRAL_COLOURS.has(bag.primaryColour || "")) {
      score += 5;
    } else if (primaryColor && bag.primaryColour === primaryColor) {
      score += 3;
    }

    // Diversity bonus
    if (recentlyUsed) {
      score += calculateAccessoryDiversityScore(bag, recentlyUsed);
    }

    if (score > bestScore) {
      bestScore = score;
      bestBag = bag;
    }
  }

  return bestScore > 8 ? bestBag : undefined;
}

/** Select 0-2 accessories for an outfit based on occasion and harmony */
function selectAccessories(
  available: {
    belts: WardrobeItem[];
    watches: WardrobeItem[];
    bags: WardrobeItem[];
    other: WardrobeItem[];
  },
  outfit: {
    shoe?: WardrobeItem;
    bottom?: WardrobeItem;
    top?: WardrobeItem;
    occasion?: string | null;
  },
  recentlyUsedAccessoryIds?: Set<string>
): WardrobeItem[] {
  const selected: WardrobeItem[] = [];
  const recentlyUsed = recentlyUsedAccessoryIds || new Set();

  // Priority 1: Belt (if formal occasion or trousers/jeans)
  if (outfit.bottom && ["trousers", "jeans"].includes(outfit.bottom.category)) {
    const belt = findMatchingBelt(
      available.belts,
      outfit.shoe,
      outfit.bottom,
      outfit.occasion,
      recentlyUsed
    );
    if (belt) {
      selected.push(belt);
      recentlyUsed.add(belt.id);
    }
  }

  // Priority 2: Watch (adds sophistication)
  if (available.watches.length > 0 && selected.length < 2) {
    const watch = findMatchingWatch(available.watches, outfit.occasion, recentlyUsed);
    if (watch) {
      selected.push(watch);
      recentlyUsed.add(watch.id);
    }
  }

  // Priority 3: Bag (if appropriate for occasion)
  if (available.bags.length > 0 && selected.length < 2 && outfit.occasion) {
    const needsBag = ["work", "formal", "date", "party"].includes(outfit.occasion);
    if (needsBag) {
      const bag = findMatchingBag(
        available.bags,
        outfit.occasion,
        outfit.top?.primaryColour,
        recentlyUsed
      );
      if (bag) {
        selected.push(bag);
        recentlyUsed.add(bag.id);
      }
    }
  }

  // Priority 4: Other accessories (scarves, hats) for specific occasions
  if (available.other.length > 0 && selected.length < 2) {
    const other = available.other.find((a) => 
      outfit.occasion && a.occasions.includes(outfit.occasion) && !recentlyUsed.has(a.id)
    );
    if (other) {
      selected.push(other);
    }
  }

  return selected;
}

/** Identify missing accessory categories for an occasion */
function identifyAccessoryGaps(
  available: {
    belts: WardrobeItem[];
    watches: WardrobeItem[];
    bags: WardrobeItem[];
  },
  occasion?: string | null
): AccessoryGap[] {
  const gaps: AccessoryGap[] = [];
  const isFormal = isFormalOccasion(occasion);

  // Check for belt
  if (isFormal && available.belts.length === 0) {
    gaps.push({
      category: "belt",
      reason: "A classic leather belt would complete formal trouser outfits",
    });
  }

  // Check for watch
  if (available.watches.length === 0) {
    gaps.push({
      category: "watch",
      reason: isFormal 
        ? "A sophisticated watch adds polish to professional looks"
        : "A versatile watch is a timeless accessory for any outfit",
    });
  }

  // Check for bag
  if (isFormal && available.bags.length === 0) {
    gaps.push({
      category: "bag",
      reason: "A structured bag or briefcase is essential for work and formal occasions",
    });
  }

  return gaps.slice(0, 2); // Max 2 suggestions
}

/** Generates outfit combinations from eligible wardrobe items */
export function generateOutfits(
  allItems: WardrobeItem[],
  options: {
    allowRewearWorn?: boolean;
    targetOccasion?: string | null;
    targetStyle?: string | null;
    limit?: number;
    recentlyUsedAccessoryIds?: Set<string>;
  } = {},
): OutfitSuggestion[] {
  const { 
    allowRewearWorn = false, 
    targetOccasion = null, 
    targetStyle = null, 
    limit = 5,
    recentlyUsedAccessoryIds = new Set()
  } = options;

  // Filter only ready-to-wear items
  const eligible = allItems.filter((item) => isEligibleStatus(item.status, allowRewearWorn));

  const tops = eligible.filter((i) => categoryGroup(i.category) === "top");
  const bottoms = eligible.filter((i) => categoryGroup(i.category) === "bottom");
  const fullbodies = eligible.filter((i) => categoryGroup(i.category) === "fullbody" || categoryGroup(i.category) === "traditional");
  const shoes = eligible.filter((i) => categoryGroup(i.category) === "footwear");
  const outerwear = eligible.filter((i) => categoryGroup(i.category) === "outerwear");
  
  // Categorize accessories for intelligent matching
  const accessories = eligible.filter((i) => categoryGroup(i.category) === "accessory");
  const belts = accessories.filter((a) => a.category === "belts");
  const watches = accessories.filter((a) => a.category === "watches");
  const bags = accessories.filter((a) => a.category === "bags");
  const otherAccessories = accessories.filter((a) => !["belts", "watches", "bags"].includes(a.category));

  const availableAccessories = { belts, watches, bags, other: otherAccessories };
  const candidates: OutfitSuggestion[] = [];

  // Identify accessory gaps
  const accessoryGaps = identifyAccessoryGaps(availableAccessories, targetOccasion);

  // Formula A: Top + Bottom + Footwear + Accessories + optional Outerwear
  for (const top of tops) {
    for (const bottom of bottoms) {
      const coreItems: WardrobeItem[] = [top, bottom];

      // Always include footwear if available
      const shoe = shoes.find((s) => 
        targetOccasion 
          ? s.occasions.includes(targetOccasion) 
          : true
      ) ?? shoes[0];
      
      if (shoe) coreItems.push(shoe);

      // Select appropriate accessories (0-2)
      const selectedAccessories = selectAccessories(
        availableAccessories,
        { shoe, bottom, top, occasion: targetOccasion },
        recentlyUsedAccessoryIds
      );
      
      const items = [...coreItems, ...selectedAccessories];

      // Add outerwear if appropriate for weather/occasion
      if (outerwear.length > 0) {
        const coat = outerwear.find((o) => 
          (top.style && o.style === top.style) || 
          (targetOccasion && o.occasions.includes(targetOccasion))
        );
        if (coat) items.push(coat);
      }

      let score = 20;
      score += calculateColorHarmony(items);
      score += calculateOccasionScore(items, targetOccasion);

      // Bonus for footwear inclusion
      if (shoe) score += 8;

      // Bonus for accessory coordination
      if (selectedAccessories.length > 0) score += 5 * selectedAccessories.length;

      if (targetStyle && items.some((i) => i.style === targetStyle)) {
        score += 8;
      }

      // Formulate a clean naming & tip
      const name = `${top.name} with ${bottom.name}`;
      const styleDesc = top.style ? `${top.style.replace("_", " ")} look` : "Balanced ensemble";
      
      let tip = `Pairs ${top.primaryColour || "clean"} tones with ${bottom.name.toLowerCase()}`;
      if (selectedAccessories.length > 0) {
        const accessoryNames = selectedAccessories.map(a => a.category).join(" and ");
        tip += `. Completed with ${accessoryNames} for polish`;
      }
      tip += ".";

      candidates.push({
        name,
        items,
        occasion: targetOccasion,
        styleDescription: styleDesc,
        stylingTip: tip,
        score,
        accessoryGaps: accessoryGaps.length > 0 ? accessoryGaps : undefined,
      });
    }
  }

  // Formula B: Fullbody / Dress + Footwear + Accessories + optional Outerwear
  for (const dress of fullbodies) {
    const coreItems: WardrobeItem[] = [dress];

    const shoe = shoes.find((s) => 
      targetOccasion 
        ? s.occasions.includes(targetOccasion) 
        : true
    ) ?? shoes[0];
    
    if (shoe) coreItems.push(shoe);

    // Select accessories for dress outfit
    const selectedAccessories = selectAccessories(
      availableAccessories,
      { shoe, occasion: targetOccasion, top: dress },
      recentlyUsedAccessoryIds
    );
    
    const items = [...coreItems, ...selectedAccessories];

    const coat = outerwear[0];
    if (coat) items.push(coat);

    let score = 22;
    score += calculateColorHarmony(items);
    score += calculateOccasionScore(items, targetOccasion);
    
    if (shoe) score += 8;
    if (selectedAccessories.length > 0) score += 5 * selectedAccessories.length;

    let tip = `Let the ${dress.name.toLowerCase()} lead the statement`;
    if (shoe) tip += ` with ${shoe.category}`;
    if (selectedAccessories.length > 0) {
      const accessoryNames = selectedAccessories.map(a => a.category).join(" and ");
      tip += ` and ${accessoryNames}`;
    }
    tip += ".";

    candidates.push({
      name: `${dress.name} Ensemble`,
      items,
      occasion: targetOccasion,
      styleDescription: dress.style ? `${dress.style.replace("_", " ")} styling` : "Classic look",
      stylingTip: tip,
      score,
      accessoryGaps: accessoryGaps.length > 0 ? accessoryGaps : undefined,
    });
  }

  // Sort by highest score first, deduplicate by item combination
  const seenCombos = new Set<string>();
  const uniqueOutfits: OutfitSuggestion[] = [];

  candidates.sort((a, b) => b.score - a.score);

  for (const c of candidates) {
    const key = c.items.map((i) => i.id).sort().join("|");
    if (seenCombos.has(key)) continue;
    seenCombos.add(key);
    uniqueOutfits.push(c);
    if (uniqueOutfits.length >= limit) break;
  }

  return uniqueOutfits;
}

/** Generate outfit around a specific focal item (works for any item including shoes, bags) */
export function styleAroundItem(
  focalItem: WardrobeItem,
  allItems: WardrobeItem[],
  options: {
    allowRewearWorn?: boolean;
    targetOccasion?: string | null;
    limit?: number;
  } = {},
): OutfitSuggestion[] {
  const { allowRewearWorn = false, targetOccasion = null, limit = 3 } = options;

  // Filter eligible items (excluding the focal item)
  const eligible = allItems.filter((item) => 
    item.id !== focalItem.id && isEligibleStatus(item.status, allowRewearWorn)
  );

  const focalGroup = categoryGroup(focalItem.category);
  const focalColor = focalItem.primaryColour;

  // Determine what other pieces we need based on focal item type
  const tops = eligible.filter((i) => categoryGroup(i.category) === "top");
  const bottoms = eligible.filter((i) => categoryGroup(i.category) === "bottom");
  const shoes = eligible.filter((i) => categoryGroup(i.category) === "footwear");
  const accessories = eligible.filter((i) => categoryGroup(i.category) === "accessory");

  const candidates: OutfitSuggestion[] = [];

  // Build outfits that complement the focal item
  if (focalGroup === "footwear") {
    // Styling around shoes: build top + bottom + these shoes
    for (const top of tops.slice(0, 5)) {
      for (const bottom of bottoms.slice(0, 5)) {
        const items = [top, bottom, focalItem];
        
        // Add matching accessories
        const belt = accessories.find(a => 
          a.category === "belts" && a.primaryColour === focalItem.primaryColour
        );
        if (belt) items.push(belt);

        let score = 15;
        score += calculateColorHarmony(items);
        score += calculateOccasionScore(items, targetOccasion);

        // Bonus for color coordination with shoes
        if (focalColor && (top.primaryColour === focalColor || bottom.primaryColour === focalColor)) {
          score += 10;
        }

        candidates.push({
          name: `Outfit with ${focalItem.name}`,
          items,
          occasion: targetOccasion,
          styleDescription: `Styled around your ${focalItem.name}`,
          stylingTip: `Built to showcase your ${focalItem.name.toLowerCase()} with coordinating pieces.`,
          score,
        });
      }
    }
  } else if (focalGroup === "accessory") {
    // Styling around accessory (bag, watch, belt): build complete outfit featuring this accessory
    for (const top of tops.slice(0, 5)) {
      for (const bottom of bottoms.slice(0, 5)) {
        const items = [top, bottom, focalItem];
        
        const shoe = shoes[0];
        if (shoe) items.push(shoe);

        let score = 15;
        score += calculateColorHarmony(items);
        score += calculateOccasionScore(items, targetOccasion);

        candidates.push({
          name: `Outfit with ${focalItem.name}`,
          items,
          occasion: targetOccasion,
          styleDescription: `Featuring your ${focalItem.name}`,
          stylingTip: `A complete look that highlights your ${focalItem.name.toLowerCase()}.`,
          score,
        });
      }
    }
  } else {
    // Original logic for clothing items
    return generateOutfits(allItems, { ...options, limit });
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates.slice(0, limit);
}

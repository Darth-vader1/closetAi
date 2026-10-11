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
}

const NEUTRAL_COLOURS = new Set(["black", "white", "grey", "navy", "beige", "cream", "brown"]);

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

/** Generates outfit combinations from eligible wardrobe garments */
export function generateOutfits(
  allItems: WardrobeItem[],
  options: {
    allowRewearWorn?: boolean;
    targetOccasion?: string | null;
    targetStyle?: string | null;
    limit?: number;
  } = {},
): OutfitSuggestion[] {
  const { allowRewearWorn = false, targetOccasion = null, targetStyle = null, limit = 5 } = options;

  // Filter only ready-to-wear items
  const eligible = allItems.filter((item) => isEligibleStatus(item.status, allowRewearWorn));

  const tops = eligible.filter((i) => categoryGroup(i.category) === "top");
  const bottoms = eligible.filter((i) => categoryGroup(i.category) === "bottom");
  const fullbodies = eligible.filter((i) => categoryGroup(i.category) === "fullbody" || categoryGroup(i.category) === "traditional");
  const shoes = eligible.filter((i) => categoryGroup(i.category) === "footwear");
  const outerwear = eligible.filter((i) => categoryGroup(i.category) === "outerwear");
  const accessories = eligible.filter((i) => categoryGroup(i.category) === "accessory");

  const candidates: OutfitSuggestion[] = [];

  // Formula A: Top + Bottom (+ Footwear + optional Outerwear)
  for (const top of tops) {
    for (const bottom of bottoms) {
      const items: WardrobeItem[] = [top, bottom];

      // Match footwear if available
      const shoe = shoes.find((s) => !targetOccasion || s.occasions.includes(targetOccasion)) ?? shoes[0];
      if (shoe) items.push(shoe);

      // Match outerwear if appropriate
      if (outerwear.length > 0) {
        const coat = outerwear.find((o) => (top.style && o.style === top.style) || (targetOccasion && o.occasions.includes(targetOccasion)));
        if (coat) items.push(coat);
      }

      // Match accessory if available
      if (accessories.length > 0) {
        const acc = accessories.find((a) => targetOccasion && a.occasions.includes(targetOccasion));
        if (acc) items.push(acc);
      }

      let score = 20;
      score += calculateColorHarmony(items);
      score += calculateOccasionScore(items, targetOccasion);

      if (targetStyle && items.some((i) => i.style === targetStyle)) {
        score += 8;
      }

      // Formulate a clean naming & tip
      const occasionLabel = targetOccasion ? targetOccasion.replace("_", " ") : "Daily";
      const name = `${top.name} with ${bottom.name}`;
      const styleDesc = top.style ? `${top.style.replace("_", " ")} look` : "Balanced ensemble";
      const tip = `Pairs ${top.primaryColour || "clean"} tones with ${bottom.name.toLowerCase()} for a cohesive silhouette.`;

      candidates.push({
        name,
        items,
        occasion: targetOccasion,
        styleDescription: styleDesc,
        stylingTip: tip,
        score,
      });
    }
  }

  // Formula B: Fullbody / Dress (+ Footwear + optional Outerwear)
  for (const dress of fullbodies) {
    const items: WardrobeItem[] = [dress];

    const shoe = shoes.find((s) => !targetOccasion || s.occasions.includes(targetOccasion)) ?? shoes[0];
    if (shoe) items.push(shoe);

    const coat = outerwear[0];
    if (coat) items.push(coat);

    let score = 22;
    score += calculateColorHarmony(items);
    score += calculateOccasionScore(items, targetOccasion);

    candidates.push({
      name: `${dress.name} Ensemble`,
      items,
      occasion: targetOccasion,
      styleDescription: dress.style ? `${dress.style.replace("_", " ")} styling` : "Classic look",
      stylingTip: `Let the ${dress.name.toLowerCase()} lead the statement with grounded footwear.`,
      score,
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

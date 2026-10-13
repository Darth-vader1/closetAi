/**
 * Wardrobe taxonomy. Categories are plain slugs in the database (no CHECK constraint), so adding a
 * new one means adding an entry here. `group` is what the outfit engine (Phase 3) uses to build
 * templates, so every category must be assigned to exactly one group.
 */
export type CategoryGroup = "top" | "bottom" | "fullbody" | "outerwear" | "footwear" | "accessory" | "traditional" | "other";

export type CareType = "WASHABLE" | "WIPE_CLEAN" | "NO_WASH";

export interface CategoryDef {
  value: string;
  label: string;
  group: CategoryGroup;
  defaultCareType: CareType;
}

export const CATEGORIES: readonly CategoryDef[] = [
  { value: "t-shirts", label: "T-shirts", group: "top", defaultCareType: "WASHABLE" },
  { value: "shirts", label: "Shirts", group: "top", defaultCareType: "WASHABLE" },
  { value: "polo-shirts", label: "Polo shirts", group: "top", defaultCareType: "WASHABLE" },
  { value: "sweaters", label: "Sweaters", group: "top", defaultCareType: "WASHABLE" },
  { value: "hoodies", label: "Hoodies", group: "top", defaultCareType: "WASHABLE" },
  { value: "trousers", label: "Trousers", group: "bottom", defaultCareType: "WASHABLE" },
  { value: "jeans", label: "Jeans", group: "bottom", defaultCareType: "WASHABLE" },
  { value: "shorts", label: "Shorts", group: "bottom", defaultCareType: "WASHABLE" },
  { value: "jorts", label: "Jorts", group: "bottom", defaultCareType: "WASHABLE" },
  { value: "capri-pants", label: "Capri pants", group: "bottom", defaultCareType: "WASHABLE" },
  { value: "skirts", label: "Skirts", group: "bottom", defaultCareType: "WASHABLE" },
  { value: "dresses", label: "Dresses", group: "fullbody", defaultCareType: "WASHABLE" },
  { value: "jackets", label: "Jackets", group: "outerwear", defaultCareType: "WASHABLE" },
  { value: "windbreakers", label: "Windbreakers", group: "outerwear", defaultCareType: "WASHABLE" },
  { value: "blazers", label: "Blazers", group: "outerwear", defaultCareType: "WASHABLE" },
  { value: "traditional", label: "Traditional clothing", group: "traditional", defaultCareType: "WASHABLE" },
  { value: "shoes", label: "Shoes", group: "footwear", defaultCareType: "WIPE_CLEAN" },
  { value: "sneakers", label: "Sneakers", group: "footwear", defaultCareType: "WIPE_CLEAN" },
  { value: "sandals", label: "Sandals", group: "footwear", defaultCareType: "WIPE_CLEAN" },
  { value: "boots", label: "Boots", group: "footwear", defaultCareType: "WIPE_CLEAN" },
  { value: "belts", label: "Belts", group: "accessory", defaultCareType: "NO_WASH" },
  { value: "watches", label: "Watches", group: "accessory", defaultCareType: "NO_WASH" },
  { value: "bags", label: "Bags", group: "accessory", defaultCareType: "NO_WASH" },
  { value: "hats", label: "Hats", group: "accessory", defaultCareType: "WASHABLE" },
  { value: "caps", label: "Caps", group: "accessory", defaultCareType: "WASHABLE" },
  { value: "sunglasses", label: "Sunglasses", group: "accessory", defaultCareType: "NO_WASH" },
  { value: "jewellery", label: "Jewellery", group: "accessory", defaultCareType: "NO_WASH" },
  { value: "ties", label: "Ties", group: "accessory", defaultCareType: "NO_WASH" },
  { value: "scarves", label: "Scarves", group: "accessory", defaultCareType: "WASHABLE" },
  { value: "socks", label: "Socks", group: "accessory", defaultCareType: "WASHABLE" },
  { value: "underwear", label: "Underwear", group: "accessory", defaultCareType: "WASHABLE" },
  { value: "accessories", label: "Accessories", group: "accessory", defaultCareType: "NO_WASH" },
  { value: "other", label: "Other", group: "other", defaultCareType: "WASHABLE" },
];

export const CATEGORY_VALUES = CATEGORIES.map((c) => c.value) as [string, ...string[]];
export const CARE_TYPES: readonly CareType[] = ["WASHABLE", "WIPE_CLEAN", "NO_WASH"];

const BY_VALUE = new Map(CATEGORIES.map((c) => [c.value, c]));

export function isCategory(value: unknown): value is string {
  return typeof value === "string" && BY_VALUE.has(value);
}

export function categoryLabel(value: string): string {
  return BY_VALUE.get(value)?.label ?? value;
}

export function categoryGroup(value: string): CategoryGroup {
  return BY_VALUE.get(value)?.group ?? "other";
}

export function categoryDefaultCareType(value: string): CareType {
  return BY_VALUE.get(value)?.defaultCareType ?? "WASHABLE";
}

export function careTypeLabel(careType: CareType): string {
  switch (careType) {
    case "WASHABLE":
      return "Washable";
    case "WIPE_CLEAN":
      return "Wipe clean";
    case "NO_WASH":
      return "No wash needed";
  }
}

export function careTypeDescription(careType: CareType): string {
  switch (careType) {
    case "WASHABLE":
      return "Needs regular washing after wear";
    case "WIPE_CLEAN":
      return "Spot clean or wipe as needed";
    case "NO_WASH":
      return "Doesn't need washing";
  }
}

// --- Other fixed vocabularies shared by forms, validation and the AI schema ---------------------

import { COLOUR_OPTIONS, OCCASION_VALUES, STYLE_VALUES } from "@/lib/profile/options";

export const WARDROBE_COLOURS = [...COLOUR_OPTIONS, "multicolour"] as const;
export const PATTERNS = ["solid", "striped", "checked", "plaid", "floral", "graphic", "printed", "polka_dot", "camouflage", "other"] as const;
export const SEASONS = ["spring", "summer", "autumn", "winter", "all_year"] as const;
export const WARMTH_LEVELS = [
  { value: 1, label: "1 · Very light" },
  { value: 2, label: "2 · Light" },
  { value: 3, label: "3 · Medium" },
  { value: 4, label: "4 · Warm" },
  { value: 5, label: "5 · Very warm" },
] as const;

export { OCCASION_VALUES, STYLE_VALUES };

export function humanise(value: string): string {
  const text = value.replaceAll("_", " ").replaceAll("-", " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}

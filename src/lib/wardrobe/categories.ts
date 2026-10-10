/**
 * Wardrobe taxonomy. Categories are plain slugs in the database (no CHECK constraint), so adding a
 * new one means adding an entry here. `group` is what the outfit engine (Phase 3) uses to build
 * templates, so every category must be assigned to exactly one group.
 */
export type CategoryGroup = "top" | "bottom" | "fullbody" | "outerwear" | "footwear" | "accessory" | "traditional" | "other";

export interface CategoryDef {
  value: string;
  label: string;
  group: CategoryGroup;
}

export const CATEGORIES: readonly CategoryDef[] = [
  { value: "t-shirts", label: "T-shirts", group: "top" },
  { value: "shirts", label: "Shirts", group: "top" },
  { value: "polo-shirts", label: "Polo shirts", group: "top" },
  { value: "sweaters", label: "Sweaters", group: "top" },
  { value: "hoodies", label: "Hoodies", group: "top" },
  { value: "trousers", label: "Trousers", group: "bottom" },
  { value: "jeans", label: "Jeans", group: "bottom" },
  { value: "shorts", label: "Shorts", group: "bottom" },
  { value: "skirts", label: "Skirts", group: "bottom" },
  { value: "dresses", label: "Dresses", group: "fullbody" },
  { value: "jackets", label: "Jackets", group: "outerwear" },
  { value: "blazers", label: "Blazers", group: "outerwear" },
  { value: "traditional", label: "Traditional clothing", group: "traditional" },
  { value: "shoes", label: "Shoes", group: "footwear" },
  { value: "sneakers", label: "Sneakers", group: "footwear" },
  { value: "sandals", label: "Sandals", group: "footwear" },
  { value: "boots", label: "Boots", group: "footwear" },
  { value: "belts", label: "Belts", group: "accessory" },
  { value: "watches", label: "Watches", group: "accessory" },
  { value: "bags", label: "Bags", group: "accessory" },
  { value: "hats", label: "Hats", group: "accessory" },
  { value: "accessories", label: "Accessories", group: "accessory" },
  { value: "other", label: "Other", group: "other" },
];

export const CATEGORY_VALUES = CATEGORIES.map((c) => c.value) as [string, ...string[]];

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

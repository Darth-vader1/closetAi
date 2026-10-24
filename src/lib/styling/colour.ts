/**
 * Colour understanding for outfit validation and scoring. Deliberately small and explicit: it maps the
 * app's colour vocabulary onto neutral/chromatic families with an approximate hue, then recognises the
 * intentional schemes stylists use (tonal, analogous, complementary, neutral foundation + accent).
 */
export interface ColourInfo {
  family: string;
  /** Neutrals and earth tones that pair with most things (black, white, grey, navy, beige, cream, brown, olive). */
  neutral: boolean;
  /** Approximate hue angle on a colour wheel, null for achromatic. */
  hue: number | null;
  dark: boolean;
}

const COLOURS: Record<string, ColourInfo> = {
  black: { family: "black", neutral: true, hue: null, dark: true },
  white: { family: "white", neutral: true, hue: null, dark: false },
  grey: { family: "grey", neutral: true, hue: null, dark: false },
  ash: { family: "grey", neutral: true, hue: null, dark: false },
  navy: { family: "navy", neutral: true, hue: 225, dark: true },
  brown: { family: "brown", neutral: true, hue: 25, dark: true },
  beige: { family: "beige", neutral: true, hue: 40, dark: false },
  cream: { family: "cream", neutral: true, hue: 45, dark: false },
  olive: { family: "olive", neutral: true, hue: 75, dark: true },
  red: { family: "red", neutral: false, hue: 0, dark: false },
  burgundy: { family: "burgundy", neutral: false, hue: 350, dark: true },
  pink: { family: "pink", neutral: false, hue: 330, dark: false },
  orange: { family: "orange", neutral: false, hue: 25, dark: false },
  yellow: { family: "yellow", neutral: false, hue: 55, dark: false },
  green: { family: "green", neutral: false, hue: 125, dark: false },
  blue: { family: "blue", neutral: false, hue: 215, dark: false },
  purple: { family: "purple", neutral: false, hue: 275, dark: false },
  multicolour: { family: "multicolour", neutral: false, hue: null, dark: false },
};

export function colourInfo(name: string | null | undefined): ColourInfo | null {
  if (!name) return null;
  return COLOURS[name.trim().toLowerCase()] ?? null;
}

export function normaliseColour(name: string | null | undefined): string | null {
  return colourInfo(name)?.family ?? null;
}

function hueDistance(a: number, b: number): number {
  const d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

export type SchemeKind =
  | "unknown"
  | "tonal"
  | "neutral"
  | "neutral_accent"
  | "analogous"
  | "complementary"
  | "contrast"
  | "clash";

export interface PaletteReading {
  kind: SchemeKind;
  label: string;
  /** 0 (poor) to 1 (excellent). */
  score: number;
  /** 0 none, 1 mild, 2 notable, 3 substantial. */
  clashSeverity: number;
  chromaticFamilies: string[];
}

/**
 * Reads the colour relationship across the clothing and footwear colours of one outfit.
 * Unknown colours are ignored (never guessed); with fewer than two known colours we report "unknown".
 */
export function readPalette(colours: Array<string | null>): PaletteReading {
  const infos = colours.map((c) => colourInfo(c)).filter((c): c is ColourInfo => c !== null);
  if (infos.length < 2) {
    return { kind: "unknown", label: "colours unknown", score: 0.6, clashSeverity: 0, chromaticFamilies: [] };
  }

  const families = new Set(infos.map((i) => i.family));
  const chromatic = [...new Set(infos.filter((i) => !i.neutral).map((i) => i.family))];

  if (families.size === 1) {
    return { kind: "tonal", label: `all ${[...families][0]}`, score: 0.85, clashSeverity: 0, chromaticFamilies: chromatic };
  }
  if (chromatic.length === 0) {
    return { kind: "neutral", label: "a neutral palette", score: 0.95, clashSeverity: 0, chromaticFamilies: [] };
  }

  const hued = infos.filter((i) => !i.neutral && i.hue !== null);
  const unknownHue = infos.some((i) => !i.neutral && i.hue === null); // multicolour piece

  if (chromatic.length === 1) {
    return {
      kind: "neutral_accent",
      label: `neutrals with ${chromatic[0]} as the accent`,
      score: unknownHue ? 0.7 : 0.9,
      clashSeverity: 0,
      chromaticFamilies: chromatic,
    };
  }

  let maxSpan = 0;
  for (const a of hued) for (const b of hued) maxSpan = Math.max(maxSpan, hueDistance(a.hue as number, b.hue as number));

  if (chromatic.length === 2) {
    if (maxSpan <= 60) return { kind: "analogous", label: `analogous ${chromatic.join(" and ")}`, score: 0.8, clashSeverity: 0, chromaticFamilies: chromatic };
    if (maxSpan >= 150) return { kind: "complementary", label: `complementary ${chromatic.join(" and ")}`, score: 0.75, clashSeverity: 0, chromaticFamilies: chromatic };
    return { kind: "contrast", label: `${chromatic.join(" with ")} (contrasting)`, score: 0.5, clashSeverity: 2, chromaticFamilies: chromatic };
  }

  // Three or more distinct chromatic families.
  if (maxSpan <= 90) return { kind: "analogous", label: `analogous ${chromatic.join(", ")}`, score: 0.65, clashSeverity: 1, chromaticFamilies: chromatic };
  return { kind: "clash", label: `${chromatic.length} competing accent colours`, score: 0.2, clashSeverity: 3, chromaticFamilies: chromatic };
}

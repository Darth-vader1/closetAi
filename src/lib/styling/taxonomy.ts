/**
 * Garment understanding: turns a wardrobe row (category slug + free-text name/subcategory + metadata)
 * into a normalised GarmentProfile using a controlled vocabulary.
 *
 * Principles:
 *  - Evidence over guesses. Text evidence (name / subcategory) beats the category slug, because users and
 *    the vision model often file chinos under "trousers" or trainers under "shoes".
 *  - If the text and the category disagree about the garment's ROLE (e.g. category "shorts" but the name
 *    says "chinos"), confidence drops to "low" and the item cannot fill an essential role until corrected.
 *  - We never invent material, size or brand. Warmth is only taken from the user's value or a clearly typical
 *    default for the garment type, and that is recorded in `evidence`.
 */
import { categoryGroup } from "@/lib/wardrobe/categories";
import type { WardrobeItem } from "@/lib/wardrobe/queries";
import { normaliseColour } from "@/lib/styling/colour";
import type { Confidence, GarmentProfile, GarmentRole, GarmentType, Silhouette } from "@/lib/styling/types";

interface TypeDef {
  type: GarmentType;
  role: GarmentRole;
  formality: number;
  athletic?: boolean;
  /** Typical warmth for the type (1-5). Only used as a fallback and recorded as evidence. */
  warmth?: number;
  layering?: boolean;
  length?: "short" | "mid" | "long";
}

export const TYPE_DEFS: Record<GarmentType, TypeDef> = {
  t_shirt: { type: "t_shirt", role: "top", formality: 2, warmth: 1 },
  shirt: { type: "shirt", role: "top", formality: 3, warmth: 2 },
  dress_shirt: { type: "dress_shirt", role: "top", formality: 4, warmth: 2 },
  polo: { type: "polo", role: "top", formality: 3, warmth: 1 },
  blouse: { type: "blouse", role: "top", formality: 3, warmth: 1 },
  sweater: { type: "sweater", role: "top", formality: 3, warmth: 4, layering: true },
  hoodie: { type: "hoodie", role: "top", formality: 1, warmth: 4, layering: true },
  cardigan: { type: "cardigan", role: "top", formality: 3, warmth: 3, layering: true },
  tank_top: { type: "tank_top", role: "top", formality: 1, warmth: 1, length: "short" },
  crop_top: { type: "crop_top", role: "top", formality: 1, warmth: 1, length: "short" },
  athletic_top: { type: "athletic_top", role: "top", formality: 1, athletic: true, warmth: 1 },
  traditional_top: { type: "traditional_top", role: "top", formality: 4, warmth: 2 },

  jeans: { type: "jeans", role: "bottom", formality: 2, warmth: 3, length: "long" },
  chinos: { type: "chinos", role: "bottom", formality: 3, warmth: 2, length: "long" },
  tailored_trousers: { type: "tailored_trousers", role: "bottom", formality: 4, warmth: 2, length: "long" },
  cargo_pants: { type: "cargo_pants", role: "bottom", formality: 2, warmth: 2, length: "long" },
  joggers: { type: "joggers", role: "bottom", formality: 1, athletic: true, warmth: 3, length: "long" },
  shorts: { type: "shorts", role: "bottom", formality: 1, warmth: 1, length: "short" },
  jorts: { type: "jorts", role: "bottom", formality: 1, warmth: 1, length: "short" },
  athletic_shorts: { type: "athletic_shorts", role: "bottom", formality: 1, athletic: true, warmth: 1, length: "short" },
  leggings: { type: "leggings", role: "bottom", formality: 1, athletic: true, warmth: 2, length: "long" },
  skirt: { type: "skirt", role: "bottom", formality: 3, warmth: 1 },
  capri_pants: { type: "capri_pants", role: "bottom", formality: 2, warmth: 1, length: "mid" },
  generic_trousers: { type: "generic_trousers", role: "bottom", formality: 3, warmth: 2, length: "long" },

  dress: { type: "dress", role: "onepiece", formality: 3, warmth: 1 },
  jumpsuit: { type: "jumpsuit", role: "onepiece", formality: 3, warmth: 2 },
  romper: { type: "romper", role: "onepiece", formality: 2, warmth: 1, length: "short" },
  traditional_set: { type: "traditional_set", role: "onepiece", formality: 4, warmth: 2 },

  jacket: { type: "jacket", role: "outer", formality: 3, warmth: 3, layering: true },
  blazer: { type: "blazer", role: "outer", formality: 4, warmth: 2, layering: true },
  coat: { type: "coat", role: "outer", formality: 4, warmth: 5, layering: true },
  overshirt: { type: "overshirt", role: "outer", formality: 2, warmth: 2, layering: true },
  windbreaker: { type: "windbreaker", role: "outer", formality: 1, warmth: 1, athletic: true, layering: true },
  track_jacket: { type: "track_jacket", role: "outer", formality: 1, warmth: 2, athletic: true, layering: true },

  sneakers: { type: "sneakers", role: "shoes", formality: 2 },
  loafers: { type: "loafers", role: "shoes", formality: 4 },
  dress_shoes: { type: "dress_shoes", role: "shoes", formality: 5 },
  boots: { type: "boots", role: "shoes", formality: 3, warmth: 3 },
  sandals: { type: "sandals", role: "shoes", formality: 1, warmth: 1 },
  slides: { type: "slides", role: "shoes", formality: 1, warmth: 1 },
  heels: { type: "heels", role: "shoes", formality: 4 },
  flats: { type: "flats", role: "shoes", formality: 3 },
  generic_shoes: { type: "generic_shoes", role: "shoes", formality: 3 },

  belt: { type: "belt", role: "accessory", formality: 3 },
  watch: { type: "watch", role: "accessory", formality: 3 },
  bag: { type: "bag", role: "accessory", formality: 3 },
  hat: { type: "hat", role: "accessory", formality: 2 },
  cap: { type: "cap", role: "accessory", formality: 1 },
  sunglasses: { type: "sunglasses", role: "accessory", formality: 3 },
  jewellery: { type: "jewellery", role: "accessory", formality: 3 },
  tie: { type: "tie", role: "accessory", formality: 5 },
  scarf: { type: "scarf", role: "accessory", formality: 3, warmth: 2 },
  other_accessory: { type: "other_accessory", role: "accessory", formality: 3 },

  socks: { type: "socks", role: "excluded", formality: 1 },
  underwear: { type: "underwear", role: "excluded", formality: 1 },
  wig: { type: "wig", role: "excluded", formality: 3 },
  unknown: { type: "unknown", role: "unknown", formality: 3 },
};

/** Ordered text rules. First match wins, so specific phrases come before generic ones. */
const TEXT_RULES: Array<[GarmentType, RegExp]> = [
  ["underwear", /\b(underwear|boxers?|briefs?|panties|bras?|lingerie|singlet)\b/],
  ["socks", /\bsocks?\b/],
  ["athletic_shorts", /\b(gym|athletic|running|training|sport|basketball|football|workout|track|sweat|drawstring|elastic[- ]?waist) (?:shorts?|jorts?)\b/],
  ["jorts", /\bjorts?\b|\bdenim shorts?\b/],
  ["shorts", /\bcargo shorts?\b/],
  ["dress_shirt", /\b(dress|formal|button[- ]?(?:up|down)|oxford|tuxedo) shirts?\b|\bbutton[- ]?(?:up|down)\b/],
  ["dress_shoes", /\b(dress shoes?|oxfords?|derbys?|brogues?|monk straps?|formal shoes?)\b/],
  ["track_jacket", /\b(track|training|bomber track) jackets?\b/],
  ["windbreaker", /\bwind ?breakers?\b|\brain jackets?\b|\bwindcheater\b/],
  ["blazer", /\bblazers?\b|\bsuit jackets?\b|\bsport coats?\b/],
  ["overshirt", /\bovershirts?\b|\bshackets?\b/],
  ["coat", /\b(coats?|trench|parka|overcoat|puffer)\b/],
  ["jacket", /\b(jackets?|bomber|varsity|denim jacket)\b/],
  ["traditional_set", /\b(agbada|aso[- ]?oke|aso[- ]?ebi|kaftan|caftan|senator|ankara|dashiki|buba|danshiki|boubou|abaya|jalabiya|kente)\b/],
  ["tailored_trousers", /\b(tailored|dress|formal|suit|pleated|slacks?|office) (pants|trousers)\b|\bslacks\b/],
  ["jumpsuit", /\bjumpsuits?\b/],
  ["romper", /\brompers?\b|\bplaysuits?\b/],
  ["dress", /\b(dress|gown|sundress|maxi|midi dress)\b/],
  ["leggings", /\bleggings?\b|\byoga pants\b|\btights\b/],
  ["joggers", /\b(joggers?|sweat ?pants|track ?pants|track bottoms|trackies|jogging bottoms)\b|\b(elastic[- ]?waist|drawstring|drawing strings?)\b.*\b(trousers?|pants?|bottoms?)\b|\b(trousers?|pants?|bottoms?)\b.*\b(elastic[- ]?waist|drawstring|drawing strings?)\b/],
  ["cargo_pants", /\bcargo(?:s| pants| trousers)?\b/],
  ["chinos", /\bchinos?\b|\bkhakis?\b/],
  ["tailored_trousers", /\b(tailored|dress|formal|suit|pleated|slacks?|office) (pants|trousers)\b|\bslacks\b/],
  ["jeans", /\bjeans?\b|\bdenim (pants|trousers)\b/],
  ["capri_pants", /\bcapri/],
  ["shorts", /\bshorts\b|\bbermudas?\b/],
  ["skirt", /\bskirts?\b|\bskort\b/],
  ["loafers", /\bloafers?\b|\bmoccasins?\b/],
  ["heels", /\b(heels?|pumps?|stilettos?|wedges?|platforms?)\b/],
  ["flats", /\b(flats?|ballet|ballerinas?|mules?)\b/],
  ["boots", /\bboots?\b|\bchelsea\b|\btimberland/],
  ["slides", /\bslides?\b|\bflip[- ]?flops?\b|\bslippers?\b|\bpalm slippers?\b/],
  ["sandals", /\bsandals?\b/],
  ["sneakers", /\b(sneakers?|trainers?|kicks|running shoes?|air force|jordans?|runners?|tennis shoes?)\b/],
  ["hoodie", /\bhood(?:ie|y|ies)\b|\bsweatshirts?\b|\bpullover\b/],
  ["cardigan", /\bcardigans?\b/],
  ["sweater", /\b(sweaters?|jumpers?|knit(?:wear)?|turtleneck|pullovers?)\b/],
  ["polo", /\bpolo\b/],
  ["blouse", /\bblouses?\b/],
  ["tank_top", /\b(tank tops?|tanks?|vests?|camisoles?|sleeveless)\b/],
  ["crop_top", /\bcrop(?:ped)? (top|tee|t-shirt)s?\b|\bbralette\b/],
  ["athletic_top", /\b(jerseys?|gym (tee|top|shirt)s?|athletic (tee|top|shirt)s?|performance (tee|top|shirt)s?|dri-?fit|sports bra|compression|workout (top|tee|shirt))\b/],
  ["t_shirt", /\b(t-?shirts?|tees?|tee-shirts?|henley)\b/],
  ["shirt", /\bshirts?\b/],
  ["belt", /\bbelts?\b/],
  ["watch", /\bwatch(?:es)?\b/],
  ["bag", /\b(bags?|backpacks?|handbags?|clutch|tote|satchel|crossbody|purse|briefcase)\b/],
  ["cap", /\b(caps?|snapback|beanie)\b/],
  ["hat", /\bhats?\b|\bbucket\b|\bfedora\b/],
  ["sunglasses", /\b(sunglasses|shades|glasses)\b/],
  ["jewellery", /\b(necklace|bracelet|ring|earrings?|chain|pendant|jewel+ery|anklet|bangle|beads?)\b/],
  ["tie", /\b(necktie|bow ?tie|tie)\b/],
  ["scarf", /\b(scarf|scarves|shawl|stole|bandana)\b/],
  ["generic_trousers", /\b(trousers?|pants?)\b/],
  ["generic_shoes", /\bshoes?\b|\bfootwear\b/],
];

const CATEGORY_DEFAULT: Record<string, GarmentType> = {
  "t-shirts": "t_shirt",
  shirts: "shirt",
  "polo-shirts": "polo",
  sweaters: "sweater",
  hoodies: "hoodie",
  cardigans: "cardigan",
  blouses: "blouse",
  "tank-tops": "tank_top",
  "crop-tops": "crop_top",
  trousers: "generic_trousers",
  chinos: "chinos",
  jeans: "jeans",
  shorts: "shorts",
  jorts: "jorts",
  "capri-pants": "capri_pants",
  "cargo-pants": "cargo_pants",
  joggers: "joggers",
  leggings: "leggings",
  skirts: "skirt",
  dresses: "dress",
  jackets: "jacket",
  windbreakers: "windbreaker",
  blazers: "blazer",
  traditional: "traditional_set",
  shoes: "generic_shoes",
  sneakers: "sneakers",
  sandals: "sandals",
  boots: "boots",
  loafers: "loafers",
  "dress-shoes": "dress_shoes",
  heels: "heels",
  flats: "flats",
  slides: "slides",
  belts: "belt",
  watches: "watch",
  bags: "bag",
  hats: "hat",
  caps: "cap",
  wigs: "wig",
  sunglasses: "sunglasses",
  jewellery: "jewellery",
  ties: "tie",
  scarves: "scarf",
  socks: "socks",
  underwear: "underwear",
  accessories: "other_accessory",
};

const SILHOUETTE_RULES: Array<[Silhouette, RegExp]> = [
  ["skinny", /\bskinny\b|\bsuper slim\b|\bsecond[- ]skin\b/],
  ["oversized", /\boversized?\b|\bboxy\b|\bbaggy\b|\bdrop[- ]shoulder\b/],
  ["wide", /\bwide[- ]?leg\b|\bwide\b|\bpalazzo\b|\bflared?\b|\bloose\b/],
  ["relaxed", /\brelaxed\b|\bstraight\b|\bdad\b/],
  ["slim", /\bslim\b|\bfitted\b|\btapered\b/],
  ["cropped", /\bcropped\b/],
];

const ATHLETIC_TEXT = /\b(gym|athletic|athleisure|running|training|performance|dri-?fit|workout|jogging|sports?|activewear|track)\b/;

function text(item: WardrobeItem): string {
  return `${item.name ?? ""} ${item.subcategory ?? ""}`.toLowerCase().replace(/[_]+/g, " ");
}

export function matchTextType(value: string, preferredRole?: GarmentRole): GarmentType | null {
  const t = value
    .toLowerCase()
    .replace(/\b(?:short|long|three[- ]quarter|cap|half)[- ]sleeve(?:d|s)?\b/g, " ");
  for (const [type, re] of TEXT_RULES) {
    if (preferredRole && TYPE_DEFS[type].role !== preferredRole) continue;
    if (re.test(t)) return type;
  }
  return null;
}

function categoryType(category: string): GarmentType | null {
  return CATEGORY_DEFAULT[category] ?? null;
}

function roleOfCategoryGroup(category: string): GarmentRole {
  switch (categoryGroup(category)) {
    case "top": return "top";
    case "bottom": return "bottom";
    case "fullbody": return "onepiece";
    case "traditional": return "onepiece";
    case "outerwear": return "outer";
    case "footwear": return "shoes";
    case "accessory": return "accessory";
    default: return "unknown";
  }
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

/** Detect a sleeve / neckline / length descriptor purely from text, so it can be shown and edited. */
export function readDescriptors(item: WardrobeItem) {
  const t = text(item);
  const sleeve = /\bsleeveless\b|\btank\b/.test(t) ? "sleeveless" : /\bshort[- ]sleeve/.test(t) ? "short" : /\blong[- ]sleeve/.test(t) ? "long" : null;
  const neckline = /\bv[- ]?neck\b/.test(t) ? "v-neck" : /\bcrew\b/.test(t) ? "crew" : /\bturtle|polo neck\b/.test(t) ? "turtleneck" : /\bcollar/.test(t) ? "collar" : null;
  return { sleeve, neckline };
}

export function profileGarment(item: WardrobeItem): GarmentProfile {
  const t = text(item);
  const evidence: string[] = [];
  let textType = matchTextType(t);
  const catType = categoryType(item.category);
  const catRole = roleOfCategoryGroup(item.category);

  let type: GarmentType = "unknown";
  let confidence: Confidence = "unknown";

  if (textType) {
    let textRole = TYPE_DEFS[textType].role;
    // If a secondary modifier word (e.g. "windbreaker" in "Grey elastic waist trousers windbreaker")
    // matched another role, check whether the text also explicitly names a garment matching `catRole`.
    if (catRole !== "unknown" && textRole !== catRole && textRole !== "excluded") {
      const roleAlignedType = matchTextType(t, catRole);
      if (roleAlignedType) {
        textType = roleAlignedType;
        textRole = TYPE_DEFS[roleAlignedType].role;
      }
    }

    type = textType;
    evidence.push(`name/subcategory suggests ${textType}`);
    if (catRole === "unknown") {
      confidence = "medium";
      evidence.push("category is 'other'/unrecognised");
    } else if (textRole === catRole || textRole === "excluded") {
      confidence = "high";
    } else if (catRole === "top" && textRole === "outer" && TYPE_DEFS[textType].layering) {
      // e.g. a "jacket" filed under hoodies: ambiguous but not contradictory in role terms.
      confidence = "medium";
      evidence.push(`category ${item.category} vs name ${textType}`);
    } else {
      confidence = "low";
      evidence.push(`category "${item.category}" conflicts with the name (${textType})`);
    }
  } else if (catType) {
    type = catType;
    confidence = "medium";
    evidence.push(`from category "${item.category}" only`);
  }

  if (type === "unknown" && catRole !== "unknown") {
    // A known group but no specific type (should be rare).
    confidence = "low";
  }

  const def = TYPE_DEFS[type];
  const style = (item.style ?? "").toLowerCase();

  let formality = def.formality;
  if (style === "formal" && def.role !== "accessory") formality = Math.max(formality, 4);
  if ((style === "business_casual" || style === "smart_casual") && ["top", "bottom", "outer"].includes(def.role)) {
    formality = Math.max(formality, 3);
  }
  if (style === "sporty" && def.role !== "accessory") formality = Math.min(formality, 2);
  formality = clamp(formality, 1, 5);

  const nonAthleticFootwear = type === "sandals" || type === "slides" || type === "loafers" || type === "dress_shoes" || type === "boots" || type === "heels" || type === "flats";
  const athletic =
    Boolean(def.athletic) ||
    (def.role !== "accessory" &&
      !nonAthleticFootwear &&
      (style === "sporty" || item.occasions.includes("sport") || ATHLETIC_TEXT.test(t)));

  let silhouette: Silhouette | null = null;
  for (const [s, re] of SILHOUETTE_RULES) {
    if (re.test(t)) {
      silhouette = s;
      break;
    }
  }
  if (!silhouette && type === "jeans" && /\bstraight\b/.test(t)) silhouette = "regular";

  const warmth = item.warmthLevel ?? def.warmth ?? null;
  if (item.warmthLevel == null && def.warmth != null) evidence.push(`warmth ${def.warmth} is the typical value for ${type}`);

  const role = def.role;
  const usable = role !== "excluded" && role !== "unknown";

  return {
    item,
    id: item.id,
    role,
    type,
    formality,
    athletic,
    warmth,
    silhouette,
    length: def.length ?? null,
    colour: normaliseColour(item.primaryColour),
    pattern: item.pattern ?? null,
    confidence,
    evidence,
    layering: Boolean(def.layering),
    usable,
  };
}

/** Garment types that are fine to fill an essential role (confidence at least medium). */
export function isReliable(p: GarmentProfile): boolean {
  return p.usable && (p.confidence === "high" || p.confidence === "medium");
}

export function typeLabel(type: GarmentType): string {
  return type.replace(/_/g, " ");
}

export const FORMAL_TYPES: ReadonlySet<GarmentType> = new Set(["dress_shirt", "tailored_trousers", "blazer", "loafers", "dress_shoes", "heels", "tie", "chinos", "coat"]);
export const CASUAL_ONLY_BOTTOMS: ReadonlySet<GarmentType> = new Set(["shorts", "jorts", "athletic_shorts", "joggers", "leggings", "cargo_pants", "capri_pants"]);

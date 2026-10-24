/**
 * Request understanding: converts a natural-language styling request into STRUCTURED constraints before
 * any candidate is generated. Deterministic by design (the AI may refine wording, but ownership,
 * exclusions, anchors and dress code must never depend on a model's mood).
 *
 * Mandatory vs preference:
 *  - mandatory: anchor items, forbidden items/colours/types, explicit palettes ("all black"), required colours,
 *    a strict dress code (formal event, interview, gym).
 *  - preference: styles (unless "only"/"strictly"), simple/polished/comfortable, preferred colours.
 */
import { colourInfo } from "@/lib/styling/colour";
import { matchTextType, TYPE_DEFS } from "@/lib/styling/taxonomy";
import type {
  DressCode,
  ForbiddenRule,
  GarmentProfile,
  GarmentType,
  Silhouette,
  StylingConstraints,
  WeatherContext,
} from "@/lib/styling/types";
import { isEligibleStatus } from "@/lib/wardrobe/status";

const COLOUR_WORDS = [
  "black", "white", "grey", "gray", "ash", "navy", "blue", "green", "olive", "brown", "beige", "cream",
  "red", "burgundy", "pink", "orange", "yellow", "purple", "maroon", "wine", "khaki",
];

function canonicalColour(word: string): string | null {
  const w = word.toLowerCase();
  if (w === "gray") return "grey";
  if (w === "maroon" || w === "wine") return "burgundy";
  if (w === "khaki") return "beige";
  return colourInfo(w) ? w : null;
}

/** When the user names a broad group, expand to every type that group plausibly covers. */
const EXPAND: Partial<Record<GarmentType, GarmentType[]>> = {
  shorts: ["shorts", "jorts", "athletic_shorts"],
  shirt: ["shirt", "dress_shirt"],
  jacket: ["jacket", "track_jacket", "windbreaker", "overshirt"],
  generic_trousers: ["generic_trousers", "tailored_trousers", "chinos", "cargo_pants", "joggers"],
  sneakers: ["sneakers"],
  cap: ["cap", "hat"],
  hat: ["hat", "cap"],
  sweater: ["sweater", "cardigan"],
};

function expandTypes(type: GarmentType): GarmentType[] {
  return EXPAND[type] ?? [type];
}

export function matchesForbidden(rule: ForbiddenRule, p: GarmentProfile): boolean {
  if (rule.types && !rule.types.includes(p.type)) return false;
  if (rule.roles && !rule.roles.includes(p.role)) return false;
  if (rule.colours && (!p.colour || !rule.colours.includes(p.colour))) return false;
  if (rule.silhouettes && (!p.silhouette || !rule.silhouettes.includes(p.silhouette))) return false;
  if (rule.formalityAtLeast !== undefined && p.formality < rule.formalityAtLeast) return false;
  if (rule.athletic !== undefined && p.athletic !== rule.athletic) return false;
  return true;
}

// -- Forbidden phrases ------------------------------------------------------------------------------

const NEGATION =
  /\b(?:no|avoid|without|skip|exclude|excluding|never|nothing|stay away from|don'?t (?:want|use|wear|include|put|like|pair|give me)|do not (?:want|use|wear|include|put|like|pair|give me))\s+((?:(?:any|the|my|those|these|a|an|too|very)\s+)*)([^.;,!?\n]+?)(?=\s+and\s+(?:no|avoid|without|never)\b|\s+(?:but|please|because|since|so|when|if)\b|[.;,!?\n]|$)/gi;

const SILHOUETTE_WORDS: Array<[Silhouette, RegExp]> = [
  ["skinny", /\b(skinny|tight|super slim)\b/],
  ["oversized", /\b(oversized?|baggy|boxy)\b/],
  ["wide", /\b(wide[- ]?leg|wide|flared?)\b/],
  ["cropped", /\bcropped\b/],
];

function parseForbiddenPiece(piece: string, phrase: string): ForbiddenRule | null {
  const p = piece.trim().toLowerCase();
  if (!p) return null;
  const rule: ForbiddenRule = { phrase };
  let matched = false;

  for (const [s, re] of SILHOUETTE_WORDS) {
    if (re.test(p)) {
      rule.silhouettes = [...(rule.silhouettes ?? []), s];
      matched = true;
    }
  }
  const colours = COLOUR_WORDS.filter((c) => new RegExp(`\\b${c}\\b`).test(p)).map(canonicalColour).filter((c): c is string => c !== null);
  if (colours.length) {
    rule.colours = [...new Set(colours)];
    matched = true;
  }
  const type = matchTextType(p.replace(/\b(skinny|tight|baggy|oversized?|wide)\b/g, "").trim() || p);
  if (type && type !== "unknown") {
    rule.types = expandTypes(type);
    matched = true;
  }
  if (/\b(formal(?:wear| wear)?|dressy|suits?|tailored|smart)\b/.test(p) && !rule.types) {
    rule.formalityAtLeast = 4;
    matched = true;
  }
  if (/\b(sporty|athletic|athleisure|activewear|gym)\b/.test(p)) {
    rule.athletic = true;
    matched = true;
  }
  if (/\b(shoes|footwear)\b/.test(p) && !rule.types) {
    rule.roles = ["shoes"];
    matched = true;
  }
  if (/\b(accessor(?:y|ies)|jewell?ery)\b/.test(p) && !rule.types) {
    rule.roles = ["accessory"];
    matched = true;
  }
  if (/\b(layers?|outerwear)\b/.test(p) && !rule.types) {
    rule.roles = ["outer"];
    matched = true;
  }
  return matched ? rule : null;
}

function parseForbidden(text: string): { rules: ForbiddenRule[]; unsupported: string[] } {
  const rules: ForbiddenRule[] = [];
  const unsupported: string[] = [];
  for (const m of text.matchAll(NEGATION)) {
    const body = m[2].trim();
    const phrase = `${m[0].split(/\s+/)[0]} ${body}`.trim();
    const pieces = body.split(/\s*(?:,|\/|\bor\b|\band\b)\s*/i).filter(Boolean);
    let any = false;
    for (const piece of pieces) {
      const rule = parseForbiddenPiece(piece, phrase);
      if (rule) {
        rules.push(rule);
        any = true;
      }
    }
    if (!any) unsupported.push(phrase);
  }
  return { rules, unsupported };
}

// -- Occasion / dress code -------------------------------------------------------------------------

interface OccasionRule {
  re: RegExp;
  occasion: string;
  dressCode: DressCode;
}

const OCCASION_RULES: OccasionRule[] = [
  { re: /\b(wedding|gala|black[- ]tie|prom|formal event|formal dinner|funeral|graduation|award)\b/, occasion: "formal_event", dressCode: "formal" },
  { re: /\b(interview|office|work|meeting|business|presentation|internship|corporate|client)\b/, occasion: "work", dressCode: "business" },
  { re: /\b(owambe|aso[- ]?ebi|traditional|native wear|engagement|naming ceremony|cultural)\b/, occasion: "traditional_event", dressCode: "traditional" },
  { re: /\b(church|worship|mosque|thanksgiving|sunday best|jumu'?ah|service)\b/, occasion: "worship", dressCode: "worship" },
  { re: /\b(gym|workout|work out|training|exercise|run(?:ning)?\b|jog(?:ging)?|football|basketball|yoga|pilates|sport session|playing sports?)\b/, occasion: "sport", dressCode: "athletic" },
  { re: /\b(date|dinner|party|night out|club|lounge|birthday|brunch)\b/, occasion: "date", dressCode: "smart_casual" },
  { re: /\b(school|campus|class|lecture|university|uni)\b/, occasion: "school", dressCode: "casual" },
  { re: /\b(travel|trip|flight|airport|road trip)\b/, occasion: "travel", dressCode: "casual" },
  { re: /\b(casual|weekend|errands?|coffee|hang ?out|chill|everyday|relax)\b/, occasion: "everyday", dressCode: "casual" },
];

const OCCASION_VALUE_TO_CODE: Record<string, DressCode> = {
  formal_event: "formal",
  work: "business",
  traditional_event: "traditional",
  worship: "worship",
  sport: "athletic",
  party: "smart_casual",
  date: "smart_casual",
  school: "casual",
  travel: "casual",
  everyday: "casual",
};

const DRESS_PRIORITY: DressCode[] = ["formal", "business", "traditional", "worship", "athletic", "smart_casual", "casual", "none"];

export function dressCodeFor(occasion: string | null | undefined): DressCode {
  if (!occasion) return "none";
  return OCCASION_VALUE_TO_CODE[occasion] ?? OCCASION_RULES.find((r) => r.re.test(occasion.toLowerCase()))?.dressCode ?? "none";
}

// -- Styles ----------------------------------------------------------------------------------------

const STYLE_WORDS: Array<[string, RegExp]> = [
  ["streetwear", /\b(street ?wear|street style|urban)\b/],
  ["smart_casual", /\bsmart[- ]casual\b/],
  ["business_casual", /\bbusiness[- ]casual\b/],
  ["minimalist", /\b(minimalist|minimalism|minimal)\b/],
  ["sporty", /\b(sporty|athleisure|athletic[- ]inspired|gym ?wear|sportswear|athletic)\b/],
  ["formal", /\b(formal|tailored|suited|dressy)\b/],
  ["traditional", /\b(traditional|native|owambe|aso[- ]?ebi)\b/],
  ["casual", /\b(casual|laid[- ]back|relaxed)\b/],
  ["classic", /\bclassic\b/],
  ["preppy", /\bpreppy\b/],
  ["vintage", /\b(vintage|retro)\b/],
  ["y2k", /\by2k\b/],
  ["bohemian", /\b(boho|bohemian)\b/],
  ["edgy", /\bedgy\b/],
];

// -- Anchors ---------------------------------------------------------------------------------------

const ANCHOR_TRIGGER =
  /\b(?:wear|use|using|build|style|around|match|pair|include|including|featuring|with|rock|wearing|incorporate|from|keep|to go with|go with|goes with)\b/;
const POSSESSIVE = /\b(?:my|these|this|that|those|the)\s+$/;

interface Mention {
  type: GarmentType;
  start: number;
  end: number;
  colour: string | null;
  anchored: boolean;
  phrase: string;
}

/** Finds garment-type words in the text and decides whether each one names a specific owned item. */
function findMentions(text: string, forbiddenSpans: Array<[number, number]>): Mention[] {
  const lower = text.toLowerCase();
  const mentions: Mention[] = [];
  const typeRegexes = collectTypeRegexes();
  const seen = new Set<number>();

  for (const [type, re] of typeRegexes) {
    const g = new RegExp(re.source, "g");
    for (const m of lower.matchAll(g)) {
      const start = m.index ?? 0;
      const end = start + m[0].length;
      if (seen.has(start)) continue;
      if (forbiddenSpans.some(([a, b]) => start >= a && end <= b)) continue;
      seen.add(start);

      const before = lower.slice(Math.max(0, start - 40), start);
      const words = before.trim().split(/\s+/).slice(-3);
      let colour: string | null = null;
      for (const w of words) {
        const c = canonicalColour(w.replace(/[^a-z]/g, ""));
        if (c) colour = c;
      }
      const clause = lower.slice(Math.max(0, lower.lastIndexOf(".", start) + 1), start);
      const hasPossessive = POSSESSIVE.test(before.replace(new RegExp(`(?:${COLOUR_WORDS.join("|")})\\s+`, "g"), "").replace(/(?:\w+\s+){0,2}$/, (x) => (POSSESSIVE.test(before) ? "" : x)));
      const directPossessive = /\b(?:my|these|this|that|those)\b/.test(words.join(" "));
      const anchored = directPossessive || hasPossessive || (ANCHOR_TRIGGER.test(clause) && colour !== null);
      mentions.push({ type, start, end, colour, anchored, phrase: lower.slice(Math.max(0, start - 20), end).trim() });
    }
  }
  return mentions.sort((a, b) => a.start - b.start);
}

let _typeRegexCache: Array<[GarmentType, RegExp]> | null = null;
function collectTypeRegexes(): Array<[GarmentType, RegExp]> {
  if (_typeRegexCache) return _typeRegexCache;
  // Re-derive regexes by probing the shared matcher with each canonical word. Keeps one source of truth.
  const words: Array<[GarmentType, string]> = [
    ["t_shirt", "t-shirts?|tees?"], ["shirt", "shirts?"], ["polo", "polos?"], ["hoodie", "hoodies|hoodie|sweatshirts?"],
    ["sweater", "sweaters?|jumpers?"], ["cardigan", "cardigans?"], ["jeans", "jeans?"], ["chinos", "chinos?|khakis?"],
    ["joggers", "joggers?|sweatpants|track ?pants"], ["cargo_pants", "cargos?|cargo pants"], ["shorts", "shorts?"], ["jorts", "jorts?"],
    ["leggings", "leggings?"], ["skirt", "skirts?"], ["dress", "dresses|dress"], ["jumpsuit", "jumpsuits?"],
    ["generic_trousers", "trousers?|pants"], ["jacket", "jackets?"], ["blazer", "blazers?"], ["coat", "coats?"],
    ["windbreaker", "windbreakers?"], ["sneakers", "sneakers?|trainers?"], ["loafers", "loafers?"], ["boots", "boots?"],
    ["sandals", "sandals?"], ["slides", "slides?"], ["heels", "heels?"], ["dress_shoes", "dress shoes|oxfords?"],
    ["generic_shoes", "shoes?"], ["belt", "belts?"], ["watch", "watch(?:es)?"], ["bag", "bags?|backpacks?"],
    ["cap", "caps?"], ["hat", "hats?"], ["sunglasses", "sunglasses|shades"], ["scarf", "scarf|scarves"], ["tie", "ties?"],
    ["traditional_set", "agbada|kaftan|senator|ankara|aso[- ]?oke|buba"],
  ];
  _typeRegexCache = words.map(([t, src]) => [t, new RegExp(`\\b(?:${src})\\b`)]);
  return _typeRegexCache;
}

function nameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !["sample", "the", "and", "with"].includes(w));
}

// -- Main parser -----------------------------------------------------------------------------------

export interface ParseOptions {
  /** Occasion value passed by the UI (OCCASION_VALUES) or free text. */
  occasion?: string | null;
  allowRewearWorn: boolean;
  /** Item ids explicitly chosen in the UI. */
  anchorItemIds?: string[];
  excludeItemIds?: string[];
}

export function emptyConstraints(prompt = ""): StylingConstraints {
  return {
    effectivePrompt: prompt,
    revised: false,
    anchorGroups: [],
    unavailableAnchors: [],
    unmatchedAnchors: [],
    forbidden: [],
    styles: [],
    styleMandatory: false,
    palette: null,
    requiredColours: [],
    preferredColours: [],
    dressCode: "none",
    occasion: null,
    allowBold: false,
    simple: false,
    polished: false,
    comfortable: false,
    hotHint: false,
    coolHint: false,
    avoidRepeatDays: null,
    allowRepeat: false,
    minDaysSinceWorn: null,
    wantsDifferent: false,
    wantsPartial: false,
    allowShopping: false,
    conflicts: [],
    unsupported: [],
  };
}

const REVISION_MARKER = /\b(actually|on second thought|scratch that|never ?mind|changed my mind|no wait|wait,|instead(?! of))\b/gi;

export function parseConstraints(prompt: string, owned: GarmentProfile[], options: ParseOptions): StylingConstraints {
  const c = emptyConstraints(prompt);
  const full = prompt.trim();

  // 1. "Changes mind halfway": positive constraints come from the last revision; exclusions persist.
  let effective = full;
  const markers = [...full.matchAll(REVISION_MARKER)];
  if (markers.length) {
    const last = markers[markers.length - 1];
    const after = full.slice((last.index ?? 0) + last[0].length).replace(/^[\s,:.-]+/, "");
    if (after.length >= 4) {
      effective = after;
      c.revised = true;
    }
  }
  c.effectivePrompt = effective;

  // 2. Exclusions (from the whole text, so "no hoodies, actually make it dressier" keeps the exclusion).
  const forb = parseForbidden(full);
  c.forbidden.push(...forb.rules);
  c.unsupported.push(...forb.unsupported);

  const forbiddenSpans: Array<[number, number]> = [];
  const lowerEffective = effective.toLowerCase();
  for (const m of lowerEffective.matchAll(NEGATION)) forbiddenSpans.push([m.index ?? 0, (m.index ?? 0) + m[0].length]);
  // Style / colour words inside an exclusion must not count as positive preferences.
  let positive = lowerEffective;
  for (const [a, b] of [...forbiddenSpans].reverse()) positive = positive.slice(0, a) + " ".repeat(b - a) + positive.slice(b);

  // 3. Occasion / dress code.
  const fromUi = options.occasion ? dressCodeFor(options.occasion) : "none";
  const matchedOccasions = OCCASION_RULES.filter((r) => r.re.test(positive)).map((r) => r);
  const codes: DressCode[] = [];
  if (fromUi !== "none") codes.push(fromUi);
  // "sporty casual" / "athletic-inspired streetwear" is a style, not a gym session.
  const gymy = /\b(gym|workout|work out|training|exercise|jog(?:ging)?|yoga|pilates|football|basketball|run(?:ning)?)\b/.test(positive);
  for (const r of matchedOccasions) {
    if (r.dressCode === "athletic" && !gymy) continue;
    codes.push(r.dressCode);
    if (!c.occasion) c.occasion = r.occasion;
  }
  if (options.occasion && !c.occasion) c.occasion = options.occasion;
  // "smart-casual date" is smart casual, not strict business: only escalate to the stricter code when asked.
  c.dressCode = DRESS_PRIORITY.find((d) => codes.includes(d)) ?? "none";
  if (/\bsmart[- ]casual\b/.test(positive) && c.dressCode === "business" && !/\b(interview|office|meeting|client|corporate)\b/.test(positive)) {
    c.dressCode = "smart_casual";
  }

  // 4. Styles.
  const stylePositive = positive.replace(/\bsmart[- ]casual\b/g, "smart_casual_token").replace(/\bbusiness[- ]casual\b/g, "business_casual_token");
  for (const [style, re] of STYLE_WORDS) {
    const probe = style === "smart_casual" ? /smart_casual_token/ : style === "business_casual" ? /business_casual_token/ : re;
    if (probe.test(stylePositive)) {
      if (style === "casual" && (c.styles.includes("smart_casual") || c.styles.includes("business_casual"))) continue;
      if (style === "casual" && !/\bcasual\b/.test(stylePositive.replace(/smart_casual_token|business_casual_token/g, ""))) continue;
      c.styles.push(style);
    }
  }
  if (c.dressCode === "athletic" && !c.styles.includes("sporty")) c.styles.push("sporty");
  c.styleMandatory = c.styles.length > 0 && /\b(only|strictly|purely|exclusively)\b/.test(positive);

  // 5. Palette and colours.
  const allColour = positive.match(new RegExp(`\\ball[- ](${COLOUR_WORDS.join("|")})\\b`));
  if (allColour) {
    const col = canonicalColour(allColour[1]);
    if (col) c.palette = { mode: "single", colours: [col], label: `all ${col}` };
  } else if (/\b(monochrom(?:e|atic)|tonal|one colou?r)\b/.test(positive)) {
    c.palette = { mode: "monochrome", colours: [], label: "monochrome" };
  }
  for (const word of COLOUR_WORDS) {
    const col = canonicalColour(word);
    if (!col) continue;
    const inAnchorPhrase = new RegExp(`\\b${word}\\s+(?:\\w+\\s+)?(?:${collectTypeRegexes().map(([, r]) => r.source.replace(/^\\b\(\?:|\)\\b$/g, "")).join("|")})`).test(positive);
    const outfitWord = new RegExp(`\\b(?:${word}\\s+(?:outfit|look|fit|ensemble|vibe)|something\\s+${word}|in\\s+${word}\\b|lots? of\\s+${word}|${word}\\s+theme)`).test(positive);
    if (outfitWord && !allColour) c.requiredColours.push(col);
    else if (new RegExp(`\\b${word}\\b`).test(positive) && !inAnchorPhrase && !allColour) c.preferredColours.push(col);
  }
  c.requiredColours = [...new Set(c.requiredColours)];
  c.preferredColours = [...new Set(c.preferredColours)].filter((x) => !c.requiredColours.includes(x));

  // 6. Mood / practical flags.
  const noSmartCasual = positive.replace(/\bsmart[- ]casual\b/g, "");
  c.allowBold = /\b(bold|statement|loud|colou?rful|experimental|daring|avant[- ]garde|unconventional|eye[- ]catching|unique|different from usual)\b/.test(positive);
  c.simple = /\b(simple|minimal(?:ist)?|clean|understated|plain|basic)\b/.test(positive);
  c.polished = /\b(expensive|polished|classy|elevated|luxe|luxury|put together|sharp|refined|elegant|smart)\b/.test(noSmartCasual);
  c.comfortable = /\b(comfort(?:able)?|cozy|comfy|breathable|easy)\b/.test(positive);
  c.hotHint = /\b(hot|scorching|heat ?wave|humid|sweaty|very warm|boiling)\b/.test(positive);
  c.coolHint = /\b(cold|chilly|harmattan|freezing|cool day|rainy|rain|wet)\b/.test(positive);

  // 7. Variety / repetition / wardrobe rules.
  const rep = positive.match(/\b(?:last|past)\s+(\d+)\s+days?\b/);
  if (/\b(?:don'?t|do not|never|avoid)\s+repeat\b|\bnot repeat\b|\bnothing i wore\b|\bdifferent from yesterday\b|\bnot what i wore\b/.test(lowerEffective) || /\bdo not repeat\b/.test(full.toLowerCase())) {
    c.avoidRepeatDays = rep ? Number(rep[1]) : /\byesterday/.test(lowerEffective + " " + full.toLowerCase()) ? 1 : 3;
  }
  if (/\b(wear(?:ing)? again|repeat (?:my|that|the|a) (?:favou?rite|last|previous)|same (?:outfit|look) as|my favou?rite outfit|re-?wear)\b/.test(positive) && !/\b(don'?t|do not|never|avoid)\s+repeat/.test(positive)) {
    c.allowRepeat = true;
    c.avoidRepeatDays = null;
  }
  if (/\b(haven'?t|have not|not|hasn'?t) (?:worn|been worn)(?: (?:in a while|recently|lately))?|\b(rarely worn|least worn|not worn recently|unworn)\b/.test(positive)) {
    c.minDaysSinceWorn = 14;
  }
  c.wantsDifferent = /\b(something (?:different|else|new)|another (?:one|outfit|look)|different (?:outfit|look)|try again|new look|surprise me)\b/.test(positive);
  c.wantsPartial = /\b(just|only)\s+(?:a\s+)?(?:tops?|shirts?|bottoms?|trousers|shoes|footwear)\b|\bwhat shoes\b|\bshoes (?:to|that) (?:match|go with|wear with)\b|\bpartial\b/.test(positive);
  c.allowShopping = /\b(shopping|what should i buy|should i buy|to buy|purchase|new (?:pieces|clothes)|wishlist|what.s missing)\b/.test(positive);

  // 8. Anchors.
  const ownedById = new Map(owned.map((p) => [p.id, p]));
  const addGroup = (ids: string[]) => {
    const key = [...ids].sort().join("|");
    if (!c.anchorGroups.some((g) => [...g].sort().join("|") === key)) c.anchorGroups.push(ids);
  };

  for (const id of options.anchorItemIds ?? []) {
    const p = ownedById.get(id);
    if (!p) continue;
    if (!isEligibleStatus(p.item.status, options.allowRewearWorn)) {
      c.unavailableAnchors.push({ id: p.id, name: p.item.name, status: p.item.status });
    } else addGroup([id]);
  }

  const lowerForNames = positive;
  for (const p of owned) {
    const n = p.item.name.toLowerCase().replace(/^sample\s+/, "").trim();
    if (n.length >= 6 && lowerForNames.includes(n)) {
      if (isEligibleStatus(p.item.status, options.allowRewearWorn)) addGroup([p.id]);
      else if (!c.unavailableAnchors.some((u) => u.id === p.id)) c.unavailableAnchors.push({ id: p.id, name: p.item.name, status: p.item.status });
    }
  }

  const mentions = findMentions(effective, forbiddenSpans).filter((m) => m.anchored);
  for (const m of mentions) {
    const types = expandTypes(m.type);
    let candidates = owned.filter((p) => types.includes(p.type) && (!m.colour || p.colour === m.colour));
    if (m.type === "generic_trousers") candidates = candidates.filter((p) => p.role === "bottom");
    if (m.type === "generic_shoes") candidates = candidates.filter((p) => p.role === "shoes");
    if (candidates.length === 0) {
      c.unmatchedAnchors.push(m.phrase);
      continue;
    }
    // Narrow by descriptive words next to the mention (e.g. "oversized", "graphic").
    const windowWords = lowerEffective.slice(Math.max(0, m.start - 30), m.end).split(/\s+/).map((w) => w.replace(/[^a-z]/g, ""));
    const narrowed = candidates.filter((p) => nameTokens(p.item.name).some((tok) => windowWords.includes(tok) && !types.some((t) => tok === t) && !COLOUR_WORDS.includes(tok)));
    if (narrowed.length > 0) candidates = narrowed;

    const available = candidates.filter((p) => isEligibleStatus(p.item.status, options.allowRewearWorn));
    if (available.length === 0) {
      for (const p of candidates.slice(0, 1)) c.unavailableAnchors.push({ id: p.id, name: p.item.name, status: p.item.status });
      continue;
    }
    addGroup(available.map((p) => p.id));
  }

  // 9. Genuine conflicts that need the user's input.
  const forbiddenHit = (p: GarmentProfile) => c.forbidden.find((r) => matchesForbidden(r, p));
  for (const group of c.anchorGroups) {
    const profiles = group.map((id) => ownedById.get(id)).filter((p): p is GarmentProfile => Boolean(p));
    if (profiles.length > 0 && profiles.every((p) => forbiddenHit(p))) {
      c.conflicts.push(`You asked to use "${profiles[0].item.name}" but also excluded it ("${forbiddenHit(profiles[0])?.phrase}").`);
    }
    if (c.palette?.mode === "single" && profiles.length > 0 && profiles.every((p) => p.colour && !c.palette!.colours.includes(p.colour) && !colourInfo(p.colour)?.neutral)) {
      c.conflicts.push(`"${profiles[0].item.name}" isn't ${c.palette.colours[0]}, so it can't be part of an ${c.palette.label} outfit.`);
    }
  }
  if (c.styles.includes("formal") && c.styles.includes("sporty") && c.dressCode !== "athletic") {
    c.conflicts.push("You asked for both a formal and a sporty look.");
  }
  if (c.dressCode === "formal" && c.styles.includes("streetwear") && c.styleMandatory) {
    c.conflicts.push("A strict formal dress code and an all-streetwear look can't both be satisfied.");
  }
  if (c.palette?.mode === "single") {
    for (const col of c.requiredColours) {
      if (!c.palette.colours.includes(col)) c.conflicts.push(`You asked for ${c.palette.label} and also for ${col}.`);
    }
  }
  for (const col of c.requiredColours) {
    if (c.forbidden.some((r) => r.colours?.includes(col) && !r.types)) c.conflicts.push(`You asked for ${col} and also excluded ${col}.`);
  }

  for (const id of options.excludeItemIds ?? []) {
    const p = ownedById.get(id);
    if (p) c.forbidden.push({ phrase: `rejected ${p.item.name}`, types: [p.type], colours: p.colour ? [p.colour] : undefined });
  }
  // The reject-this-garment rule above is intentionally narrow (same type AND colour) so one dislike does
  // not become a blanket rule; see preferences.ts for the soft, decaying version.

  c.styles = [...new Set(c.styles)];
  void TYPE_DEFS;
  return c;
}

// -- Weather ---------------------------------------------------------------------------------------

/** Builds a WeatherContext from the weather string the UI sends (live summary or a preset) plus request hints. */
export function parseWeather(summary: string | null | undefined, c: StylingConstraints): WeatherContext | null {
  const s = (summary ?? "").toLowerCase();
  const tempMatch = s.match(/(-?\d{1,2})\s*°\s*c/) ?? s.match(/around\s+(-?\d{1,2})\b/);
  let temperatureC = tempMatch ? Number(tempMatch[1]) : null;
  const rainy = /\b(rain|shower|drizzle|storm|thunder|wet)\b/.test(s) || (c.coolHint && /\brain|wet\b/.test(c.effectivePrompt.toLowerCase()));
  if (temperatureC === null) {
    if (/\b(snow|freezing|cold winter)\b/.test(s)) temperatureC = 5;
    else if (c.hotHint) temperatureC = 32;
  }
  if (temperatureC === null && !rainy && !s && !c.hotHint && !c.coolHint) return null;
  return {
    temperatureC,
    rainy,
    windy: /\bwind/.test(s),
    humid: /\bhumid/.test(s) || c.hotHint,
  };
}

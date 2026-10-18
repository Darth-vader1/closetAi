import { categoryGroup, type CategoryGroup } from "@/lib/wardrobe/categories";
import {
  aiPackingResponseSchema,
  DAILY_PLAN_MAX_DAYS,
  LAUNDRY_CYCLE_DAYS,
  MAX_CAPSULE_ITEMS,
  MAX_ITEMS_PER_OUTFIT,
  MAX_OUTFITS,
  MAX_PACKING_TIPS,
  MAX_SUGGESTED_ITEMS,
  PRIORITIES,
  type PackingRequest,
  type PlanOutfit,
  type PlanWeather,
  type SuggestedItem,
  type SuggestionCategory,
  type SuggestionPriority,
} from "@/lib/packing/schemas";

/**
 * Deterministic side of the "Pack for..." planner:
 *  - plan shape (daily vs laundry-cycle rotation),
 *  - a rule-based capsule + outfit builder used when the AI is unavailable or returns junk,
 *  - validation of AI output (unknown ids dropped, bounded sizes, gaps filled),
 *  - "Don't forget" suggestions, ownership matching and safety filtering,
 *  - wear counts for the whole stay.
 * Nothing here trusts model output.
 */

export interface InventoryRow {
  id: string;
  name: string;
  category: string;
  subcategory: string | null;
  primary_colour: string | null;
  pattern: string | null;
  material: string | null;
  style: string | null;
  occasions: string[] | null;
  warmth_level: number | null;
  image_path: string;
  wear_count: number | null;
}

export interface OwnedRow {
  name: string;
  category: string;
  subcategory: string | null;
}

export interface PlanShape {
  mode: "daily" | "rotation";
  /** Days in one template. */
  cycleDays: number;
  /** Number of outfits we ask for / build (== cycleDays, bounded by MAX_OUTFITS). */
  outfitCount: number;
  repeats: number;
}

const DAY_MS = 86_400_000;
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const NEUTRALS = new Set(["black", "white", "grey", "gray", "navy", "beige", "brown", "cream", "khaki", "denim", "blue"]);

export function planShape(days: number, laundry: PackingRequest["laundry"]): PlanShape {
  if (days <= DAILY_PLAN_MAX_DAYS) {
    return { mode: "daily", cycleDays: days, outfitCount: Math.min(days, MAX_OUTFITS), repeats: 1 };
  }
  const cycleDays = Math.min(LAUNDRY_CYCLE_DAYS[laundry], MAX_OUTFITS, days);
  return { mode: "rotation", cycleDays, outfitCount: cycleDays, repeats: Math.ceil(days / cycleDays) };
}

/** Day indices (0-based, inside the template) that are event days. */
export function eventDayIndexes(req: PackingRequest, startDate: string, shape: PlanShape): Set<number> {
  const out = new Set<number>();
  if (req.purpose !== "event") return out;
  const start = Date.parse(`${startDate}T00:00:00Z`);
  for (const d of req.eventDates ?? []) {
    const idx = Math.round((Date.parse(`${d}T00:00:00Z`) - start) / DAY_MS);
    if (idx >= 0 && idx < req.days) out.add(idx % shape.cycleDays);
  }
  if (out.size === 0) {
    const count = Math.min(req.eventCount ?? 1, shape.outfitCount);
    const step = shape.outfitCount / count;
    for (let i = 0; i < count; i++) out.add(Math.min(shape.outfitCount - 1, Math.floor(i * step + step / 2)));
  }
  return out;
}

function dayTitle(req: PackingRequest, shape: PlanShape, startDate: string, index: number, isEvent: boolean): string {
  const weekday = WEEKDAYS[new Date(Date.parse(`${startDate}T00:00:00Z`) + index * DAY_MS).getUTCDay()];
  const prefix = shape.mode === "rotation" ? `Template day ${index + 1} · ${weekday}` : `Day ${index + 1} · ${weekday}`;
  if (isEvent) return `${prefix}: ${req.eventName || "Event"} look`;
  if (shape.mode === "daily" && index === 0 && (req.purpose === "trip" || req.purpose === "relocation")) return `${prefix}: Travel day`;
  const label: Record<PackingRequest["purpose"], string> = {
    trip: "Explore",
    school: "Campus day",
    work: "Workday",
    event: "Downtime",
    relocation: "Settling in",
  };
  return `${prefix}: ${label[req.purpose]}`;
}

const PURPOSE_OCCASIONS: Record<PackingRequest["purpose"], string[]> = {
  trip: ["travel", "everyday", "party"],
  school: ["school", "everyday"],
  work: ["work", "formal_event"],
  event: ["formal_event", "party", "worship"],
  relocation: ["everyday", "work"],
};

function scoreItem(item: InventoryRow, req: PackingRequest, weather: PlanWeather): number {
  let score = 0;
  const occ = item.occasions ?? [];
  if (PURPOSE_OCCASIONS[req.purpose].some((o) => occ.includes(o))) score += 3;
  const formalWanted =
    req.dressCode === "business" || req.dressCode === "formal_days" || req.formality === "formal" || req.formality === "smart_casual";
  if (formalWanted && (item.style === "formal" || item.style === "smart_casual")) score += 2;
  if (req.dressCode === "casual" && item.style === "casual") score += 1;
  const warmth = item.warmth_level ?? 3;
  if (weather.flags.cold) score += warmth >= 3 ? 2 : -1;
  if (weather.flags.hot) score += warmth <= 2 ? 2 : -2;
  if (item.primary_colour && NEUTRALS.has(item.primary_colour.toLowerCase())) score += 1;
  if (weather.flags.rainy && /suede|silk|velvet/i.test(item.material ?? "")) score -= 2;
  score -= Math.min(2, (item.wear_count ?? 0) * 0.02);
  return score;
}

/** Rule-based fallback plan. Always returns ids that exist in `inventory`. */
export function buildDeterministicPlan(
  inventory: InventoryRow[],
  req: PackingRequest,
  weather: PlanWeather,
  startDate: string,
  shape: PlanShape,
): { capsuleIds: string[]; outfits: PlanOutfit[]; rationale: string; tips: string[] } {
  const byGroup = new Map<CategoryGroup, InventoryRow[]>();
  for (const item of inventory) {
    const g = categoryGroup(item.category);
    byGroup.set(g, [...(byGroup.get(g) ?? []), item]);
  }
  for (const list of byGroup.values()) list.sort((a, b) => scoreItem(b, req, weather) - scoreItem(a, req, weather));
  const take = (g: CategoryGroup, n: number) => (byGroup.get(g) ?? []).slice(0, Math.max(0, n));

function distributeItems(pool: InventoryRow[], count: number): InventoryRow[] {
  if (pool.length === 0) return [];
  if (pool.length === 1) return Array(count).fill(pool[0]);
  const wearCounts = new Map<string, number>(pool.map((p) => [p.id, 0]));
  const result: InventoryRow[] = [];
  for (let i = 0; i < count; i++) {
    const prevId = result[i - 1]?.id;
    const prevPrevId = result[i - 2]?.id;
    let candidates = pool.filter((item) => item.id !== prevId);
    if (candidates.length === 0) candidates = pool;
    if (pool.length >= 3) {
      const notRecent = candidates.filter((item) => item.id !== prevPrevId);
      if (notRecent.length > 0) candidates = notRecent;
    }
    candidates.sort((a, b) => {
      const wa = wearCounts.get(a.id) ?? 0;
      const wb = wearCounts.get(b.id) ?? 0;
      if (wa !== wb) return wa - wb;
      return pool.indexOf(a) - pool.indexOf(b);
    });
    const chosen = candidates[0];
    result.push(chosen);
    wearCounts.set(chosen.id, (wearCounts.get(chosen.id) ?? 0) + 1);
  }
  return result;
}

  const n = shape.outfitCount;
  const events = eventDayIndexes(req, startDate, shape);
  const formalNeed =
    req.purpose === "event" || req.dressCode === "business" || req.dressCode === "formal_days" || req.formality === "formal";
  const traditionalNeed = req.formality === "traditional" || /owambe|traditional|aso[- ]?ebi/i.test(req.eventName ?? "");

  const tops = take("top", n <= 1 ? 1 : Math.min(7, Math.max(2, Math.ceil(n * 0.75))));
  const bottoms = take(
    "bottom",
    n >= 7 ? Math.min(5, Math.max(3, Math.ceil(n * 0.5))) : Math.min(4, Math.max(1, Math.ceil(n / 2.5))),
  );
  const shoes = take("footwear", n <= 2 ? 1 : formalNeed ? 3 : 2);
  const outer = take("outerwear", weather.flags.cold && n > 5 ? 2 : weather.flags.cold || weather.flags.rainy || formalNeed ? 1 : 0);
  const special = traditionalNeed
    ? [...take("traditional", Math.max(1, events.size)), ...take("fullbody", 1)]
    : take("fullbody", formalNeed ? Math.max(1, Math.min(3, events.size || 1)) : n >= 5 ? 1 : 0);
  const accessories = take("accessory", n >= 3 ? 1 : 0);

  const distributedTops = distributeItems(tops, n);
  const distributedBottoms = distributeItems(bottoms, n);

  const outfits: PlanOutfit[] = [];
  let specialIdx = 0;
  for (let i = 0; i < n; i++) {
    const isEvent = events.has(i);
    const ids: string[] = [];
    if (isEvent && special.length > 0) {
      ids.push(special[specialIdx++ % special.length].id);
    } else {
      if (distributedTops[i]) ids.push(distributedTops[i].id);
      if (distributedBottoms[i]) ids.push(distributedBottoms[i].id);
      if (!distributedTops.length && !distributedBottoms.length && special.length) ids.push(special[i % special.length].id);
    }
    if (shoes.length) ids.push((isEvent ? shoes[shoes.length - 1] : shoes[i % shoes.length]).id);
    if (outer.length && (weather.flags.cold || weather.flags.rainy || isEvent)) ids.push(outer[i % outer.length].id);
    if (isEvent && accessories.length) ids.push(accessories[0].id);
    outfits.push({
      day: i + 1,
      title: dayTitle(req, shape, startDate, i, isEvent),
      item_ids: [...new Set(ids)].slice(0, MAX_ITEMS_PER_OUTFIT),
      styling_tip: isEvent
        ? "Steam or press this look the night before and keep shoes polished for photos."
        : weather.flags.rainy
          ? "Keep your outer layer handy; tuck trousers above wet ground and skip delicate fabrics."
          : weather.flags.hot
            ? "Roll sleeves and keep layers breathable to stay comfortable in the heat."
            : "Swap the top or shoes to make this base feel new.",
    });
  }

  const capsuleIds = [...new Set(outfits.flatMap((o) => o.item_ids))].slice(0, MAX_CAPSULE_ITEMS);
  const rationale =
    shape.mode === "rotation"
      ? `A ${capsuleIds.length}-piece core capsule built around a ${shape.cycleDays}-day laundry cycle. Repeat the template ${shape.repeats} time(s) across your ${req.days}-day stay instead of packing a new outfit for every day.`
      : `A ${capsuleIds.length}-piece mix-and-match capsule for ${req.days} day(s), favouring versatile, neutral pieces that suit the conditions.`;
  const tips = [
    "Roll soft items and fold structured pieces to save space and limit creases.",
    shape.mode === "rotation" ? "Wash on the same day each cycle so the template stays in sync." : "Wear your bulkiest layer and shoes while travelling.",
    weather.flags.rainy ? "Pack a plastic bag for wet clothes and shoes." : "Keep one outfit in your carry-on in case your bag is delayed.",
  ];
  return { capsuleIds, outfits, rationale, tips };
}

/** Repeat existing outfits to fill any missing template days, keeping the plan bounded. */
function fillMissingDays(outfits: PlanOutfit[], shape: PlanShape): PlanOutfit[] {
  const byDay = new Map(outfits.map((o) => [o.day, o]));
  const base = [...outfits].sort((a, b) => a.day - b.day);
  const out: PlanOutfit[] = [];
  for (let d = 1; d <= shape.outfitCount; d++) {
    const existing = byDay.get(d);
    if (existing) {
      out.push(existing);
    } else {
      const src = base[(d - 1) % base.length];
      out.push({ ...src, day: d, title: `Day ${d}: Repeat of day ${src.day}`, styling_tip: src.styling_tip });
    }
  }
  return out;
}

/**
 * Validate model output. Returns null (→ deterministic fallback) when the response fails the
 * schema or is too thin to be useful. Unknown item ids are dropped; sizes are capped.
 */
export function sanitizeAiPlan(
  raw: unknown,
  inventory: InventoryRow[],
  shape: PlanShape,
): { capsuleIds: string[]; outfits: PlanOutfit[]; rationale: string; tips: string[]; suggestions: SuggestedItem[] } | null {
  const parsed = aiPackingResponseSchema.safeParse(raw);
  if (!parsed.success) return null;
  const data = parsed.data;
  const valid = new Set(inventory.map((i) => i.id));

  const capsule: string[] = [];
  const addToCapsule = (id: string) => {
    if (valid.has(id) && !capsule.includes(id) && capsule.length < MAX_CAPSULE_ITEMS) capsule.push(id);
  };
  data.capsule_item_ids.forEach(addToCapsule);

  const seenDays = new Set<number>();
  const outfits: PlanOutfit[] = [];
  for (const o of data.outfits) {
    if (o.day > shape.outfitCount || seenDays.has(o.day)) continue;
    const ids = [...new Set(o.item_ids)].filter((id) => valid.has(id));
    ids.forEach(addToCapsule);
    const kept = ids.filter((id) => capsule.includes(id));
    if (kept.length === 0) continue;
    seenDays.add(o.day);
    outfits.push({ day: o.day, title: o.title || `Day ${o.day}`, item_ids: kept, styling_tip: o.styling_tip });
  }

  const minOutfits = Math.max(1, Math.ceil(shape.outfitCount / 2));
  if (capsule.length < Math.min(3, inventory.length) || outfits.length < minOutfits) return null;

  return {
    capsuleIds: capsule,
    outfits: fillMissingDays(outfits, shape),
    rationale: data.capsule_rationale,
    tips: data.packing_tips.slice(0, MAX_PACKING_TIPS),
    suggestions: data.suggestedItems.map((s) => ({ ...s, alreadyOwned: false })),
  };
}

/** Total wears per item across the whole stay (template repeated over `days`). */
export function computeWears(outfits: PlanOutfit[], days: number): Record<string, number> {
  const wears: Record<string, number> = {};
  if (outfits.length === 0) return wears;
  const ordered = [...outfits].sort((a, b) => a.day - b.day);
  for (let d = 0; d < days; d++) {
    for (const id of ordered[d % ordered.length].item_ids) wears[id] = (wears[id] ?? 0) + 1;
  }
  return wears;
}

// --- "Don't forget" suggestions ----------------------------------------------------------------

type Rule = { name: string; category: SuggestionCategory; reason: string; priority: SuggestionPriority };

export function buildRuleSuggestions(req: PackingRequest, weather: PlanWeather): SuggestedItem[] {
  const rules: Rule[] = [
    { name: "Phone charger", category: "tech", reason: "Easy to forget and annoying to replace.", priority: "essential" },
    { name: "Toiletries kit", category: "toiletries", reason: "Toothbrush, deodorant and skincare basics.", priority: "essential" },
  ];
  if (weather.flags.rainy) {
    rules.push({ name: "Umbrella", category: "weather_gear", reason: "Rain is likely during your stay.", priority: "essential" });
    rules.push({ name: "Raincoat or rain jacket", category: "weather_gear", reason: "Keeps you dry when an umbrella isn't enough.", priority: "recommended" });
  }
  if (weather.flags.cold) {
    rules.push({ name: "Warm jacket or coat", category: "clothing_gaps", reason: "Temperatures will be cool.", priority: "essential" });
  }
  if (weather.flags.hot) {
    rules.push({ name: "Sunscreen", category: "toiletries", reason: "Strong sun and high temperatures expected.", priority: "essential" });
    rules.push({ name: "Hat or cap", category: "weather_gear", reason: "Shade for long days outdoors.", priority: "recommended" });
    rules.push({ name: "Reusable water bottle", category: "weather_gear", reason: "Stay hydrated in the heat.", priority: "recommended" });
  }
  switch (req.purpose) {
    case "trip":
      rules.push({ name: "ID, tickets and booking confirmations", category: "documents", reason: "Keep them together and easy to reach.", priority: "essential" });
      rules.push({ name: "Travel plug adapter", category: "tech", reason: "Only if your destination uses a different socket type.", priority: "optional" });
      rules.push({ name: "Power bank", category: "tech", reason: "Long days out drain your phone.", priority: "recommended" });
      break;
    case "school":
      rules.push({ name: "Student ID and admission documents", category: "documents", reason: "Needed for registration and campus access.", priority: "essential" });
      rules.push({ name: "Power bank", category: "tech", reason: "Power cuts and long lecture days.", priority: "essential" });
      rules.push({ name: "Extension cord / multi-plug", category: "tech", reason: "Hostel rooms rarely have enough sockets.", priority: "recommended" });
      rules.push({ name: "Laptop and charger", category: "tech", reason: "For assignments and research.", priority: "recommended" });
      if (req.dressCode === "uniform_days") rules.push({ name: "School uniform", category: "clothing_gaps", reason: "Your dress code includes uniform days.", priority: "essential" });
      if (req.dressCode === "formal_days") rules.push({ name: "Formal outfit for presentations", category: "clothing_gaps", reason: "For presentation or seminar days.", priority: "recommended" });
      rules.push({ name: "Lab coat", category: "clothing_gaps", reason: "Only if your course has practical or lab sessions.", priority: "optional" });
      rules.push(
        req.laundry === "none"
          ? { name: "Laundry bag and travel detergent", category: "toiletries", reason: "No hostel laundry, so you'll hand-wash.", priority: "recommended" }
          : { name: "Laundry bag", category: "toiletries", reason: "Keeps worn clothes separate until wash day.", priority: "optional" },
      );
      break;
    case "work":
      rules.push({ name: "ID and work/placement letter", category: "documents", reason: "Often requested on your first day.", priority: "essential" });
      rules.push({ name: "Laptop and charger", category: "tech", reason: "For work tasks and meetings.", priority: "recommended" });
      if (req.dressCode === "business") rules.push({ name: "Polished formal shoes", category: "clothing_gaps", reason: "A corporate dress code calls for them.", priority: "recommended" });
      break;
    case "event":
      rules.push({ name: "Invitation or ticket", category: "documents", reason: "Some venues check at the door.", priority: "recommended" });
      if (req.photoDay) {
        rules.push({ name: "Lint roller and stain pen", category: "toiletries", reason: "Look crisp in photos.", priority: "recommended" });
        rules.push({ name: "Backup outfit", category: "clothing_gaps", reason: "In case of spills on photo day.", priority: "optional" });
      }
      if (/church|mosque|temple|worship|religious|wedding|nikkah|mass/i.test(`${req.eventName ?? ""} ${req.notes ?? ""}`)) {
        rules.push({ name: "Modest cover (shawl or scarf)", category: "clothing_gaps", reason: "Religious venues may expect covered shoulders.", priority: "recommended" });
      }
      rules.push({ name: "Travel steamer or iron", category: "tech", reason: "Smooth out creases before the event.", priority: "optional" });
      break;
    case "relocation":
      rules.push({ name: "Important documents folder", category: "documents", reason: "Keep IDs and key papers together.", priority: "essential" });
      rules.push({ name: "Extension cord / multi-plug", category: "tech", reason: "New rooms rarely have sockets where you need them.", priority: "recommended" });
      rules.push({ name: "Towels and bedding", category: "toiletries", reason: "For your first nights before you settle in.", priority: "recommended" });
      break;
  }
  return rules.map((r) => ({ ...r, alreadyOwned: false }));
}

const BLOCKED_SUGGESTION = /prescri|medic|pill|drug|vaccin|antibiot|antimalar|inhaler|insulin|first[- ]?aid|pharma|visa|permit|insurance|lawyer|legal|immigration|notar|affidavit/i;
const STOPWORDS = new Set(["pair", "travel", "extra", "small", "light", "with", "your", "spare", "pack", "warm", "or", "and", "for", "set"]);
const SYNONYMS: Record<string, string[]> = {
  raincoat: ["raincoat", "rain jacket", "waterproof", "mac", "trench"],
  jacket: ["jacket", "coat", "parka", "puffer", "blazer"],
  coat: ["coat", "jacket", "parka", "trench"],
  hat: ["hat", "cap", "beanie", "bucket"],
  cap: ["cap", "hat"],
  shawl: ["shawl", "scarf", "wrap", "pashmina"],
  scarf: ["scarf", "shawl"],
  sunglasses: ["sunglasses", "shades"],
  wig: ["wig", "hairpiece", "frontal", "closure", "weave"],
  umbrella: ["umbrella"],
  shoes: ["shoes", "loafers", "oxford", "derby", "heels", "brogues"],
};

/** Server-side truth for alreadyOwned: does something in the wardrobe match this suggestion? */
function findOwned(name: string, owned: OwnedRow[]): OwnedRow | undefined {
  const tokens = name
    .toLowerCase()
    .replace(/[^a-z\s-]/g, " ")
    .split(/[\s/-]+/)
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t));
  const terms = new Set(tokens.flatMap((t) => SYNONYMS[t] ?? [t]));
  if (terms.size === 0) return undefined;
  return owned.find((o) => {
    const hay = `${o.name} ${o.subcategory ?? ""} ${o.category}`.toLowerCase();
    return [...terms].some((t) => new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}s?\\b`).test(hay));
  });
}

/**
 * Merge AI + rule suggestions, drop medical/legal advice, mark owned items (never "buy" what they
 * own), guarantee one generic documents reminder, dedupe and cap.
 */
export function finaliseSuggestions(
  aiSuggestions: SuggestedItem[],
  ruleSuggestions: SuggestedItem[],
  owned: OwnedRow[],
): SuggestedItem[] {
  const merged = new Map<string, SuggestedItem>();
  for (const s of [...aiSuggestions, ...ruleSuggestions]) {
    const key = s.name.toLowerCase().replace(/[^a-z]/g, "");
    if (!key || merged.has(key)) continue;
    if (BLOCKED_SUGGESTION.test(`${s.name} ${s.reason}`)) continue;
    merged.set(key, s);
  }

  let list = [...merged.values()];
  if (!list.some((s) => s.category === "documents")) {
    list.push({ name: "ID and key documents", category: "documents", reason: "A quick reminder to keep them with you.", priority: "essential", alreadyOwned: false });
  }

  list = list.map((s) => {
    // Documents are never wardrobe items; everything else (clothing gaps, weather gear, tech
    // like a power bank, toiletries) is checked against what the user already owns.
    if (s.category === "documents") return { ...s, alreadyOwned: false };
    const match = findOwned(s.name, owned);
    return match
      ? { ...s, alreadyOwned: true, ownedItemName: match.name, reason: `You already own "${match.name}", so pack it rather than buying one. ${s.reason}`.slice(0, 200) }
      : { ...s, alreadyOwned: false };
  });

  const rank = (p: SuggestionPriority) => PRIORITIES.indexOf(p);
  return list.sort((a, b) => rank(a.priority) - rank(b.priority)).slice(0, MAX_SUGGESTED_ITEMS);
}

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  compareTimeOfDaySlots,
  inferTimeOfDayFromText,
  normalizeOutfitTimeOfDay,
  type OutfitTimeOfDay,
} from "@/lib/outfits/calendar-slots";
import { signImageUrls, type ImageSize, type WardrobeItem } from "@/lib/wardrobe/queries";
import { isLaundryStatus } from "@/lib/wardrobe/status";

export type { OutfitTimeOfDay } from "@/lib/outfits/calendar-slots";

export interface OutfitWithItems {
  id: string;
  userId: string;
  name: string;
  occasion: string | null;
  styleDescription: string | null;
  explanation: string | null;
  stylingTip: string | null;
  photoPath: string | null;
  source: "MANUAL" | "ENGINE" | "AI";
  isFavourite: boolean;
  createdAt: string;
  items: WardrobeItem[];
}

interface RawOutfitRow {
  id: string;
  user_id: string;
  name: string;
  occasion: string | null;
  style_description: string | null;
  explanation: string | null;
  styling_tip: string | null;
  photo_path?: string | null;
  source: "MANUAL" | "ENGINE" | "AI";
  is_favourite: boolean;
  created_at: string;
  outfit_items: Array<{
    position: number;
    wardrobe_items: {
      id: string;
      name: string;
      category: string;
      subcategory: string | null;
      primary_colour: string | null;
      secondary_colours: string[] | null;
      pattern: string | null;
      material: string | null;
      style: string | null;
      occasions: string[] | null;
      seasons: string[] | null;
      warmth_level: number | null;
      image_path: string;
      status: string;
      care_type: string | null;
      is_favourite: boolean;
      ai_analysed: boolean;
      wear_count: number;
      last_worn_at: string | null;
      last_washed_at: string | null;
      created_at: string;
    };
  }>;
}

export async function listUserOutfits(
  supabase: SupabaseClient,
  userId: string,
): Promise<OutfitWithItems[]> {
  const { data, error } = await supabase
    .from("outfits")
    .select(`
      id, user_id, name, occasion, style_description, explanation, styling_tip, photo_path, source, is_favourite, created_at,
      outfit_items (
        position,
        wardrobe_items (
          id, name, category, subcategory, primary_colour, secondary_colours,
          pattern, material, style, occasions, seasons, warmth_level,
          image_path, status, care_type, is_favourite, ai_analysed, wear_count,
          last_worn_at, last_washed_at, created_at
        )
      )
    `)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Could not load outfits: ${error.message}`);

  return ((data ?? []) as unknown as RawOutfitRow[]).map((row) => ({
    id: row.id,
    userId: row.user_id,
    name: row.name,
    occasion: row.occasion,
    styleDescription: row.style_description,
    explanation: row.explanation,
    stylingTip: row.styling_tip,
    photoPath: row.photo_path ?? null,
    source: row.source,
    isFavourite: row.is_favourite,
    createdAt: row.created_at,
    items: (row.outfit_items ?? [])
      .sort((a, b) => a.position - b.position)
      .map((link) => {
        const item = link.wardrobe_items;
        return {
          id: item.id,
          name: item.name,
          category: item.category,
          subcategory: item.subcategory,
          primaryColour: item.primary_colour,
          secondaryColours: item.secondary_colours ?? [],
          pattern: item.pattern,
          material: item.material,
          style: item.style,
          occasions: item.occasions ?? [],
          seasons: item.seasons ?? [],
          warmthLevel: item.warmth_level,
          imagePath: item.image_path,
          status: isLaundryStatus(item.status) ? item.status : "UNAVAILABLE",
          careType: (item.care_type === "WASHABLE" || item.care_type === "WIPE_CLEAN" || item.care_type === "NO_WASH") 
            ? item.care_type 
            : "WASHABLE",
          isFavourite: item.is_favourite,
          aiAnalysed: item.ai_analysed,
          wearCount: item.wear_count,
          lastWornAt: item.last_worn_at,
          lastWashedAt: item.last_washed_at,
          createdAt: item.created_at,
        };
      }),
  }));
}

export interface PlannedOutfitRow {
  id: string;
  userId: string;
  outfitId: string;
  plannedFor: string;
  timeOfDay: OutfitTimeOfDay;
  status: "PLANNED" | "WORN" | "SKIPPED";
  wornAt?: string | null;
  outfit: OutfitWithItems;
}

export interface OutfitHistoryRow {
  id: string;
  outfitId: string | null;
  wornOn: string;
  timeOfDay?: OutfitTimeOfDay;
  wornAt: string;
  outfit?: OutfitWithItems | null;
}

const PLAN_OUTFITS_NESTED_SELECT = `
  outfits (
    id, user_id, name, occasion, style_description, explanation, styling_tip, photo_path, source, is_favourite, created_at,
    outfit_items (
      position,
      wardrobe_items (
        id, name, category, subcategory, primary_colour, secondary_colours,
        pattern, material, style, occasions, seasons, warmth_level,
        image_path, status, care_type, is_favourite, ai_analysed, wear_count,
        last_worn_at, last_washed_at, created_at
      )
    )
  )
`;

export async function listOutfitPlans(
  supabase: SupabaseClient,
  userId: string,
  from?: string,
  to?: string,
): Promise<PlannedOutfitRow[]> {
  let qWithSlot = supabase
    .from("outfit_plans")
    .select(`id, user_id, outfit_id, planned_for, time_of_day, status, worn_at, ${PLAN_OUTFITS_NESTED_SELECT}`)
    .eq("user_id", userId)
    .order("planned_for", { ascending: true });

  if (from) qWithSlot = qWithSlot.gte("planned_for", from);
  if (to) qWithSlot = qWithSlot.lte("planned_for", to);

  let { data, error } = await qWithSlot;

  // Fallback if time_of_day column migration hasn't been applied on this database yet
  if (error && String(error.message ?? "").toLowerCase().includes("time_of_day")) {
    let qLegacy = supabase
      .from("outfit_plans")
      .select(`id, user_id, outfit_id, planned_for, status, worn_at, ${PLAN_OUTFITS_NESTED_SELECT}`)
      .eq("user_id", userId)
      .order("planned_for", { ascending: true });
    if (from) qLegacy = qLegacy.gte("planned_for", from);
    if (to) qLegacy = qLegacy.lte("planned_for", to);
    const fallbackRes = await qLegacy;
    data = fallbackRes.data as typeof data;
    error = fallbackRes.error;
  }

  type PlanOutfitItemLink = {
    position: number;
    wardrobe_items: {
      id: string;
      name: string;
      category: string;
      subcategory: string | null;
      primary_colour: string | null;
      secondary_colours: string[] | null;
      pattern: string | null;
      material: string | null;
      style: string | null;
      occasions: string[] | null;
      seasons: string[] | null;
      warmth_level: number | null;
      image_path: string;
      status: string;
      care_type: string | null;
      is_favourite: boolean;
      ai_analysed: boolean;
      wear_count: number;
      last_worn_at: string | null;
      last_washed_at: string | null;
      created_at: string;
    };
  };

  type PlanRowRaw = {
    id: string;
    user_id: string;
    outfit_id: string;
    planned_for: string;
    time_of_day?: string | null;
    status: PlannedOutfitRow["status"];
    worn_at?: string | null;
    outfits: {
      id: string;
      user_id: string;
      name: string;
      occasion: string | null;
      style_description: string | null;
      explanation: string | null;
      styling_tip: string | null;
      photo_path?: string | null;
      source: OutfitWithItems["source"];
      is_favourite: boolean;
      created_at: string;
      outfit_items?: PlanOutfitItemLink[];
    } | null;
  };

  const mapNestedOutfit = (
    o: PlanRowRaw["outfits"],
    fallbackOutfitId: string,
    fallbackUserId: string,
  ): OutfitWithItems => {
    const items = (o?.outfit_items ?? [])
      .slice()
      .sort((a, b) => a.position - b.position)
      .map((l) => {
        const item = l.wardrobe_items;
        const careType = item.care_type;
        return {
          id: item.id,
          name: item.name,
          category: item.category,
          subcategory: item.subcategory,
          primaryColour: item.primary_colour,
          secondaryColours: item.secondary_colours ?? [],
          pattern: item.pattern,
          material: item.material,
          style: item.style,
          occasions: item.occasions ?? [],
          seasons: item.seasons ?? [],
          warmthLevel: item.warmth_level,
          imagePath: item.image_path,
          status: isLaundryStatus(item.status) ? item.status : "UNAVAILABLE",
          careType:
            careType === "WASHABLE" || careType === "WIPE_CLEAN" || careType === "NO_WASH"
              ? (careType as "WASHABLE" | "WIPE_CLEAN" | "NO_WASH")
              : ("WASHABLE" as const),
          isFavourite: item.is_favourite,
          aiAnalysed: item.ai_analysed,
          wearCount: item.wear_count,
          lastWornAt: item.last_worn_at,
          lastWashedAt: item.last_washed_at,
          createdAt: item.created_at,
        };
      });

    return {
      id: o?.id ?? fallbackOutfitId,
      userId: o?.user_id ?? fallbackUserId,
      name: o?.name ?? "Saved Outfit",
      occasion: o?.occasion ?? null,
      styleDescription: o?.style_description ?? null,
      explanation: o?.explanation ?? null,
      stylingTip: o?.styling_tip ?? null,
      photoPath: o?.photo_path ?? null,
      source: o?.source ?? "MANUAL",
      isFavourite: o?.is_favourite ?? false,
      createdAt: o?.created_at ?? "",
      items,
    };
  };

  const planRows: PlannedOutfitRow[] =
    !error && data
      ? (data as unknown as PlanRowRaw[]).map((row) => {
          const mappedOutfit = mapNestedOutfit(row.outfits, row.outfit_id, row.user_id);
          const inferredSlot = inferTimeOfDayFromText(
            mappedOutfit.styleDescription,
            mappedOutfit.occasion,
            mappedOutfit.name,
          );
          const rawSlot = row.time_of_day ? normalizeOutfitTimeOfDay(row.time_of_day) : null;
          // If row had no explicit time_of_day (or defaulted to MORNING while outfit metadata explicitly says Afternoon/Evening calendar log), use inferredSlot
          const effectiveSlot =
            rawSlot && rawSlot !== "MORNING"
              ? rawSlot
              : (inferredSlot ?? rawSlot ?? "MORNING");
          return {
            id: row.id,
            userId: row.user_id,
            outfitId: row.outfit_id,
            plannedFor: row.planned_for,
            timeOfDay: effectiveSlot,
            status: row.status,
            wornAt: row.worn_at ?? null,
            outfit: mappedOutfit,
          };
        })
      : [];

  // Also merge any worn outfits from outfit_history that aren't already in outfit_plans for that (date, slot)
  try {
    let hQuery = supabase
      .from("outfit_history")
      .select(`id, user_id, outfit_id, plan_id, worn_on, time_of_day, worn_at, ${PLAN_OUTFITS_NESTED_SELECT}`)
      .eq("user_id", userId)
      .not("outfit_id", "is", null)
      .order("worn_on", { ascending: true });
    if (from) hQuery = hQuery.gte("worn_on", from);
    if (to) hQuery = hQuery.lte("worn_on", to);

    let { data: hData, error: hError } = await hQuery;
    if (hError && String(hError.message ?? "").toLowerCase().includes("time_of_day")) {
      let hLegacy = supabase
        .from("outfit_history")
        .select(`id, user_id, outfit_id, plan_id, worn_on, worn_at, ${PLAN_OUTFITS_NESTED_SELECT}`)
        .eq("user_id", userId)
        .not("outfit_id", "is", null)
        .order("worn_on", { ascending: true });
      if (from) hLegacy = hLegacy.gte("worn_on", from);
      if (to) hLegacy = hLegacy.lte("worn_on", to);
      const hFallback = await hLegacy;
      hData = hFallback.data as typeof hData;
      hError = hFallback.error;
    }

    if (!hError && hData) {
      type HistoryRowRaw = {
        id: string;
        user_id: string;
        outfit_id: string | null;
        plan_id?: string | null;
        worn_on: string;
        time_of_day?: string | null;
        worn_at: string;
        outfits: PlanRowRaw["outfits"];
      };

      const existingKeys = new Set(
        planRows.map((p) => `${p.plannedFor}:${p.timeOfDay}`),
      );
      const existingPlanIds = new Set(planRows.map((p) => p.id));

      for (const hRow of hData as unknown as HistoryRowRaw[]) {
        if (!hRow.outfit_id || !hRow.outfits) continue;
        if (hRow.plan_id && existingPlanIds.has(hRow.plan_id)) continue;

        const mappedHistOutfit = mapNestedOutfit(hRow.outfits, hRow.outfit_id, hRow.user_id);
        const inferredHistSlot = inferTimeOfDayFromText(
          mappedHistOutfit.styleDescription,
          mappedHistOutfit.occasion,
          mappedHistOutfit.name,
        );
        const rawHistSlot = hRow.time_of_day ? normalizeOutfitTimeOfDay(hRow.time_of_day) : null;
        let slot: OutfitTimeOfDay =
          rawHistSlot && rawHistSlot !== "MORNING"
            ? rawHistSlot
            : (inferredHistSlot ?? rawHistSlot ?? "MORNING");
        // If no explicit time_of_day column was set on legacy history rows and the slot is taken, infer from worn_at UTC hour or pick next open slot
        if (!hRow.time_of_day && existingKeys.has(`${hRow.worn_on}:${slot}`)) {
          const hour = new Date(hRow.worn_at).getHours();
          const candidate: OutfitTimeOfDay =
            hour >= 17 ? "EVENING" : hour >= 12 ? "AFTERNOON" : "MORNING";
          if (!existingKeys.has(`${hRow.worn_on}:${candidate}`)) {
            slot = candidate;
          } else if (!existingKeys.has(`${hRow.worn_on}:AFTERNOON`)) {
            slot = "AFTERNOON";
          } else if (!existingKeys.has(`${hRow.worn_on}:EVENING`)) {
            slot = "EVENING";
          }
        }

        const key = `${hRow.worn_on}:${slot}`;
        if (existingKeys.has(key)) continue;

        existingKeys.add(key);
        planRows.push({
          id: hRow.plan_id || hRow.id,
          userId: hRow.user_id,
          outfitId: hRow.outfit_id,
          plannedFor: hRow.worn_on,
          timeOfDay: slot,
          status: "WORN",
          wornAt: hRow.worn_at,
          outfit: mappedHistOutfit,
        });
      }
    }
  } catch {
    // Non-fatal if outfit_history merge fails
  }

  planRows.sort((a, b) => {
    if (a.plannedFor !== b.plannedFor) {
      return a.plannedFor.localeCompare(b.plannedFor);
    }
    return compareTimeOfDaySlots(a.timeOfDay, b.timeOfDay);
  });

  return planRows;
}

export async function signAllOutfitImages(
  supabase: SupabaseClient,
  outfits: OutfitWithItems[],
  size: ImageSize = "original",
): Promise<Map<string, string>> {
  const paths: string[] = [];
  for (const o of outfits) {
    if (o.photoPath) paths.push(o.photoPath);
    for (const item of o.items) {
      if (item.imagePath) paths.push(item.imagePath);
    }
  }
  return signImageUrls(supabase, [...new Set(paths)], size);
}

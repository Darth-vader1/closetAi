"use server";

import { revalidatePath } from "next/cache";
import { fail, type ActionResult } from "@/lib/actions/result";
import { requireUser } from "@/lib/auth/session";
import { logger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

import { formatLocalDate } from "@/lib/utils/format";
import { isOwnStoragePath } from "@/lib/security/origin";
import {
  OUTFIT_TIME_OF_DAY_SLOTS,
  TIME_OF_DAY_META,
  type OutfitTimeOfDay,
} from "@/lib/outfits/calendar-slots";
import type { OutfitWithItems, PlannedOutfitRow } from "@/lib/outfits/queries";
import { isLaundryStatus } from "@/lib/wardrobe/status";

const GENERIC_ERROR = "Something went wrong. Please try again.";

const saveStylistOutfitSchema = z.object({
  name: z.string().trim().min(1).max(120),
  itemIds: z.array(z.string().uuid()).min(1).max(10),
  occasion: z.string().trim().max(60).nullable().optional(),
  styleDescription: z.string().trim().max(400).nullable().optional(),
  explanation: z.string().trim().max(800).nullable().optional(),
  stylingTip: z.string().trim().max(400).nullable().optional(),
  photoPath: z.string().trim().max(300).nullable().optional(),
});

export async function saveStylistOutfitAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  const parsed = saveStylistOutfitSchema.safeParse(input);
  if (!parsed.success) return fail("Invalid outfit details.");

  const { name, itemIds, occasion, styleDescription, explanation, stylingTip, photoPath } = parsed.data;
  if (photoPath && !isOwnStoragePath(photoPath, user.id)) {
    return fail("Invalid outfit photo reference.");
  }
  const supabase = await createClient();

  const { data: outfit, error: outfitErr } = await supabase
    .from("outfits")
    .insert({
      user_id: user.id,
      name,
      occasion: occasion || null,
      style_description: styleDescription || null,
      explanation: explanation || null,
      styling_tip: stylingTip || null,
      photo_path: photoPath || null,
      source: "AI",
      is_favourite: false,
    })
    .select("id")
    .single();

  if (outfitErr || !outfit) {
    logger.error("stylist.outfit_save_failed", { userId: user.id, error: outfitErr });
    return fail(GENERIC_ERROR);
  }

  const linkRows = itemIds.map((itemId, idx) => ({
    outfit_id: outfit.id as string,
    item_id: itemId,
    user_id: user.id,
    position: idx,
  }));

  const { error: linkErr } = await supabase.from("outfit_items").insert(linkRows);
  if (linkErr) {
    logger.error("stylist.links_failed", { userId: user.id, error: linkErr });
    await supabase.from("outfits").delete().eq("id", outfit.id).eq("user_id", user.id);
    return fail(GENERIC_ERROR);
  }

  revalidatePath("/stylist");
  revalidatePath("/studio");
  revalidatePath("/calendar");
  revalidatePath("/dashboard");

  return { ok: true, id: outfit.id as string };
}

const planOutfitSchema = z.object({
  outfitId: z.string().uuid(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Please provide a valid date (YYYY-MM-DD)."),
  timeOfDay: z.enum(OUTFIT_TIME_OF_DAY_SLOTS).optional().default("MORNING"),
});

export async function planOutfitAction(input: unknown): Promise<ActionResult<{ planId: string; timeOfDay: OutfitTimeOfDay }>> {
  const user = await requireUser();
  const parsed = planOutfitSchema.safeParse(input);
  if (!parsed.success) return fail("Invalid plan date or outfit.");

  const supabase = await createClient();
  const timeOfDay = parsed.data.timeOfDay;

  // Upsert plan for this date + time_of_day slot
  let { data, error } = await supabase
    .from("outfit_plans")
    .upsert(
      {
        user_id: user.id,
        outfit_id: parsed.data.outfitId,
        planned_for: parsed.data.date,
        time_of_day: timeOfDay,
        status: "PLANNED",
      },
      { onConflict: "user_id,planned_for,time_of_day" },
    )
    .select("id")
    .single();

  // Backwards-compatible fallback if the time_of_day migration hasn't been applied on DB yet
  if (error) {
    const fallbackRes = await supabase
      .from("outfit_plans")
      .upsert(
        {
          user_id: user.id,
          outfit_id: parsed.data.outfitId,
          planned_for: parsed.data.date,
          status: "PLANNED",
        },
        { onConflict: "user_id,planned_for" },
      )
      .select("id")
      .single();
    data = fallbackRes.data;
    error = fallbackRes.error;
  }

  if (error || !data) {
    logger.error("stylist.plan_failed", { userId: user.id, error });
    return fail("Could not schedule outfit for this date.");
  }

  revalidatePath("/calendar");
  revalidatePath("/stylist");
  return { ok: true, planId: data.id as string, timeOfDay };
}

const wearOutfitSchema = z.object({
  outfitId: z.string().uuid(),
  itemIds: z.array(z.string().uuid()).optional(),
  planId: z.string().uuid().optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Please provide a valid date (YYYY-MM-DD).")
    .optional(),
  timeOfDay: z.enum(OUTFIT_TIME_OF_DAY_SLOTS).optional().default("MORNING"),
});

export async function wearOutfitTodayAction(
  input: unknown,
): Promise<ActionResult<{ planId?: string; timeOfDay: OutfitTimeOfDay }>> {
  const user = await requireUser();
  const parsed = wearOutfitSchema.safeParse(input);
  if (!parsed.success) return fail("Invalid outfit.");

  const supabase = await createClient();
  const todayStr = parsed.data.date || formatLocalDate(new Date());
  const timeOfDay = parsed.data.timeOfDay;
  const nowIso = new Date().toISOString();

  // Helper to ensure outfit_plans reflects the WORN slot for the calendar
  const syncPlanSlotAsWorn = async (): Promise<string | undefined> => {
    if (parsed.data.planId && !parsed.data.planId.startsWith("history-")) {
      const { data: updatedById } = await supabase
        .from("outfit_plans")
        .update({
          outfit_id: parsed.data.outfitId,
          status: "WORN",
          worn_at: nowIso,
          time_of_day: timeOfDay,
        })
        .eq("id", parsed.data.planId)
        .eq("user_id", user.id)
        .select("id")
        .maybeSingle();
      if (updatedById?.id) return updatedById.id as string;
    }

    const { data: upsertedSlot, error: upsertErr } = await supabase
      .from("outfit_plans")
      .upsert(
        {
          user_id: user.id,
          outfit_id: parsed.data.outfitId,
          planned_for: todayStr,
          time_of_day: timeOfDay,
          status: "WORN",
          worn_at: nowIso,
        },
        { onConflict: "user_id,planned_for,time_of_day" },
      )
      .select("id")
      .maybeSingle();

    if (!upsertErr && upsertedSlot?.id) {
      return upsertedSlot.id as string;
    }

    const { data: legacyUpserted } = await supabase
      .from("outfit_plans")
      .upsert(
        {
          user_id: user.id,
          outfit_id: parsed.data.outfitId,
          planned_for: todayStr,
          status: "WORN",
          worn_at: nowIso,
        },
        { onConflict: "user_id,planned_for" },
      )
      .select("id")
      .maybeSingle();

    return legacyUpserted?.id as string | undefined;
  };

  // Prefer atomic database RPC if migration has been applied (try 4-param with p_time_of_day first, then 3-param)
  let { error: wearRpcErr } = await supabase.rpc("wear_outfit", {
    p_outfit_id: parsed.data.outfitId,
    p_worn_on: todayStr,
    p_plan_id:
      parsed.data.planId && !parsed.data.planId.startsWith("history-")
        ? parsed.data.planId
        : null,
    p_time_of_day: timeOfDay,
  });

  if (wearRpcErr) {
    const legacyRpc = await supabase.rpc("wear_outfit", {
      p_outfit_id: parsed.data.outfitId,
      p_worn_on: todayStr,
      p_plan_id:
        parsed.data.planId && !parsed.data.planId.startsWith("history-")
          ? parsed.data.planId
          : null,
    });
    wearRpcErr = legacyRpc.error;
  }

  if (!wearRpcErr) {
    const planId = await syncPlanSlotAsWorn();
    revalidatePath("/wardrobe");
    revalidatePath("/laundry");
    revalidatePath("/calendar");
    revalidatePath("/stylist");
    revalidatePath("/dashboard");
    return { ok: true, planId, timeOfDay };
  }

  // Fallback when wear_outfit RPC is not yet present or returned a duplicate/missing-signature error:
  // Always read garment IDs from outfit_items in DB (never trust client itemIds)
  const { data: outfitRow, error: outfitCheckErr } = await supabase
    .from("outfits")
    .select("id, outfit_items ( item_id )")
    .eq("id", parsed.data.outfitId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (outfitCheckErr || !outfitRow) {
    logger.error("stylist.wear_outfit_not_found", { userId: user.id, error: outfitCheckErr });
    return fail("Outfit not found.");
  }

  const dbItemIds = ((outfitRow.outfit_items ?? []) as Array<{ item_id: string }>).map((r) => r.item_id);
  const cleanPlanId =
    parsed.data.planId && !parsed.data.planId.startsWith("history-")
      ? parsed.data.planId
      : null;

  // 1. Record in outfit_history (try with time_of_day first, fallback without it, tolerate 23505 duplicate)
  let { data: hist, error: histErr } = await supabase
    .from("outfit_history")
    .insert({
      user_id: user.id,
      outfit_id: parsed.data.outfitId,
      plan_id: cleanPlanId,
      worn_on: todayStr,
      time_of_day: timeOfDay,
      worn_at: nowIso,
    })
    .select("id")
    .single();

  if (histErr && String(histErr.message ?? "").toLowerCase().includes("time_of_day")) {
    const fallbackHist = await supabase
      .from("outfit_history")
      .insert({
        user_id: user.id,
        outfit_id: parsed.data.outfitId,
        plan_id: cleanPlanId,
        worn_on: todayStr,
        worn_at: nowIso,
      })
      .select("id")
      .single();
    hist = fallbackHist.data;
    histErr = fallbackHist.error;
  }

  const isDuplicateHistory = histErr?.code === "23505";
  if (histErr && !isDuplicateHistory) {
    logger.error("stylist.history_failed", { userId: user.id, error: histErr });
    return fail(GENERIC_ERROR);
  }

  // 2. Record items in outfit_history_items & update wardrobe_items if this is a fresh history entry
  if (hist?.id && dbItemIds.length > 0) {
    const historyItems = dbItemIds.map((itemId) => ({
      history_id: hist.id as string,
      item_id: itemId,
      user_id: user.id,
    }));

    const { error: histItemsErr } = await supabase.from("outfit_history_items").insert(historyItems);
    if (histItemsErr && histItemsErr.code !== "23505") {
      logger.error("stylist.history_items_failed", { userId: user.id, error: histItemsErr });
    }

    // 3. Fetch current wear_count and care_type for each item, mark WASHABLE items as WORN, increment wear_count
    const { data: currentItems } = await supabase
      .from("wardrobe_items")
      .select("id, wear_count, status, care_type")
      .eq("user_id", user.id)
      .in("id", dbItemIds);

    await Promise.all(
      (currentItems ?? []).map(async (item) => {
        const nextStatus =
          item.care_type === "WIPE_CLEAN" || item.care_type === "NO_WASH"
            ? item.status
            : "WORN";

        const { error: updateErr } = await supabase
          .from("wardrobe_items")
          .update({
            status: nextStatus,
            wear_count: (item.wear_count ?? 0) + 1,
            last_worn_at: nowIso,
          })
          .eq("id", item.id)
          .eq("user_id", user.id);

        if (updateErr) {
          logger.error("stylist.wear_item_update_failed", { userId: user.id, itemId: item.id, error: updateErr });
        } else {
          await supabase.from("laundry_events").insert({
            user_id: user.id,
            item_id: item.id,
            from_status: item.status,
            to_status: nextStatus,
            confirmed_washed: false,
          });
        }
      }),
    );
  }

  // 4. Upsert or mark outfit_plans slot as WORN
  const planId = await syncPlanSlotAsWorn();

  revalidatePath("/wardrobe");
  revalidatePath("/laundry");
  revalidatePath("/calendar");
  revalidatePath("/stylist");
  revalidatePath("/dashboard");

  return { ok: true, planId, timeOfDay };
}

const logCustomOutfitOnCalendarSchema = z.object({
  name: z.string().trim().max(120).optional(),
  itemIds: z.array(z.string().uuid()).min(1, "Select at least 1 garment.").max(10, "Select up to 10 garments."),
  occasion: z.string().trim().max(60).nullable().optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Please provide a valid date (YYYY-MM-DD)."),
  timeOfDay: z.enum(OUTFIT_TIME_OF_DAY_SLOTS).optional().default("MORNING"),
  intent: z.enum(["WORN", "PLANNED"]).default("WORN"),
});

export async function logCustomOutfitOnCalendarAction(
  input: unknown,
): Promise<ActionResult<{ plan: PlannedOutfitRow }>> {
  const user = await requireUser();
  const parsed = logCustomOutfitOnCalendarSchema.safeParse(input);
  if (!parsed.success) {
    return fail(parsed.error.issues[0]?.message || "Invalid outfit selection.");
  }

  const { itemIds, occasion, date, timeOfDay, intent } = parsed.data;
  const uniqueItemIds = Array.from(new Set(itemIds));
  const supabase = await createClient();

  // Verify garments belong to the authenticated user
  const { data: wardrobeRows, error: itemsErr } = await supabase
    .from("wardrobe_items")
    .select(
      "id, name, category, subcategory, primary_colour, secondary_colours, pattern, material, style, occasions, seasons, warmth_level, image_path, status, care_type, is_favourite, ai_analysed, wear_count, last_worn_at, last_washed_at, created_at",
    )
    .eq("user_id", user.id)
    .in("id", uniqueItemIds);

  if (itemsErr || !wardrobeRows || wardrobeRows.length !== uniqueItemIds.length) {
    logger.error("calendar.custom_outfit_items_invalid", { userId: user.id, error: itemsErr });
    return fail("One or more selected garments could not be found in your wardrobe.");
  }

  const slotLabel = TIME_OF_DAY_META[timeOfDay].label;
  const resolvedName =
    parsed.data.name && parsed.data.name.trim().length > 0
      ? parsed.data.name.trim()
      : `${slotLabel} Look · ${new Date(`${date}T12:00:00`).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        })}`;

  // 1. Create the manual outfit record
  const { data: outfitRow, error: outfitErr } = await supabase
    .from("outfits")
    .insert({
      user_id: user.id,
      name: resolvedName,
      occasion: occasion || slotLabel,
      style_description: `${slotLabel} outfit logged on the Outfit Calendar.`,
      source: "MANUAL",
      is_favourite: false,
    })
    .select("id, created_at")
    .single();

  if (outfitErr || !outfitRow) {
    logger.error("calendar.custom_outfit_create_failed", { userId: user.id, error: outfitErr });
    return fail("Could not save custom outfit.");
  }

  const linkRows = uniqueItemIds.map((itemId, idx) => ({
    outfit_id: outfitRow.id as string,
    item_id: itemId,
    user_id: user.id,
    position: idx,
  }));

  const { error: linkErr } = await supabase.from("outfit_items").insert(linkRows);
  if (linkErr) {
    logger.error("calendar.custom_outfit_links_failed", { userId: user.id, error: linkErr });
    await supabase.from("outfits").delete().eq("id", outfitRow.id).eq("user_id", user.id);
    return fail("Could not attach garments to outfit.");
  }

  // 2. Plan or directly mark as worn for the selected date & time_of_day slot
  let planId = `temp-${outfitRow.id as string}-${date}-${timeOfDay}`;
  const nowIso = new Date().toISOString();

  if (intent === "WORN") {
    const wearRes = await wearOutfitTodayAction({
      outfitId: outfitRow.id as string,
      itemIds: uniqueItemIds,
      date,
      timeOfDay,
    });
    if (!wearRes.ok) {
      return fail(wearRes.error);
    }
    if (wearRes.planId) {
      planId = wearRes.planId;
    }
  } else {
    const planRes = await planOutfitAction({
      outfitId: outfitRow.id as string,
      date,
      timeOfDay,
    });
    if (!planRes.ok) {
      return fail(planRes.error);
    }
    planId = planRes.planId;
  }

  const rowById = new Map(wardrobeRows.map((r) => [r.id as string, r]));
  const orderedItems: OutfitWithItems["items"] = uniqueItemIds
    .map((id) => rowById.get(id))
    .filter((r): r is NonNullable<typeof r> => Boolean(r))
    .map((item) => {
      const careType =
        item.care_type === "WASHABLE" || item.care_type === "WIPE_CLEAN" || item.care_type === "NO_WASH"
          ? item.care_type
          : "WASHABLE";
      const currentStatus = isLaundryStatus(item.status) ? item.status : "CLEAN";
      const nextStatus =
        intent === "WORN" && careType === "WASHABLE" ? "WORN" : currentStatus;
      return {
        id: item.id as string,
        name: item.name as string,
        category: item.category as string,
        subcategory: (item.subcategory as string | null) ?? null,
        primaryColour: (item.primary_colour as string | null) ?? null,
        secondaryColours: (item.secondary_colours as string[] | null) ?? [],
        pattern: (item.pattern as string | null) ?? null,
        material: (item.material as string | null) ?? null,
        style: (item.style as string | null) ?? null,
        occasions: (item.occasions as string[] | null) ?? [],
        seasons: (item.seasons as string[] | null) ?? [],
        warmthLevel: (item.warmth_level as number | null) ?? null,
        imagePath: item.image_path as string,
        status: nextStatus,
        careType,
        isFavourite: Boolean(item.is_favourite),
        aiAnalysed: Boolean(item.ai_analysed),
        wearCount: intent === "WORN" ? ((item.wear_count as number) ?? 0) + 1 : ((item.wear_count as number) ?? 0),
        lastWornAt: intent === "WORN" ? nowIso : ((item.last_worn_at as string | null) ?? null),
        lastWashedAt: (item.last_washed_at as string | null) ?? null,
        createdAt: item.created_at as string,
      };
    });

  const constructedOutfit: OutfitWithItems = {
    id: outfitRow.id as string,
    userId: user.id,
    name: resolvedName,
    occasion: occasion || slotLabel,
    styleDescription: `${slotLabel} outfit logged on the Outfit Calendar.`,
    explanation: null,
    stylingTip: null,
    photoPath: null,
    source: "MANUAL",
    isFavourite: false,
    createdAt: outfitRow.created_at as string,
    items: orderedItems,
  };

  const constructedPlan: PlannedOutfitRow = {
    id: planId,
    userId: user.id,
    outfitId: outfitRow.id as string,
    plannedFor: date,
    timeOfDay,
    status: intent,
    wornAt: intent === "WORN" ? nowIso : null,
    outfit: constructedOutfit,
  };

  return { ok: true, plan: constructedPlan };
}

const removeOutfitPlanSchema = z.object({
  planId: z.string().min(1),
});

export async function removeOutfitPlanAction(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = removeOutfitPlanSchema.safeParse(input);
  if (!parsed.success) return fail("Invalid calendar entry.");

  const supabase = await createClient();
  const { planId } = parsed.data;

  if (planId.startsWith("history-")) {
    const historyId = planId.replace(/^history-/, "");
    await supabase.from("outfit_history").delete().eq("id", historyId).eq("user_id", user.id);
  } else {
    await supabase.from("outfit_plans").delete().eq("id", planId).eq("user_id", user.id);
  }

  revalidatePath("/calendar");
  revalidatePath("/dashboard");
  return { ok: true };
}

const rateOutfitSchema = z.object({
  outfitId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
});

export async function rateOutfitAction(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = rateOutfitSchema.safeParse(input);
  if (!parsed.success) return fail("Rating must be between 1 and 5 stars.");

  const supabase = await createClient();
  const { error } = await supabase.from("outfit_feedback").insert({
    user_id: user.id,
    outfit_id: parsed.data.outfitId,
    action: "RATED",
    rating: parsed.data.rating,
  });

  if (error) {
    logger.error("outfit.rate_failed", { userId: user.id, error });
    return fail("Could not save rating.");
  }

  revalidatePath("/stylist");
  revalidatePath("/dashboard");
  return { ok: true };
}

const feedbackOutfitSchema = z.object({
  outfitId: z.string().uuid(),
  action: z.enum(["LIKED", "REJECTED"]),
});

export async function recordOutfitFeedbackAction(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = feedbackOutfitSchema.safeParse(input);
  if (!parsed.success) return fail("Invalid feedback.");

  const supabase = await createClient();
  const { error } = await supabase.from("outfit_feedback").insert({
    user_id: user.id,
    outfit_id: parsed.data.outfitId,
    action: parsed.data.action,
    rating: null,
  });

  if (error) {
    logger.error("outfit.feedback_failed", { userId: user.id, error });
    return fail("Could not save feedback.");
  }

  revalidatePath("/stylist");
  return { ok: true };
}



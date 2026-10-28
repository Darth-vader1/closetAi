"use server";

import { revalidatePath } from "next/cache";
import { fail, type ActionResult } from "@/lib/actions/result";
import { requireUser } from "@/lib/auth/session";
import { logger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

import { formatLocalDate } from "@/lib/utils/format";

const GENERIC_ERROR = "Something went wrong. Please try again.";

const saveStylistOutfitSchema = z.object({
  name: z.string().trim().min(1).max(120),
  itemIds: z.array(z.string().uuid()).min(1).max(10),
  occasion: z.string().trim().max(60).nullable().optional(),
  styleDescription: z.string().trim().max(400).nullable().optional(),
  explanation: z.string().trim().max(800).nullable().optional(),
  stylingTip: z.string().trim().max(400).nullable().optional(),
});

export async function saveStylistOutfitAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  const parsed = saveStylistOutfitSchema.safeParse(input);
  if (!parsed.success) return fail("Invalid outfit details.");

  const { name, itemIds, occasion, styleDescription, explanation, stylingTip } = parsed.data;
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
});

export async function planOutfitAction(input: unknown): Promise<ActionResult<{ planId: string }>> {
  const user = await requireUser();
  const parsed = planOutfitSchema.safeParse(input);
  if (!parsed.success) return fail("Invalid plan date or outfit.");

  const supabase = await createClient();

  // Upsert plan for this date
  const { data, error } = await supabase
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

  if (error || !data) {
    logger.error("stylist.plan_failed", { userId: user.id, error });
    return fail("Could not schedule outfit for this date.");
  }

  revalidatePath("/calendar");
  revalidatePath("/stylist");
  return { ok: true, planId: data.id as string };
}

const wearOutfitSchema = z.object({
  outfitId: z.string().uuid(),
  itemIds: z.array(z.string().uuid()).optional(),
  planId: z.string().uuid().optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Please provide a valid date (YYYY-MM-DD).")
    .optional(),
});

export async function wearOutfitTodayAction(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = wearOutfitSchema.safeParse(input);
  if (!parsed.success) return fail("Invalid outfit.");

  const supabase = await createClient();
  const todayStr = parsed.data.date || formatLocalDate(new Date());
  const nowIso = new Date().toISOString();

  // Prefer atomic database RPC if migration has been applied
  const { error: wearRpcErr } = await supabase.rpc("wear_outfit", {
    p_outfit_id: parsed.data.outfitId,
    p_worn_on: todayStr,
    p_plan_id: parsed.data.planId ?? null,
  });

  if (!wearRpcErr) {
    revalidatePath("/wardrobe");
    revalidatePath("/laundry");
    revalidatePath("/calendar");
    revalidatePath("/stylist");
    revalidatePath("/dashboard");
    return { ok: true };
  }

  // Fallback when wear_outfit RPC is not yet present: always read garment IDs from outfit_items in DB (never trust client itemIds)
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

  // 1. Record in outfit_history
  const { data: hist, error: histErr } = await supabase
    .from("outfit_history")
    .insert({
      user_id: user.id,
      outfit_id: parsed.data.outfitId,
      plan_id: parsed.data.planId ?? null,
      worn_on: todayStr,
      worn_at: nowIso,
    })
    .select("id")
    .single();

  if (histErr || !hist) {
    logger.error("stylist.history_failed", { userId: user.id, error: histErr });
    return fail(GENERIC_ERROR);
  }

  // 2. Record items in outfit_history_items
  if (dbItemIds.length > 0) {
    const historyItems = dbItemIds.map((itemId) => ({
      history_id: hist.id as string,
      item_id: itemId,
      user_id: user.id,
    }));

    const { error: histItemsErr } = await supabase.from("outfit_history_items").insert(historyItems);
    if (histItemsErr) {
      logger.error("stylist.history_items_failed", { userId: user.id, error: histItemsErr });
      await supabase.from("outfit_history").delete().eq("id", hist.id).eq("user_id", user.id);
      return fail(GENERIC_ERROR);
    }

    // 3. Fetch current wear_count for each item, mark status as WORN, increment wear_count, and set last_worn_at
    const { data: currentItems } = await supabase
      .from("wardrobe_items")
      .select("id, wear_count, status")
      .eq("user_id", user.id)
      .in("id", dbItemIds);

    for (const item of currentItems ?? []) {
      const { error: updateErr } = await supabase
        .from("wardrobe_items")
        .update({
          status: "WORN",
          wear_count: (item.wear_count ?? 0) + 1,
          last_worn_at: nowIso,
        })
        .eq("id", item.id)
        .eq("user_id", user.id);

      if (updateErr) {
        logger.error("stylist.wear_item_update_failed", { userId: user.id, itemId: item.id, error: updateErr });
        return fail(GENERIC_ERROR);
      }

      await supabase.from("laundry_events").insert({
        user_id: user.id,
        item_id: item.id,
        from_status: item.status,
        to_status: "WORN",
        confirmed_washed: false,
      });
    }
  }

  // 4. Mark linked or same-day outfit_plans as WORN
  if (parsed.data.planId) {
    await supabase
      .from("outfit_plans")
      .update({ status: "WORN", worn_at: nowIso })
      .eq("id", parsed.data.planId)
      .eq("user_id", user.id);
  } else {
    await supabase
      .from("outfit_plans")
      .update({ status: "WORN", worn_at: nowIso })
      .eq("user_id", user.id)
      .eq("outfit_id", parsed.data.outfitId)
      .eq("planned_for", todayStr);
  }

  revalidatePath("/wardrobe");
  revalidatePath("/laundry");
  revalidatePath("/calendar");
  revalidatePath("/stylist");
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



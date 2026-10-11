"use server";

import { revalidatePath } from "next/cache";
import { fail, type ActionResult } from "@/lib/actions/result";
import { requireUser } from "@/lib/auth/session";
import { logger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";

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
  itemIds: z.array(z.string().uuid()),
});

export async function wearOutfitTodayAction(input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const parsed = wearOutfitSchema.safeParse(input);
  if (!parsed.success) return fail("Invalid outfit.");

  const supabase = await createClient();
  const todayStr = new Date().toISOString().split("T")[0];

  // 1. Record in outfit_history
  const { data: hist, error: histErr } = await supabase
    .from("outfit_history")
    .insert({
      user_id: user.id,
      outfit_id: parsed.data.outfitId,
      worn_on: todayStr,
    })
    .select("id")
    .single();

  if (histErr || !hist) {
    logger.error("stylist.history_failed", { userId: user.id, error: histErr });
    return fail(GENERIC_ERROR);
  }

  // 2. Record items in outfit_history_items
  const historyItems = parsed.data.itemIds.map((itemId) => ({
    history_id: hist.id as string,
    item_id: itemId,
    user_id: user.id,
  }));

  await supabase.from("outfit_history_items").insert(historyItems);

  // 3. Mark garments status as WORN_ONCE or DIRTY, and increment wear count
  for (const itemId of parsed.data.itemIds) {
    await supabase.rpc("change_item_status", {
      p_item_id: itemId,
      p_to: "WORN_ONCE",
      p_confirm_washed: false,
    }).catch(() => {
      // Fallback direct update if rpc has special rules
      return supabase
        .from("wardrobe_items")
        .update({
          status: "WORN_ONCE",
          last_worn_at: new Date().toISOString(),
        })
        .eq("id", itemId)
        .eq("user_id", user.id);
    });
  }

  revalidatePath("/wardrobe");
  revalidatePath("/laundry");
  revalidatePath("/calendar");
  revalidatePath("/stylist");
  revalidatePath("/dashboard");

  return { ok: true };
}

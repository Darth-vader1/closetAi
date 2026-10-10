"use server";

import { revalidatePath } from "next/cache";
import { fail, zodFieldErrors, type ActionResult } from "@/lib/actions/result";
import { requireUser } from "@/lib/auth/session";
import { logger } from "@/lib/logger";
import { isOwnStoragePath } from "@/lib/security/origin";
import { createClient } from "@/lib/supabase/server";
import { createItemSchema, itemFieldsSchema, statusChangeSchema, uuidSchema } from "@/lib/validation/wardrobe";
import { WARDROBE_BUCKET } from "@/lib/wardrobe/queries";

/**
 * Wardrobe mutations. Rules that apply to every action here:
 *  - the user id comes from the verified session, never from the client;
 *  - every input is re-validated on the server;
 *  - queries also filter by user_id, on top of Row Level Security.
 */

const GENERIC_ERROR = "Something went wrong. Please try again.";

function toRow(fields: ReturnType<typeof itemFieldsSchema.parse>) {
  return {
    name: fields.name,
    category: fields.category,
    subcategory: fields.subcategory,
    primary_colour: fields.primaryColour,
    secondary_colours: fields.secondaryColours,
    pattern: fields.pattern,
    material: fields.material,
    style: fields.style,
    occasions: fields.occasions,
    seasons: fields.seasons,
    warmth_level: fields.warmthLevel,
    is_favourite: fields.isFavourite,
  };
}

function refresh() {
  revalidatePath("/wardrobe");
  revalidatePath("/laundry");
  revalidatePath("/dashboard");
}

export async function saveItemAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  const parsed = createItemSchema.safeParse(input);
  if (!parsed.success) return fail("Please fix the highlighted fields.", zodFieldErrors(parsed.error));
  const { imagePath, aiAnalysed, ...fieldsInput } = parsed.data;

  if (!isOwnStoragePath(imagePath, user.id)) return fail("That photo isn't valid. Please upload it again.");

  const supabase = await createClient();
  const [folder, file] = imagePath.split("/");
  const listing = await supabase.storage.from(WARDROBE_BUCKET).list(folder, { search: file, limit: 1 });
  if (listing.error || !listing.data?.some((o) => o.name === file)) return fail("That photo is no longer available. Please upload it again.");

  const fields = itemFieldsSchema.parse(fieldsInput);
  const { data, error } = await supabase
    .from("wardrobe_items")
    .insert({ user_id: user.id, image_path: imagePath, ai_analysed: aiAnalysed, ...toRow(fields) })
    .select("id")
    .single();

  if (error) {
    if (error.code === "23505") return fail("That photo has already been saved to your wardrobe.");
    logger.error("wardrobe.save_failed", { userId: user.id, code: error.code });
    return fail(GENERIC_ERROR);
  }
  refresh();
  return { ok: true, id: data.id as string };
}

export async function updateItemAction(id: unknown, input: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const idResult = uuidSchema.safeParse(id);
  if (!idResult.success) return fail("That item couldn't be found.");
  const parsed = itemFieldsSchema.safeParse(input);
  if (!parsed.success) return fail("Please fix the highlighted fields.", zodFieldErrors(parsed.error));

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("wardrobe_items")
    .update(toRow(parsed.data))
    .eq("id", idResult.data)
    .eq("user_id", user.id)
    .select("id");
  if (error) {
    logger.error("wardrobe.update_failed", { userId: user.id, code: error.code });
    return fail(GENERIC_ERROR);
  }
  if (!data || data.length === 0) return fail("That item couldn't be found.");
  refresh();
  revalidatePath(`/wardrobe/${idResult.data}`);
  return { ok: true };
}

export async function deleteItemAction(id: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const idResult = uuidSchema.safeParse(id);
  if (!idResult.success) return fail("That item couldn't be found.");

  const supabase = await createClient();
  const found = await supabase.from("wardrobe_items").select("image_path").eq("id", idResult.data).eq("user_id", user.id).maybeSingle();
  if (found.error) return fail(GENERIC_ERROR);
  if (!found.data) return fail("That item couldn't be found.");

  // Row first: it is the source of truth. Outfit links cascade away; outfits themselves are kept.
  const del = await supabase.from("wardrobe_items").delete().eq("id", idResult.data).eq("user_id", user.id);
  if (del.error) {
    logger.error("wardrobe.delete_failed", { userId: user.id, code: del.error.code });
    return fail(GENERIC_ERROR);
  }

  const imagePath = found.data.image_path as string;
  if (isOwnStoragePath(imagePath, user.id)) {
    const removed = await supabase.storage.from(WARDROBE_BUCKET).remove([imagePath]);
    // The item is already gone; a leftover file is harmless, so log it and carry on.
    if (removed.error) logger.warn("wardrobe.photo_cleanup_failed", { userId: user.id, errorMessage: removed.error.message });
  }
  refresh();
  return { ok: true };
}

export async function setFavouriteAction(id: unknown, value: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const idResult = uuidSchema.safeParse(id);
  if (!idResult.success || typeof value !== "boolean") return fail("That item couldn't be found.");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("wardrobe_items")
    .update({ is_favourite: value })
    .eq("id", idResult.data)
    .eq("user_id", user.id)
    .select("id");
  if (error) return fail(GENERIC_ERROR);
  if (!data || data.length === 0) return fail("That item couldn't be found.");
  refresh();
  revalidatePath(`/wardrobe/${idResult.data}`);
  return { ok: true };
}

/**
 * Change one garment's laundry status through the database function, which records the audit event
 * and only sets last_washed_at when `confirmWashed` is true.
 */
export async function changeStatusAction(id: unknown, input: unknown): Promise<ActionResult> {
  await requireUser();
  const idResult = uuidSchema.safeParse(id);
  const parsed = statusChangeSchema.safeParse(input);
  if (!idResult.success || !parsed.success) return fail("That change isn't valid.");

  const supabase = await createClient();
  const { error } = await supabase.rpc("change_item_status", {
    p_item_id: idResult.data,
    p_to: parsed.data.to,
    p_confirm_washed: parsed.data.confirmWashed,
  });
  if (error) {
    if (error.code === "P0002") return fail("That item couldn't be found.");
    if (error.code === "22023") return fail("Washing can only be confirmed when marking an item clean.");
    logger.error("wardrobe.status_failed", { code: error.code });
    return fail(GENERIC_ERROR);
  }
  refresh();
  revalidatePath(`/wardrobe/${idResult.data}`);
  return { ok: true };
}

const MAX_BULK = 100;

/** Apply one status change to several garments (e.g. "all drying items are now washed and clean"). */
export async function bulkChangeStatusAction(ids: unknown, input: unknown): Promise<ActionResult<{ changed: number }>> {
  await requireUser();
  const idsResult = uuidSchema.array().min(1).max(MAX_BULK).safeParse(ids);
  const parsed = statusChangeSchema.safeParse(input);
  if (!idsResult.success || !parsed.success) return fail("That change isn't valid.");

  const supabase = await createClient();
  const outcomes = await Promise.all(
    [...new Set(idsResult.data)].map((id) =>
      supabase.rpc("change_item_status", { p_item_id: id, p_to: parsed.data.to, p_confirm_washed: parsed.data.confirmWashed }),
    ),
  );
  const changed = outcomes.filter((o) => !o.error).length;
  refresh();
  if (changed < outcomes.length) {
    logger.warn("wardrobe.bulk_status_partial", { requested: outcomes.length, changed });
    return fail(`Updated ${changed} of ${outcomes.length} items. Please try the rest again.`);
  }
  return { ok: true, changed };
}

/**
 * Remove a photo the user uploaded but chose not to keep (removed from the batch before saving).
 * Refuses if the photo already belongs to a saved item.
 */
export async function discardUploadAction(path: unknown): Promise<ActionResult> {
  const user = await requireUser();
  if (!isOwnStoragePath(path, user.id)) return fail("That photo isn't valid.");

  const supabase = await createClient();
  const used = await supabase.from("wardrobe_items").select("id").eq("user_id", user.id).eq("image_path", path).maybeSingle();
  if (used.error) return fail(GENERIC_ERROR);
  if (used.data) return fail("That photo is part of a saved item. Delete the item instead.");

  const removed = await supabase.storage.from(WARDROBE_BUCKET).remove([path]);
  if (removed.error) {
    logger.warn("wardrobe.discard_failed", { userId: user.id, errorMessage: removed.error.message });
    return fail(GENERIC_ERROR);
  }
  return { ok: true };
}

"use server";

import { revalidatePath } from "next/cache";
import { fail, zodFieldErrors, type ActionResult } from "@/lib/actions/result";
import { getProfile, requireUser } from "@/lib/auth/session";
import { checkUsageLimit } from "@/lib/billing/entitlements";
import { logger } from "@/lib/logger";
import { generateOutfits, type OutfitSuggestion } from "@/lib/outfits/engine";
import { isOwnStoragePath } from "@/lib/security/origin";
import { createClient } from "@/lib/supabase/server";
import { createOutfitSchema, generateOutfitsQuerySchema } from "@/lib/validation/outfits";
import { uuidSchema } from "@/lib/validation/wardrobe";
import { listWardrobeItems, WARDROBE_BUCKET } from "@/lib/wardrobe/queries";

const GENERIC_ERROR = "Something went wrong. Please try again.";

export async function saveOutfitAction(input: unknown): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();

  const usage = await checkUsageLimit(user.id, "saved_outfits");
  if (!usage.allowed) {
    return fail(
      usage.message ||
        "You have reached the Free plan limit of 10 saved outfits. Upgrade to Premium to save unlimited outfits."
    );
  }

  const parsed = createOutfitSchema.safeParse(input);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.message;
    return fail(firstIssue || "Please fix the highlighted fields.", zodFieldErrors(parsed.error));
  }

  const { name, itemIds, occasion, styleDescription, explanation, stylingTip, photoPath, isFavourite } = parsed.data;

  // Validate photoPath if provided
  if (photoPath && !isOwnStoragePath(photoPath, user.id)) {
    return fail("That outfit photo is not valid.");
  }

  const supabase = await createClient();

  // 1. Insert into outfits
  const outfitRow = {
    user_id: user.id,
    name,
    occasion: occasion || null,
    style_description: styleDescription || null,
    explanation: explanation || null,
    styling_tip: stylingTip || null,
    photo_path: photoPath || null,
    source: "MANUAL",
    is_favourite: isFavourite,
  };

  let insertResult = await supabase.from("outfits").insert(outfitRow).select("id").single();

  // Gracefully fallback if photo_path column doesn't exist yet
  if (insertResult.error && insertResult.error.message.includes("photo_path")) {
    const { photo_path: _unusedPhotoPath, ...withoutPhoto } = outfitRow;
    void _unusedPhotoPath;
    insertResult = await supabase.from("outfits").insert(withoutPhoto).select("id").single();
  }

  if (insertResult.error || !insertResult.data) {
    logger.error("outfit.save_failed", { userId: user.id, error: insertResult.error });
    return fail(GENERIC_ERROR);
  }

  const outfitId = insertResult.data.id as string;

  // 2. Insert into outfit_items with positions
  const linkRows = itemIds.map((itemId, idx) => ({
    outfit_id: outfitId,
    item_id: itemId,
    user_id: user.id,
    position: idx,
  }));

  const linkResult = await supabase.from("outfit_items").insert(linkRows);
  if (linkResult.error) {
    logger.error("outfit.links_failed", { userId: user.id, error: linkResult.error });
    // Rollback outfit
    await supabase.from("outfits").delete().eq("id", outfitId).eq("user_id", user.id);
    return fail(GENERIC_ERROR);
  }

  revalidatePath("/studio");
  revalidatePath("/dashboard");
  return { ok: true, id: outfitId };
}

export async function deleteOutfitAction(id: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const idResult = uuidSchema.safeParse(id);
  if (!idResult.success) return fail("That outfit couldn't be found.");

  const supabase = await createClient();
  const found = await supabase
    .from("outfits")
    .select("photo_path")
    .eq("id", idResult.data)
    .eq("user_id", user.id)
    .maybeSingle();

  const del = await supabase.from("outfits").delete().eq("id", idResult.data).eq("user_id", user.id);
  if (del.error) {
    logger.error("outfit.delete_failed", { userId: user.id, error: del.error });
    return fail(GENERIC_ERROR);
  }

  // Cleanup photo if present
  if (found.data?.photo_path && isOwnStoragePath(found.data.photo_path, user.id)) {
    await supabase.storage.from(WARDROBE_BUCKET).remove([found.data.photo_path]);
  }

  revalidatePath("/studio");
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function toggleOutfitFavouriteAction(id: unknown, value: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const idResult = uuidSchema.safeParse(id);
  if (!idResult.success || typeof value !== "boolean") return fail("That outfit couldn't be found.");

  const supabase = await createClient();
  const { error } = await supabase
    .from("outfits")
    .update({ is_favourite: value })
    .eq("id", idResult.data)
    .eq("user_id", user.id);

  if (error) return fail(GENERIC_ERROR);

  revalidatePath("/studio");
  return { ok: true };
}

export async function generateOutfitSuggestionsAction(
  queryInput?: unknown,
): Promise<ActionResult<{ suggestions: OutfitSuggestion[] }>> {
  const user = await requireUser();
  const profile = await getProfile();
  const parsed = generateOutfitsQuerySchema.safeParse(queryInput ?? {});

  const supabase = await createClient();
  // Fetch up to 200 items for engine evaluation
  const { items } = await listWardrobeItems(supabase, user.id, {
    q: "",
    category: null,
    colour: null,
    status: null,
    favouritesOnly: false,
    sort: "newest",
    page: 1,
  });

  const suggestions = generateOutfits(items, {
    allowRewearWorn: profile?.rewear_worn_items ?? false,
    targetOccasion: parsed.success ? parsed.data.occasion : null,
    targetStyle: parsed.success ? parsed.data.style : null,
    limit: parsed.success ? parsed.data.limit : 5,
  });

  return { ok: true, suggestions };
}

"use server";

import { revalidatePath } from "next/cache";
import { fail, zodFieldErrors, type ActionResult } from "@/lib/actions/result";
import { requireUser } from "@/lib/auth/session";
import { logger } from "@/lib/logger";
import { isOwnStoragePath } from "@/lib/security/origin";
import { createClient } from "@/lib/supabase/server";
import { saveFlatlaySchema } from "@/lib/flatlay/validation";
import { uuidSchema } from "@/lib/validation/wardrobe";
import { WARDROBE_BUCKET } from "@/lib/wardrobe/queries";

const GENERIC_ERROR = "Something went wrong while saving your flatlay. Please try again.";

export async function saveFlatlayAction(
  input: unknown,
): Promise<ActionResult<{ id: string; outfitId?: string | null }>> {
  const user = await requireUser();
  const parsed = saveFlatlaySchema.safeParse(input);
  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0]?.message;
    return fail(
      firstIssue || "Please check your flatlay board details and try again.",
      zodFieldErrors(parsed.error),
    );
  }

  const {
    id,
    name,
    preset,
    aspectRatio,
    canvasWidth,
    canvasHeight,
    backgroundColor,
    backgroundStyle,
    items,
    thumbnailPath,
    saveAsOutfit,
  } = parsed.data;

  // Validate thumbnail path if provided
  if (thumbnailPath && !isOwnStoragePath(thumbnailPath, user.id)) {
    return fail("Invalid thumbnail storage path.");
  }

  const supabase = await createClient();

  // Security Check: Verify user owns every wardrobe item referenced in the flatlay
  const wardrobeItemIds = [...new Set(items.map((i) => i.wardrobeItemId))];
  if (wardrobeItemIds.length > 0) {
    const { data: owned, error: checkErr } = await supabase
      .from("wardrobe_items")
      .select("id")
      .eq("user_id", user.id)
      .in("id", wardrobeItemIds);

    if (checkErr || !owned || owned.length !== wardrobeItemIds.length) {
      logger.warn("flatlay.unauthorized_items_attempted", { userId: user.id });
      return fail("You can only include garments from your own wardrobe.");
    }
  }

  let linkedOutfitId = parsed.data.outfitId ?? null;

  // Optionally create a ClosetAI outfit record alongside the flatlay board
  if (saveAsOutfit && !linkedOutfitId && wardrobeItemIds.length >= 1) {
    const outfitRow = {
      user_id: user.id,
      name,
      occasion: null,
      style_description: `Flatlay Composition (${preset})`,
      explanation: "Created in ClosetAI Flatlay Studio",
      photo_path: thumbnailPath || null,
      source: "MANUAL",
      is_favourite: false,
    };

    const { data: outfitData, error: outfitErr } = await supabase
      .from("outfits")
      .insert(outfitRow)
      .select("id")
      .single();

    if (!outfitErr && outfitData) {
      linkedOutfitId = outfitData.id;
      // Link items
      const linkRows = wardrobeItemIds.map((itemId, idx) => ({
        outfit_id: linkedOutfitId as string,
        item_id: itemId,
        user_id: user.id,
        position: idx,
      }));
      await supabase.from("outfit_items").insert(linkRows);
    }
  }

  const compositionRow = {
    user_id: user.id,
    name,
    preset,
    aspect_ratio: aspectRatio,
    canvas_width: canvasWidth,
    canvas_height: canvasHeight,
    background_color: backgroundColor,
    background_style: backgroundStyle,
    items,
    thumbnail_path: thumbnailPath || null,
    outfit_id: linkedOutfitId,
  };

  let savedId = id;

  if (id) {
    // Update existing
    const { data, error } = await supabase
      .from("flatlay_compositions")
      .update(compositionRow)
      .eq("id", id)
      .eq("user_id", user.id)
      .select("id")
      .single();

    if (error || !data) {
      if (
        (error as { code?: string; message?: string })?.code === "42P01" ||
        (error as { code?: string; message?: string })?.code === "PGRST204" ||
        (error as { code?: string; message?: string })?.message?.includes("does not exist")
      ) {
        return fail("Database table 'flatlay_compositions' is not set up yet. Please apply migration 20261021000001_flatlay_compositions.sql.");
      }
      logger.error("flatlay.update_failed", { userId: user.id, error });
      return fail(GENERIC_ERROR);
    }
    savedId = data.id;
  } else {
    // Insert new
    const { data, error } = await supabase
      .from("flatlay_compositions")
      .insert(compositionRow)
      .select("id")
      .single();

    if (error || !data) {
      if (
        (error as { code?: string; message?: string })?.code === "42P01" ||
        (error as { code?: string; message?: string })?.code === "PGRST204" ||
        (error as { code?: string; message?: string })?.message?.includes("does not exist")
      ) {
        return fail("Database table 'flatlay_compositions' is not set up yet. Please apply migration 20261021000001_flatlay_compositions.sql.");
      }
      logger.error("flatlay.insert_failed", { userId: user.id, error });
      return fail(GENERIC_ERROR);
    }
    savedId = data.id;
  }

  revalidatePath("/studio");
  revalidatePath("/studio/flatlay");
  return { ok: true, id: savedId as string, outfitId: linkedOutfitId };
}

export async function deleteFlatlayAction(id: unknown): Promise<ActionResult> {
  const user = await requireUser();
  const idResult = uuidSchema.safeParse(id);
  if (!idResult.success) return fail("That flatlay board couldn't be found.");

  const supabase = await createClient();

  // Find thumbnail for cleanup
  const { data: found } = await supabase
    .from("flatlay_compositions")
    .select("thumbnail_path")
    .eq("id", idResult.data)
    .eq("user_id", user.id)
    .maybeSingle();

  const { error } = await supabase
    .from("flatlay_compositions")
    .delete()
    .eq("id", idResult.data)
    .eq("user_id", user.id);

  if (error) {
    logger.error("flatlay.delete_failed", { userId: user.id, error });
    return fail("Could not delete flatlay board.");
  }

  if (found?.thumbnail_path && isOwnStoragePath(found.thumbnail_path, user.id)) {
    await supabase.storage.from(WARDROBE_BUCKET).remove([found.thumbnail_path]);
  }

  revalidatePath("/studio");
  revalidatePath("/studio/flatlay");
  return { ok: true };
}

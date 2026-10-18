"use server";

import { revalidatePath } from "next/cache";
import { fail, zodFieldErrors, type ActionResult } from "@/lib/actions/result";
import { requireUser } from "@/lib/auth/session";
import { findDuplicateImportedItem } from "@/lib/import/duplicate-check";
import { normalizeProductUrl } from "@/lib/import/safe-fetch";
import { logger } from "@/lib/logger";
import { isOwnStoragePath } from "@/lib/security/origin";
import { createClient } from "@/lib/supabase/server";
import {
  createItemSchema,
  itemFieldsSchema,
  saveBeautifiedImageSchema,
  statusChangeSchema,
  uuidSchema,
} from "@/lib/validation/wardrobe";
import {
  getWardrobeItem,
  signImageUrls,
  WARDROBE_BUCKET,
} from "@/lib/wardrobe/queries";

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
    care_type: fields.careType,
  };
}

function refresh() {
  revalidatePath("/wardrobe");
  revalidatePath("/studio");
  revalidatePath("/laundry");
  revalidatePath("/dashboard");
}

async function storageObjectExists(
  supabase: Awaited<ReturnType<typeof createClient>>,
  path: string,
): Promise<boolean> {
  const [folder, file] = path.split("/");
  if (!folder || !file) return false;
  const listing = await supabase.storage
    .from(WARDROBE_BUCKET)
    .list(folder, { search: file, limit: 1 });
  return Boolean(!listing.error && listing.data?.some((o) => o.name === file));
}

export async function saveItemAction(
  input: unknown,
): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  const parsed = createItemSchema.safeParse(input);
  if (!parsed.success) {
    return fail(
      "Please fix the highlighted fields.",
      zodFieldErrors(parsed.error),
    );
  }
  const {
    imagePath,
    originalImagePath,
    beautifiedImagePath,
    beautificationMode,
    beautificationProvider,
    beautificationModel,
    beautificationStatus,
    aiAnalysed,
    sourceUrl,
    sourceBrand,
    sourceImageSha256,
    allowDuplicate,
    ...fieldsInput
  } = parsed.data;

  const resolvedOriginalPath = originalImagePath ?? imagePath;
  const resolvedBeautifiedPath = beautifiedImagePath ?? null;

  if (
    !isOwnStoragePath(imagePath, user.id) ||
    !isOwnStoragePath(resolvedOriginalPath, user.id) ||
    (resolvedBeautifiedPath !== null &&
      !isOwnStoragePath(resolvedBeautifiedPath, user.id))
  ) {
    return fail("That photo isn't valid. Please upload it again.");
  }

  let normalizedSourceUrl: string | null = null;
  if (sourceUrl) {
    try {
      normalizedSourceUrl = normalizeProductUrl(sourceUrl);
    } catch {
      normalizedSourceUrl = sourceUrl;
    }
  }

  const supabase = await createClient();
  if (!(await storageObjectExists(supabase, imagePath))) {
    return fail("That photo is no longer available. Please upload it again.");
  }

  if (!allowDuplicate && (normalizedSourceUrl || sourceImageSha256)) {
    const duplicate = await findDuplicateImportedItem(supabase, user.id, {
      sourceUrl: normalizedSourceUrl,
      sourceImageSha256: sourceImageSha256 ?? null,
    });
    if (duplicate) {
      return fail(
        `This product has already been imported to your wardrobe ("${duplicate.name}").`,
      );
    }
  }

  const fields = itemFieldsSchema.parse(fieldsInput);
  const fullPayload = {
    user_id: user.id,
    image_path: imagePath,
    original_image_path: resolvedOriginalPath,
    beautified_image_path: resolvedBeautifiedPath,
    beautification_mode: resolvedBeautifiedPath
      ? (beautificationMode ?? "clean-cutout")
      : null,
    beautification_provider: resolvedBeautifiedPath
      ? (beautificationProvider ?? "local-studio")
      : null,
    beautification_model: resolvedBeautifiedPath
      ? (beautificationModel ?? "closetai-cv-v2")
      : null,
    beautification_status:
      beautificationStatus ?? (resolvedBeautifiedPath ? "COMPLETED" : "NONE"),
    beautified_at: resolvedBeautifiedPath ? new Date().toISOString() : null,
    ai_analysed: aiAnalysed,
    ...(normalizedSourceUrl ? { source_url: normalizedSourceUrl } : {}),
    ...(sourceBrand ? { source_brand: sourceBrand } : {}),
    ...(sourceImageSha256 ? { source_image_sha256: sourceImageSha256 } : {}),
    ...toRow(fields),
  };

  let { data, error } = await supabase
    .from("wardrobe_items")
    .insert(fullPayload)
    .select("id")
    .single();

  if (
    error &&
    (error.message.includes("original_image_path") ||
      error.message.includes("source_url") ||
      error.message.includes("source_brand") ||
      error.message.includes("source_image_sha256") ||
      error.code === "42703")
  ) {
    const fallbackInsert = await supabase
      .from("wardrobe_items")
      .insert({
        user_id: user.id,
        image_path: imagePath,
        ai_analysed: aiAnalysed,
        ...toRow(fields),
      })
      .select("id")
      .single();
    data = fallbackInsert.data;
    error = fallbackInsert.error;
  }

  if (error || !data) {
    if (error?.code === "23505") {
      return fail("That photo has already been saved to your wardrobe.");
    }
    logger.error("wardrobe.save_failed", {
      userId: user.id,
      code: error?.code,
    });
    return fail(GENERIC_ERROR);
  }
  refresh();
  return { ok: true, id: data.id as string };
}

export async function updateItemAction(
  id: unknown,
  input: unknown,
): Promise<ActionResult> {
  const user = await requireUser();
  const idResult = uuidSchema.safeParse(id);
  if (!idResult.success) return fail("That item couldn't be found.");
  const parsed = itemFieldsSchema.safeParse(input);
  if (!parsed.success) {
    return fail(
      "Please fix the highlighted fields.",
      zodFieldErrors(parsed.error),
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("wardrobe_items")
    .update(toRow(parsed.data))
    .eq("id", idResult.data)
    .eq("user_id", user.id)
    .select("id");
  if (error) {
    logger.error("wardrobe.update_failed", {
      userId: user.id,
      code: error.code,
    });
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
  const item = await getWardrobeItem(supabase, user.id, idResult.data);
  if (!item) return fail("That item couldn't be found.");

  // Row first: it is the source of truth. Outfit links cascade away; outfits themselves are kept.
  const del = await supabase
    .from("wardrobe_items")
    .delete()
    .eq("id", idResult.data)
    .eq("user_id", user.id);
  if (del.error) {
    logger.error("wardrobe.delete_failed", {
      userId: user.id,
      code: del.error.code,
    });
    return fail(GENERIC_ERROR);
  }

  const pathsToRemove = [
    ...new Set(
      [item.imagePath, item.originalImagePath, item.beautifiedImagePath].filter(
        (p): p is string => Boolean(p && isOwnStoragePath(p, user.id)),
      ),
    ),
  ];

  if (pathsToRemove.length > 0) {
    const removed = await supabase.storage
      .from(WARDROBE_BUCKET)
      .remove(pathsToRemove);
    if (removed.error) {
      logger.warn("wardrobe.photo_cleanup_failed", {
        userId: user.id,
        errorMessage: removed.error.message,
      });
    }
  }
  refresh();
  return { ok: true };
}

export async function setFavouriteAction(
  id: unknown,
  value: unknown,
): Promise<ActionResult> {
  const user = await requireUser();
  const idResult = uuidSchema.safeParse(id);
  if (!idResult.success || typeof value !== "boolean") {
    return fail("That item couldn't be found.");
  }

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
 * Returns fresh, full-resolution signed URLs for an existing wardrobe item's
 * original and beautified images so the client can run or re-run beautification
 * without hitting expired signed URLs or low-res display transforms.
 */
export async function getItemBeautifyUrlsAction(id: unknown): Promise<
  ActionResult<{
    originalPath: string;
    originalUrl: string;
    beautifiedPath: string | null;
    beautifiedUrl: string | null;
  }>
> {
  const user = await requireUser();
  const idResult = uuidSchema.safeParse(id);
  if (!idResult.success) return fail("That item couldn't be found.");

  const supabase = await createClient();
  const item = await getWardrobeItem(supabase, user.id, idResult.data);
  if (!item) return fail("That item couldn't be found.");

  const originalPath = item.originalImagePath ?? item.imagePath;
  const beautifiedPath = item.beautifiedImagePath ?? null;
  const paths = [
    originalPath,
    ...(beautifiedPath ? [beautifiedPath] : []),
  ];
  const signed = await signImageUrls(supabase, paths, "original");
  const originalUrl = signed.get(originalPath);
  if (!originalUrl) {
    return fail("Could not load the original photo for this garment.");
  }

  return {
    ok: true,
    originalPath,
    originalUrl,
    beautifiedPath,
    beautifiedUrl: beautifiedPath
      ? (signed.get(beautifiedPath) ?? null)
      : null,
  };
}

/**
 * Saves an accepted beautified garment image for an existing wardrobe item
 * while preserving `original_image_path` so the user can always view or
 * switch back to the original photograph.
 */
export async function saveBeautifiedImageAction(
  id: unknown,
  input: unknown,
): Promise<
  ActionResult<{
    activeImagePath: string;
    activeImageUrl: string | null;
    originalImageUrl: string | null;
    beautifiedImageUrl: string | null;
    beautificationMode: "clean-cutout" | "ai-enhance";
    beautificationProvider: string;
    beautificationModel: string;
    beautifiedAt: string;
  }>
> {
  const user = await requireUser();
  const idResult = uuidSchema.safeParse(id);
  if (!idResult.success) return fail("That item couldn't be found.");

  const parsed = saveBeautifiedImageSchema.safeParse(input);
  if (!parsed.success) return fail("Invalid beautified image data.");

  const { beautifiedPath, mode, provider, model } = parsed.data;
  if (!isOwnStoragePath(beautifiedPath, user.id)) {
    return fail("Unauthorized image storage path.");
  }

  const supabase = await createClient();
  const item = await getWardrobeItem(supabase, user.id, idResult.data);
  if (!item) return fail("That item couldn't be found.");

  if (!(await storageObjectExists(supabase, beautifiedPath))) {
    return fail(
      "The beautified photo could not be found in storage. Please try again.",
    );
  }

  const previousBeautified = item.beautifiedImagePath ?? null;
  const preservedOriginal = item.originalImagePath ?? item.imagePath;
  const resolvedProvider = provider ?? "local-studio";
  const resolvedModel = model ?? "closetai-cv-v2";
  const nowIso = new Date().toISOString();

  let { error } = await supabase
    .from("wardrobe_items")
    .update({
      image_path: beautifiedPath,
      original_image_path: preservedOriginal,
      beautified_image_path: beautifiedPath,
      beautification_mode: mode,
      beautification_provider: resolvedProvider,
      beautification_model: resolvedModel,
      beautification_status: "COMPLETED",
      beautified_at: nowIso,
    })
    .eq("id", idResult.data)
    .eq("user_id", user.id);

  if (
    error &&
    (error.message.includes("original_image_path") ||
      error.message.includes("beautification_provider") ||
      error.code === "42703")
  ) {
    const fallbackUpdate = await supabase
      .from("wardrobe_items")
      .update({ image_path: beautifiedPath })
      .eq("id", idResult.data)
      .eq("user_id", user.id);
    error = fallbackUpdate.error;
  }

  if (error) {
    logger.error("wardrobe.save_beautified_failed", {
      userId: user.id,
      code: error.code,
    });
    return fail(GENERIC_ERROR);
  }

  // Clean up superseded beautified file if it is neither the original nor the new beautified path
  if (
    previousBeautified &&
    previousBeautified !== beautifiedPath &&
    previousBeautified !== preservedOriginal &&
    isOwnStoragePath(previousBeautified, user.id)
  ) {
    await supabase.storage
      .from(WARDROBE_BUCKET)
      .remove([previousBeautified])
      .catch(() => null);
  }

  const signed = await signImageUrls(
    supabase,
    [preservedOriginal, beautifiedPath],
    "medium",
  );

  refresh();
  revalidatePath(`/wardrobe/${idResult.data}`);

  return {
    ok: true,
    activeImagePath: beautifiedPath,
    activeImageUrl: signed.get(beautifiedPath) ?? null,
    originalImageUrl: signed.get(preservedOriginal) ?? null,
    beautifiedImageUrl: signed.get(beautifiedPath) ?? null,
    beautificationMode: mode,
    beautificationProvider: resolvedProvider,
    beautificationModel: resolvedModel,
    beautifiedAt: nowIso,
  };
}

/**
 * Switches the active wardrobe & Flatlay Studio display photo between the
 * preserved original image and the beautified product image.
 */
export async function switchItemImageVersionAction(
  id: unknown,
  version: unknown,
): Promise<
  ActionResult<{
    activeVersion: "original" | "beautified";
    activeImagePath: string;
    activeImageUrl: string | null;
  }>
> {
  const user = await requireUser();
  const idResult = uuidSchema.safeParse(id);
  if (
    !idResult.success ||
    (version !== "original" && version !== "beautified")
  ) {
    return fail("Invalid image version selection.");
  }

  const supabase = await createClient();
  const item = await getWardrobeItem(supabase, user.id, idResult.data);
  if (!item) return fail("That item couldn't be found.");

  const targetPath =
    version === "original"
      ? (item.originalImagePath ?? item.imagePath)
      : (item.beautifiedImagePath ?? null);

  if (!targetPath || !isOwnStoragePath(targetPath, user.id)) {
    return fail(
      version === "beautified"
        ? "No beautified version is saved for this item yet."
        : "Original photo is not available.",
    );
  }

  const nextStatus =
    version === "original" ? "RESTORED_ORIGINAL" : "COMPLETED";

  let { error } = await supabase
    .from("wardrobe_items")
    .update({
      image_path: targetPath,
      beautification_status: nextStatus,
    })
    .eq("id", idResult.data)
    .eq("user_id", user.id);

  if (
    error &&
    (error.message.includes("beautification_status") || error.code === "42703")
  ) {
    const fallbackUpdate = await supabase
      .from("wardrobe_items")
      .update({ image_path: targetPath })
      .eq("id", idResult.data)
      .eq("user_id", user.id);
    error = fallbackUpdate.error;
  }

  if (error) {
    logger.error("wardrobe.switch_image_version_failed", {
      userId: user.id,
      code: error.code,
    });
    return fail(GENERIC_ERROR);
  }

  const signed = await signImageUrls(supabase, [targetPath], "medium");
  refresh();
  revalidatePath(`/wardrobe/${idResult.data}`);

  return {
    ok: true,
    activeVersion: version,
    activeImagePath: targetPath,
    activeImageUrl: signed.get(targetPath) ?? null,
  };
}

/**
 * Change one garment's laundry status through the database function, which records the audit event
 * and only sets last_washed_at when `confirmWashed` is true.
 * The database trigger will prevent setting non-washable items to wash cycle statuses.
 */
export async function changeStatusAction(
  id: unknown,
  input: unknown,
): Promise<ActionResult> {
  await requireUser();
  const idResult = uuidSchema.safeParse(id);
  const parsed = statusChangeSchema.safeParse(input);
  if (!idResult.success || !parsed.success) {
    return fail("That change isn't valid.");
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("change_item_status", {
    p_item_id: idResult.data,
    p_to: parsed.data.to,
    p_confirm_washed: parsed.data.confirmWashed,
  });
  if (error) {
    if (error.code === "P0002") return fail("That item couldn't be found.");
    if (error.code === "22023") {
      return fail(
        "Washing can only be confirmed when marking an item clean.",
      );
    }
    if (error.code === "23514") {
      return fail(
        "This item doesn't need washing. Non-washable items like accessories and shoes always stay clean.",
      );
    }
    logger.error("wardrobe.status_failed", { code: error.code });
    return fail(GENERIC_ERROR);
  }
  refresh();
  revalidatePath(`/wardrobe/${idResult.data}`);
  return { ok: true };
}

const MAX_BULK = 100;

/** Apply one status change to several garments (e.g. "all drying items are now washed and clean"). */
export async function bulkChangeStatusAction(
  ids: unknown,
  input: unknown,
): Promise<ActionResult<{ changed: number }>> {
  await requireUser();
  const idsResult = uuidSchema.array().min(1).max(MAX_BULK).safeParse(ids);
  const parsed = statusChangeSchema.safeParse(input);
  if (!idsResult.success || !parsed.success) {
    return fail("That change isn't valid.");
  }

  const supabase = await createClient();
  const outcomes = await Promise.all(
    [...new Set(idsResult.data)].map((id) =>
      supabase.rpc("change_item_status", {
        p_item_id: id,
        p_to: parsed.data.to,
        p_confirm_washed: parsed.data.confirmWashed,
      }),
    ),
  );
  const changed = outcomes.filter((o) => !o.error).length;
  refresh();
  if (changed < outcomes.length) {
    logger.warn("wardrobe.bulk_status_partial", {
      requested: outcomes.length,
      changed,
    });
    return fail(
      `Updated ${changed} of ${outcomes.length} items. Please try the rest again.`,
    );
  }
  return { ok: true, changed };
}

/**
 * Remove a photo the user uploaded but chose not to keep (removed from the batch before saving
 * or rejected during beautification preview).
 * Refuses if the photo belongs to any saved item (as active, original, or beautified image).
 */
export async function discardUploadAction(path: unknown): Promise<ActionResult> {
  const user = await requireUser();
  if (!isOwnStoragePath(path, user.id)) return fail("That photo isn't valid.");

  const supabase = await createClient();
  const activeUsed = await supabase
    .from("wardrobe_items")
    .select("id")
    .eq("user_id", user.id)
    .eq("image_path", path)
    .maybeSingle();
  if (activeUsed.error) return fail(GENERIC_ERROR);
  if (activeUsed.data) {
    return fail("That photo is part of a saved item. Delete the item instead.");
  }

  // Also check original_image_path and beautified_image_path when migration columns exist
  const versionUsed = await supabase
    .from("wardrobe_items")
    .select("id")
    .eq("user_id", user.id)
    .or(`original_image_path.eq.${path},beautified_image_path.eq.${path}`)
    .limit(1);
  if (!versionUsed.error && versionUsed.data && versionUsed.data.length > 0) {
    return fail("That photo is part of a saved item. Delete the item instead.");
  }

  const removed = await supabase.storage.from(WARDROBE_BUCKET).remove([path]);
  if (removed.error) {
    logger.warn("wardrobe.discard_failed", {
      userId: user.id,
      errorMessage: removed.error.message,
    });
    return fail(GENERIC_ERROR);
  }
  return { ok: true };
}

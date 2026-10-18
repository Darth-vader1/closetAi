import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { findDuplicateImportedItem } from "@/lib/import/duplicate-check";
import { SafeFetchError, safeFetchImage } from "@/lib/import/safe-fetch";
import { logger } from "@/lib/logger";
import { isSameOrigin } from "@/lib/security/origin";
import { createClient } from "@/lib/supabase/server";
import { WARDROBE_BUCKET } from "@/lib/wardrobe/queries";

const requestSchema = z.object({
  imageUrl: z.string().trim().min(1).max(2048),
  sourceUrl: z.string().trim().max(2048).nullable().optional(),
});

const json = (body: Record<string, unknown>, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });

/**
 * POST /api/wardrobe/import-image
 *
 * Downloads a user-selected product image from a remote store URL using `safeFetchImage`
 * (enforcing SSRF protections, DNS-rebinding protections, redirect validation, byte-size limits,
 * magic-byte sniffing, and image dimension checks), stores the original image in the authenticated
 * user's folder inside `WARDROBE_BUCKET`, and checks for duplicate imports.
 */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request.headers)) {
    return json({ ok: false, error: "Cross-site requests aren't allowed." }, 403);
  }

  try {
    const user = await getSessionUser();
    if (!user) {
      return json({ ok: false, error: "Please sign in again." }, 401);
    }

    const parsed = requestSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) {
      return json(
        {
          ok: false,
          code: "INVALID_URL",
          error: "Invalid product image URL.",
        },
        400,
      );
    }

    let validatedImage: Awaited<ReturnType<typeof safeFetchImage>>;
    try {
      validatedImage = await safeFetchImage(parsed.data.imageUrl, {
        signal: request.signal,
      });
    } catch (err) {
      if (err instanceof SafeFetchError) {
        const isSecurityReject =
          err.code === "INVALID_URL" ||
          err.code === "UNSUPPORTED_PROTOCOL" ||
          err.code === "PROHIBITED_HOST" ||
          err.code === "PROHIBITED_IP" ||
          err.code === "TOO_MANY_REDIRECTS";
        return json(
          {
            ok: false,
            code: err.code,
            error: err.message,
            fallbackHint:
              "Try selecting another image from the gallery, or copy & paste (Ctrl+V) the image directly from the store page.",
          },
          isSecurityReject ? 400 : 422,
        );
      }
      throw err;
    }

    const supabase = await createClient();
    const duplicateItem = await findDuplicateImportedItem(supabase, user.id, {
      sourceUrl: parsed.data.sourceUrl ?? null,
      sourceImageSha256: validatedImage.sha256,
    });

    // Ownership is enforced server-side: path always starts with `${user.id}/`
    const storagePath = `${user.id}/${crypto.randomUUID()}.${validatedImage.extension}`;

    const uploadRes = await supabase.storage
      .from(WARDROBE_BUCKET)
      .upload(storagePath, validatedImage.bytes, {
        contentType: validatedImage.mimeType,
        upsert: false,
      });

    if (uploadRes.error) {
      logger.error("wardrobe.import_image_upload_failed", {
        userId: user.id,
        errorMessage: uploadRes.error.message,
      });
      return json(
        {
          ok: false,
          code: "STORAGE_ERROR",
          error: "Could not save the product image to your wardrobe storage.",
        },
        500,
      );
    }

    const dataUrl = `data:${validatedImage.mimeType};base64,${Buffer.from(
      validatedImage.bytes,
    ).toString("base64")}`;

    return json({
      ok: true,
      path: storagePath,
      mimeType: validatedImage.mimeType,
      extension: validatedImage.extension,
      width: validatedImage.width,
      height: validatedImage.height,
      sha256: validatedImage.sha256,
      dataUrl,
      duplicateItem,
    });
  } catch (err) {
    logger.error("wardrobe.import_image_error", { err });
    return json(
      {
        ok: false,
        code: "INTERNAL_ERROR",
        error: "Could not download that product image right now.",
        fallbackHint:
          "You can right-click the image on the store page, copy it, and press Ctrl+V here.",
      },
      500,
    );
  }
}

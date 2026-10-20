import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { takeAiQuota } from "@/lib/ai/rate-limit";
import { getSessionUser } from "@/lib/auth/session";
import { ConfigError } from "@/lib/env";
import { logger } from "@/lib/logger";
import { MAX_UPLOAD_BYTES, sniffImage } from "@/lib/security/image-sniff";
import { isOwnStoragePath, isSameOrigin } from "@/lib/security/origin";
import { createClient } from "@/lib/supabase/server";
import {
  DEFAULT_ENHANCEMENT_PARAMS,
  runGarmentEnhancementService,
} from "@/lib/wardrobe/enhancement-service";
import { WARDROBE_BUCKET } from "@/lib/wardrobe/queries";

const requestSchema = z
  .object({
    path: z.string().min(1).max(300).optional(),
    imageDataUrl: z.string().optional(),
    mode: z
      .enum(["clean-cutout", "ai-enhance", "catalog-flatlay"])
      .optional()
      .default("clean-cutout"),
    skipSegmentation: z.boolean().optional().default(false),
  })
  .refine((data) => Boolean(data.path || data.imageDataUrl), {
    message: "Either path or imageDataUrl must be provided.",
  });

const json = (body: Record<string, unknown>, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });

/**
 * Server-side Garment Beautification endpoint (`/api/ai/beautify`).
 *
 * - Authenticates the user and verifies storage ownership (`isOwnStoragePath`).
 * - Delegates segmentation (`https://image-api.photoroom.com/v2/edit`) and
 *   Mode 2 (`ai-enhance`) wrinkle/lighting calibration (`gemini-2.5-flash`) to
 *   `runGarmentEnhancementService`.
 * - Returns `provider`, `model`, `cutoutDataUrl`, and calibrated `params` so the
 *   Product Studio UI and database can persist full processing provenance.
 */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request.headers)) {
    return json({ error: "Cross-site requests aren't allowed." }, 403);
  }

  try {
    const user = await getSessionUser();
    if (!user) {
      return json({ error: "Please sign in again." }, 401);
    }

    const parsed = requestSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) {
      return json({ error: "Invalid photo reference." }, 400);
    }
    if (parsed.data.path && !isOwnStoragePath(parsed.data.path, user.id)) {
      return json({ error: "Invalid photo reference." }, 400);
    }

    const { path, imageDataUrl, mode, skipSegmentation } = parsed.data;

    const supabase = await createClient();
    const quota = await takeAiQuota(supabase, user.id, "ANALYSE_IMAGE");
    if (!quota.allowed) {
      return json({
        status: "fallback",
        provider: "local-studio",
        model: "closetai-cv-v2",
        cutoutDataUrl: null,
        params: DEFAULT_ENHANCEMENT_PARAMS,
        reason:
          "Hourly studio processing limit reached; applied local studio cutout.",
      });
    }

    let bytes: Uint8Array;
    let mimeType: "image/jpeg" | "image/png" | "image/webp";
    let extension: "jpg" | "png" | "webp";

    if (imageDataUrl) {
      const match = imageDataUrl.match(/^data:(image\/(jpeg|png|webp));base64,(.+)$/i);
      if (!match) {
        return json({ error: "Unsupported image data URL format." }, 400);
      }
      const rawBuf = Buffer.from(match[3], "base64");
      if (rawBuf.byteLength === 0 || rawBuf.byteLength > MAX_UPLOAD_BYTES) {
        return json(
          { error: "Image exceeds the 4 MB processing limit." },
          413,
        );
      }
      const candidateBytes = new Uint8Array(rawBuf.buffer, rawBuf.byteOffset, rawBuf.byteLength);
      const kind = sniffImage(candidateBytes);
      if (!kind) {
        return json(
          { error: "Unsupported or malformed image file." },
          415,
        );
      }
      bytes = candidateBytes;
      mimeType = kind.mimeType;
      extension = kind.extension;
    } else if (path) {
      const { data: blob, error: downloadError } = await supabase.storage
        .from(WARDROBE_BUCKET)
        .download(path);

      if (downloadError || !blob) {
        return json({ error: "We couldn't find that photo." }, 404);
      }

      if (blob.size === 0 || blob.size > MAX_UPLOAD_BYTES) {
        return json(
          { error: "Image exceeds the 4 MB processing limit." },
          413,
        );
      }

      bytes = new Uint8Array(await blob.arrayBuffer());
      const kind = sniffImage(bytes);
      if (!kind) {
        return json(
          { error: "Unsupported or malformed image file." },
          415,
        );
      }
      mimeType = kind.mimeType;
      extension = kind.extension;
    } else {
      return json({ error: "No image source provided." }, 400);
    }

    const serviceResult = await runGarmentEnhancementService({
      bytes,
      mimeType,
      extension,
      mode,
      skipSegmentation,
      signal: request.signal,
    });

    return json({
      status: serviceResult.status,
      provider: serviceResult.provider,
      model: serviceResult.model,
      cutoutDataUrl: serviceResult.cutoutDataUrl,
      params: serviceResult.params,
      reason: serviceResult.reason,
    });
  } catch (err) {
    if (err instanceof ConfigError) {
      return json({
        status: "fallback",
        provider: "local-studio",
        model: "closetai-cv-v2",
        cutoutDataUrl: null,
        params: DEFAULT_ENHANCEMENT_PARAMS,
      });
    }
    logger.error("ai.beautify_route_error", { err });
    return json(
      { error: "Could not complete garment beautification." },
      500,
    );
  }
}

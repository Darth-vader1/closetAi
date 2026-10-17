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

const requestSchema = z.object({
  path: z.string().min(1).max(300),
  mode: z.enum(["clean-cutout", "ai-enhance"]).optional().default("clean-cutout"),
  skipSegmentation: z.boolean().optional().default(false),
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
    if (!parsed.success || !isOwnStoragePath(parsed.data.path, user.id)) {
      return json({ error: "Invalid photo reference." }, 400);
    }

    const { path, mode, skipSegmentation } = parsed.data;

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

    const bytes = new Uint8Array(await blob.arrayBuffer());
    const kind = sniffImage(bytes);
    if (!kind) {
      return json(
        { error: "Unsupported or malformed image file." },
        415,
      );
    }

    const serviceResult = await runGarmentEnhancementService({
      bytes,
      mimeType: kind.mimeType,
      extension: kind.extension,
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

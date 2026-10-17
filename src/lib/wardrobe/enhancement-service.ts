import "server-only";
import { z } from "zod";
import { getPhotoRoomApiKey, resolveAiConfig } from "@/lib/env";
import { logger } from "@/lib/logger";
import { sniffImage } from "@/lib/security/image-sniff";
import type {
  AiEnhancementParams,
  BeautificationMode,
} from "@/lib/wardrobe/beautify-engine";

export type BeautificationProviderId =
  | "photoroom"
  | "photoroom+gemini"
  | "gemini"
  | "local-studio";

export interface GarmentEnhancementRequest {
  bytes: Uint8Array;
  mimeType: string;
  extension: string;
  mode: BeautificationMode;
  skipSegmentation?: boolean;
  usePhotoRoomRelighting?: boolean;
  signal?: AbortSignal;
}

export interface GarmentEnhancementServiceResult {
  status: "ok" | "fallback";
  provider: BeautificationProviderId;
  model: string;
  cutoutDataUrl: string | null;
  params: Required<AiEnhancementParams>;
  reason: string | null;
}

export const aiEnhancementResponseSchema = z.object({
  exposureGain: z.number().min(0.88).max(1.25).default(1.06),
  wbTempShift: z.number().min(-14).max(14).default(0),
  wrinkleSoftening: z.number().min(0).max(0.85).default(0.62),
  shadowLift: z.number().min(0).max(0.65).default(0.42),
  sharpenAmount: z.number().min(0).max(0.55).default(0.24),
  hasGraphicsOrText: z.boolean().default(false),
  multipleGarmentsAdvisory: z.boolean().default(false),
  qualityNote: z.string().max(160).nullable().default(null),
});

export const DEFAULT_ENHANCEMENT_PARAMS: Required<AiEnhancementParams> = {
  exposureGain: 1.06,
  wbTempShift: 0,
  wrinkleSoftening: 0.62,
  shadowLift: 0.42,
  sharpenAmount: 0.24,
  hasGraphicsOrText: false,
  multipleGarmentsAdvisory: false,
  qualityNote: null,
};

/**
 * Calls PhotoRoom Image Editing API v2 (`https://image-api.photoroom.com/v2/edit`)
 * with fallback to `https://sdk.photoroom.com/v1/segment` to isolate the clothing
 * item with a neural alpha matte and return a transparent PNG cutout.
 */
export async function segmentWithPhotoRoom(
  bytes: Uint8Array,
  mimeType: string,
  ext: string,
  apiKey: string,
  options?: {
    useRelighting?: boolean;
    parentSignal?: AbortSignal;
  },
): Promise<
  | { ok: true; pngBytes: Uint8Array; modelUsed: string }
  | { ok: false; status?: number; reason: string }
> {
  const parentSignal = options?.parentSignal;
  const useRelighting = Boolean(options?.useRelighting);

  const callV2Edit = async (): Promise<Response> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 16_000);
    const onParentAbort = () => controller.abort();
    parentSignal?.addEventListener("abort", onParentAbort, { once: true });

    try {
      const fd = new FormData();
      fd.append(
        "imageFile",
        new Blob([Buffer.from(bytes)], { type: mimeType }),
        `garment.${ext}`,
      );
      fd.append("removeBackground", "true");
      fd.append("export.format", "png");
      if (useRelighting) {
        fd.append("lighting.mode", "ai.auto");
      }

      return await fetch("https://image-api.photoroom.com/v2/edit", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          Accept: "image/png, application/json",
        },
        body: fd,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
      parentSignal?.removeEventListener("abort", onParentAbort);
    }
  };

  try {
    let res = await callV2Edit();
    let modelUsed = useRelighting
      ? "photoroom-v2-edit-relight"
      : "photoroom-v2-edit";

    // Retry once on transient 502/503/504 upstream errors
    if (res.status === 502 || res.status === 503 || res.status === 504) {
      await new Promise((r) => setTimeout(r, 450));
      res = await callV2Edit();
    }

    // Fallback to Basic /v1/segment if /v2/edit is unavailable for this key tier
    if (res.status === 400 || res.status === 403) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 16_000);
      try {
        const fd1 = new FormData();
        fd1.append(
          "image_file",
          new Blob([Buffer.from(bytes)], { type: mimeType }),
          `garment.${ext}`,
        );
        fd1.append("format", "png");
        fd1.append("channels", "rgba");
        const v1Res = await fetch("https://sdk.photoroom.com/v1/segment", {
          method: "POST",
          headers: {
            "x-api-key": apiKey,
            Accept: "image/png, application/json",
          },
          body: fd1,
          signal: controller.signal,
        });
        if (v1Res.ok) {
          res = v1Res;
          modelUsed = "photoroom-v1-segment";
        }
      } finally {
        clearTimeout(timer);
      }
    }

    if (!res.ok) {
      logger.warn("photoroom.segment_failed", { status: res.status });
      if (res.status === 402 || res.status === 429) {
        return {
          ok: false,
          status: res.status,
          reason:
            "PhotoRoom API quota or rate limit reached; switched to built-in studio cutout.",
        };
      }
      return {
        ok: false,
        status: res.status,
        reason:
          "PhotoRoom segmentation was unavailable for this photo; used built-in studio cutout.",
      };
    }

    const outBytes = new Uint8Array(await res.arrayBuffer());
    const sniffed = sniffImage(outBytes);
    if (!sniffed) {
      return {
        ok: false,
        reason:
          "PhotoRoom returned an unexpected format; used built-in studio cutout.",
      };
    }

    return { ok: true, pngBytes: outBytes, modelUsed };
  } catch (err) {
    logger.warn("photoroom.segment_exception", {
      message: err instanceof Error ? err.message : "unknown",
    });
    return {
      ok: false,
      reason: "PhotoRoom connection timed out; used built-in studio cutout.",
    };
  }
}

/**
 * Inspects a garment image with Gemini Vision (`@google/genai` REST endpoint)
 * to calibrate fabric-constrained wrinkle reduction, cast-shadow recovery,
 * exposure, white balance, and graphic/text protection.
 */
export async function calibrateGarmentEnhancementWithGemini(
  bytes: Uint8Array,
  mimeType: string,
  apiKey: string,
  visionModel: string,
  parentSignal?: AbortSignal,
): Promise<
  | { ok: true; params: Required<AiEnhancementParams>; modelUsed: string }
  | { ok: false; reason: string }
> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 11_000);
  const onParentAbort = () => controller.abort();
  parentSignal?.addEventListener("abort", onParentAbort, { once: true });

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
      visionModel,
    )}:generateContent`;

    const prompt = [
      "Inspect this clothing photograph for conservative product-studio enhancement and fabric wrinkle reduction.",
      "Do NOT invent or alter garment details, logos, text, patterns, seams, or proportions.",
      "Return JSON only with:",
      "- exposureGain: number between 0.90 and 1.20 (1.0 = well exposed, >1.0 lifts dim indoor lighting)",
      "- wbTempShift: number between -10 and 10 (negative cools warm yellow cast, positive warms cool blue cast)",
      "- wrinkleSoftening: number between 0.15 and 0.70 (higher for wrinkled shirts/trousers/dresses, lower for heavy knitwear)",
      "- shadowLift: number between 0.10 and 0.50 (higher when strong cast shadows or deep fold shadows are visible)",
      "- sharpenAmount: number between 0.15 and 0.40 (higher to keep seams, collars, and weave crisp)",
      "- hasGraphicsOrText: boolean (true if printed text, logos, brand markings, or graphic prints exist on the garment)",
      "- multipleGarmentsAdvisory: boolean (true ONLY if 2 or more separate clothing items appear in the frame)",
      "- qualityNote: short string (max 110 chars) or null if lighting/framing is clean.",
    ].join("\n");

    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              { text: prompt },
              {
                inlineData: {
                  mimeType,
                  data: Buffer.from(bytes).toString("base64"),
                },
              },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 256,
          responseMimeType: "application/json",
        },
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      return {
        ok: false,
        reason: "AI lighting & wrinkle calibration used studio defaults.",
      };
    }

    const payload = (await res.json()) as {
      candidates?: Array<{
        content?: { parts?: Array<{ text?: string }> };
      }>;
    };
    const rawText = payload.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
    const cleaned = rawText
      .trim()
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```$/, "");
    const validated = aiEnhancementResponseSchema.safeParse(
      JSON.parse(cleaned),
    );

    if (!validated.success) {
      return {
        ok: false,
        reason: "AI calibration returned non-standard parameters; used defaults.",
      };
    }

    return {
      ok: true,
      params: validated.data,
      modelUsed: visionModel,
    };
  } catch {
    return {
      ok: false,
      reason: "AI calibration timed out; applied deterministic fabric enhancement.",
    };
  } finally {
    clearTimeout(timer);
    parentSignal?.removeEventListener("abort", onParentAbort);
  }
}

/**
 * Reusable server-side Garment Enhancement Service orchestrating PhotoRoom
 * neural background segmentation and Gemini Vision wrinkle/lighting calibration
 * with graceful fallback to the local deterministic CV studio engine.
 */
export async function runGarmentEnhancementService(
  req: GarmentEnhancementRequest,
): Promise<GarmentEnhancementServiceResult> {
  let cutoutDataUrl: string | null = null;
  let segmentedWithPhotoRoom = false;
  let photoRoomModel = "closetai-cv-v2";
  let fallbackReason: string | null = null;

  const photoRoomKey = getPhotoRoomApiKey();
  if (photoRoomKey && !req.skipSegmentation) {
    const segResult = await segmentWithPhotoRoom(
      req.bytes,
      req.mimeType,
      req.extension,
      photoRoomKey,
      {
        useRelighting: req.usePhotoRoomRelighting,
        parentSignal: req.signal,
      },
    );
    if (segResult.ok) {
      cutoutDataUrl = `data:image/png;base64,${Buffer.from(
        segResult.pngBytes,
      ).toString("base64")}`;
      segmentedWithPhotoRoom = true;
      photoRoomModel = segResult.modelUsed;
    } else {
      fallbackReason = segResult.reason;
    }
  }

  // Mode 1: Clean Cutout
  if (req.mode === "clean-cutout") {
    return {
      status: segmentedWithPhotoRoom ? "ok" : "fallback",
      provider: segmentedWithPhotoRoom ? "photoroom" : "local-studio",
      model: photoRoomModel,
      cutoutDataUrl,
      params: DEFAULT_ENHANCEMENT_PARAMS,
      reason: fallbackReason,
    };
  }

  // Mode 2: AI Enhance (PhotoRoom Cutout + Gemini Vision Wrinkle/Lighting Calibration)
  const aiConfigRes = resolveAiConfig();
  if (!aiConfigRes.ok || aiConfigRes.config.provider !== "gemini") {
    return {
      status: segmentedWithPhotoRoom ? "ok" : "fallback",
      provider: segmentedWithPhotoRoom ? "photoroom" : "local-studio",
      model: segmentedWithPhotoRoom
        ? `${photoRoomModel}+fabric-wrinkle-v2`
        : "closetai-cv-v2",
      cutoutDataUrl,
      params: DEFAULT_ENHANCEMENT_PARAMS,
      reason: fallbackReason,
    };
  }

  const { apiKey, visionModel } = aiConfigRes.config;
  const calibration = await calibrateGarmentEnhancementWithGemini(
    req.bytes,
    req.mimeType,
    apiKey,
    visionModel,
    req.signal,
  );

  if (calibration.ok) {
    const provider: BeautificationProviderId = segmentedWithPhotoRoom
      ? "photoroom+gemini"
      : req.skipSegmentation
        ? "photoroom+gemini"
        : "gemini";
    const baseModel =
      segmentedWithPhotoRoom || req.skipSegmentation
        ? "photoroom-v2-edit"
        : "closetai-cv-v2";
    return {
      status: "ok",
      provider,
      model: `${baseModel}+${calibration.modelUsed}`,
      cutoutDataUrl,
      params: calibration.params,
      reason: fallbackReason,
    };
  }

  return {
    status: segmentedWithPhotoRoom ? "ok" : "fallback",
    provider: segmentedWithPhotoRoom ? "photoroom" : "local-studio",
    model: segmentedWithPhotoRoom
      ? `${photoRoomModel}+fabric-wrinkle-v2`
      : "closetai-cv-v2",
    cutoutDataUrl,
    params: DEFAULT_ENHANCEMENT_PARAMS,
    reason: fallbackReason ?? calibration.reason,
  };
}

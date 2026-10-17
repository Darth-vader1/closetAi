/**
 * In-browser studio image processing, garment segmentation, standardization,
 * and optional conservative AI-guided enhancement for ClosetAI.
 *
 * Delegates pixel-level segmentation, bounding-box cropping, category-specific
 * scaling (1024×1024 standardized square canvas without upscaling small photos),
 * anti-halo edge decontamination, and Mode 2 enhancement to `beautify-engine.ts`.
 */

import {
  processGarmentBuffer,
  type AiEnhancementParams,
  type BeautificationMode,
  type BeautifyBackgroundStyle,
  type BeautifyQualityDiagnostics,
} from "@/lib/wardrobe/beautify-engine";

export interface StudioProcessOptions {
  /** Processing mode: 'clean-cutout' (Mode 1, default) or 'ai-enhance' (Mode 2). */
  mode?: BeautificationMode;
  /** Garment category slug for category-specific scaling on the square canvas. */
  category?: string | null;
  /** Tolerance threshold for background color matching (10 to 80, default 36). */
  tolerance?: number;
  /** Whether to cast a soft studio contact shadow below the garment (default true). */
  addShadow?: boolean;
  /** Background fill mode: 'transparent' | 'clean-white' | 'studio-neutral'. */
  background?: "transparent" | "clean-white" | "studio-neutral";
  /** Target square canvas resolution (default 1024). */
  targetCanvasSize?: number;
  /** Optional server-assisted AI enhancement parameters for Mode 2. */
  aiParams?: AiEnhancementParams | null;
}

export interface StudioBeautifyResult {
  blob: Blob;
  width: number;
  height: number;
  modeUsed: BeautificationMode;
  diagnostics: BeautifyQualityDiagnostics;
}

/**
 * Full Garment Beautification pipeline (Mode 1: Clean Cutout & Mode 2: AI Enhance).
 * Returns the standardized product image Blob plus quality diagnostics & warnings.
 */
export async function beautifyGarmentImage(
  imageSource: Blob | File | string,
  options: StudioProcessOptions = {},
): Promise<StudioBeautifyResult> {
  const {
    mode = "clean-cutout",
    category = null,
    tolerance = 36,
    addShadow = true,
    background = "clean-white",
    targetCanvasSize = 1024,
    aiParams = null,
  } = options;

  let img: HTMLImageElement;
  let objectUrlToRevoke: string | null = null;

  if (typeof imageSource === "string") {
    img = await loadImageFromUrl(imageSource);
  } else {
    objectUrlToRevoke = URL.createObjectURL(imageSource);
    img = await loadImageFromUrl(objectUrlToRevoke);
  }

  try {
    const rawW = img.naturalWidth || img.width;
    const rawH = img.naturalHeight || img.height;

    // Cap working input buffer at 1600px max side so browser processing stays fast (<400ms)
    const maxInputSide = 1600;
    const inputScale =
      Math.max(rawW, rawH) > maxInputSide
        ? maxInputSide / Math.max(rawW, rawH)
        : 1;
    const width = Math.max(16, Math.round(rawW * inputScale));
    const height = Math.max(16, Math.round(rawH * inputScale));

    const srcCanvas = document.createElement("canvas");
    srcCanvas.width = width;
    srcCanvas.height = height;

    const srcCtx = srcCanvas.getContext("2d", { willReadFrequently: true });
    if (!srcCtx) {
      throw new Error("Canvas 2D context is not available in this browser.");
    }

    srcCtx.drawImage(img, 0, 0, width, height);
    const srcImageData = srcCtx.getImageData(0, 0, width, height);

    const mappedBackground: BeautifyBackgroundStyle =
      background === "transparent"
        ? "transparent"
        : background === "studio-neutral"
          ? "studio-neutral"
          : "white";

    const result = processGarmentBuffer(srcImageData.data, width, height, {
      mode,
      category,
      background: mappedBackground,
      targetCanvasSize,
      tolerance,
      enableShadow: addShadow,
      aiParams,
    });

    const outCanvas = document.createElement("canvas");
    outCanvas.width = result.width;
    outCanvas.height = result.height;
    const outCtx = outCanvas.getContext("2d");
    if (!outCtx) {
      throw new Error("Output Canvas 2D context is not available.");
    }

    const outImageData = new ImageData(
      new Uint8ClampedArray(result.rgba),
      result.width,
      result.height,
    );
    outCtx.putImageData(outImageData, 0, 0);

    const mimeType =
      mappedBackground === "transparent" ? "image/png" : "image/jpeg";
    const quality = mappedBackground === "transparent" ? undefined : 0.92;

    const blob = await new Promise<Blob | null>((resolve) =>
      outCanvas.toBlob(resolve, mimeType, quality),
    );
    if (!blob) {
      throw new Error("Failed to encode beautified garment image.");
    }

    return {
      blob,
      width: result.width,
      height: result.height,
      modeUsed: result.modeUsed,
      diagnostics: result.diagnostics,
    };
  } finally {
    if (objectUrlToRevoke) {
      URL.revokeObjectURL(objectUrlToRevoke);
    }
  }
}

/**
 * Backwards-compatible helper that returns just the processed Blob.
 */
export async function removeImageBackground(
  imageSource: Blob | File | string,
  options: StudioProcessOptions = {},
): Promise<Blob> {
  const res = await beautifyGarmentImage(imageSource, options);
  return res.blob;
}

function loadImageFromUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () =>
      reject(
        new Error(
          "Could not load the garment image for beautification. Please check your connection or retry.",
        ),
      );
    img.src = url;
  });
}

"use client";

/**
 * Client-side browser canvas utilities for rotating, flipping, and cropping garment images.
 */

export interface TransformedImageResult {
  blob: Blob;
  url: string;
  width: number;
  height: number;
}

/**
 * Loads an HTMLImageElement safely from a URL or Blob with CORS handling.
 */
export function loadHtmlImage(source: string | Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const isBlobOrData =
      typeof source !== "string" ||
      source.startsWith("blob:") ||
      source.startsWith("data:");

    if (!isBlobOrData) {
      img.crossOrigin = "anonymous";
    }

    const objectUrl = typeof source === "string" ? source : URL.createObjectURL(source);

    img.onload = () => resolve(img);
    img.onerror = () => {
      // Fallback without crossOrigin if CORS cache causes an issue
      if (img.crossOrigin) {
        const fallback = new Image();
        fallback.onload = () => resolve(fallback);
        fallback.onerror = (err) => reject(err);
        fallback.src = objectUrl;
      } else {
        reject(new Error("Failed to load image for transformation."));
      }
    };

    img.src = objectUrl;
  });
}

/**
 * Rotates an image by 90, 180, 270 (or -90) degrees clockwise.
 */
export async function rotateImage(
  source: string | Blob,
  degrees: 90 | 180 | 270 | -90,
): Promise<TransformedImageResult> {
  const img = await loadHtmlImage(source);
  const normalizedDeg = ((degrees % 360) + 360) % 360;

  const is90or270 = normalizedDeg === 90 || normalizedDeg === 270;
  const canvasWidth = is90or270 ? img.naturalHeight || img.height : img.naturalWidth || img.width;
  const canvasHeight = is90or270 ? img.naturalWidth || img.width : img.naturalHeight || img.height;

  const canvas = document.createElement("canvas");
  canvas.width = canvasWidth;
  canvas.height = canvasHeight;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Could not acquire 2D canvas context for rotation.");

  // Transform coordinates to rotate around center
  ctx.translate(canvasWidth / 2, canvasHeight / 2);
  ctx.rotate((normalizedDeg * Math.PI) / 180);
  ctx.drawImage(img, -img.width / 2, -img.height / 2);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) return reject(new Error("Failed to export rotated image."));
        const url = URL.createObjectURL(blob);
        resolve({ blob, url, width: canvasWidth, height: canvasHeight });
      },
      "image/jpeg",
      0.95,
    );
  });
}

/**
 * Horizontally flips an image (mirror).
 */
export async function flipImageHorizontal(
  source: string | Blob,
): Promise<TransformedImageResult> {
  const img = await loadHtmlImage(source);
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;

  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Could not acquire 2D canvas context for flip.");

  ctx.translate(w, 0);
  ctx.scale(-1, 1);
  ctx.drawImage(img, 0, 0, w, h);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) return reject(new Error("Failed to export flipped image."));
        const url = URL.createObjectURL(blob);
        resolve({ blob, url, width: w, height: h });
      },
      "image/jpeg",
      0.95,
    );
  });
}

export interface CropRect {
  /** Normalized 0..1 bounding coordinates */
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Crops a normalized rectangle from an image and outputs a high-res cropped image.
 */
export async function cropImageNormalized(
  source: string | Blob,
  crop: CropRect,
): Promise<TransformedImageResult> {
  const img = await loadHtmlImage(source);
  const srcW = img.naturalWidth || img.width;
  const srcH = img.naturalHeight || img.height;

  const pixelX = Math.max(0, Math.floor(crop.x * srcW));
  const pixelY = Math.max(0, Math.floor(crop.y * srcH));
  const pixelW = Math.min(srcW - pixelX, Math.ceil(crop.width * srcW));
  const pixelH = Math.min(srcH - pixelY, Math.ceil(crop.height * srcH));

  if (pixelW <= 10 || pixelH <= 10) {
    throw new Error("Crop area is too small.");
  }

  const canvas = document.createElement("canvas");
  canvas.width = pixelW;
  canvas.height = pixelH;

  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Could not acquire 2D canvas context for crop.");

  ctx.drawImage(img, pixelX, pixelY, pixelW, pixelH, 0, 0, pixelW, pixelH);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (!blob) return reject(new Error("Failed to export cropped image."));
        const url = URL.createObjectURL(blob);
        resolve({ blob, url, width: pixelW, height: pixelH });
      },
      "image/jpeg",
      0.95,
    );
  });
}

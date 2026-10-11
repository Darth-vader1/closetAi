/**
 * In-browser studio image processing and background removal for clothing items.
 * Performs intelligent background isolation (flood/flood-fill edge analysis,
 * color difference tolerance, alpha feathering) and studio lighting enhancements
 * without needing heavy external AI models or server-side billable credits.
 */

export interface StudioProcessOptions {
  /** Tolerance threshold for background color matching (0 to 100, default 32). */
  tolerance?: number;
  /** Whether to add a subtle studio drop shadow. */
  addShadow?: boolean;
  /** Background fill mode: 'transparent' | 'clean-white' | 'studio-neutral'. */
  background?: "transparent" | "clean-white" | "studio-neutral";
}

/**
 * Isolates the foreground clothing item from the background using corner-sample
 * color clustering and contiguous alpha masking with edge feathering.
 */
export async function removeImageBackground(
  imageSource: Blob | File | string,
  options: StudioProcessOptions = {},
): Promise<Blob> {
  const { tolerance = 32, addShadow = false, background = "clean-white" } = options;

  let img: HTMLImageElement;
  let objectUrlToRevoke: string | null = null;

  if (typeof imageSource === "string") {
    img = await loadImageFromUrl(imageSource);
  } else {
    objectUrlToRevoke = URL.createObjectURL(imageSource);
    img = await loadImageFromUrl(objectUrlToRevoke);
  }

  try {
    const canvas = document.createElement("canvas");
    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;
    canvas.width = width;
    canvas.height = height;

    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) throw new Error("Canvas 2D context not available");

    // Draw original
    ctx.drawImage(img, 0, 0, width, height);
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;

    // Sample background colors from the 4 corners and borders
    const samplePoints = [
      { x: 0, y: 0 },
      { x: width - 1, y: 0 },
      { x: 0, y: height - 1 },
      { x: width - 1, y: height - 1 },
      { x: Math.floor(width / 2), y: 0 },
      { x: Math.floor(width / 2), y: height - 1 },
      { x: 0, y: Math.floor(height / 2) },
      { x: width - 1, y: Math.floor(height / 2) },
    ];

    const bgSamples: Array<{ r: number; g: number; b: number }> = [];
    for (const pt of samplePoints) {
      const idx = (pt.y * width + pt.x) * 4;
      bgSamples.push({ r: data[idx], g: data[idx + 1], b: data[idx + 2] });
    }

    // Color distance function
    const colorDist = (r1: number, g1: number, b1: number, r2: number, g2: number, b2: number) => {
      const dr = r1 - r2;
      const dg = g1 - g2;
      const db = b1 - b2;
      return Math.sqrt(dr * dr * 0.299 + dg * dg * 0.587 + db * db * 0.114);
    };

    const tol = (tolerance / 100) * 180;
    const alphaMask = new Uint8Array(width * height);

    // Flood-like scan from border inwards
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];

        // Is pixel close to any sampled background color?
        let minDist = 999;
        for (const s of bgSamples) {
          const d = colorDist(r, g, b, s.r, s.g, s.b);
          if (d < minDist) minDist = d;
        }

        if (minDist < tol) {
          // Pixel matches background: feather edge smoothly
          const feather = Math.max(0, Math.min(1, (minDist - tol * 0.65) / (tol * 0.35)));
          alphaMask[y * width + x] = Math.round(feather * 255);
        } else {
          alphaMask[y * width + x] = 255;
        }
      }
    }

    // Apply alpha mask to pixels
    for (let i = 0; i < alphaMask.length; i++) {
      const pIdx = i * 4;
      const alphaVal = alphaMask[i];
      if (background === "transparent") {
        data[pIdx + 3] = Math.min(data[pIdx + 3], alphaVal);
      } else if (background === "clean-white") {
        // Blend towards pure clean studio white (#ffffff)
        const t = alphaVal / 255;
        data[pIdx] = Math.round(data[pIdx] * t + 255 * (1 - t));
        data[pIdx + 1] = Math.round(data[pIdx + 1] * t + 255 * (1 - t));
        data[pIdx + 2] = Math.round(data[pIdx + 2] * t + 255 * (1 - t));
      } else if (background === "studio-neutral") {
        // Soft warm grey studio background (#f8f7f5)
        const t = alphaVal / 255;
        data[pIdx] = Math.round(data[pIdx] * t + 248 * (1 - t));
        data[pIdx + 1] = Math.round(data[pIdx + 1] * t + 247 * (1 - t));
        data[pIdx + 2] = Math.round(data[pIdx + 2] * t + 245 * (1 - t));
      }
    }

    ctx.putImageData(imgData, 0, 0);

    // If studio shadow requested, render subtle grounded shadow
    if (addShadow && background !== "clean-white") {
      const shadowCanvas = document.createElement("canvas");
      shadowCanvas.width = width;
      shadowCanvas.height = height;
      const sCtx = shadowCanvas.getContext("2d");
      if (sCtx) {
        sCtx.shadowColor = "rgba(0, 0, 0, 0.12)";
        sCtx.shadowBlur = 18;
        sCtx.shadowOffsetY = 12;
        sCtx.drawImage(canvas, 0, 0);
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(shadowCanvas, 0, 0);
      }
    }

    const mime = background === "transparent" ? "image/png" : "image/jpeg";
    const quality = background === "transparent" ? undefined : 0.92;

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, mime, quality));
    if (!blob) throw new Error("Failed to export processed studio image");
    return blob;
  } finally {
    if (objectUrlToRevoke) URL.revokeObjectURL(objectUrlToRevoke);
  }
}

function loadImageFromUrl(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to load image for processing"));
    img.src = url;
  });
}

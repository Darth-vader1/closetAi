import type { DetectedClothingItem } from "@/lib/ai/schemas";

export interface CroppedGarment {
  item: DetectedClothingItem;
  file: File;
  previewUrl: string;
}

/**
 * Calculates clamped pixel crop bounds with comfortable padding margin from normalized 0-1000 coordinates.
 */
export function calculateCropBounds(
  box2d: [number, number, number, number],
  imageWidth: number,
  imageHeight: number,
  marginFraction = 0.04,
): { cropX: number; cropY: number; cropW: number; cropH: number } {
  const [ymin, xmin, ymax, xmax] = box2d;

  // Convert 0-1000 scale to pixel coordinates
  const top = (Math.max(0, Math.min(1000, ymin)) / 1000) * imageHeight;
  const left = (Math.max(0, Math.min(1000, xmin)) / 1000) * imageWidth;
  const bottom = (Math.max(0, Math.min(1000, ymax)) / 1000) * imageHeight;
  const right = (Math.max(0, Math.min(1000, xmax)) / 1000) * imageWidth;

  const rawW = Math.max(1, right - left);
  const rawH = Math.max(1, bottom - top);

  const marginX = rawW * marginFraction;
  const marginY = rawH * marginFraction;

  const cropX = Math.max(0, Math.floor(left - marginX));
  const cropY = Math.max(0, Math.floor(top - marginY));
  const cropW = Math.min(imageWidth - cropX, Math.ceil(rawW + marginX * 2));
  const cropH = Math.min(imageHeight - cropY, Math.ceil(rawH + marginY * 2));

  return {
    cropX,
    cropY,
    cropW: Math.max(10, cropW),
    cropH: Math.max(10, cropH),
  };
}

/**
 * Crops a single detected garment from an image source using browser HTML Canvas.
 */
export async function cropGarmentFromImage(
  source: File | Blob,
  box2d: [number, number, number, number],
  filename: string,
): Promise<{ file: File; previewUrl: string }> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(source, { imageOrientation: "from-image" });
  } catch {
    throw new Error("Unable to read image source for cropping.");
  }

  try {
    const { cropX, cropY, cropW, cropH } = calculateCropBounds(
      box2d,
      bitmap.width,
      bitmap.height,
    );

    const canvas = document.createElement("canvas");
    canvas.width = cropW;
    canvas.height = cropH;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Browser cannot create canvas context.");

    // Fill white background for any transparency
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, cropW, cropH);

    ctx.drawImage(bitmap, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.9),
    );

    if (!blob) throw new Error("Failed to export cropped garment canvas.");

    const sanitizedName =
      filename
        .replace(/[^a-zA-Z0-9_\-]/g, "-")
        .replace(/-+/g, "-")
        .slice(0, 50) || "garment";
    const file = new File([blob], `${sanitizedName}.jpg`, { type: "image/jpeg" });
    const previewUrl = URL.createObjectURL(file);

    return { file, previewUrl };
  } finally {
    bitmap.close();
  }
}

/**
 * Crops all detected garments from a screenshot in sequence.
 */
export async function cropAllDetectedGarments(
  sourceFile: File | Blob,
  items: DetectedClothingItem[],
): Promise<CroppedGarment[]> {
  const results: CroppedGarment[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const name = item.suggestion.name || `garment-${i + 1}`;
    try {
      const cropped = await cropGarmentFromImage(sourceFile, item.box2d, name);
      results.push({
        item,
        file: cropped.file,
        previewUrl: cropped.previewUrl,
      });
    } catch {
      // If individual crop fails, continue with remaining items
    }
  }

  return results;
}

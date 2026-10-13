/**
 * In-browser studio image processing and background removal for clothing items.
 *
 * Uses contiguous 8-way Breadth-First Search (BFS) flood-fill seeded from the image
 * perimeter, combined with Sobel-like local gradient stopping and boundary alpha
 * feathering. This ensures interior details (white buttons, logos, inner fabric)
 * are preserved rather than globally erased, and composites the isolated garment
 * onto a clean studio backdrop with a true alpha-silhouette drop shadow.
 */

export interface StudioProcessOptions {
  /** Tolerance threshold for background color matching (0 to 100, default 34). */
  tolerance?: number;
  /** Whether to cast a soft studio drop shadow behind the isolated garment (default true). */
  addShadow?: boolean;
  /** Background fill mode: 'transparent' | 'clean-white' | 'studio-neutral'. */
  background?: "transparent" | "clean-white" | "studio-neutral";
}

interface RgbSample {
  r: number;
  g: number;
  b: number;
}

/**
 * Isolates the foreground clothing item from the background using contiguous
 * border flood-fill, edge gradient protection, and boundary feathering.
 */
export async function removeImageBackground(
  imageSource: Blob | File | string,
  options: StudioProcessOptions = {},
): Promise<Blob> {
  const {
    tolerance = 34,
    addShadow = true,
    background = "clean-white",
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
    const width = img.naturalWidth || img.width;
    const height = img.naturalHeight || img.height;

    const fgCanvas = document.createElement("canvas");
    fgCanvas.width = width;
    fgCanvas.height = height;

    const fgCtx = fgCanvas.getContext("2d", { willReadFrequently: true });
    if (!fgCtx) throw new Error("Canvas 2D context not available");

    fgCtx.drawImage(img, 0, 0, width, height);
    const imgData = fgCtx.getImageData(0, 0, width, height);
    const data = imgData.data;

    // 1. Sample perimeter pixels along all 4 edges to capture background lighting & wall/floor gradients
    const bgSamples = samplePerimeterPalette(data, width, height);

    // Perceptual color distance (weighted RGB)
    const colorDist = (r1: number, g1: number, b1: number, r2: number, g2: number, b2: number) => {
      const dr = r1 - r2;
      const dg = g1 - g2;
      const db = b1 - b2;
      return Math.sqrt(dr * dr * 0.299 + dg * dg * 0.587 + db * db * 0.114);
    };

    const minDistToPalette = (r: number, g: number, b: number): number => {
      let best = 999;
      for (let i = 0; i < bgSamples.length; i++) {
        const s = bgSamples[i];
        const d = colorDist(r, g, b, s.r, s.g, s.b);
        if (d < best) best = d;
      }
      return best;
    };

    const maxPaletteTolerance = (tolerance / 100) * 165;
    const neighborStepTolerance = Math.max(14, (tolerance / 100) * 48);

    const totalPixels = width * height;
    // 0 = unvisited (foreground by default), 1 = connected exterior background
    const isBg = new Uint8Array(totalPixels);
    const queue = new Int32Array(totalPixels);
    let qHead = 0;
    let qTail = 0;

    const trySeed = (x: number, y: number) => {
      const idx = y * width + x;
      if (isBg[idx]) return;
      const p = idx * 4;
      if (minDistToPalette(data[p], data[p + 1], data[p + 2]) <= maxPaletteTolerance * 1.15) {
        isBg[idx] = 1;
        queue[qTail++] = idx;
      }
    };

    // Seed from all 4 outer borders
    for (let x = 0; x < width; x++) {
      trySeed(x, 0);
      trySeed(x, height - 1);
    }
    for (let y = 1; y < height - 1; y++) {
      trySeed(0, y);
      trySeed(width - 1, y);
    }

    // 2. Contiguous 4-connected BFS flood fill from borders inward
    // Stops at strong local color edges so white/neutral garments don't get hollowed out
    while (qHead < qTail) {
      const curr = queue[qHead++];
      const cx = curr % width;
      const cy = (curr - cx) / width;
      const cp = curr * 4;
      const cr = data[cp];
      const cg = data[cp + 1];
      const cb = data[cp + 2];

      const neighbors = [
        cx > 0 ? curr - 1 : -1,
        cx < width - 1 ? curr + 1 : -1,
        cy > 0 ? curr - width : -1,
        cy < height - 1 ? curr + width : -1,
      ];

      for (let i = 0; i < 4; i++) {
        const next = neighbors[i];
        if (next < 0 || isBg[next]) continue;

        const np = next * 4;
        const nr = data[np];
        const ng = data[np + 1];
        const nb = data[np + 2];

        const stepDist = colorDist(cr, cg, cb, nr, ng, nb);
        if (stepDist > neighborStepTolerance) continue;

        const paletteDist = minDistToPalette(nr, ng, nb);
        if (paletteDist <= maxPaletteTolerance) {
          isBg[next] = 1;
          queue[qTail++] = next;
        }
      }
    }

    // 3. Build feathered alpha mask along the foreground/background boundary
    const alphaMask = new Uint8Array(totalPixels);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        if (!isBg[idx]) {
          // Check if adjacent to background for soft anti-aliased edge feathering
          let bgNeighbors = 0;
          if (x > 0 && isBg[idx - 1]) bgNeighbors++;
          if (x < width - 1 && isBg[idx + 1]) bgNeighbors++;
          if (y > 0 && isBg[idx - width]) bgNeighbors++;
          if (y < height - 1 && isBg[idx + width]) bgNeighbors++;
          if (x > 0 && y > 0 && isBg[idx - width - 1]) bgNeighbors++;
          if (x < width - 1 && y > 0 && isBg[idx - width + 1]) bgNeighbors++;
          if (x > 0 && y < height - 1 && isBg[idx + width - 1]) bgNeighbors++;
          if (x < width - 1 && y < height - 1 && isBg[idx + width + 1]) bgNeighbors++;

          if (bgNeighbors > 0) {
            alphaMask[idx] = Math.max(95, 255 - bgNeighbors * 20);
          } else {
            alphaMask[idx] = 255;
          }
        } else {
          alphaMask[idx] = 0;
        }
      }
    }

    // Apply alpha mask onto the foreground canvas
    for (let i = 0; i < totalPixels; i++) {
      const p = i * 4;
      data[p + 3] = Math.min(data[p + 3], alphaMask[i]);
    }
    fgCtx.putImageData(imgData, 0, 0);

    // If transparent PNG was requested, export directly
    if (background === "transparent") {
      const pngBlob = await new Promise<Blob | null>((resolve) =>
        fgCanvas.toBlob(resolve, "image/png"),
      );
      if (!pngBlob) throw new Error("Failed to export transparent cutout");
      return pngBlob;
    }

    // 4. Composite isolated foreground onto a clean studio backdrop with a soft silhouette shadow
    const outCanvas = document.createElement("canvas");
    outCanvas.width = width;
    outCanvas.height = height;
    const outCtx = outCanvas.getContext("2d");
    if (!outCtx) throw new Error("Output Canvas 2D context not available");

    // Fill studio background with subtle radial studio lighting
    const grad = outCtx.createRadialGradient(
      width * 0.5,
      height * 0.45,
      width * 0.08,
      width * 0.5,
      height * 0.5,
      Math.max(width, height) * 0.75,
    );
    if (background === "clean-white") {
      grad.addColorStop(0, "#ffffff");
      grad.addColorStop(1, "#f5f4f0");
    } else {
      grad.addColorStop(0, "#faf9f6");
      grad.addColorStop(1, "#eceae4");
    }
    outCtx.fillStyle = grad;
    outCtx.fillRect(0, 0, width, height);

    if (addShadow) {
      outCtx.save();
      outCtx.shadowColor = "rgba(28, 25, 23, 0.16)";
      outCtx.shadowBlur = Math.max(12, Math.round(Math.min(width, height) * 0.028));
      outCtx.shadowOffsetY = Math.max(6, Math.round(height * 0.012));
      outCtx.drawImage(fgCanvas, 0, 0);
      outCtx.restore();
    } else {
      outCtx.drawImage(fgCanvas, 0, 0);
    }

    const blob = await new Promise<Blob | null>((resolve) =>
      outCanvas.toBlob(resolve, "image/jpeg", 0.92),
    );
    if (!blob) throw new Error("Failed to export processed studio image");
    return blob;
  } finally {
    if (objectUrlToRevoke) URL.revokeObjectURL(objectUrlToRevoke);
  }
}

/**
 * Samples ~28 points around the 4 outer edges of the image to build a representative
 * palette of the background (accounting for lighting falloff from top to bottom).
 */
function samplePerimeterPalette(
  data: Uint8ClampedArray,
  width: number,
  height: number,
): RgbSample[] {
  const samples: RgbSample[] = [];
  const steps = 7;

  const pushAt = (x: number, y: number) => {
    const cx = Math.max(0, Math.min(width - 1, Math.round(x)));
    const cy = Math.max(0, Math.min(height - 1, Math.round(y)));
    const idx = (cy * width + cx) * 4;
    samples.push({ r: data[idx], g: data[idx + 1], b: data[idx + 2] });
  };

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    pushAt(t * (width - 1), 0); // top edge
    pushAt(t * (width - 1), height - 1); // bottom edge
    pushAt(0, t * (height - 1)); // left edge
    pushAt(width - 1, t * (height - 1)); // right edge
  }

  return samples;
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

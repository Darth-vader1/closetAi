import { categoryGroup, type CategoryGroup } from "@/lib/wardrobe/categories";

export type BeautificationMode = "clean-cutout" | "ai-enhance";

export type BeautifyBackgroundStyle =
  | "white"
  | "studio-neutral"
  | "transparent";

export interface AiEnhancementParams {
  /** Multiplicative exposure adjustment clamped to [0.85, 1.28] */
  exposureGain?: number;
  /** Additive warmth/coolness white balance shift in [-18, +18] */
  wbTempShift?: number;
  /** Conservative fabric-region wrinkle smoothing strength in [0, 1] */
  wrinkleSoftening?: number;
  /** Harsh shadow lift strength in [0, 0.65] */
  shadowLift?: number;
  /** Edge detail unsharp mask amount in [0, 0.65] */
  sharpenAmount?: number;
  /** True when printed text, logos, or graphic prints were detected */
  hasGraphicsOrText?: boolean;
  /** Optional quality or multi-garment advisory returned by vision inspection */
  qualityNote?: string | null;
  multipleGarmentsAdvisory?: boolean;
}

export interface BeautifyPipelineOptions {
  mode?: BeautificationMode;
  category?: string | null;
  background?: BeautifyBackgroundStyle;
  targetCanvasSize?: number;
  tolerance?: number;
  enableShadow?: boolean;
  aiParams?: AiEnhancementParams | null;
}

export interface CategoryScaleRule {
  group: CategoryGroup | "bags";
  /** Target maximum fraction of the standardized square canvas occupied by the garment */
  targetFillRatio: number;
  /** Minimum margin fraction preserved on every side */
  minMarginRatio: number;
  /** Vertical optical center (0.5 = geometric middle) */
  verticalCenterRatio: number;
}

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  width: number;
  height: number;
}

export interface BeautifyQualityDiagnostics {
  foregroundCoverageRatio: number;
  primaryComponentRatio: number;
  secondaryComponentRatio: number;
  componentCount: number;
  multipleGarmentsDetected: boolean;
  tightCropDetected: boolean;
  usedExistingAlpha: boolean;
  lowResolutionPreserved: boolean;
  rotationAppliedDeg: number;
  aiFallbackUsed: boolean;
  protectedDetailRatio: number;
  wrinkleVarianceReductionRatio: number;
  warnings: string[];
}

export interface BeautifyPipelineResult {
  rgba: Uint8ClampedArray;
  width: number;
  height: number;
  modeUsed: BeautificationMode;
  scaleRule: CategoryScaleRule;
  boundingBox: BoundingBox;
  diagnostics: BeautifyQualityDiagnostics;
}

export class BeautifyPipelineError extends Error {
  readonly code:
    | "INVALID_DIMENSIONS"
    | "SEGMENTATION_EMPTY"
    | "SEGMENTATION_UNRELIABLE"
    | "GARMENT_TOO_SMALL";

  constructor(
    code:
      | "INVALID_DIMENSIONS"
      | "SEGMENTATION_EMPTY"
      | "SEGMENTATION_UNRELIABLE"
      | "GARMENT_TOO_SMALL",
    message: string,
  ) {
    super(message);
    this.name = "BeautifyPipelineError";
    this.code = code;
  }
}

const DEFAULT_CANVAS_SIZE = 1024;
const MIN_CANVAS_SIZE = 256;

const CATEGORY_SCALE_RULES: Record<CategoryGroup | "bags", CategoryScaleRule> = {
  top: {
    group: "top",
    targetFillRatio: 0.78,
    minMarginRatio: 0.09,
    verticalCenterRatio: 0.49,
  },
  outerwear: {
    group: "outerwear",
    targetFillRatio: 0.8,
    minMarginRatio: 0.08,
    verticalCenterRatio: 0.49,
  },
  bottom: {
    group: "bottom",
    targetFillRatio: 0.82,
    minMarginRatio: 0.08,
    verticalCenterRatio: 0.5,
  },
  fullbody: {
    group: "fullbody",
    targetFillRatio: 0.85,
    minMarginRatio: 0.07,
    verticalCenterRatio: 0.5,
  },
  traditional: {
    group: "traditional",
    targetFillRatio: 0.84,
    minMarginRatio: 0.07,
    verticalCenterRatio: 0.5,
  },
  footwear: {
    group: "footwear",
    targetFillRatio: 0.72,
    minMarginRatio: 0.12,
    verticalCenterRatio: 0.54,
  },
  bags: {
    group: "bags",
    targetFillRatio: 0.74,
    minMarginRatio: 0.11,
    verticalCenterRatio: 0.51,
  },
  accessory: {
    group: "accessory",
    targetFillRatio: 0.65,
    minMarginRatio: 0.15,
    verticalCenterRatio: 0.5,
  },
  other: {
    group: "other",
    targetFillRatio: 0.78,
    minMarginRatio: 0.09,
    verticalCenterRatio: 0.5,
  },
};

/**
 * Returns category-specific canvas standardization rules for Tops, Outerwear,
 * Bottoms/Trousers, Dresses/Fullbody, Footwear, Bags, and Accessories.
 */
export function getCategoryScaleRule(category?: string | null): CategoryScaleRule {
  const normalized = category?.trim().toLowerCase() ?? "";
  if (normalized === "bags" || normalized === "bag" || normalized === "handbag") {
    return CATEGORY_SCALE_RULES.bags;
  }
  if (!normalized) {
    return CATEGORY_SCALE_RULES.top;
  }
  const group = categoryGroup(normalized);
  if (group && group !== "other" && CATEGORY_SCALE_RULES[group]) {
    return CATEGORY_SCALE_RULES[group];
  }
  return CATEGORY_SCALE_RULES.top;
}

function colorDistSq(
  r1: number,
  g1: number,
  b1: number,
  r2: number,
  g2: number,
  b2: number,
): number {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return dr * dr * 0.3 + dg * dg * 0.59 + db * db * 0.11;
}

function clampByte(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : Math.round(v);
}

/**
 * Detects whether the input RGBA buffer already contains a meaningful transparent background
 * (e.g., an existing transparent PNG cutout).
 */
function hasMeaningfulTransparency(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): boolean {
  const total = width * height;
  let transparentCount = 0;
  let opaqueCount = 0;
  let borderTransparent = 0;
  let borderTotal = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = rgba[(y * width + x) * 4 + 3];
      if (a < 24) transparentCount++;
      else if (a > 200) opaqueCount++;

      if (x === 0 || x === width - 1 || y === 0 || y === height - 1) {
        borderTotal++;
        if (a < 32) borderTransparent++;
      }
    }
  }

  return (
    borderTotal > 0 &&
    borderTransparent / borderTotal >= 0.45 &&
    transparentCount / total >= 0.08 &&
    opaqueCount / total >= 0.02
  );
}

interface BackgroundSample {
  r: number;
  g: number;
  b: number;
}

function samplePerimeterPalette(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): BackgroundSample[] {
  const rawSamples: BackgroundSample[] = [];
  const step = Math.max(1, Math.floor(Math.min(width, height) / 48));
  const insetRing = Math.max(1, Math.min(4, Math.floor(Math.min(width, height) * 0.02)));

  const pushAt = (x: number, y: number) => {
    const idx = (y * width + x) * 4;
    if (rgba[idx + 3] < 128) return;
    rawSamples.push({ r: rgba[idx], g: rgba[idx + 1], b: rgba[idx + 2] });
  };

  for (const inset of [0, insetRing]) {
    for (let x = inset; x < width - inset; x += step) {
      pushAt(x, inset);
      pushAt(x, height - 1 - inset);
    }
    for (let y = inset; y < height - inset; y += step) {
      pushAt(inset, y);
      pushAt(width - 1 - inset, y);
    }
  }

  // Cluster similar border samples so textured backgrounds (bedsheets, wood, walls)
  // are compactly represented while ignoring occasional garment pixels touching 1 edge.
  const clusters: { r: number; g: number; b: number; count: number }[] = [];
  const mergeThresholdSq = 18 * 18;

  for (const s of rawSamples) {
    let matched = false;
    for (const c of clusters) {
      if (colorDistSq(s.r, s.g, s.b, c.r, c.g, c.b) <= mergeThresholdSq) {
        c.r = (c.r * c.count + s.r) / (c.count + 1);
        c.g = (c.g * c.count + s.g) / (c.count + 1);
        c.b = (c.b * c.count + s.b) / (c.count + 1);
        c.count++;
        matched = true;
        break;
      }
    }
    if (!matched) {
      clusters.push({ r: s.r, g: s.g, b: s.b, count: 1 });
    }
  }

  clusters.sort((a, b) => b.count - a.count);
  const topClusters = clusters.slice(0, 28);
  return topClusters.map((c) => ({ r: c.r, g: c.g, b: c.b }));
}

function computeSobelEdgeStrength(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): Float32Array {
  const total = width * height;
  const luma = new Float32Array(total);
  for (let i = 0; i < total; i++) {
    const p = i * 4;
    luma[i] = rgba[p] * 0.299 + rgba[p + 1] * 0.587 + rgba[p + 2] * 0.114;
  }

  const edge = new Float32Array(total);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const gx =
        -luma[idx - width - 1] +
        luma[idx - width + 1] -
        2 * luma[idx - 1] +
        2 * luma[idx + 1] -
        luma[idx + width - 1] +
        luma[idx + width + 1];
      const gy =
        -luma[idx - width - 1] -
        2 * luma[idx - width] -
        luma[idx - width + 1] +
        luma[idx + width - 1] +
        2 * luma[idx + width] +
        luma[idx + width + 1];

      // Also include chromatic gradient for garments with similar luminance to background
      const pLeft = (idx - 1) * 4;
      const pRight = (idx + 1) * 4;
      const pUp = (idx - width) * 4;
      const pDown = (idx + width) * 4;
      const chromaGrad =
        Math.abs(rgba[pRight] - rgba[pLeft]) +
        Math.abs(rgba[pRight + 1] - rgba[pLeft + 1]) +
        Math.abs(rgba[pRight + 2] - rgba[pLeft + 2]) +
        Math.abs(rgba[pDown] - rgba[pUp]) +
        Math.abs(rgba[pDown + 1] - rgba[pUp + 1]) +
        Math.abs(rgba[pDown + 2] - rgba[pUp + 2]);

      edge[idx] = Math.hypot(gx, gy) + chromaGrad * 0.65;
    }
  }
  return edge;
}

interface SegmentationOutput {
  alphaMask: Uint8Array;
  palette: BackgroundSample[];
  usedExistingAlpha: boolean;
  componentCount: number;
  primaryComponentRatio: number;
  secondaryComponentRatio: number;
  multipleGarmentsDetected: boolean;
}

/**
 * Step B: Garment Segmentation + Connected-Component Filtering.
 * Isolates the garment while handling textured backgrounds, low-contrast edges,
 * existing transparent PNGs, and multiple-garment detection.
 */
function segmentGarment(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  tolerance: number,
): SegmentationOutput {
  const total = width * height;
  const existingAlpha = hasMeaningfulTransparency(rgba, width, height);
  const palette = samplePerimeterPalette(rgba, width, height);
  const alphaMask = new Uint8Array(total);

  if (existingAlpha) {
    for (let i = 0; i < total; i++) {
      alphaMask[i] = rgba[i * 4 + 3];
    }
  } else {
    const edgeStrength = computeSobelEdgeStrength(rgba, width, height);

    // Measure contrast between perimeter palette and interior center region
    // so dark-on-dark and light-on-light images automatically tighten their flood tolerance
    let centerDiffSum = 0;
    let centerCount = 0;
    const xStart = Math.floor(width * 0.28);
    const xEnd = Math.ceil(width * 0.72);
    const yStart = Math.floor(height * 0.28);
    const yEnd = Math.ceil(height * 0.72);

    for (let y = yStart; y < yEnd; y += Math.max(1, Math.floor((yEnd - yStart) / 16))) {
      for (let x = xStart; x < xEnd; x += Math.max(1, Math.floor((xEnd - xStart) / 16))) {
        const p = (y * width + x) * 4;
        let minD = Infinity;
        for (let k = 0; k < palette.length; k++) {
          const d = colorDistSq(rgba[p], rgba[p + 1], rgba[p + 2], palette[k].r, palette[k].g, palette[k].b);
          if (d < minD) minD = d;
        }
        centerDiffSum += Math.sqrt(minD);
        centerCount++;
      }
    }

    const avgCenterContrast = centerCount > 0 ? centerDiffSum / centerCount : tolerance;
    const effectiveTolerance =
      avgCenterContrast < tolerance * 0.85
        ? Math.max(11, Math.min(tolerance, avgCenterContrast * 0.58))
        : tolerance;

    const globalThresholdSq = effectiveTolerance * effectiveTolerance;
    const localStepThresholdSq = Math.max(
      9 * 9,
      Math.pow(effectiveTolerance * 0.52, 2),
    );
    const strongEdgeBarrier = avgCenterContrast < 26 ? 48 : 96;

    const bgMask = new Uint8Array(total);
    const queue = new Int32Array(total);
    let head = 0;
    let tail = 0;

    const matchesPalette = (idx: number, tolScale = 1): boolean => {
      const p = idx * 4;
      const r = rgba[p];
      const g = rgba[p + 1];
      const b = rgba[p + 2];
      const limit = globalThresholdSq * tolScale;
      for (let i = 0; i < palette.length; i++) {
        const s = palette[i];
        if (colorDistSq(r, g, b, s.r, s.g, s.b) <= limit) {
          return true;
        }
      }
      return false;
    };

    const enqueueIfBorderBg = (idx: number) => {
      if (bgMask[idx] === 1) return;
      if (matchesPalette(idx, 1.15)) {
        bgMask[idx] = 1;
        queue[tail++] = idx;
      }
    };

    for (let x = 0; x < width; x++) {
      enqueueIfBorderBg(x);
      enqueueIfBorderBg((height - 1) * width + x);
    }
    for (let y = 1; y < height - 1; y++) {
      enqueueIfBorderBg(y * width);
      enqueueIfBorderBg(y * width + (width - 1));
    }

    while (head < tail) {
      const curr = queue[head++];
      const cx = curr % width;
      const cy = (curr - cx) / width;
      const cp = curr * 4;
      const cr = rgba[cp];
      const cg = rgba[cp + 1];
      const cb = rgba[cp + 2];

      const neighbors = [
        cy > 0 ? curr - width : -1,
        cy < height - 1 ? curr + width : -1,
        cx > 0 ? curr - 1 : -1,
        cx < width - 1 ? curr + 1 : -1,
      ];

      for (let n = 0; n < 4; n++) {
        const next = neighbors[n];
        if (next < 0 || bgMask[next] === 1) continue;

        if (edgeStrength[next] >= strongEdgeBarrier) continue;

        const np = next * 4;
        const stepDist = colorDistSq(cr, cg, cb, rgba[np], rgba[np + 1], rgba[np + 2]);
        if (stepDist <= localStepThresholdSq && matchesPalette(next, 1.0)) {
          bgMask[next] = 1;
          queue[tail++] = next;
        }
      }
    }

    for (let i = 0; i < total; i++) {
      alphaMask[i] = bgMask[i] === 1 ? 0 : 255;
    }
  }

  // Connected-component analysis on foreground pixels (alpha >= 128)
  const visited = new Uint8Array(total);
  const compQueue = new Int32Array(total);
  const components: { size: number; indices: number[]; touchesCenter: boolean }[] = [];

  const centerMinX = Math.floor(width * 0.2);
  const centerMaxX = Math.ceil(width * 0.8);
  const centerMinY = Math.floor(height * 0.2);
  const centerMaxY = Math.ceil(height * 0.8);

  for (let i = 0; i < total; i++) {
    if (alphaMask[i] < 128 || visited[i] === 1) continue;

    let cHead = 0;
    let cTail = 0;
    visited[i] = 1;
    compQueue[cTail++] = i;
    let touchesCenter = false;
    const indices: number[] = [];

    while (cHead < cTail) {
      const curr = compQueue[cHead++];
      indices.push(curr);
      const cx = curr % width;
      const cy = (curr - cx) / width;

      if (cx >= centerMinX && cx <= centerMaxX && cy >= centerMinY && cy <= centerMaxY) {
        touchesCenter = true;
      }

      for (let dy = -1; dy <= 1; dy++) {
        const ny = cy + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = cx + dx;
          if (nx < 0 || nx >= width) continue;
          const next = ny * width + nx;
          if (visited[next] === 0 && alphaMask[next] >= 128) {
            visited[next] = 1;
            compQueue[cTail++] = next;
          }
        }
      }
    }

    components.push({ size: indices.length, indices, touchesCenter });
  }

  // Sort components largest first, preferring components overlapping the image center
  components.sort((a, b) => {
    if (a.touchesCenter !== b.touchesCenter) {
      return a.touchesCenter ? -1 : 1;
    }
    return b.size - a.size;
  });

  const minNoisePixels = Math.max(8, Math.floor(total * 0.0025));
  const significantComponents = components.filter((c) => c.size >= minNoisePixels);

  // Zero out tiny background specks / dust islands
  for (const comp of components) {
    if (comp.size < minNoisePixels) {
      for (let j = 0; j < comp.indices.length; j++) {
        alphaMask[comp.indices[j]] = 0;
      }
    }
  }

  const primarySize = significantComponents[0]?.size ?? 0;
  const secondarySize = significantComponents[1]?.size ?? 0;
  const primaryComponentRatio = primarySize / total;
  const secondaryComponentRatio = secondarySize / total;

  // Detect whether multiple distinct garments are present ( vs. a pair of shoes ).
  // A significant secondary component (>14% of primary and >2.5% of total area) triggers advisory.
  const multipleGarmentsDetected =
    significantComponents.length >= 2 &&
    secondarySize / Math.max(1, primarySize) >= 0.14 &&
    secondaryComponentRatio >= 0.025;

  // Feather mask boundaries by 1px for smooth antialiased garment edges
  if (!existingAlpha) {
    const feathered = new Uint8Array(alphaMask);
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const idx = y * width + x;
        if (alphaMask[idx] === 0) continue;
        const zeroNeighbors =
          (alphaMask[idx - 1] === 0 ? 1 : 0) +
          (alphaMask[idx + 1] === 0 ? 1 : 0) +
          (alphaMask[idx - width] === 0 ? 1 : 0) +
          (alphaMask[idx + width] === 0 ? 1 : 0);
        if (zeroNeighbors >= 3) {
          feathered[idx] = 96;
        } else if (zeroNeighbors === 2) {
          feathered[idx] = 164;
        } else if (zeroNeighbors === 1) {
          feathered[idx] = 220;
        }
      }
    }
    alphaMask.set(feathered);
  }

  return {
    alphaMask,
    palette,
    usedExistingAlpha: existingAlpha,
    componentCount: significantComponents.length,
    primaryComponentRatio,
    secondaryComponentRatio,
    multipleGarmentsDetected,
  };
}

/**
 * Step D (part 1): Edge Color Decontamination (Anti-Halo).
 * Removes background color spill from semi-transparent boundary pixels so dark
 * garments on white backgrounds or light garments on dark backgrounds don't show halos.
 */
function decontaminateGarmentEdges(
  rgba: Uint8ClampedArray,
  alphaMask: Uint8Array,
  width: number,
  height: number,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rgba.length);
  out.set(rgba);

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const a = alphaMask[idx];
      out[idx * 4 + 3] = a;

      if (a === 0 || a >= 250) continue;

      // Pull chromaticity from nearest fully-opaque interior neighbor within a 2px radius
      let rSum = 0;
      let gSum = 0;
      let bSum = 0;
      let count = 0;

      for (let dy = -2; dy <= 2; dy++) {
        const ny = y + dy;
        if (ny < 0 || ny >= height) continue;
        for (let dx = -2; dx <= 2; dx++) {
          const nx = x + dx;
          if (nx < 0 || nx >= width) continue;
          const nIdx = ny * width + nx;
          if (alphaMask[nIdx] === 255) {
            const np = nIdx * 4;
            rSum += rgba[np];
            gSum += rgba[np + 1];
            bSum += rgba[np + 2];
            count++;
          }
        }
      }

      if (count > 0) {
        const p = idx * 4;
        out[p] = Math.round(rSum / count);
        out[p + 1] = Math.round(gSum / count);
        out[p + 2] = Math.round(bSum / count);
      }
    }
  }

  // Ensure border pixels have updated alpha as well
  for (let i = 0; i < width * height; i++) {
    out[i * 4 + 3] = alphaMask[i];
  }

  return out;
}

/**
 * Step C (part 1): Non-transparent bounding box + tight-crop detection.
 * Includes semi-transparent boundary details (alpha >= 16) such as lace,
 * sheer collars, cuffs, and hems so garment details are never clipped.
 */
export function detectForegroundBounds(
  alphaMask: Uint8Array,
  width: number,
  height: number,
): { box: BoundingBox | null; tightCropDetected: boolean; foregroundPixels: number } {
  let rawMinX = width;
  let rawMinY = height;
  let rawMaxX = -1;
  let rawMaxY = -1;
  let foregroundPixels = 0;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = alphaMask[y * width + x];
      if (a >= 16) {
        if (a >= 32) {
          foregroundPixels++;
        }
        if (x < rawMinX) rawMinX = x;
        if (x > rawMaxX) rawMaxX = x;
        if (y < rawMinY) rawMinY = y;
        if (y > rawMaxY) rawMaxY = y;
      }
    }
  }

  if (rawMaxX < rawMinX || rawMaxY < rawMinY || foregroundPixels === 0) {
    return { box: null, tightCropDetected: false, foregroundPixels: 0 };
  }

  const edgeMargin = Math.max(1, Math.floor(Math.min(width, height) * 0.01));
  const touchesLeft = rawMinX <= edgeMargin;
  const touchesRight = rawMaxX >= width - 1 - edgeMargin;
  const touchesTop = rawMinY <= edgeMargin;
  const touchesBottom = rawMaxY >= height - 1 - edgeMargin;
  const touchedSides =
    (touchesLeft ? 1 : 0) +
    (touchesRight ? 1 : 0) +
    (touchesTop ? 1 : 0) +
    (touchesBottom ? 1 : 0);

  // Add a 1px protective pad inside source bounds so sleeves, collars, and hems are never clipped
  const minX = Math.max(0, rawMinX - 1);
  const minY = Math.max(0, rawMinY - 1);
  const maxX = Math.min(width - 1, rawMaxX + 1);
  const maxY = Math.min(height - 1, rawMaxY + 1);

  return {
    box: {
      minX,
      minY,
      maxX,
      maxY,
      width: maxX - minX + 1,
      height: maxY - minY + 1,
    },
    tightCropDetected: touchedSides >= 2,
    foregroundPixels,
  };
}

/**
 * Estimates whether a garment has a small, unambiguous tilt (1.2° to 8.5°)
 * using second-order central image moments on the foreground alpha mask.
 * Only corrects when eccentricity is high enough to be reliable and the garment
 * is not clipped by image borders.
 */
function estimateSafeMinorRotationDeg(
  alphaMask: Uint8Array,
  width: number,
  height: number,
  box: BoundingBox,
  tightCropDetected: boolean,
): number {
  if (tightCropDetected) return 0;

  let m00 = 0;
  let m10 = 0;
  let m01 = 0;

  for (let y = box.minY; y <= box.maxY; y++) {
    for (let x = box.minX; x <= box.maxX; x++) {
      const w = alphaMask[y * width + x] / 255;
      if (w < 0.25) continue;
      m00 += w;
      m10 += x * w;
      m01 += y * w;
    }
  }

  if (m00 < 64) return 0;

  const cx = m10 / m00;
  const cy = m01 / m00;

  let mu20 = 0;
  let mu02 = 0;
  let mu11 = 0;

  for (let y = box.minY; y <= box.maxY; y++) {
    for (let x = box.minX; x <= box.maxX; x++) {
      const w = alphaMask[y * width + x] / 255;
      if (w < 0.25) continue;
      const dx = x - cx;
      const dy = y - cy;
      mu20 += dx * dx * w;
      mu02 += dy * dy * w;
      mu11 += dx * dy * w;
    }
  }

  const diff = mu20 - mu02;
  const denom = Math.hypot(diff, 2 * mu11);
  const sum = mu20 + mu02;
  const eccentricity = sum > 0 ? denom / sum : 0;

  // Require clear axis elongation so round/square bags or folded items aren't rotated
  if (eccentricity < 0.28) return 0;

  // Principal axis angle in radians relative to x-axis
  const thetaRad = 0.5 * Math.atan2(2 * mu11, diff);
  const thetaDeg = (thetaRad * 180) / Math.PI;

  // Measure deviation from nearest cardinal axis (0° horizontal or ±90° vertical)
  let deltaDeg = thetaDeg;
  if (thetaDeg > 45) deltaDeg = thetaDeg - 90;
  else if (thetaDeg < -45) deltaDeg = thetaDeg + 90;

  const absDelta = Math.abs(deltaDeg);
  if (absDelta < 1.2 || absDelta > 8.5) {
    return 0;
  }

  return -deltaDeg;
}

/**
 * Builds a per-pixel Fabric vs. Protected-Detail Mask on the isolated garment.
 *
 * - `fabricMask[i] === 0`: Protected high-contrast / structural detail (printed text,
 *   logos, graphics, stripes, plaid, seams, stitching, collar/sleeve borders, silhouette edges).
 * - `fabricMask[i] in (0, 1]`: Interior garment fabric eligible for multi-scale
 *   wrinkle shadow/ridge softening and studio relighting.
 */
export function buildFabricProtectionMask(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): {
  fabricMask: Float32Array;
  protectedDetailRatio: number;
} {
  const total = width * height;
  const rawGraphic = new Uint8Array(total);
  const maxLumaStepMap = new Float32Array(total);

  // A sharp achromatic ink/stripe edge requires a 52+ luma jump between adjacent opaque pixels
  // (equivalent to ~90 in 3D Euclidean RGB), whereas steep fabric folds on sleeves/shoulders
  // have gradual 10..42 luma steps and low chromaticity shift.
  const sharpLumaEdgeThreshold = 52;
  const sharpChromaEdgeThreshold = 26;

  // 1. First pass: compute per-pixel local 8-neighbor luma/chroma steps among opaque garment
  // pixels and estimate dominant smooth interior fabric RGB & luminance.
  let smoothR = 0;
  let smoothG = 0;
  let smoothB = 0;
  let smoothCount = 0;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const p = idx * 4;
      if (rgba[p + 3] < 220) {
        continue;
      }

      const cr = rgba[p];
      const cg = rgba[p + 1];
      const cb = rgba[p + 2];
      const cLuma = cr * 0.299 + cg * 0.587 + cb * 0.114;
      const cRG = cr - cg;
      const cGB = cg - cb;

      let maxLumaStep = 0;
      let maxChromaStep = 0;
      let opaqueNeighbors = 0;

      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nIdx = (y + dy) * width + (x + dx);
          const np = nIdx * 4;
          // Ignore transparent/semi-transparent canvas pixels outside the garment silhouette
          // so sleeve and hem edges are relit and smoothed seamlessly with the interior!
          if (rgba[np + 3] < 220) {
            continue;
          }
          opaqueNeighbors++;
          const nr = rgba[np];
          const ng = rgba[np + 1];
          const nb = rgba[np + 2];
          const nLuma = nr * 0.299 + ng * 0.587 + nb * 0.114;
          const lStep = Math.abs(cLuma - nLuma);
          if (lStep > maxLumaStep) {
            maxLumaStep = lStep;
          }
          const cStep = Math.abs(cRG - (nr - ng)) + Math.abs(cGB - (ng - nb));
          if (cStep > maxChromaStep) {
            maxChromaStep = cStep;
          }
        }
      }

      maxLumaStepMap[idx] = maxLumaStep;
      if (
        maxLumaStep >= sharpLumaEdgeThreshold ||
        maxChromaStep >= sharpChromaEdgeThreshold
      ) {
        rawGraphic[idx] = 1;
      } else if (
        opaqueNeighbors >= 6 &&
        maxLumaStep <= 10 &&
        maxChromaStep <= 12
      ) {
        smoothR += cr;
        smoothG += cg;
        smoothB += cb;
        smoothCount++;
      }
    }
  }

  // 2. Second pass: mark solid graphic interiors (e.g., red "HAVEN" text interior or
  // black Pegasus print interior) relative to dominant fabric color without ever flagging
  // achromatic gray shoulder/sleeve shadow troughs (`luma 80..215` on a white shirt).
  if (smoothCount >= 32) {
    const domR = smoothR / smoothCount;
    const domG = smoothG / smoothCount;
    const domB = smoothB / smoothCount;
    const domLuma = domR * 0.299 + domG * 0.587 + domB * 0.114;
    const domRG = domR - domG;
    const domGB = domG - domB;

    for (let i = 0; i < total; i++) {
      if (rawGraphic[i] === 1) continue;
      const p = i * 4;
      if (rgba[p + 3] < 220) continue;
      const r = rgba[p];
      const g = rgba[p + 1];
      const b = rgba[p + 2];
      const luma = r * 0.299 + g * 0.587 + b * 0.114;

      const chromaShift = Math.abs(r - g - domRG) + Math.abs(g - b - domGB);

      // Asymmetric ink interior detection:
      // - On light/white garments (domLuma >= 140), fabric fold shadows go darker into
      //   the mid/dark-gray range (luma 75..210), whereas solid black screen-print ink
      //   reaches deep charcoal/black (luma <= 72).
      // - On dark/mid garments (domLuma < 140), light printed text/logos go much brighter
      //   than the fabric (luma - domLuma >= 75), or deep black ink on mid-tone fabric (luma <= 32).
      const isChromaticInk = chromaShift >= 34;
      const isDeepInkInterior =
        domLuma >= 140
          ? luma <= 72
          : luma - domLuma >= 75 || (domLuma >= 85 && luma <= 30);

      if (isChromaticInk || isDeepInkInterior) {
        rawGraphic[i] = 1;
      }
    }
  }

  // 3. Dilate ONLY true graphic/text/stripe pixels (`rawGraphic`) by a tight 1px buffer
  // so anti-aliased graphic edges are protected without creating wide unbrightened gray halos.
  const dilatedGraphic = new Uint8Array(total);
  for (let y = 0; y < height; y++) {
    const y0 = Math.max(0, y - 1);
    const y1 = Math.min(height - 1, y + 1);
    for (let x = 0; x < width; x++) {
      if (rawGraphic[y * width + x] === 1) {
        const x0 = Math.max(0, x - 1);
        const x1 = Math.min(width - 1, x + 1);
        for (let ny = y0; ny <= y1; ny++) {
          const rowOff = ny * width;
          for (let nx = x0; nx <= x1; nx++) {
            dilatedGraphic[rowOff + nx] = 1;
          }
        }
      }
    }
  }

  const fabricMask = new Float32Array(total);
  let fgCount = 0;
  let protectedCount = 0;

  for (let i = 0; i < total; i++) {
    const a = rgba[i * 4 + 3];
    if (a < 128) continue;
    fgCount++;

    if (dilatedGraphic[i] === 1 || a < 220) {
      fabricMask[i] = 0;
      protectedCount++;
    } else {
      // Allow full smoothing across normal and steep fabric folds (maxLumaStep up to 44),
      // tapering gently only as local contrast approaches sharpLumaEdgeThreshold (52).
      const norm = maxLumaStepMap[i] / sharpLumaEdgeThreshold;
      fabricMask[i] = Math.max(0.3, Math.min(1, 1 - norm * norm * 0.4));
    }
  }

  return {
    fabricMask,
    protectedDetailRatio: fgCount > 0 ? protectedCount / fgCount : 0,
  };
}

/**
 * Measures local mid-frequency luminance variance across interior fabric pixels
 * (`fabricMask[i] >= 0.4`) to quantify fabric wrinkle intensity before & after enhancement.
 */
export function computeFabricWrinkleEnergy(
  rgba: Uint8ClampedArray,
  fabricMask: Float32Array,
  width: number,
  height: number,
): number {
  let energySum = 0;
  let count = 0;

  for (let y = 2; y < height - 2; y++) {
    for (let x = 2; x < width - 2; x++) {
      const idx = y * width + x;
      if (fabricMask[idx] < 0.4) continue;
      const p = idx * 4;
      const centerLuma = rgba[p] * 0.299 + rgba[p + 1] * 0.587 + rgba[p + 2] * 0.114;

      let localSum = 0;
      let localCount = 0;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const nIdx = (y + dy) * width + (x + dx);
          if (fabricMask[nIdx] < 0.2) continue;
          const np = nIdx * 4;
          localSum += rgba[np] * 0.299 + rgba[np + 1] * 0.587 + rgba[np + 2] * 0.114;
          localCount++;
        }
      }
      if (localCount >= 5) {
        const diff = centerLuma - localSum / localCount;
        energySum += diff * diff;
        count++;
      }
    }
  }

  return count > 0 ? energySum / count : 0;
}

/**
 * Step E: Conservative Mode 2 AI Garment Enhancement with Multi-Scale Integral-Image
 * Wrinkle & Fold Flattening and Strict Garment Preservation.
 *
 * - Protects logos, printed text, graphics, stripes, plaid, seams, and collar/sleeve
 *   boundaries (`fabricMask === 0` keeps 100% original pixel fidelity).
 * - Uses O(1) Summed-Area Tables (Integral Images) across 3 resolution-scaled radii
 *   (`1.4%`, `3.6%`, and `7.5%` of garment size — up to 150px+ window on 1024px+ images)
 *   weighted exclusively by `fabricMask` so broad sleeve folds, torso creases, and
 *   shoulder shadows are flattened toward the lit fabric surface without bleeding
 *   graphics or edges.
 * - Normalizes dingy indoor white/light garments toward studio white while preserving
 *   dark and brightly colored garment chromaticity.
 */
export function applyConservativeGarmentEnhancement(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  aiParams?: AiEnhancementParams | null,
): Uint8ClampedArray {
  const out = new Uint8ClampedArray(rgba.length);
  out.set(rgba);

  const total = width * height;
  const { fabricMask } = buildFabricProtectionMask(rgba, width, height);

  // 1. Gather interior fabric luminance histogram & mean RGB for lighting/shadow calibration
  const hist = new Uint32Array(256);
  let fgCount = 0;
  let fabricCount = 0;
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;

  for (let i = 0; i < total; i++) {
    const p = i * 4;
    const a = rgba[p + 3];
    if (a < 128) continue;
    fgCount++;

    if (fabricMask[i] >= 0.25) {
      const r = rgba[p];
      const g = rgba[p + 1];
      const b = rgba[p + 2];
      const y = clampByte(r * 0.299 + g * 0.587 + b * 0.114);
      hist[y]++;
      sumR += r;
      sumG += g;
      sumB += b;
      fabricCount++;
    }
  }

  if (fgCount < 16) return out;
  const statCount = fabricCount >= 16 ? fabricCount : fgCount;

  let pMedian = 128;
  let p85 = 200;
  let pHigh = 255;
  let acc = 0;
  const medianTarget = statCount * 0.5;
  const p85Target = statCount * 0.85;
  const highTarget = statCount * 0.96;
  let foundMedian = false;
  let foundP85 = false;

  for (let v = 0; v < 256; v++) {
    acc += hist[v];
    if (!foundMedian && acc >= medianTarget) {
      pMedian = v;
      foundMedian = true;
    }
    if (!foundP85 && acc >= p85Target) {
      p85 = v;
      foundP85 = true;
    }
    if (acc >= highTarget) {
      pHigh = v;
      break;
    }
  }

  const meanR = fabricCount >= 16 ? sumR / fabricCount : 128;
  const meanG = fabricCount >= 16 ? sumG / fabricCount : 128;
  const meanB = fabricCount >= 16 ? sumB / fabricCount : 128;
  const meanGray = (meanR + meanG + meanB) / 3;
  const meanSat = Math.max(meanR, meanG, meanB) - Math.min(meanR, meanG, meanB);

  // Detect light/white neutral garments (like white graphic tees/shirts shot indoors)
  // so dingy gray indoor lighting (p85 ~ 195-232) lifts cleanly toward studio white (246).
  const isLightNeutralFabric = p85 >= 185 && meanSat <= 24 && pMedian >= 155;

  const autoGain = isLightNeutralFabric
    ? Math.min(1.18, Math.max(1.04, 246 / Math.max(185, p85)))
    : meanGray < 105 && pHigh < 215
      ? Math.min(1.14, 220 / Math.max(125, pHigh))
      : meanGray > 225
        ? 1.0
        : 1.03;

  const requestedGain = aiParams?.exposureGain
    ? Math.max(0.9, Math.min(1.22, aiParams.exposureGain))
    : autoGain;
  const exposureGain = isLightNeutralFabric
    ? Math.max(autoGain, requestedGain)
    : autoGain * 0.55 + requestedGain * 0.45;

  const wbShift = Math.max(-10, Math.min(10, aiParams?.wbTempShift ?? 0));
  const castR = wbShift * 0.35;
  const castG = 0;
  const castB = -wbShift * 0.35;

  const shadowLiftStrength = Math.max(
    0,
    Math.min(0.65, aiParams?.shadowLift ?? 0.38),
  );

  // Apply studio exposure & shadow lift strictly on fabric pixels (fabricMask > 0)
  const tonalAdjusted = new Uint8ClampedArray(rgba.length);
  tonalAdjusted.set(rgba);

  const shadowReferenceLuma = isLightNeutralFabric ? pHigh : pMedian;
  const shadowCurveBoost = isLightNeutralFabric
    ? Math.min(0.88, shadowLiftStrength + 0.3)
    : shadowLiftStrength * 0.85;

  for (let i = 0; i < total; i++) {
    const p = i * 4;
    if (rgba[p + 3] === 0) continue;

    const fw = fabricMask[i];
    if (fw <= 0) {
      continue;
    }

    const r0 = rgba[p];
    const g0 = rgba[p + 1];
    const b0 = rgba[p + 2];
    const luma = r0 * 0.299 + g0 * 0.587 + b0 * 0.114;

    let localShadowGain = 1;
    if (
      shadowReferenceLuma > 45 &&
      luma < shadowReferenceLuma * 0.98 &&
      luma > 8
    ) {
      const shadowDeficit =
        (shadowReferenceLuma * 0.98 - luma) / Math.max(1, shadowReferenceLuma);
      localShadowGain = 1 + shadowDeficit * shadowCurveBoost * fw;
    }

    const effectiveGain = 1 + (exposureGain * localShadowGain - 1) * fw;
    tonalAdjusted[p] = clampByte(r0 * effectiveGain + castR * fw);
    tonalAdjusted[p + 1] = clampByte(g0 * effectiveGain + castG * fw);
    tonalAdjusted[p + 2] = clampByte(b0 * effectiveGain + castB * fw);
  }

  // 2. Build Weighted Summed-Area Tables (Integral Images) over interior fabric
  // so we can query fine (1.4%), medium (3.6%), and broad (7.5%) fabric surface envelopes
  // in O(1) time per pixel without ever touching protected graphics, text, or borders.
  const stride = width + 1;
  const satLen = stride * (height + 1);
  const satR = new Float64Array(satLen);
  const satG = new Float64Array(satLen);
  const satB = new Float64Array(satLen);
  const satW = new Float64Array(satLen);
  const litRidgeThreshold = Math.min(242, p85 * exposureGain * 0.95);

  for (let y = 0; y < height; y++) {
    let rowR = 0;
    let rowG = 0;
    let rowB = 0;
    let rowW = 0;
    const prevRow = y * stride;
    const currRow = (y + 1) * stride;

    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      const fw = fabricMask[idx];
      if (fw > 0) {
        const p = idx * 4;
        const r = tonalAdjusted[p];
        const g = tonalAdjusted[p + 1];
        const b = tonalAdjusted[p + 2];
        const luma = r * 0.299 + g * 0.587 + b * 0.114;
        // Weight brighter lit fabric ridges higher (2.4x) than dark crease troughs (0.35x)
        // so the multi-scale surface envelope rides along the unwrinkled lit fabric plane!
        const litBias = luma >= litRidgeThreshold ? 2.4 : 0.35;
        const w = fw * litBias;
        rowR += r * w;
        rowG += g * w;
        rowB += b * w;
        rowW += w;
      }
      satR[currRow + x + 1] = satR[prevRow + x + 1] + rowR;
      satG[currRow + x + 1] = satG[prevRow + x + 1] + rowG;
      satB[currRow + x + 1] = satB[prevRow + x + 1] + rowB;
      satW[currRow + x + 1] = satW[prevRow + x + 1] + rowW;
    }
  }

  const queryFabricEnvelope = (
    cx: number,
    cy: number,
    radius: number,
    fallbackR: number,
    fallbackG: number,
    fallbackB: number,
  ): [number, number, number] => {
    const x0 = Math.max(0, cx - radius);
    const y0 = Math.max(0, cy - radius);
    const x1 = Math.min(width - 1, cx + radius) + 1;
    const y1 = Math.min(height - 1, cy + radius) + 1;

    const i00 = y0 * stride + x0;
    const i10 = y0 * stride + x1;
    const i01 = y1 * stride + x0;
    const i11 = y1 * stride + x1;

    const w = satW[i11] - satW[i10] - satW[i01] + satW[i00];
    if (w <= 0.25) {
      return [fallbackR, fallbackG, fallbackB];
    }
    const r = (satR[i11] - satR[i10] - satR[i01] + satR[i00]) / w;
    const g = (satG[i11] - satG[i10] - satG[i01] + satG[i00]) / w;
    const b = (satB[i11] - satB[i10] - satB[i01] + satB[i00]) / w;
    return [r, g, b];
  };

  const minDim = Math.min(width, height);
  const rFine = Math.max(2, Math.round(minDim * 0.014));
  const rMed = Math.max(4, Math.round(minDim * 0.036));
  const rBroad = Math.max(8, Math.round(minDim * 0.075));

  const wrinkleStrength = Math.max(
    0,
    Math.min(0.85, aiParams?.wrinkleSoftening ?? 0.58),
  );
  const sharpenAmount = Math.max(
    0,
    Math.min(0.45, aiParams?.sharpenAmount ?? 0.22),
  );

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      const p = idx * 4;
      const a = tonalAdjusted[p + 3];
      if (a < 64) continue;

      const fw = fabricMask[idx];
      if (fw <= 0) {
        out[p] = rgba[p];
        out[p + 1] = rgba[p + 1];
        out[p + 2] = rgba[p + 2];
        out[p + 3] = a;
        continue;
      }

      const cr = tonalAdjusted[p];
      const cg = tonalAdjusted[p + 1];
      const cb = tonalAdjusted[p + 2];

      // 1px immediate 3x3 average for fine weave residual extraction
      const [microR, microG, microB] = queryFabricEnvelope(x, y, 1, cr, cg, cb);
      // 3-scale fabric illumination envelopes (fine creases, medium wrinkles, broad sleeve/torso folds)
      const [fineR, fineG, fineB] = queryFabricEnvelope(x, y, rFine, cr, cg, cb);
      const [medR, medG, medB] = queryFabricEnvelope(x, y, rMed, fineR, fineG, fineB);
      const [broadR, broadG, broadB] = queryFabricEnvelope(
        x,
        y,
        rBroad,
        medR,
        medG,
        medB,
      );

      let envR = fineR * 0.16 + medR * 0.42 + broadR * 0.42;
      let envG = fineG * 0.16 + medG * 0.42 + broadG * 0.42;
      let envB = fineB * 0.16 + medB * 0.42 + broadB * 0.42;

      // Safety check: only fall back to fine envelope if chromaticity (hue/tint) diverges
      // (never reject luminance lifting of deep fold shadow troughs!)
      const envChromaDiff =
        Math.abs(cr - cg - (envR - envG)) + Math.abs(cg - cb - (envG - envB));
      if (envChromaDiff > 34) {
        envR = fineR;
        envG = fineG;
        envB = fineB;
      }

      const cLuma = cr * 0.299 + cg * 0.587 + cb * 0.114;
      const envLuma = envR * 0.299 + envG * 0.587 + envB * 0.114;

      // Wrinkle shadow troughs (cLuma < envLuma) get strong upward lift toward the broad lit fabric plane
      const isWrinkleShadowTrough = cLuma < envLuma;
      if (isWrinkleShadowTrough && envChromaDiff <= 34) {
        const wideR = medR * 0.4 + broadR * 0.6;
        const wideG = medG * 0.4 + broadG * 0.6;
        const wideB = medB * 0.4 + broadB * 0.6;
        if (wideR + wideG + wideB > envR + envG + envB) {
          envR = wideR;
          envG = wideG;
          envB = wideB;
        }
      }

      const effectiveWrinkleBlend = Math.min(
        0.92,
        fw * wrinkleStrength * (isWrinkleShadowTrough ? 1.58 : 1.18),
      );

      // Retain subtle 1px weave texture residual (cr - microR) so cotton/linen never looks plastic
      const weaveKeep = (1 - effectiveWrinkleBlend * 0.84) * (1 + sharpenAmount * 0.2);
      const weaveR = (cr - microR) * weaveKeep;
      const weaveG = (cg - microG) * weaveKeep;
      const weaveB = (cb - microB) * weaveKeep;

      const finalR =
        microR * (1 - effectiveWrinkleBlend) +
        envR * effectiveWrinkleBlend +
        weaveR;
      const finalG =
        microG * (1 - effectiveWrinkleBlend) +
        envG * effectiveWrinkleBlend +
        weaveG;
      const finalB =
        microB * (1 - effectiveWrinkleBlend) +
        envB * effectiveWrinkleBlend +
        weaveB;

      out[p] = clampByte(finalR);
      out[p + 1] = clampByte(finalG);
      out[p + 2] = clampByte(finalB);
      out[p + 3] = a;
    }
  }

  return out;
}

/**
 * Bilinear sample helper for cropping, centering, scaling, and optional minor rotation.
 */
function sampleBilinearPremultiplied(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  sx: number,
  sy: number,
): [number, number, number, number] {
  if (sx < -0.5 || sy < -0.5 || sx > width - 0.5 || sy > height - 0.5) {
    return [0, 0, 0, 0];
  }

  const x0 = Math.max(0, Math.min(width - 1, Math.floor(sx)));
  const y0 = Math.max(0, Math.min(height - 1, Math.floor(sy)));
  const x1 = Math.max(0, Math.min(width - 1, x0 + 1));
  const y1 = Math.max(0, Math.min(height - 1, y0 + 1));
  const fx = Math.max(0, Math.min(1, sx - x0));
  const fy = Math.max(0, Math.min(1, sy - y0));

  const w00 = (1 - fx) * (1 - fy);
  const w10 = fx * (1 - fy);
  const w01 = (1 - fx) * fy;
  const w11 = fx * fy;

  const p00 = (y0 * width + x0) * 4;
  const p10 = (y0 * width + x1) * 4;
  const p01 = (y1 * width + x0) * 4;
  const p11 = (y1 * width + x1) * 4;

  const a00 = (rgba[p00 + 3] / 255) * w00;
  const a10 = (rgba[p10 + 3] / 255) * w10;
  const a01 = (rgba[p01 + 3] / 255) * w01;
  const a11 = (rgba[p11 + 3] / 255) * w11;

  const alpha = a00 + a10 + a01 + a11;
  if (alpha <= 1e-4) {
    return [0, 0, 0, 0];
  }

  const r = (rgba[p00] * a00 + rgba[p10] * a10 + rgba[p01] * a01 + rgba[p11] * a11) / alpha;
  const g =
    (rgba[p00 + 1] * a00 +
      rgba[p10 + 1] * a10 +
      rgba[p01 + 1] * a01 +
      rgba[p11 + 1] * a11) /
    alpha;
  const b =
    (rgba[p00 + 2] * a00 +
      rgba[p10 + 2] * a10 +
      rgba[p01 + 2] * a01 +
      rgba[p11 + 2] * a11) /
    alpha;

  return [clampByte(r), clampByte(g), clampByte(b), clampByte(alpha * 255)];
}

/**
 * Full deterministic Garment Beautification Pipeline (Steps B, C, D, E).
 * Works identically in browser Canvas and Node/Vitest unit tests.
 */
export function processGarmentBuffer(
  inputRgba: Uint8ClampedArray,
  width: number,
  height: number,
  options: BeautifyPipelineOptions = {},
): BeautifyPipelineResult {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width < 16 ||
    height < 16 ||
    inputRgba.length !== width * height * 4
  ) {
    throw new BeautifyPipelineError(
      "INVALID_DIMENSIONS",
      "Image dimensions are invalid or too small to process (minimum 16×16px).",
    );
  }

  const requestedMode: BeautificationMode = options.mode ?? "clean-cutout";
  const background: BeautifyBackgroundStyle = options.background ?? "white";
  const tolerance = options.tolerance ?? 36;
  const enableShadow = options.enableShadow ?? true;
  const scaleRule = getCategoryScaleRule(options.category);

  // STEP B: GARMENT SEGMENTATION
  const seg = segmentGarment(inputRgba, width, height, tolerance);
  const { box, tightCropDetected, foregroundPixels } = detectForegroundBounds(
    seg.alphaMask,
    width,
    height,
  );

  const totalPixels = width * height;
  const foregroundCoverageRatio = foregroundPixels / totalPixels;

  if (!box || foregroundCoverageRatio < 0.012) {
    throw new BeautifyPipelineError(
      "SEGMENTATION_EMPTY",
      "Could not isolate a clear garment from the background. Try a photo with clearer contrast between the clothing item and background.",
    );
  }

  if (!seg.usedExistingAlpha && foregroundCoverageRatio > 0.965 && tightCropDetected) {
    throw new BeautifyPipelineError(
      "SEGMENTATION_UNRELIABLE",
      "The background could not be reliably separated from the garment. Try photographing the item with a small margin of visible background around all edges.",
    );
  }

  // Edge decontamination to prevent white/dark halos
  let cutoutRgba = decontaminateGarmentEdges(
    inputRgba,
    seg.alphaMask,
    width,
    height,
  );

  const warnings: string[] = [];
  if (seg.multipleGarmentsDetected || options.aiParams?.multipleGarmentsAdvisory) {
    warnings.push(
      "Multiple separated items were detected in this photo. For best results in Flatlay Studio, upload one garment per photo.",
    );
  }
  if (tightCropDetected) {
    warnings.push(
      "This garment touches the edges of the original photo; we centered it with protective whitespace.",
    );
  }
  if (options.aiParams?.qualityNote) {
    warnings.push(options.aiParams.qualityNote);
  }

  const protectionAnalysis = buildFabricProtectionMask(cutoutRgba, width, height);
  const protectedDetailRatio = protectionAnalysis.protectedDetailRatio;
  let wrinkleVarianceReductionRatio = 0;

  // STEP E (Optional Mode 2): Conservative AI/Photometric Enhancement on the clean cutout
  let modeUsed: BeautificationMode = "clean-cutout";
  let aiFallbackUsed = false;

  if (requestedMode === "ai-enhance") {
    try {
      const beforeEnergy = computeFabricWrinkleEnergy(
        cutoutRgba,
        protectionAnalysis.fabricMask,
        width,
        height,
      );
      cutoutRgba = applyConservativeGarmentEnhancement(
        cutoutRgba,
        width,
        height,
        options.aiParams,
      );
      const afterEnergy = computeFabricWrinkleEnergy(
        cutoutRgba,
        protectionAnalysis.fabricMask,
        width,
        height,
      );
      if (beforeEnergy > 1e-3) {
        wrinkleVarianceReductionRatio = Math.max(
          0,
          Math.min(1, (beforeEnergy - afterEnergy) / beforeEnergy),
        );
      }
      modeUsed = "ai-enhance";
    } catch {
      // Safe fallback to Clean Cutout if enhancement fails
      aiFallbackUsed = true;
      modeUsed = "clean-cutout";
      warnings.push(
        "AI enhancement encountered an issue; preserved the clean cutout version.",
      );
    }
  }

  // STEP C: GARMENT NORMALIZATION & STANDARDIZED SQUARE CANVAS
  const requestedCanvas = options.targetCanvasSize ?? DEFAULT_CANVAS_SIZE;
  const garmentMaxDim = Math.max(box.width, box.height);
  const idealCanvasForGarment = Math.ceil(garmentMaxDim / scaleRule.targetFillRatio);

  // Do not unnecessarily enlarge small images beyond their native resolution
  const lowResolutionPreserved = idealCanvasForGarment < requestedCanvas;
  const canvasSize = Math.max(
    MIN_CANVAS_SIZE,
    Math.min(
      requestedCanvas,
      lowResolutionPreserved
        ? Math.max(Math.max(width, height), idealCanvasForGarment)
        : requestedCanvas,
    ),
  );

  if (lowResolutionPreserved && Math.max(width, height) < 512) {
    warnings.push(
      "Low-resolution source image detected; standardized canvas without upscaling garment pixels beyond native resolution.",
    );
  }

  const maxAllowedSpan = canvasSize * Math.min(scaleRule.targetFillRatio, 1 - scaleRule.minMarginRatio * 2);
  // Never upscale garment pixels beyond 1.0x native resolution
  const scale = Math.min(1, maxAllowedSpan / garmentMaxDim);

  const rotationAppliedDeg = estimateSafeMinorRotationDeg(
    seg.alphaMask,
    width,
    height,
    box,
    tightCropDetected,
  );
  const rotRad = (rotationAppliedDeg * Math.PI) / 180;
  const cosR = Math.cos(rotRad);
  const sinR = Math.sin(rotRad);

  const srcCenterX = box.minX + box.width / 2;
  const srcCenterY = box.minY + box.height / 2;
  const dstCenterX = canvasSize * 0.5;
  const dstCenterY = canvasSize * scaleRule.verticalCenterRatio;

  // STEP D: BACKGROUND COMPOSITING (White #FFFFFF by default + optional subtle contact shadow)
  const outputRgba = new Uint8ClampedArray(canvasSize * canvasSize * 4);

  if (background === "white") {
    outputRgba.fill(255);
  } else if (background === "studio-neutral") {
    for (let y = 0; y < canvasSize; y++) {
      // Subtle studio paper gradient (#F8F7F4 -> #EFECE6)
      const t = y / Math.max(1, canvasSize - 1);
      const r = clampByte(248 - t * 9);
      const g = clampByte(247 - t * 11);
      const b = clampByte(244 - t * 14);
      for (let x = 0; x < canvasSize; x++) {
        const p = (y * canvasSize + x) * 4;
        outputRgba[p] = r;
        outputRgba[p + 1] = g;
        outputRgba[p + 2] = b;
        outputRgba[p + 3] = 255;
      }
    }
  }

  // Optional subtle grounded contact shadow under the garment base on opaque backgrounds
  if (enableShadow && background !== "transparent") {
    const garmentHalfW = (box.width * scale) / 2;
    const garmentHalfH = (box.height * scale) / 2;
    const shadowCenterY = Math.min(
      canvasSize - 8,
      dstCenterY + garmentHalfH + Math.max(4, canvasSize * 0.014),
    );
    const shadowRadiusX = Math.max(16, garmentHalfW * 0.68);
    const shadowRadiusY = Math.max(4, canvasSize * 0.022);

    const minSY = Math.max(0, Math.floor(shadowCenterY - shadowRadiusY * 1.5));
    const maxSY = Math.min(canvasSize - 1, Math.ceil(shadowCenterY + shadowRadiusY * 1.5));
    const minSX = Math.max(0, Math.floor(dstCenterX - shadowRadiusX * 1.25));
    const maxSX = Math.min(canvasSize - 1, Math.ceil(dstCenterX + shadowRadiusX * 1.25));

    for (let y = minSY; y <= maxSY; y++) {
      const dy = (y - shadowCenterY) / shadowRadiusY;
      for (let x = minSX; x <= maxSX; x++) {
        const dx = (x - dstCenterX) / shadowRadiusX;
        const d2 = dx * dx + dy * dy;
        if (d2 >= 1) continue;
        const falloff = Math.pow(1 - d2, 2) * 0.065; // Very subtle 6.5% max studio contact shadow
        const p = (y * canvasSize + x) * 4;
        outputRgba[p] = clampByte(outputRgba[p] * (1 - falloff));
        outputRgba[p + 1] = clampByte(outputRgba[p + 1] * (1 - falloff));
        outputRgba[p + 2] = clampByte(outputRgba[p + 2] * (1 - falloff));
      }
    }
  }

  // Render normalized, centered, aspect-ratio-preserving garment onto standardized canvas
  for (let dy = 0; dy < canvasSize; dy++) {
    const relY = (dy - dstCenterY) / scale;
    for (let dx = 0; dx < canvasSize; dx++) {
      const relX = (dx - dstCenterX) / scale;
      const sx = srcCenterX + (relX * cosR + relY * sinR);
      const sy = srcCenterY + (-relX * sinR + relY * cosR);

      const [sr, sg, sb, sa] = sampleBilinearPremultiplied(
        cutoutRgba,
        width,
        height,
        sx,
        sy,
      );
      if (sa === 0) continue;

      const p = (dy * canvasSize + dx) * 4;
      if (background === "transparent") {
        outputRgba[p] = sr;
        outputRgba[p + 1] = sg;
        outputRgba[p + 2] = sb;
        outputRgba[p + 3] = sa;
      } else {
        const alpha = sa / 255;
        const inv = 1 - alpha;
        outputRgba[p] = clampByte(sr * alpha + outputRgba[p] * inv);
        outputRgba[p + 1] = clampByte(sg * alpha + outputRgba[p + 1] * inv);
        outputRgba[p + 2] = clampByte(sb * alpha + outputRgba[p + 2] * inv);
        outputRgba[p + 3] = 255;
      }
    }
  }

  return {
    rgba: outputRgba,
    width: canvasSize,
    height: canvasSize,
    modeUsed,
    scaleRule,
    boundingBox: box,
    diagnostics: {
      foregroundCoverageRatio,
      primaryComponentRatio: seg.primaryComponentRatio,
      secondaryComponentRatio: seg.secondaryComponentRatio,
      componentCount: seg.componentCount,
      multipleGarmentsDetected:
        seg.multipleGarmentsDetected || Boolean(options.aiParams?.multipleGarmentsAdvisory),
      tightCropDetected,
      usedExistingAlpha: seg.usedExistingAlpha,
      lowResolutionPreserved,
      rotationAppliedDeg,
      aiFallbackUsed,
      protectedDetailRatio,
      wrinkleVarianceReductionRatio,
      warnings,
    },
  };
}

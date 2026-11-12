import zlib from "node:zlib";
import { categoryGroup, type CategoryGroup } from "@/lib/wardrobe/categories";

function paethPredictor(a: number, b: number, c: number): number {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

export interface CutoutSanityResult {
  valid: boolean;
  width: number;
  height: number;
  totalPixels: number;
  opaquePixels: number;
  coverage: number;
  centerCoverage: number;
  leftFlankCoverage: number;
  rightFlankCoverage: number;
  zone3Coverage: number;
  borderCoverage: number;
  reason: string | null;
}

/** Smallest cutout we accept; anything smaller cannot be a usable garment photo. */
export const MIN_CUTOUT_DIMENSION = 32;
/** Remove.bg `size=auto` tops out at 25 MP; cap slightly above to bound memory (~104 MB RGBA). */
export const MAX_CUTOUT_PIXELS = 26_000_000;
/** Overall alpha coverage at/above this means the background was never removed. */
const MAX_COVERAGE = 0.985;
/** Share of the 1px frame border that is opaque at/above this means the backdrop is still there. */
const MAX_BORDER_COVERAGE = 0.95;
/** Alpha above this counts as garment. */
const OPAQUE_ALPHA = 48;

const MAJOR_GARMENT_GROUPS: ReadonlySet<CategoryGroup> = new Set([
  "top",
  "bottom",
  "fullbody",
  "outerwear",
  "traditional",
]);

/** Category slugs are lowercase-hyphenated; tolerate labels like "Hoodies" or "Polo Shirts". */
export function isMajorGarmentCategory(category?: string | null): boolean {
  if (!category) return false;
  const slug = category.trim().toLowerCase().replace(/\s+/g, "-");
  return MAJOR_GARMENT_GROUPS.has(categoryGroup(slug));
}

function reject(
  reason: string,
  width = 0,
  height = 0,
  stats?: Partial<CutoutSanityResult>,
): CutoutSanityResult {
  return {
    valid: false,
    width,
    height,
    totalPixels: width * height,
    opaquePixels: 0,
    coverage: 0,
    centerCoverage: 0,
    leftFlankCoverage: 0,
    rightFlankCoverage: 0,
    zone3Coverage: 0,
    borderCoverage: 0,
    ...stats,
    reason,
  };
}

/**
 * Validates the alpha channel of a neural cutout PNG.
 *
 * Rejects (so the waterfall cascades to the next provider / local studio):
 * - corrupt, oversized, tiny, interlaced or otherwise unverifiable PNGs;
 * - images with no alpha channel or with the backdrop still present;
 * - hollow or severely amputated masks where the model deleted the garment
 *   torso, belly, or one entire flank/sleeve (major garment categories).
 */
export function validateCutoutAlphaSanity(
  pngBytes: Uint8Array | Buffer,
  category?: string | null,
): CutoutSanityResult {
  const buf = Buffer.isBuffer(pngBytes) ? pngBytes : Buffer.from(pngBytes);

  // 1. Validate PNG signature
  if (
    buf.length < 32 ||
    buf[0] !== 0x89 ||
    buf[1] !== 0x50 ||
    buf[2] !== 0x4e ||
    buf[3] !== 0x47 ||
    buf[4] !== 0x0d ||
    buf[5] !== 0x0a ||
    buf[6] !== 0x1a ||
    buf[7] !== 0x0a
  ) {
    return reject("Invalid PNG signature");
  }

  // 2. Walk chunks
  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  let sawIhdr = false;
  let paletteAlpha: Buffer | null = null;
  const idatParts: Buffer[] = [];

  while (offset + 8 <= buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.toString("ascii", offset + 4, offset + 8);
    const chunkDataStart = offset + 8;
    const chunkDataEnd = chunkDataStart + length;

    if (chunkDataEnd > buf.length) break;

    const chunkData = buf.subarray(chunkDataStart, chunkDataEnd);
    offset += 12 + length;

    if (type === "IHDR" && chunkData.length >= 13) {
      sawIhdr = true;
      width = chunkData.readUInt32BE(0);
      height = chunkData.readUInt32BE(4);
      bitDepth = chunkData[8];
      colorType = chunkData[9];
      interlace = chunkData[12];
    } else if (type === "tRNS") {
      paletteAlpha = chunkData;
    } else if (type === "IDAT") {
      idatParts.push(chunkData);
    } else if (type === "IEND") {
      break;
    }
  }

  if (!sawIhdr || idatParts.length === 0) {
    return reject("PNG is missing IHDR or IDAT data", width, height);
  }

  // 3. Dimension bounds (no tiny-image bypass: a real cutout is never < 32px)
  if (width < MIN_CUTOUT_DIMENSION || height < MIN_CUTOUT_DIMENSION) {
    return reject(`Cutout too small (${width}x${height})`, width, height);
  }
  if (width * height > MAX_CUTOUT_PIXELS) {
    return reject(
      `Cutout too large to verify (${width}x${height} exceeds ${MAX_CUTOUT_PIXELS} px)`,
      width,
      height,
    );
  }

  // 4. Resolve pixel layout and where the alpha lives
  let bpp: number; // bytes per pixel (filter unit)
  let alphaOf: (row: Buffer, x: number) => number;

  if (interlace !== 0) {
    return reject("Interlaced PNG cutouts are not supported", width, height);
  }

  if (colorType === 6 && (bitDepth === 8 || bitDepth === 16)) {
    // RGBA
    bpp = bitDepth === 8 ? 4 : 8;
    alphaOf = bitDepth === 8 ? (r, x) => r[x * 4 + 3] : (r, x) => r[x * 8 + 6];
  } else if (colorType === 4 && (bitDepth === 8 || bitDepth === 16)) {
    // Grayscale + alpha
    bpp = bitDepth === 8 ? 2 : 4;
    alphaOf = bitDepth === 8 ? (r, x) => r[x * 2 + 1] : (r, x) => r[x * 4 + 2];
  } else if (colorType === 3 && bitDepth === 8) {
    // Palette: transparency only exists via tRNS
    if (!paletteAlpha || paletteAlpha.length === 0) {
      return reject("Cutout has no transparency (palette PNG without tRNS)", width, height);
    }
    const trns = paletteAlpha;
    bpp = 1;
    alphaOf = (r, x) => {
      const idx = r[x];
      return idx < trns.length ? trns[idx] : 255;
    };
  } else if (colorType === 0 || colorType === 2) {
    return reject("Cutout has no alpha channel (background was not removed)", width, height);
  } else {
    return reject(
      `Unsupported PNG layout (colorType ${colorType}, bitDepth ${bitDepth})`,
      width,
      height,
    );
  }

  const rowBytes = width * bpp;
  const expectedLength = height * (1 + rowBytes);

  // 5. Inflate with a hard output cap (guards against decompression bombs)
  let decompressed: Buffer;
  try {
    decompressed = zlib.inflateSync(Buffer.concat(idatParts), {
      maxOutputLength: expectedLength + 1024,
    });
  } catch (err) {
    return reject(
      `Corrupted PNG IDAT chunk: ${err instanceof Error ? err.message : String(err)}`,
      width,
      height,
    );
  }

  if (decompressed.length < expectedLength) {
    return reject("Decompressed PNG data truncated", width, height);
  }

  let opaquePixels = 0;
  let centerOpaque = 0;
  let centerTotal = 0;
  let leftFlankOpaque = 0;
  let leftFlankTotal = 0;
  let rightFlankOpaque = 0;
  let rightFlankTotal = 0;
  let zone3Opaque = 0;
  let zone3Total = 0;
  let borderOpaque = 0;
  let borderTotal = 0;

  // Center core box: x in [25%, 75%], y in [28%, 72%]
  const minCx = Math.floor(width * 0.25);
  const maxCx = Math.floor(width * 0.75);
  const minCy = Math.floor(height * 0.28);
  const maxCy = Math.floor(height * 0.72);

  // Left flank: x in [10%, 40%], y in [25%, 75%]
  const minLx = Math.floor(width * 0.10);
  const maxLx = Math.floor(width * 0.40);

  // Right flank: x in [60%, 90%], y in [25%, 75%]
  const minRx = Math.floor(width * 0.60);
  const maxRx = Math.floor(width * 0.90);

  // Zone 3: y in [50%, 75%] (mid-torso/belly)
  const minZ3y = Math.floor(height * 0.50);
  const maxZ3y = Math.floor(height * 0.75);

  let prevRow = Buffer.alloc(rowBytes);
  let currRow = Buffer.alloc(rowBytes);

  for (let y = 0; y < height; y++) {
    const rowOffset = y * (1 + rowBytes);
    const filterType = decompressed[rowOffset];

    for (let i = 0; i < rowBytes; i++) {
      const raw = decompressed[rowOffset + 1 + i];
      const a = i >= bpp ? currRow[i - bpp] : 0;
      const b = prevRow[i];
      const c = i >= bpp ? prevRow[i - bpp] : 0;

      let val = raw;
      if (filterType === 1) {
        val = (raw + a) & 0xff;
      } else if (filterType === 2) {
        val = (raw + b) & 0xff;
      } else if (filterType === 3) {
        val = (raw + Math.floor((a + b) / 2)) & 0xff;
      } else if (filterType === 4) {
        val = (raw + paethPredictor(a, b, c)) & 0xff;
      }
      currRow[i] = val;
    }

    const inYFlank = y >= minCy && y <= maxCy;
    const inYZ3 = y >= minZ3y && y <= maxZ3y;
    const isBorderRow = y === 0 || y === height - 1;

    for (let x = 0; x < width; x++) {
      const isOpaque = alphaOf(currRow, x) > OPAQUE_ALPHA;

      if (isOpaque) {
        opaquePixels++;
      }

      if (isBorderRow || x === 0 || x === width - 1) {
        borderTotal++;
        if (isOpaque) borderOpaque++;
      }

      if (x >= minCx && x <= maxCx && y >= minCy && y <= maxCy) {
        centerTotal++;
        if (isOpaque) centerOpaque++;
      }

      if (inYFlank) {
        if (x >= minLx && x <= maxLx) {
          leftFlankTotal++;
          if (isOpaque) leftFlankOpaque++;
        } else if (x >= minRx && x <= maxRx) {
          rightFlankTotal++;
          if (isOpaque) rightFlankOpaque++;
        }
      }

      if (inYZ3) {
        zone3Total++;
        if (isOpaque) zone3Opaque++;
      }
    }

    const temp = prevRow;
    prevRow = currRow;
    currRow = temp;
  }

  const totalPixels = width * height;
  const stats = {
    totalPixels,
    opaquePixels,
    coverage: totalPixels > 0 ? opaquePixels / totalPixels : 0,
    centerCoverage: centerTotal > 0 ? centerOpaque / centerTotal : 0,
    leftFlankCoverage: leftFlankTotal > 0 ? leftFlankOpaque / leftFlankTotal : 0,
    rightFlankCoverage: rightFlankTotal > 0 ? rightFlankOpaque / rightFlankTotal : 0,
    zone3Coverage: zone3Total > 0 ? zone3Opaque / zone3Total : 0,
    borderCoverage: borderTotal > 0 ? borderOpaque / borderTotal : 0,
  };
  const pct = (v: number) => (v * 100).toFixed(1);

  // Rule 0: Background never removed (fully opaque, or the frame edge is still backdrop)
  if (stats.coverage >= MAX_COVERAGE) {
    return reject(
      `Background not removed (coverage ${pct(stats.coverage)}%)`,
      width,
      height,
      stats,
    );
  }
  if (stats.borderCoverage >= MAX_BORDER_COVERAGE) {
    return reject(
      `Background not removed (frame border ${pct(stats.borderCoverage)}% opaque)`,
      width,
      height,
      stats,
    );
  }

  const isMajorGarment = isMajorGarmentCategory(category);

  // Rule 1: Absolute minimum coverage (even accessories cover >= 4%, garments cover >= 18%)
  const minCoverage = isMajorGarment ? 0.18 : 0.04;
  if (stats.coverage < minCoverage) {
    return reject(
      `Overall coverage too low (${pct(stats.coverage)}% < ${pct(minCoverage)}%)`,
      width,
      height,
      stats,
    );
  }

  // Rule 2: Hollow torso / midsection in major garments
  if (isMajorGarment && stats.zone3Coverage < 0.12) {
    return reject(
      `Hollow garment body/torso detected (mid-section coverage ${pct(stats.zone3Coverage)}% < 12%)`,
      width,
      height,
      stats,
    );
  }

  // Rule 3: Extreme left/right flank amputation (one sleeve/side erased)
  if (isMajorGarment) {
    const maxFlank = Math.max(stats.leftFlankCoverage, stats.rightFlankCoverage);
    const minFlank = Math.min(stats.leftFlankCoverage, stats.rightFlankCoverage);
    if (maxFlank > 0.20 && minFlank < 0.035) {
      return reject(
        `Severely amputated side/sleeve detected (left: ${pct(stats.leftFlankCoverage)}%, right: ${pct(stats.rightFlankCoverage)}%)`,
        width,
        height,
        stats,
      );
    }
  }

  return {
    valid: true,
    width,
    height,
    ...stats,
    reason: null,
  };
}

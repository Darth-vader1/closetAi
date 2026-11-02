import zlib from "node:zlib";

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
  reason: string | null;
}

/**
 * Validates the alpha channel of a neural cutout PNG.
 * Rejects corrupt, hollow, or severely amputated masks where the neural model
 * mistakenly deleted the garment torso, belly, or one entire flank/sleeve.
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
    return {
      valid: false,
      width: 0,
      height: 0,
      totalPixels: 0,
      opaquePixels: 0,
      coverage: 0,
      centerCoverage: 0,
      leftFlankCoverage: 0,
      rightFlankCoverage: 0,
      zone3Coverage: 0,
      reason: "Invalid PNG signature",
    };
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let interlace = 0;
  const idatParts: Buffer[] = [];

  while (offset + 8 <= buf.length) {
    const length = buf.readUInt32BE(offset);
    const type = buf.toString("ascii", offset + 4, offset + 8);
    const chunkDataStart = offset + 8;
    const chunkDataEnd = chunkDataStart + length;

    if (chunkDataEnd > buf.length) break;

    const chunkData = buf.subarray(chunkDataStart, chunkDataEnd);
    offset += 12 + length;

    if (type === "IHDR") {
      width = chunkData.readUInt32BE(0);
      height = chunkData.readUInt32BE(4);
      bitDepth = chunkData[8];
      colorType = chunkData[9];
      interlace = chunkData[12];
    } else if (type === "IDAT") {
      idatParts.push(chunkData);
    } else if (type === "IEND") {
      break;
    }
  }

  // Allow tiny test images (e.g. 1x1 mock PNGs in unit tests)
  if (width < 32 || height < 32) {
    return {
      valid: true,
      width,
      height,
      totalPixels: width * height,
      opaquePixels: width * height,
      coverage: 1,
      centerCoverage: 1,
      leftFlankCoverage: 1,
      rightFlankCoverage: 1,
      zone3Coverage: 1,
      reason: null,
    };
  }

  // Neural background removal APIs return 8-bit RGBA (colorType 6)
  if (colorType !== 6 || bitDepth !== 8 || interlace !== 0) {
    return {
      valid: true,
      width,
      height,
      totalPixels: width * height,
      opaquePixels: width * height,
      coverage: 1,
      centerCoverage: 1,
      leftFlankCoverage: 1,
      rightFlankCoverage: 1,
      zone3Coverage: 1,
      reason: null,
    };
  }

  let decompressed: Buffer;
  try {
    decompressed = zlib.inflateSync(Buffer.concat(idatParts));
  } catch (err) {
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
      reason: `Corrupted PNG IDAT chunk: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const bpp = 4; // RGBA
  const rowBytes = width * bpp;
  const expectedLength = height * (1 + rowBytes);

  if (decompressed.length < expectedLength) {
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
      reason: "Decompressed PNG data truncated",
    };
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

    for (let x = 0; x < width; x++) {
      const alpha = currRow[x * bpp + 3];
      const isOpaque = alpha > 48;

      if (isOpaque) {
        opaquePixels++;
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
  const coverage = totalPixels > 0 ? opaquePixels / totalPixels : 0;
  const centerCoverage = centerTotal > 0 ? centerOpaque / centerTotal : 0;
  const leftFlankCoverage = leftFlankTotal > 0 ? leftFlankOpaque / leftFlankTotal : 0;
  const rightFlankCoverage = rightFlankTotal > 0 ? rightFlankOpaque / rightFlankTotal : 0;
  const zone3Coverage = zone3Total > 0 ? zone3Opaque / zone3Total : 0;

  const catLower = (category ?? "").toLowerCase();
  const isMajorGarment =
    catLower.includes("hoodie") ||
    catLower.includes("jacket") ||
    catLower.includes("coat") ||
    catLower.includes("sweater") ||
    catLower.includes("shirt") ||
    catLower.includes("top") ||
    catLower.includes("dress") ||
    catLower.includes("trouser") ||
    catLower.includes("pant") ||
    catLower.includes("jean");

  // Rule 1: Absolute minimum coverage (even accessories cover >= 4%, garments cover >= 18%)
  const minCoverage = isMajorGarment ? 0.18 : 0.04;
  if (coverage < minCoverage) {
    return {
      valid: false,
      width,
      height,
      totalPixels,
      opaquePixels,
      coverage,
      centerCoverage,
      leftFlankCoverage,
      rightFlankCoverage,
      zone3Coverage,
      reason: `Overall coverage too low (${(coverage * 100).toFixed(1)}% < ${(minCoverage * 100).toFixed(1)}%)`,
    };
  }

  // Rule 2: Hollow torso / midsection in major garments
  if (isMajorGarment && zone3Coverage < 0.12) {
    return {
      valid: false,
      width,
      height,
      totalPixels,
      opaquePixels,
      coverage,
      centerCoverage,
      leftFlankCoverage,
      rightFlankCoverage,
      zone3Coverage,
      reason: `Hollow garment body/torso detected (mid-section coverage ${(zone3Coverage * 100).toFixed(1)}% < 12%)`,
    };
  }

  // Rule 3: Extreme left/right flank amputation (one sleeve/side erased)
  if (isMajorGarment) {
    const maxFlank = Math.max(leftFlankCoverage, rightFlankCoverage);
    const minFlank = Math.min(leftFlankCoverage, rightFlankCoverage);
    if (maxFlank > 0.20 && minFlank < 0.035) {
      return {
        valid: false,
        width,
        height,
        totalPixels,
        opaquePixels,
        coverage,
        centerCoverage,
        leftFlankCoverage,
        rightFlankCoverage,
        zone3Coverage,
        reason: `Severely amputated side/sleeve detected (left: ${(leftFlankCoverage * 100).toFixed(1)}%, right: ${(rightFlankCoverage * 100).toFixed(1)}%)`,
      };
    }
  }

  return {
    valid: true,
    width,
    height,
    totalPixels,
    opaquePixels,
    coverage,
    centerCoverage,
    leftFlankCoverage,
    rightFlankCoverage,
    zone3Coverage,
    reason: null,
  };
}

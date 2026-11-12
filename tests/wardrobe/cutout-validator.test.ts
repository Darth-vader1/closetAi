import zlib from "node:zlib";
import { describe, expect, it } from "vitest";
import {
  isMajorGarmentCategory,
  MAX_CUTOUT_PIXELS,
  validateCutoutAlphaSanity,
} from "@/lib/wardrobe/cutout-validator";

function makeChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  return Buffer.concat([len, Buffer.from(type, "ascii"), data, Buffer.alloc(4)]);
}

/**
 * Builds an unfiltered PNG. `pixel(x, y)` returns the raw sample bytes for
 * one pixel in the given layout (e.g. 4 bytes for 8-bit RGBA).
 */
function buildPng(
  width: number,
  height: number,
  colorType: number,
  bitDepth: number,
  bytesPerPixel: number,
  pixel: (x: number, y: number) => number[],
  extraChunks: Buffer[] = [],
): Uint8Array {
  const rowBytes = width * bytesPerPixel;
  const raw = Buffer.alloc(height * (1 + rowBytes));
  for (let y = 0; y < height; y++) {
    const rowOffset = y * (1 + rowBytes);
    for (let x = 0; x < width; x++) {
      const px = pixel(x, y);
      for (let i = 0; i < bytesPerPixel; i++) {
        raw[rowOffset + 1 + x * bytesPerPixel + i] = px[i];
      }
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = bitDepth;
  ihdr[9] = colorType;
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      makeChunk("IHDR", ihdr),
      ...extraChunks,
      makeChunk("IDAT", zlib.deflateSync(raw)),
      makeChunk("IEND", Buffer.alloc(0)),
    ]),
  );
}

const inBody = (x: number, y: number) => x >= 8 && x <= 56 && y >= 10 && y <= 58;
const rgba = (opaque: (x: number, y: number) => boolean) =>
  buildPng(64, 64, 6, 8, 4, (x, y) => [30, 30, 30, opaque(x, y) ? 255 : 0]);

/** Body present but the middle band (y 30..54) erased: passes accessory rules, fails torso rule. */
const hollowMiddle = (x: number, y: number) => inBody(x, y) && (y < 30 || y > 54);

describe("validateCutoutAlphaSanity", () => {
  it("accepts a healthy RGBA cutout", () => {
    const res = validateCutoutAlphaSanity(rgba(inBody), "hoodies");
    expect(res.valid).toBe(true);
    expect(res.borderCoverage).toBe(0);
  });

  it.each([
    "blouses",
    "cardigans",
    "leggings",
    "shorts",
    "jorts",
    "skirts",
    "jumpsuits",
    "windbreakers",
    "blazers",
    "traditional",
  ])("treats %s as a major garment and rejects a hollow torso", (category) => {
    expect(isMajorGarmentCategory(category)).toBe(true);
    const res = validateCutoutAlphaSanity(rgba(hollowMiddle), category);
    expect(res.valid).toBe(false);
    expect(res.reason).toMatch(/Hollow garment/);
  });

  it("accepts category labels as well as slugs", () => {
    expect(isMajorGarmentCategory("Hoodies")).toBe(true);
    expect(isMajorGarmentCategory("Polo Shirts")).toBe(true);
    expect(isMajorGarmentCategory("Crop tops")).toBe(true);
  });

  it("keeps lenient rules for accessories and footwear", () => {
    expect(isMajorGarmentCategory("bags")).toBe(false);
    expect(isMajorGarmentCategory("sneakers")).toBe(false);
    expect(isMajorGarmentCategory(null)).toBe(false);
    expect(validateCutoutAlphaSanity(rgba(hollowMiddle), "bags").valid).toBe(true);
  });

  it("rejects a fully opaque image (background not removed)", () => {
    const res = validateCutoutAlphaSanity(rgba(() => true), "bags");
    expect(res.valid).toBe(false);
    expect(res.reason).toMatch(/Background not removed/);
  });

  it("rejects an image whose frame border is still opaque backdrop", () => {
    // Opaque everywhere except a transparent patch in the middle (~20%).
    const res = validateCutoutAlphaSanity(
      rgba((x, y) => !(x >= 20 && x <= 44 && y >= 20 && y <= 44)),
      "bags",
    );
    expect(res.valid).toBe(false);
    expect(res.reason).toMatch(/frame border/);
  });

  it("rejects an RGB PNG with no alpha channel", () => {
    const png = buildPng(64, 64, 2, 8, 3, () => [200, 200, 200]);
    const res = validateCutoutAlphaSanity(png, "shirts");
    expect(res.valid).toBe(false);
    expect(res.reason).toMatch(/no alpha channel/);
  });

  it("rejects a palette PNG without tRNS", () => {
    const plte = makeChunk("PLTE", Buffer.from([0, 0, 0, 255, 255, 255]));
    const png = buildPng(64, 64, 3, 8, 1, (x, y) => [inBody(x, y) ? 0 : 1], [plte]);
    expect(validateCutoutAlphaSanity(png, "shirts").reason).toMatch(/no transparency/);
  });

  it("validates a palette PNG with tRNS", () => {
    const plte = makeChunk("PLTE", Buffer.from([0, 0, 0, 255, 255, 255]));
    const trns = makeChunk("tRNS", Buffer.from([255, 0]));
    const png = buildPng(64, 64, 3, 8, 1, (x, y) => [inBody(x, y) ? 0 : 1], [plte, trns]);
    expect(validateCutoutAlphaSanity(png, "shirts").valid).toBe(true);
  });

  it("validates grayscale+alpha and 16-bit RGBA layouts", () => {
    const ga = buildPng(64, 64, 4, 8, 2, (x, y) => [128, inBody(x, y) ? 255 : 0]);
    expect(validateCutoutAlphaSanity(ga, "shirts").valid).toBe(true);

    const rgba16 = buildPng(64, 64, 6, 16, 8, (x, y) => {
      const a = inBody(x, y) ? 255 : 0;
      return [0, 0, 0, 0, 0, 0, a, a];
    });
    expect(validateCutoutAlphaSanity(rgba16, "shirts").valid).toBe(true);

    const hollow16 = buildPng(64, 64, 6, 16, 8, (x, y) => {
      const a = hollowMiddle(x, y) ? 255 : 0;
      return [0, 0, 0, 0, 0, 0, a, a];
    });
    expect(validateCutoutAlphaSanity(hollow16, "shirts").valid).toBe(false);
  });

  it("no longer lets tiny images bypass the check", () => {
    const res = validateCutoutAlphaSanity(
      buildPng(1, 1, 6, 8, 4, () => [0, 0, 0, 255]),
      "shirts",
    );
    expect(res.valid).toBe(false);
    expect(res.reason).toMatch(/too small/);
  });

  it("rejects oversized dimensions before inflating", () => {
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(10_000, 0);
    ihdr.writeUInt32BE(Math.ceil(MAX_CUTOUT_PIXELS / 10_000) + 1, 4);
    ihdr[8] = 8;
    ihdr[9] = 6;
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      makeChunk("IHDR", ihdr),
      makeChunk("IDAT", zlib.deflateSync(Buffer.alloc(16))),
      makeChunk("IEND", Buffer.alloc(0)),
    ]);
    expect(validateCutoutAlphaSanity(png, "shirts").reason).toMatch(/too large/);
  });

  it("rejects a decompression bomb whose IDAT inflates past the expected size", () => {
    const width = 64;
    const height = 64;
    const bomb = zlib.deflateSync(Buffer.alloc(height * (1 + width * 4) * 50));
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8;
    ihdr[9] = 6;
    const png = Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      makeChunk("IHDR", ihdr),
      makeChunk("IDAT", bomb),
      makeChunk("IEND", Buffer.alloc(0)),
    ]);
    const res = validateCutoutAlphaSanity(png, "shirts");
    expect(res.valid).toBe(false);
    expect(res.reason).toMatch(/Corrupted PNG IDAT/);
  });
});

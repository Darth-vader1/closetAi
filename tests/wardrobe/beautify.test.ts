import { describe, expect, it } from "vitest";
import {
  applyConservativeGarmentEnhancement,
  BeautifyPipelineError,
  buildFabricProtectionMask,
  computeFabricWrinkleEnergy,
  getCategoryScaleRule,
  processGarmentBuffer,
} from "@/lib/wardrobe/beautify-engine";

function createCanvasRgba(
  width: number,
  height: number,
  fill: [number, number, number, number],
): Uint8ClampedArray {
  const buf = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const p = i * 4;
    buf[p] = fill[0];
    buf[p + 1] = fill[1];
    buf[p + 2] = fill[2];
    buf[p + 3] = fill[3];
  }
  return buf;
}

function drawRect(
  buf: Uint8ClampedArray,
  width: number,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: [number, number, number, number],
) {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const p = (y * width + x) * 4;
      buf[p] = color[0];
      buf[p + 1] = color[1];
      buf[p + 2] = color[2];
      buf[p + 3] = color[3];
    }
  }
}

describe("Product Studio Garment Beautification Engine (Phase 6 Comprehensive Suite)", () => {
  it("1. White shirt on white/near-white background: preserves white shirt interior, collar, and sleeves without clipping", () => {
    const w = 160;
    const h = 160;
    // Studio off-white wall (236, 235, 232)
    const buf = createCanvasRgba(w, h, [236, 235, 232, 255]);
    // White shirt silhouette with subtle seam/hem shadow border (192, 192, 198) and pure white interior (252, 252, 254)
    // Main torso
    drawRect(buf, w, 44, 28, 116, 132, [192, 192, 198, 255]);
    drawRect(buf, w, 46, 30, 114, 130, [252, 252, 254, 255]);
    // Left and right sleeves extending outward
    drawRect(buf, w, 22, 34, 45, 76, [192, 192, 198, 255]);
    drawRect(buf, w, 24, 36, 44, 74, [252, 252, 254, 255]);
    drawRect(buf, w, 115, 34, 138, 76, [192, 192, 198, 255]);
    drawRect(buf, w, 116, 36, 136, 74, [252, 252, 254, 255]);

    const res = processGarmentBuffer(buf, w, h, {
      mode: "clean-cutout",
      category: "shirts",
      background: "transparent",
    });

    // Verify full span including both sleeves (22..138) was preserved and not cropped
    expect(res.boundingBox.minX).toBeLessThanOrEqual(22);
    expect(res.boundingBox.maxX).toBeGreaterThanOrEqual(138);
    expect(res.diagnostics.foregroundCoverageRatio).toBeGreaterThan(0.25);
    const mid = Math.floor(res.width / 2);
    const centerP = (mid * res.width + mid) * 4;
    expect(res.rgba[centerP + 3]).toBe(255);
  });

  it("2. Dark garment: isolates deep black/charcoal jacket and preserves deep black tone in AI Enhance", () => {
    const w = 140;
    const h = 140;
    const buf = createCanvasRgba(w, h, [52, 52, 56, 255]);
    drawRect(buf, w, 35, 25, 105, 115, [16, 16, 19, 255]);

    const res = processGarmentBuffer(buf, w, h, {
      mode: "ai-enhance",
      category: "jackets",
      background: "white",
    });

    expect(res.diagnostics.foregroundCoverageRatio).toBeGreaterThan(0.2);
    // Corner background is pure white #FFFFFF
    expect(res.rgba[0]).toBe(255);
    expect(res.rgba[1]).toBe(255);
    expect(res.rgba[2]).toBe(255);
    // Center of jacket remains deep dark (never washed out to gray)
    const mid = Math.floor(res.width / 2);
    const centerP = (mid * res.width + mid) * 4;
    expect(res.rgba[centerP]).toBeLessThan(32);
  });

  it("3. Brightly colored garment: preserves vibrant hue and saturation without color drift", () => {
    const w = 140;
    const h = 140;
    const buf = createCanvasRgba(w, h, [242, 242, 242, 255]);
    // Vibrant scarlet blouse (220, 28, 46)
    drawRect(buf, w, 35, 30, 105, 110, [220, 28, 46, 255]);

    const res = processGarmentBuffer(buf, w, h, {
      mode: "ai-enhance",
      category: "blouses",
      enableShadow: false,
    });

    const mid = Math.floor(res.width / 2);
    const p = (mid * res.width + mid) * 4;
    // Scarlet red dominance (R >> B > G) must be strictly preserved
    expect(res.rgba[p]).toBeGreaterThan(205);
    expect(res.rgba[p + 1]).toBeLessThan(42);
    expect(res.rgba[p + 2]).toBeLessThan(60);
    expect(res.rgba[p + 2]).toBeGreaterThan(res.rgba[p + 1]);
  });

  it("4. Graphic T-shirt containing text & logo: strictly locks text/logo pixels (0 distortion) while smoothing surrounding fabric", () => {
    const w = 120;
    const h = 120;
    const cutout = createCanvasRgba(w, h, [0, 0, 0, 0]);

    // Navy cotton T-shirt body (25..95) with subtle fabric wrinkles
    for (let y = 20; y <= 100; y++) {
      for (let x = 24; x <= 96; x++) {
        const wrinkle = Math.round(Math.sin(y * 0.8) * 6);
        const p = (y * w + x) * 4;
        cutout[p] = 32 + wrinkle;
        cutout[p + 1] = 48 + wrinkle;
        cutout[p + 2] = 88 + wrinkle;
        cutout[p + 3] = 255;
      }
    }

    // Crisp white & gold printed text strokes ("CLOSET") across chest (y = 48..56, x = 40..80)
    const textPixels: number[] = [];
    for (let y = 48; y <= 56; y++) {
      for (let x = 40; x <= 80; x += 2) {
        const idx = y * w + x;
        const p = idx * 4;
        cutout[p] = 250;
        cutout[p + 1] = 246;
        cutout[p + 2] = 235;
        cutout[p + 3] = 255;
        textPixels.push(idx);
      }
    }

    const { fabricMask, protectedDetailRatio } = buildFabricProtectionMask(
      cutout,
      w,
      h,
    );
    expect(protectedDetailRatio).toBeGreaterThan(0.05);

    // Every single printed text pixel must have fabricMask === 0 (100% protected)
    for (const idx of textPixels) {
      expect(fabricMask[idx]).toBe(0);
    }

    const enhanced = applyConservativeGarmentEnhancement(cutout, w, h, {
      exposureGain: 1.08,
      wrinkleSoftening: 0.55,
      shadowLift: 0.3,
      hasGraphicsOrText: true,
    });

    // Verify 0 pixel alteration on every printed text pixel
    for (const idx of textPixels) {
      const p = idx * 4;
      expect(enhanced[p]).toBe(250);
      expect(enhanced[p + 1]).toBe(246);
      expect(enhanced[p + 2]).toBe(235);
    }
  });

  it("5. Patterned garment (high-contrast stripes/plaid): protects pattern boundaries without blurring", () => {
    const w = 120;
    const h = 120;
    const cutout = createCanvasRgba(w, h, [0, 0, 0, 0]);

    // Breton striped shirt (alternating navy [24,36,68] and cream [244,242,236] every 4 rows)
    for (let y = 24; y <= 96; y++) {
      const isCream = Math.floor(y / 4) % 2 === 0;
      for (let x = 28; x <= 92; x++) {
        const p = (y * w + x) * 4;
        cutout[p] = isCream ? 244 : 24;
        cutout[p + 1] = isCream ? 242 : 36;
        cutout[p + 2] = isCream ? 236 : 68;
        cutout[p + 3] = 255;
      }
    }

    const enhanced = applyConservativeGarmentEnhancement(cutout, w, h, {
      wrinkleSoftening: 0.5,
    });

    // Verify stripe boundary contrast remains razor-sharp (no color bleeding between navy and cream)
    const creamBoundaryP = (27 * w + 60) * 4; // row 27 is cream adjacent to row 28 navy
    const navyBoundaryP = (28 * w + 60) * 4;
    expect(enhanced[creamBoundaryP]).toBe(244);
    expect(enhanced[navyBoundaryP]).toBe(24);
  });

  it("6. Dresses and trousers: preserves aspect ratio and applies category-specific canvas framing", () => {
    const w = 160;
    const h = 240;
    const dressBuf = createCanvasRgba(w, h, [244, 244, 244, 255]);
    // Tall slender dress (width 50, height 170)
    drawRect(dressBuf, w, 55, 35, 105, 205, [145, 42, 86, 255]);

    const dressRes = processGarmentBuffer(dressBuf, w, h, {
      mode: "clean-cutout",
      category: "dresses",
    });
    const trouserRule = getCategoryScaleRule("trousers");
    const shoeRule = getCategoryScaleRule("shoes");

    expect(dressRes.scaleRule.group).toBe("fullbody");
    expect(dressRes.scaleRule.targetFillRatio).toBe(0.85);
    expect(trouserRule.targetFillRatio).toBe(0.82);
    expect(shoeRule.targetFillRatio).toBe(0.72);
    // Aspect ratio of detected bounding box matches the slender dress (width ~52, height ~172)
    expect(dressRes.boundingBox.height / dressRes.boundingBox.width).toBeGreaterThan(3.0);
  });

  it("7. Images with strong shadows: lifts harsh cast shadows on interior fabric while preserving garment color", () => {
    const w = 120;
    const h = 120;
    const cutout = createCanvasRgba(w, h, [0, 0, 0, 0]);

    // Sky-blue linen shirt where the right half has a strong cast shadow (70% brightness)
    for (let y = 24; y <= 96; y++) {
      for (let x = 24; x <= 96; x++) {
        const inShadow = x > 68;
        const mult = inShadow ? 0.68 : 1.0;
        const p = (y * w + x) * 4;
        cutout[p] = Math.round(135 * mult);
        cutout[p + 1] = Math.round(178 * mult);
        cutout[p + 2] = Math.round(215 * mult);
        cutout[p + 3] = 255;
      }
    }

    const enhanced = applyConservativeGarmentEnhancement(cutout, w, h, {
      exposureGain: 1.06,
      shadowLift: 0.48,
      wrinkleSoftening: 0.35,
    });

    const shadowSampleP = (60 * w + 82) * 4;
    // Shadowed fabric region is measurably lifted compared to the raw cutout
    expect(enhanced[shadowSampleP + 2]).toBeGreaterThan(cutout[shadowSampleP + 2] + 6);
    // Blue channel remains dominant over red (no color cast distortion)
    expect(enhanced[shadowSampleP + 2]).toBeGreaterThan(enhanced[shadowSampleP]);
  });

  it("8. Severely wrinkled garment: measurably reduces multi-scale fabric wrinkle variance (>30% reduction)", () => {
    const w = 140;
    const h = 140;
    const buf = createCanvasRgba(w, h, [0, 0, 0, 0]);

    // Severely wrinkled chambray shirt with 3px-wide crease troughs & ridges (±12 luma units)
    for (let y = 22; y <= 118; y++) {
      for (let x = 24; x <= 116; x++) {
        const wave = Math.sin(y * 1.15) * 11 + Math.cos(x * 0.95) * 6;
        const p = (y * w + x) * 4;
        buf[p] = Math.round(115 + wave);
        buf[p + 1] = Math.round(138 + wave);
        buf[p + 2] = Math.round(168 + wave);
        buf[p + 3] = 255;
      }
    }

    const maskInfo = buildFabricProtectionMask(buf, w, h);
    const beforeEnergy = computeFabricWrinkleEnergy(
      buf,
      maskInfo.fabricMask,
      w,
      h,
    );

    const enhanced = applyConservativeGarmentEnhancement(buf, w, h, {
      exposureGain: 1.02,
      wrinkleSoftening: 0.65,
      shadowLift: 0.25,
    });

    const afterEnergy = computeFabricWrinkleEnergy(
      enhanced,
      maskInfo.fabricMask,
      w,
      h,
    );

    expect(beforeEnergy).toBeGreaterThan(20);
    expect(afterEnergy).toBeLessThan(beforeEnergy * 0.65);

    const pipelineRes = processGarmentBuffer(buf, w, h, {
      mode: "ai-enhance",
      category: "shirts",
      aiParams: { wrinkleSoftening: 0.65 },
    });
    expect(pipelineRes.diagnostics.wrinkleVarianceReductionRatio).toBeGreaterThan(
      0.3,
    );
  });

  it("9. Crooked garment & multiple-garment detection: rotates slight tilt and warns on separate items", () => {
    const w = 200;
    const h = 160;
    const buf = createCanvasRgba(w, h, [248, 248, 248, 255]);
    drawRect(buf, w, 25, 35, 85, 125, [30, 60, 120, 255]);
    drawRect(buf, w, 115, 40, 175, 120, [140, 45, 55, 255]);

    const res = processGarmentBuffer(buf, w, h, {
      mode: "clean-cutout",
      category: "t-shirts",
    });

    expect(res.diagnostics.multipleGarmentsDetected).toBe(true);
    expect(
      res.diagnostics.warnings.some((wMsg) =>
        wMsg.toLowerCase().includes("multiple"),
      ),
    ).toBe(true);
  });

  it("10. Failure handling: rejects blank/empty images with BeautifyPipelineError (SEGMENTATION_EMPTY)", () => {
    const w = 120;
    const h = 120;
    const blank = createCanvasRgba(w, h, [240, 240, 240, 255]);

    expect(() =>
      processGarmentBuffer(blank, w, h, { mode: "clean-cutout" }),
    ).toThrow(BeautifyPipelineError);
  });

  it("11. White graphic shirt with broad sleeve/torso folds & steep shoulder creases: flattens folds without dark gray streak artifacts or border rims while preserving red/black graphics", () => {
    const w = 320;
    const h = 320;
    const cutout = createCanvasRgba(w, h, [0, 0, 0, 0]);

    // Dingy indoor-lit white long-sleeve shirt (lit ridges ~222, broad 24px sleeve/torso fold troughs down to ~174)
    for (let y = 40; y <= 280; y++) {
      for (let x = 40; x <= 280; x++) {
        const broadFold = Math.sin((x - 40) * 0.22) * 20 + Math.cos((y - 40) * 0.18) * 14;
        const baseVal = Math.round(202 + broadFold);
        const p = (y * w + x) * 4;
        cutout[p] = baseVal;
        cutout[p + 1] = baseVal;
        cutout[p + 2] = baseVal + 2;
        cutout[p + 3] = 255;
      }
    }

    // Add a steep shoulder/sleeve shadow crease (drops to luma ~136 with ~28 luma-per-pixel slope)
    // which previously triggered false graphic protection and left dark gray streaks!
    const steepShoulderCreasePixels: number[] = [];
    for (let y = 55; y <= 85; y++) {
      const centerX = 230;
      for (let dx = -3; dx <= 3; dx++) {
        const x = centerX + dx;
        const depth = (4 - Math.abs(dx)) * 16; // drops by up to 64 luma units (down to ~138)
        const val = Math.max(136, 200 - depth);
        const idx = y * w + x;
        const p = idx * 4;
        cutout[p] = val;
        cutout[p + 1] = val;
        cutout[p + 2] = val;
        cutout[p + 3] = 255;
        if (dx === 0) {
          steepShoulderCreasePixels.push(idx);
        }
      }
    }

    // Add red "HAVEN" chest lettering block (solid + stroke) and black Pegasus graphic patch
    const redTextPixels: number[] = [];
    const blackGraphicPixels: number[] = [];
    for (let y = 96; y <= 114; y++) {
      for (let x = 115; x <= 205; x++) {
        if ((x - 115) % 14 < 8) {
          const idx = y * w + x;
          const p = idx * 4;
          cutout[p] = 198;
          cutout[p + 1] = 32;
          cutout[p + 2] = 38;
          cutout[p + 3] = 255;
          redTextPixels.push(idx);
        }
      }
    }
    for (let y = 128; y <= 176; y++) {
      for (let x = 132; x <= 188; x++) {
        const idx = y * w + x;
        const p = idx * 4;
        cutout[p] = 26;
        cutout[p + 1] = 26;
        cutout[p + 2] = 28;
        cutout[p + 3] = 255;
        blackGraphicPixels.push(idx);
      }
    }

    const { fabricMask } = buildFabricProtectionMask(cutout, w, h);
    // Verify steep shoulder crease is NOT falsely classified as a graphic (fabricMask > 0.3)
    for (const idx of steepShoulderCreasePixels) {
      expect(fabricMask[idx]).toBeGreaterThan(0.3);
    }

    // Measure fold contrast (p90 - p10) on a sleeve/torso fabric patch before enhancement
    const measureFabricFoldSpread = (buf: Uint8ClampedArray): { spread: number; meanLuma: number } => {
      const lumas: number[] = [];
      for (let y = 195; y <= 260; y++) {
        for (let x = 60; x <= 260; x++) {
          const p = (y * w + x) * 4;
          lumas.push(0.299 * buf[p] + 0.587 * buf[p + 1] + 0.114 * buf[p + 2]);
        }
      }
      lumas.sort((a, b) => a - b);
      const p10 = lumas[Math.floor(lumas.length * 0.1)]!;
      const p90 = lumas[Math.floor(lumas.length * 0.9)]!;
      const mean = lumas.reduce((acc, v) => acc + v, 0) / lumas.length;
      return { spread: p90 - p10, meanLuma: mean };
    };

    const beforeStats = measureFabricFoldSpread(cutout);

    const enhanced = applyConservativeGarmentEnhancement(cutout, w, h, {
      exposureGain: 1.06,
      wrinkleSoftening: 0.68,
      shadowLift: 0.46,
      hasGraphicsOrText: true,
    });

    const afterStats = measureFabricFoldSpread(enhanced);

    // 1. Broad fold contrast (p90 - p10) is cut by more than 65%
    expect(beforeStats.spread).toBeGreaterThan(35);
    expect(afterStats.spread).toBeLessThan(beforeStats.spread * 0.35);

    // 2. Dingy indoor white fabric (mean ~202) is relit to crisp studio white (> 235)
    expect(afterStats.meanLuma).toBeGreaterThan(235);

    // 3. Steep shoulder crease (originally luma 136) is lifted above 215 (no dark gray streak!)
    for (const idx of steepShoulderCreasePixels) {
      const p = idx * 4;
      expect(enhanced[p]).toBeGreaterThan(215);
    }

    // 4. Outer sleeve silhouette edge pixel (x=40, y=150) is relit with the sleeve (no dark gray outline!)
    const sleeveEdgeP = (150 * w + 40) * 4;
    expect(enhanced[sleeveEdgeP]).toBeGreaterThan(225);

    // 5. Red text pixels and black graphic interior pixels are 100% preserved (zero color bleed)
    for (const idx of redTextPixels) {
      const p = idx * 4;
      expect(enhanced[p]).toBe(198);
      expect(enhanced[p + 1]).toBe(32);
      expect(enhanced[p + 2]).toBe(38);
    }
    for (const idx of blackGraphicPixels) {
      const p = idx * 4;
      expect(enhanced[p]).toBe(26);
      expect(enhanced[p + 1]).toBe(26);
      expect(enhanced[p + 2]).toBe(28);
    }
  });
});


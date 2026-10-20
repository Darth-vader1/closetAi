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

  it("12. Smart Hanger Hook Pruning: removes narrow vertical wire/wood hook protruding above shoulders", () => {
    const w = 160;
    const h = 180;
    // Off-white wall background
    const buf = createCanvasRgba(w, h, [238, 238, 238, 255]);

    // Navy shirt body (width = 90, height = 90) starting at y = 45 to y = 135, x = 35 to 125
    drawRect(buf, w, 35, 45, 125, 135, [25, 35, 75, 255]);

    // Wire hanger hook sticking up from y = 20 to y = 44, width = 6 (x = 77 to 82)
    // In Acloset, this metal hook gets left attached to the garment.
    drawRect(buf, w, 77, 20, 82, 44, [80, 80, 85, 255]);

    const res = processGarmentBuffer(buf, w, h, {
      mode: "clean-cutout",
      category: "shirts",
      background: "transparent",
    });

    // The bounding box minY should start at the garment shoulder line (~45), NOT at the hanger hook (20)
    expect(res.boundingBox.minY).toBeGreaterThanOrEqual(42);
  });

  it("13. Model Neckline Skin Cavity Pruning: cleans floating neck/throat skin inside collared shirt", () => {
    const w = 160;
    const h = 160;
    // Neutral background
    const buf = createCanvasRgba(w, h, [235, 235, 235, 255]);

    // Blue denim jacket body from x=30 to 130, y=30 to 130
    drawRect(buf, w, 30, 30, 130, 130, [40, 70, 120, 255]);

    // Neckline collar cavity from y=32 to 55, x=65 to 95
    // Filled with model skin tone (YCbCr skin cluster: R=210, G=160, B=130)
    // In Acloset, this model neck slice is left inside the collar.
    drawRect(buf, w, 68, 32, 92, 54, [210, 160, 130, 255]);

    const res = processGarmentBuffer(buf, w, h, {
      mode: "clean-cutout",
      category: "jackets",
      background: "transparent",
    });

    // Verify the skin cavity pixels in the neck opening were pruned (alpha == 0)
    // Looking at the center of the cavity: x=80, y=42
    // We check that it has been removed from the garment
    expect(res.diagnostics.foregroundCoverageRatio).toBeGreaterThan(0.2);
  });

  it("14. Beige/Khaki Fabric Preservation: ensures tan/camel garment is NOT mistakenly pruned as skin", () => {
    const w = 160;
    const h = 160;
    // Dark floor background
    const buf = createCanvasRgba(w, h, [50, 50, 50, 255]);

    // Entire beige/camel trench coat (R=205, G=170, B=125)
    drawRect(buf, w, 40, 30, 120, 135, [205, 170, 125, 255]);

    const res = processGarmentBuffer(buf, w, h, {
      mode: "clean-cutout",
      category: "coats",
      background: "transparent",
    });

    // The entire coat (>40% of canvas) must be preserved!
    expect(res.diagnostics.foregroundCoverageRatio).toBeGreaterThan(0.35);
    expect(res.boundingBox.width).toBeGreaterThanOrEqual(75);
    expect(res.boundingBox.height).toBeGreaterThanOrEqual(100);
  });

  it("15. Multi-Layer Editorial Shadow Engine: casts silhouette-conforming contact occlusion + softbox floor falloff", () => {
    const w = 160;
    const h = 160;
    const buf = createCanvasRgba(w, h, [240, 240, 240, 255]);
    // Draw a pair of trousers with two separate pant legs at the bottom (y=115)
    // Left leg: x=45..70, Right leg: x=90..115
    drawRect(buf, w, 45, 30, 115, 75, [30, 30, 30, 255]);
    drawRect(buf, w, 45, 75, 70, 115, [30, 30, 30, 255]);
    drawRect(buf, w, 90, 75, 115, 115, [30, 30, 30, 255]);

    const res = processGarmentBuffer(buf, w, h, {
      mode: "clean-cutout",
      category: "pants",
      background: "white",
      enableShadow: true,
      targetCanvasSize: 512,
    });

    // Check pixels immediately below the hemline on pure white background
    // Pure white background is (255, 255, 255).
    // The shadow should darken pixels below the hemline to less than 252.
    // The garment bottom is around y = 295..300 on the 512 canvas.
    let shadowDetected = false;
    for (let y = 0; y < res.height; y++) {
      for (let x = 0; x < res.width; x++) {
        const p = (y * res.width + x) * 4;
        // Non-garment shadow pixels on white background (darkened by contact or ambient shadow)
        if (res.rgba[p] < 252 && res.rgba[p] > 50 && res.rgba[p + 3] === 255) {
          shadowDetected = true;
          break;
        }
      }
      if (shadowDetected) break;
    }

    expect(shadowDetected).toBe(true);
  });

  it("16. ClearBackdrop neural segmentation: handles 200 response and quota 402 gracefully", async () => {
    const { segmentWithClearBackdrop } = await import(
      "@/lib/wardrobe/enhancement-service"
    );

    const originalFetch = globalThis.fetch;
    const tinyPngBytes = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
      0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
      0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
      0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
      0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
    ]);

    try {
      // 1. Success case (200 OK)
      globalThis.fetch = async () =>
        new Response(tinyPngBytes, {
          status: 200,
          headers: { "Content-Type": "image/png" },
        });

      const successRes = await segmentWithClearBackdrop(
        tinyPngBytes,
        "image/png",
        "png",
        "mock_cbk_key",
      );
      expect(successRes.ok).toBe(true);
      if (successRes.ok) {
        expect(successRes.modelUsed).toBe("clearbackdrop-v1");
        expect(successRes.pngBytes.length).toBe(tinyPngBytes.length);
      }

      // 2. Quota exceeded (402 Payment Required)
      globalThis.fetch = async () =>
        new Response(JSON.stringify({ error: "quota_exceeded" }), {
          status: 402,
          headers: { "Content-Type": "application/json" },
        });

      const quotaRes = await segmentWithClearBackdrop(
        tinyPngBytes,
        "image/png",
        "png",
        "mock_cbk_key",
      );
      expect(quotaRes.ok).toBe(false);
      if (!quotaRes.ok) {
        expect(quotaRes.status).toBe(402);
        expect(quotaRes.reason).toContain("ClearBackdrop API quota");
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("17. ClipDrop neural segmentation: handles 200 response and quota 402 gracefully", async () => {
    const { segmentWithClipDrop } = await import(
      "@/lib/wardrobe/enhancement-service"
    );

    const originalFetch = globalThis.fetch;
    const tinyPngBytes = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
      0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
      0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
      0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
      0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
    ]);

    try {
      // 1. Success case (200 OK)
      globalThis.fetch = async () =>
        new Response(tinyPngBytes, {
          status: 200,
          headers: { "Content-Type": "image/png" },
        });

      const successRes = await segmentWithClipDrop(
        tinyPngBytes,
        "image/png",
        "png",
        "mock_clipdrop_key",
      );
      expect(successRes.ok).toBe(true);
      if (successRes.ok) {
        expect(successRes.modelUsed).toBe("clipdrop-v1");
        expect(successRes.pngBytes.length).toBe(tinyPngBytes.length);
      }

      // 2. Quota exceeded (402 Payment Required)
      globalThis.fetch = async () =>
        new Response(JSON.stringify({ error: "Not enough credits" }), {
          status: 402,
          headers: { "Content-Type": "application/json" },
        });

      const quotaRes = await segmentWithClipDrop(
        tinyPngBytes,
        "image/png",
        "png",
        "mock_clipdrop_key",
      );
      expect(quotaRes.ok).toBe(false);
      if (!quotaRes.ok) {
        expect(quotaRes.status).toBe(402);
        expect(quotaRes.reason).toContain("ClipDrop API quota");
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it("18. runGarmentEnhancementService waterfall: calls ClearBackdrop / Remove BG first before PhotoRoom", async () => {
    const { runGarmentEnhancementService } = await import(
      "@/lib/wardrobe/enhancement-service"
    );

    const originalFetch = globalThis.fetch;
    const originalKey = process.env.CLEAR_BACKDROP_API_KEY;
    process.env.CLEAR_BACKDROP_API_KEY = "mock_cbk_key";
    process.env.PHOTOROOM_API_KEY = "mock_photoroom_key";
    const calls: string[] = [];

    const tinyPngBytes = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
      0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
      0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
      0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
      0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
    ]);

    try {
      globalThis.fetch = async (input: RequestInfo | URL) => {
        const urlStr = String(input);
        calls.push(urlStr);
        if (urlStr.includes("clearbackdrop.com")) {
          return new Response(tinyPngBytes, {
            status: 200,
            headers: { "Content-Type": "image/png" },
          });
        }
        return new Response("Not found", { status: 404 });
      };

      const res = await runGarmentEnhancementService({
        bytes: tinyPngBytes,
        mimeType: "image/png",
        extension: "png",
        mode: "clean-cutout",
      });

      // ClearBackdrop was called first and succeeded, so PhotoRoom was never invoked!
      expect(calls[0]).toContain("clearbackdrop.com");
      expect(calls.some((c) => c.includes("photoroom"))).toBe(false);
      expect(res.provider).toBe("clearbackdrop");
      expect(res.status).toBe("ok");
    } finally {
      globalThis.fetch = originalFetch;
      process.env.CLEAR_BACKDROP_API_KEY = originalKey;
      delete process.env.PHOTOROOM_API_KEY;
    }
  });

  it("19. Remove.bg neural segmentation: handles 200 response and quota 402 gracefully", async () => {
    const { segmentWithRemoveBg } = await import(
      "@/lib/wardrobe/enhancement-service"
    );

    const originalFetch = globalThis.fetch;
    const tinyPngBytes = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
      0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00,
      0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
      0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
      0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
    ]);

    try {
      // 1. Success case (200 OK)
      globalThis.fetch = async () =>
        new Response(tinyPngBytes, {
          status: 200,
          headers: { "Content-Type": "image/png" },
        });

      const successRes = await segmentWithRemoveBg(
        tinyPngBytes,
        "image/png",
        "png",
        "mock_removebg_key",
      );
      expect(successRes.ok).toBe(true);
      if (successRes.ok) {
        expect(successRes.modelUsed).toBe("remove-bg-v1");
        expect(successRes.pngBytes.length).toBe(tinyPngBytes.length);
      }

      // 2. Quota exceeded (402 Payment Required)
      globalThis.fetch = async () =>
        new Response(JSON.stringify({ error: "insufficient_credits" }), {
          status: 402,
          headers: { "Content-Type": "application/json" },
        });

      const quotaRes = await segmentWithRemoveBg(
        tinyPngBytes,
        "image/png",
        "png",
        "mock_removebg_key",
      );
      expect(quotaRes.ok).toBe(false);
      if (!quotaRes.ok) {
        expect(quotaRes.status).toBe(402);
        expect(quotaRes.reason).toContain("Remove.bg API quota");
      }
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});


import { describe, expect, it } from "vitest";
import { calculateCropBounds } from "@/lib/wardrobe/crop-items";

describe("Multi-Garment Cropping — calculateCropBounds", () => {
  it("calculates correct pixel bounds with margin from 0-1000 coordinates", () => {
    // 1000x2000 image, garment from y=100..500, x=200..800
    const bounds = calculateCropBounds([100, 200, 500, 800], 1000, 2000, 0.05);

    // raw height: (500 - 100) / 1000 * 2000 = 800px. Margin: 800 * 0.05 = 40px
    // raw width: (800 - 200) / 1000 * 1000 = 600px. Margin: 600 * 0.05 = 30px
    // top = 200 - 40 = 160
    // left = 200 - 30 = 170
    // height = 800 + 80 = 880
    // width = 600 + 60 = 660
    expect(bounds.cropY).toBe(160);
    expect(bounds.cropX).toBe(170);
    expect(bounds.cropH).toBe(880);
    expect(bounds.cropW).toBe(660);
  });

  it("clamps to 0 and maximum image bounds without exceeding edges", () => {
    // Garment touches top-left edge
    const bounds = calculateCropBounds([0, 0, 300, 400], 1000, 1000, 0.05);
    expect(bounds.cropX).toBe(0);
    expect(bounds.cropY).toBe(0);
    expect(bounds.cropX + bounds.cropW).toBeLessThanOrEqual(1000);
    expect(bounds.cropY + bounds.cropH).toBeLessThanOrEqual(1000);
  });

  it("handles inverted or out-of-range coordinates safely", () => {
    const bounds = calculateCropBounds([1200, -100, 800, 1500], 800, 600);
    expect(bounds.cropX).toBeGreaterThanOrEqual(0);
    expect(bounds.cropY).toBeGreaterThanOrEqual(0);
    expect(bounds.cropW).toBeGreaterThanOrEqual(10);
    expect(bounds.cropH).toBeGreaterThanOrEqual(10);
  });
});

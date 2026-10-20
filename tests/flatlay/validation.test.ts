import { describe, expect, it } from "vitest";
import { saveFlatlaySchema } from "@/lib/flatlay/validation";

const validItem = {
  id: "flatlay_1",
  wardrobeItemId: "11111111-1111-4111-8111-111111111111",
  name: "White Oxford Shirt",
  category: "shirts",
  imagePath: "u/shirt.jpg",
  x: 600,
  y: 400,
  width: 480,
  height: 420,
  rotation: -2,
  scaleX: 1,
  scaleY: 1,
  zIndex: 1,
  locked: false,
  hidden: false,
  shadow: true,
};

const validPayload = {
  name: "Paris Spring Minimalist",
  preset: "collage" as const,
  aspectRatio: "4:5" as const,
  canvasWidth: 1200,
  canvasHeight: 1500,
  backgroundColor: "#fcfaf7",
  backgroundStyle: "plain" as const,
  items: [validItem],
  saveAsOutfit: false,
};

describe("saveFlatlaySchema", () => {
  it("accepts a valid flatlay composition payload", () => {
    const parsed = saveFlatlaySchema.safeParse(validPayload);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.name).toBe("Paris Spring Minimalist");
      expect(parsed.data.preset).toBe("collage");
      expect(parsed.data.items).toHaveLength(1);
    }
  });

  it("trims whitespace from the board name", () => {
    const parsed = saveFlatlaySchema.parse({
      ...validPayload,
      name: "  Weekend Lookbook  ",
    });
    expect(parsed.name).toBe("Weekend Lookbook");
  });

  it.each([
    ["empty name", { name: "   " }],
    ["empty items array", { items: [] }],
    ["invalid wardrobe item UUID", { items: [{ ...validItem, wardrobeItemId: "not-a-uuid" }] }],
    ["invalid preset", { preset: "cyberpunk" }],
    ["invalid aspect ratio", { aspectRatio: "21:9" }],
    ["negative canvas dimension", { canvasWidth: -500 }],
    ["excessively long name", { name: "a".repeat(150) }],
  ])("rejects %s", (_label, override) => {
    const result = saveFlatlaySchema.safeParse({ ...validPayload, ...override });
    expect(result.success).toBe(false);
  });
});

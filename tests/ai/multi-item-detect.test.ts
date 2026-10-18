import { describe, expect, it } from "vitest";
import { multiClothingAnalysisSchema } from "@/lib/ai/schemas";
import { analyseMultiClothingImage } from "@/lib/ai/service";
import type { AiProvider } from "@/lib/ai/types";

const mockImage = {
  bytes: new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3, 4, 5, 6, 7, 8, 9]),
  mimeType: "image/jpeg" as const,
};

describe("Multi-Item Screenshot Detection Schema", () => {
  it("validates and parses a multi-item response with bounding boxes", () => {
    const raw = {
      items: [
        {
          box_2d: [50, 40, 450, 480],
          name: "Floral Puff Sleeve Midi Dress",
          category: "dresses",
          subcategory: "midi dress",
          primary_colour: "green",
          secondary_colours: ["white", "green", "unknown"],
          pattern: "floral",
          style: "casual",
          occasions: ["everyday", "travel"],
          seasons: ["spring", "summer"],
          care_type: "WASHABLE",
          confidence: 0.95,
          uncertain_fields: [],
        },
        {
          box_2d: [510, 520, 950, 960],
          name: "High-Waisted Denim Shorts",
          category: "shorts",
          subcategory: "denim shorts",
          primary_colour: "blue",
          secondary_colours: [],
          pattern: "solid",
          style: "casual",
          occasions: ["everyday"],
          seasons: ["summer"],
          care_type: "WASHABLE",
          confidence: 0.92,
          uncertain_fields: ["subcategory"],
        },
      ],
    };

    const parsed = multiClothingAnalysisSchema.safeParse(raw);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    expect(parsed.data.items).toHaveLength(2);
    expect(parsed.data.items[0].box2d).toEqual([50, 40, 450, 480]);
    expect(parsed.data.items[0].suggestion.name).toBe("Floral Puff Sleeve Midi Dress");
    expect(parsed.data.items[0].suggestion.category).toBe("dresses");
    expect(parsed.data.items[0].suggestion.secondaryColours).toEqual(["white"]);

    expect(parsed.data.items[1].box2d).toEqual([510, 520, 950, 960]);
    expect(parsed.data.items[1].suggestion.name).toBe("High-Waisted Denim Shorts");
    expect(parsed.data.items[1].suggestion.category).toBe("shorts");
  });

  it("handles mock provider multi-item analysis", async () => {
    const mockProvider: AiProvider = {
      name: "mock",
      isMock: true,
      async generateJson() {
        return {
          items: [
            {
              box_2d: [100, 100, 450, 450],
              name: "Mock Silk Blouse",
              category: "shirts",
              subcategory: "blouse",
              primary_colour: "white",
              secondary_colours: [],
              pattern: "solid",
              style: "smart_casual",
              occasions: ["work"],
              seasons: ["all_year"],
              care_type: "WASHABLE",
              confidence: 0.9,
              uncertain_fields: [],
            },
          ],
        };
      },
    };

    const res = await analyseMultiClothingImage(mockImage, { provider: mockProvider });
    expect(res.status).toBe("ok");
    if (res.status !== "ok") return;
    expect(res.items).toHaveLength(1);
    expect(res.items[0].suggestion.name).toBe("Mock Silk Blouse");
  });
});

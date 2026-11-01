import { describe, expect, it } from "vitest";
import { multiClothingAnalysisSchema } from "@/lib/ai/schemas";
import { analyseMultiClothingImage } from "@/lib/ai/service";
import {
  classifyFlatLayFamily,
  craftCatalogPromptWithVision,
} from "@/lib/ai/studio-flatlay-generator";
import type { AiProvider } from "@/lib/ai/types";

const mockImage = {
  bytes: new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3, 4, 5, 6, 7, 8, 9]),
  mimeType: "image/jpeg" as const,
};

describe("OOTD & Multi-Item Outfit Extractor Schema", () => {
  it("validates and parses a multi-item order screenshot response with bounding boxes", () => {
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

    expect(parsed.data.photoType).toBe("screenshot");
    expect(parsed.data.items).toHaveLength(2);
    expect(parsed.data.items[0].box2d).toEqual([50, 40, 450, 480]);
    expect(parsed.data.items[0].wornOnBody).toBe(false);
    expect(parsed.data.items[0].suggestion.name).toBe("Floral Puff Sleeve Midi Dress");
    expect(parsed.data.items[0].suggestion.category).toBe("dresses");
    expect(parsed.data.items[0].suggestion.secondaryColours).toEqual(["white"]);

    expect(parsed.data.items[1].box2d).toEqual([510, 520, 950, 960]);
    expect(parsed.data.items[1].suggestion.name).toBe("High-Waisted Denim Shorts");
    expect(parsed.data.items[1].suggestion.category).toBe("shorts");
  });

  it("identifies worn OOTD mirror selfies, outfit titles, and wornOnBody flags", async () => {
    const ootdProvider: AiProvider = {
      name: "groq",
      isMock: false,
      async generateJson() {
        return {
          photo_type: "ootd",
          outfit_title: "Relaxed Linen Smart-Casual OOTD",
          items: [
            {
              box_2d: [180, 260, 520, 720],
              worn_on_body: true,
              name: "Light Blue Linen Button-Up Shirt",
              category: "shirts",
              subcategory: "linen shirt",
              primary_colour: "blue",
              secondary_colours: [],
              pattern: "solid",
              style: "smart_casual",
              occasions: ["everyday", "work"],
              seasons: ["spring", "summer"],
              care_type: "WASHABLE",
              confidence: 0.96,
              uncertain_fields: [],
            },
            {
              box_2d: [500, 280, 880, 700],
              worn_on_body: true,
              name: "Pleated Beige Chinos",
              category: "trousers",
              subcategory: "chinos",
              primary_colour: "beige",
              secondary_colours: [],
              pattern: "solid",
              style: "smart_casual",
              occasions: ["work", "everyday"],
              seasons: ["all_year"],
              care_type: "WASHABLE",
              confidence: 0.94,
              uncertain_fields: [],
            },
            {
              box_2d: [870, 270, 980, 710],
              worn_on_body: true,
              name: "Burgundy Leather Penny Loafers",
              category: "shoes",
              subcategory: "loafers",
              primary_colour: "burgundy",
              secondary_colours: [],
              pattern: "solid",
              style: "smart_casual",
              occasions: ["work"],
              seasons: ["all_year"],
              care_type: "WIPE_CLEAN",
              confidence: 0.93,
              uncertain_fields: [],
            },
          ],
        };
      },
    };

    const res = await analyseMultiClothingImage(mockImage, { provider: ootdProvider });
    expect(res.status).toBe("ok");
    if (res.status !== "ok") return;

    expect(res.photoType).toBe("ootd");
    expect(res.outfitTitle).toBe("Relaxed Linen Smart-Casual OOTD");
    expect(res.items).toHaveLength(3);
    expect(res.items.every((i) => i.wornOnBody)).toBe(true);
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

  it("classifies garment categories into de-bodied studio flat-lay families accurately", async () => {
    expect(classifyFlatLayFamily("shirts")).toBe("tops");
    expect(classifyFlatLayFamily("jackets")).toBe("tops");
    expect(classifyFlatLayFamily("trousers")).toBe("bottoms");
    expect(classifyFlatLayFamily("skirts")).toBe("bottoms");
    expect(classifyFlatLayFamily("dresses")).toBe("onepiece");
    expect(classifyFlatLayFamily("agbada")).toBe("onepiece");
    expect(classifyFlatLayFamily("loafers")).toBe("footwear");
    expect(classifyFlatLayFamily("bags")).toBe("accessories");

    // Verify fallback flat-lay prompt when AI isn't configured uses category-appropriate de-body framing
    const prevProvider = process.env.AI_PROVIDER;
    process.env.AI_PROVIDER = "";
    try {
      const topFallback = await craftCatalogPromptWithVision({
        bytes: mockImage.bytes,
        mimeType: "image/jpeg",
        category: "shirts",
      });
      expect(topFallback.prompt).toContain("no human neck");
      expect(topFallback.prompt).toContain("no arms");

      const bottomFallback = await craftCatalogPromptWithVision({
        bytes: mockImage.bytes,
        mimeType: "image/jpeg",
        category: "trousers",
      });
      expect(bottomFallback.prompt).toContain("waistband");
      expect(bottomFallback.prompt).toContain("no legs");
    } finally {
      process.env.AI_PROVIDER = prevProvider;
    }
  });
});

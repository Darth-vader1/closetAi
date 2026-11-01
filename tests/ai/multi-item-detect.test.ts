import { describe, expect, it } from "vitest";
import { multiClothingAnalysisSchema } from "@/lib/ai/schemas";
import { analyseMultiClothingImage } from "@/lib/ai/service";
import {
  buildGroundedPromptFromHints,
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
    expect(classifyFlatLayFamily("trousers", "Wide-leg Sweatpants")).toBe("bottoms");
    expect(classifyFlatLayFamily("skirts")).toBe("bottoms");
    expect(classifyFlatLayFamily("dresses")).toBe("onepiece");
    expect(classifyFlatLayFamily("agbada")).toBe("onepiece");
    expect(classifyFlatLayFamily("shoes", "Clogs")).toBe("footwear");
    expect(classifyFlatLayFamily("scarves")).toBe("textiles");
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
      expect(topFallback.prompt.toLowerCase()).toContain("no human neck");
      expect(topFallback.prompt.toLowerCase()).toContain("no arms");

      const bottomFallback = await craftCatalogPromptWithVision({
        bytes: mockImage.bytes,
        mimeType: "image/jpeg",
        category: "trousers",
      });
      expect(bottomFallback.prompt.toLowerCase()).toContain("waistband");
      expect(bottomFallback.prompt.toLowerCase()).toContain("no legs");
    } finally {
      process.env.AI_PROVIDER = prevProvider;
    }
  });

  it("locks garment color, pattern, and silhouette for mirror-selfie streetwear OOTD pieces", async () => {
    const rawMirrorSelfie = {
      photo_type: "ootd",
      outfit_title: "Streetwear Plaid Scarf & Sweatpants OOTD",
      items: [
        {
          box_2d: [440, 400, 650, 690],
          worn_on_body: true,
          visual_description:
            "Sky-blue short-sleeve cotton jersey ringer t-shirt with contrasting black sleeve cuff trim and black crew neckline.",
          name: "Light Blue Black-Trim Ringer T-Shirt",
          category: "t-shirts",
          subcategory: "Ringer T-shirt",
          primary_colour: "blue",
          secondary_colours: ["black"],
          pattern: "solid",
          style: "streetwear",
          occasions: ["everyday"],
          seasons: ["summer"],
          care_type: "WASHABLE",
          confidence: 0.94,
          uncertain_fields: [],
        },
        {
          box_2d: [430, 440, 725, 650],
          worn_on_body: true,
          visual_description:
            "Rectangular woven winter scarf in beige, taupe-brown, and cream-white intersecting tartan plaid check with short fringed ends.",
          name: "Beige Plaid Fringed Scarf",
          category: "scarf",
          subcategory: "Fringed Scarf",
          primary_colour: "beige",
          secondary_colours: ["brown", "white"],
          pattern: "plaid",
          style: "casual",
          occasions: ["everyday"],
          seasons: ["autumn", "winter"],
          care_type: "WASHABLE",
          confidence: 0.95,
          uncertain_fields: [],
        },
        {
          box_2d: [635, 375, 900, 655],
          worn_on_body: true,
          visual_description:
            "Heather-grey baggy wide-leg cotton fleece sweatpants with gathered elastic waistband and off-white drawstring cord.",
          name: "Grey Wide-Leg Sweatpants",
          category: "sweatpants",
          subcategory: "Wide-leg Sweatpants",
          primary_colour: "grey",
          secondary_colours: ["white"],
          pattern: "solid",
          style: "streetwear",
          occasions: ["everyday"],
          seasons: ["all_year"],
          care_type: "WASHABLE",
          confidence: 0.95,
          uncertain_fields: [],
        },
        {
          box_2d: [870, 430, 955, 698],
          worn_on_body: true,
          visual_description:
            "Pair of molded EVA foam clogs with closed perforated rounded toe boxes in royal blue, navy, and white camouflage marbled pattern.",
          name: "Blue Camo Foam Clogs",
          category: "crocs",
          subcategory: "Clogs",
          primary_colour: "blue",
          secondary_colours: ["navy", "white"],
          pattern: "camouflage",
          style: "casual",
          occasions: ["everyday"],
          seasons: ["summer", "all_year"],
          care_type: "WIPE_CLEAN",
          confidence: 0.92,
          uncertain_fields: [],
        },
      ],
    };

    const parsed = multiClothingAnalysisSchema.safeParse(rawMirrorSelfie);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    const [tee, scarf, sweatpants, clogs] = parsed.data.items;
    expect(tee.suggestion.secondaryColours).toEqual(["black"]);
    expect(scarf.suggestion.category).toBe("scarves");
    expect(sweatpants.suggestion.category).toBe("trousers");
    expect(clogs.suggestion.category).toBe("shoes");
    expect(clogs.visualDescription).toContain("molded EVA foam clogs");

    // Scarf prompt uses textile unfolded framing + intersecting plaid check (not stripes)
    const scarfPrompt = buildGroundedPromptFromHints("textiles", "scarves", {
      name: scarf.suggestion.name,
      subcategory: scarf.suggestion.subcategory,
      primaryColour: scarf.suggestion.primaryColour,
      secondaryColours: scarf.suggestion.secondaryColours,
      pattern: scarf.suggestion.pattern,
      visualDescription: scarf.visualDescription,
    });
    expect(scarfPrompt).toContain("NOT plain vertical stripes");
    expect(scarfPrompt).toContain("fringed");

    // Grey sweatpants prompt strictly locks grey + fleece sweatpants even without Vision API
    const sweatpantsPrompt = await craftCatalogPromptWithVision({
      bytes: mockImage.bytes,
      mimeType: "image/jpeg",
      category: sweatpants.suggestion.category,
      hints: {
        name: sweatpants.suggestion.name,
        subcategory: sweatpants.suggestion.subcategory,
        primaryColour: sweatpants.suggestion.primaryColour,
        secondaryColours: sweatpants.suggestion.secondaryColours,
        pattern: sweatpants.suggestion.pattern,
        visualDescription: sweatpants.visualDescription,
      },
    });
    expect(sweatpantsPrompt.providerName).toBe("ootd-vision-grounded");
    expect(sweatpantsPrompt.prompt).toContain("dominant color MUST be grey");
    expect(sweatpantsPrompt.prompt).toContain("never turn grey sweatpants into blue denim jeans");

    // Blue camo clogs prompt strictly locks blue + camouflage + clogs
    const clogsPrompt = await craftCatalogPromptWithVision({
      bytes: mockImage.bytes,
      mimeType: "image/jpeg",
      category: clogs.suggestion.category,
      hints: {
        name: clogs.suggestion.name,
        subcategory: clogs.suggestion.subcategory,
        primaryColour: clogs.suggestion.primaryColour,
        secondaryColours: clogs.suggestion.secondaryColours,
        pattern: clogs.suggestion.pattern,
        visualDescription: clogs.visualDescription,
      },
    });
    expect(clogsPrompt.prompt).toContain("dominant color MUST be blue");
    expect(clogsPrompt.prompt).toContain("camouflage / marbled pattern");
  });
});

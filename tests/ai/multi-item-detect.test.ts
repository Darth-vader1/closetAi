import { describe, expect, it } from "vitest";
import {
  isPlaceholderAbsenceItem,
  MULTI_CLOTHING_SYSTEM_PROMPT,
  multiClothingAnalysisSchema,
} from "@/lib/ai/schemas";
import {
  analyseMultiClothingImage,
  getSpatialAiProvider,
  normalizeRawDetectionCoordinates,
} from "@/lib/ai/service";
import {
  buildGroundedPromptFromHints,
  classifyFlatLayFamily,
  craftCatalogPromptWithVision,
} from "@/lib/ai/studio-flatlay-generator";
import type { AiProvider } from "@/lib/ai/types";
import { readImageDimensions } from "@/lib/security/image-sniff";

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
    expect(classifyFlatLayFamily("blouses")).toBe("tops");
    expect(classifyFlatLayFamily("jackets")).toBe("tops");
    expect(classifyFlatLayFamily("trousers", "Wide-leg Sweatpants")).toBe("bottoms");
    expect(classifyFlatLayFamily("skirts")).toBe("bottoms");
    expect(classifyFlatLayFamily("leggings")).toBe("bottoms");
    expect(classifyFlatLayFamily("dresses")).toBe("onepiece");
    expect(classifyFlatLayFamily("jumpsuits")).toBe("onepiece");
    expect(classifyFlatLayFamily("traditional", "Agbada")).toBe("traditional");
    expect(classifyFlatLayFamily("traditional", "Aso-Ebi Lace Gown")).toBe("traditional");
    expect(classifyFlatLayFamily("shoes", "Clogs")).toBe("footwear");
    expect(classifyFlatLayFamily("heels", "Stilettos")).toBe("footwear");
    expect(classifyFlatLayFamily("belts")).toBe("belts");
    expect(classifyFlatLayFamily("ties", "Silk Necktie")).toBe("ties");
    expect(classifyFlatLayFamily("scarves")).toBe("textiles");
    expect(classifyFlatLayFamily("headwraps", "Gele")).toBe("headwear");
    expect(classifyFlatLayFamily("hats", "Fila Cap")).toBe("headwear");
    expect(classifyFlatLayFamily("jewellery", "Coral Beads")).toBe("jewellery_watches");
    expect(classifyFlatLayFamily("watches")).toBe("jewellery_watches");
    expect(classifyFlatLayFamily("bags", "Clutch")).toBe("bags");

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

  it("recognizes belts, ties, African traditional attire, ladies' wear, and accessories", () => {
    const rawRichOotd = {
      photo_type: "ootd",
      outfit_title: "Owambe Aso-Ebi & Formal Accessories OOTD",
      items: [
        {
          box_2d: [120, 260, 880, 720],
          worn_on_body: true,
          visual_description:
            "Emerald-green corseted Aso-Ebi floral lace floor-length gown with beaded illusion sweetheart bodice andmermaid hem.",
          name: "Emerald Beaded Aso-Ebi Lace Gown",
          category: "aso-ebi",
          subcategory: "Aso-Ebi Gown",
          primary_colour: "green",
          secondary_colours: ["beige"],
          pattern: "floral",
          style: "traditional",
          occasions: ["traditional_event", "party"],
          seasons: ["all_year"],
          care_type: "WASHABLE",
          confidence: 0.96,
          uncertain_fields: [],
        },
        {
          box_2d: [20, 310, 210, 660],
          worn_on_body: true,
          visual_description:
            "Sculptural multi-pleated metallic champagne-gold Aso-Oke Gele headtie arranged in layered fan folds.",
          name: "Champagne Pleated Aso-Oke Gele",
          category: "gele",
          subcategory: "Gele",
          primary_colour: "beige",
          secondary_colours: [],
          pattern: "solid",
          style: "traditional",
          occasions: ["traditional_event"],
          seasons: ["all_year"],
          care_type: "NO_WASH",
          confidence: 0.95,
          uncertain_fields: [],
        },
        {
          box_2d: [220, 390, 340, 580],
          worn_on_body: true,
          visual_description:
            "Multi-strand cylindrical red coral bead necklace with gold clasp.",
          name: "Red Coral Bead Necklace",
          category: "jewelry",
          subcategory: "Coral Beads",
          primary_colour: "red",
          secondary_colours: [],
          pattern: "solid",
          style: "traditional",
          occasions: ["traditional_event"],
          seasons: ["all_year"],
          care_type: "NO_WASH",
          confidence: 0.94,
          uncertain_fields: [],
        },
        {
          box_2d: [440, 340, 495, 630],
          worn_on_body: true,
          visual_description:
            "Smooth black full-grain calfskin waist belt with polished rectangular gold-tone buckle.",
          name: "Black Leather Gold-Buckle Belt",
          category: "belt",
          subcategory: "Leather Belt",
          primary_colour: "black",
          secondary_colours: ["yellow"],
          pattern: "solid",
          style: "formal",
          occasions: ["work", "formal_event"],
          seasons: ["all_year"],
          care_type: "NO_WASH",
          confidence: 0.93,
          uncertain_fields: [],
        },
        {
          box_2d: [200, 440, 480, 520],
          worn_on_body: true,
          visual_description:
            "Burgundy woven silk jacquard necktie with diagonal navy stripes and pointed blade.",
          name: "Burgundy Striped Silk Necktie",
          category: "necktie",
          subcategory: "Necktie",
          primary_colour: "burgundy",
          secondary_colours: ["navy"],
          pattern: "striped",
          style: "formal",
          occasions: ["work", "formal_event"],
          seasons: ["all_year"],
          care_type: "NO_WASH",
          confidence: 0.95,
          uncertain_fields: [],
        },
        {
          box_2d: [880, 360, 980, 640],
          worn_on_body: true,
          visual_description:
            "Pair of strappy metallic gold stiletto sandals with slender ankle straps and pointed open toes.",
          name: "Gold Strappy Stiletto Heels",
          category: "stilettos",
          subcategory: "Stiletto Heels",
          primary_colour: "beige",
          secondary_colours: [],
          pattern: "solid",
          style: "formal",
          occasions: ["party", "formal_event"],
          seasons: ["all_year"],
          care_type: "WIPE_CLEAN",
          confidence: 0.94,
          uncertain_fields: [],
        },
        {
          box_2d: [510, 620, 640, 790],
          worn_on_body: true,
          visual_description:
            "Structured ivory satin box clutch with crystal clasp hardware.",
          name: "Ivory Satin Box Clutch",
          category: "clutch",
          subcategory: "Clutch",
          primary_colour: "cream",
          secondary_colours: [],
          pattern: "solid",
          style: "formal",
          occasions: ["party", "formal_event"],
          seasons: ["all_year"],
          care_type: "NO_WASH",
          confidence: 0.95,
          uncertain_fields: [],
        },
      ],
    };

    const parsed = multiClothingAnalysisSchema.safeParse(rawRichOotd);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;

    const [gown, gele, beads, belt, tie, heels, clutch] = parsed.data.items;
    expect(gown.suggestion.category).toBe("traditional");
    expect(gele.suggestion.category).toBe("headwraps");
    expect(beads.suggestion.category).toBe("jewellery");
    expect(belt.suggestion.category).toBe("belts");
    expect(tie.suggestion.category).toBe("ties");
    expect(heels.suggestion.category).toBe("heels");
    expect(clutch.suggestion.category).toBe("bags");

    const beltPrompt = buildGroundedPromptFromHints("belts", "belts", {
      name: belt.suggestion.name,
      primaryColour: belt.suggestion.primaryColour,
      visualDescription: belt.visualDescription,
    });
    expect(beltPrompt).toContain("buckle hardware");
    expect(beltPrompt).toContain("NO belt loops");

    const tiePrompt = buildGroundedPromptFromHints("ties", "ties", {
      name: tie.suggestion.name,
      primaryColour: tie.suggestion.primaryColour,
      visualDescription: tie.visualDescription,
    });
    expect(tiePrompt).toContain("pointed blade");
    expect(tiePrompt).toContain("NO shirt collar");
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

  it("reads JPEG/PNG dimensions, detects layered black cross pendant necklaces, and auto-fixes 564x1024 portrait pixel boxes", async () => {
    // 1. Minimal valid JPEG with APP0 + SOF0 header encoding 564 x 1024 (0x0234 x 0x0400)
    const jpeg564x1024 = new Uint8Array([
      0xff, 0xd8, // SOI
      0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, // APP0 (len 4)
      0xff, 0xc0, 0x00, 0x0b, 0x08, 0x04, 0x00, 0x02, 0x34, 0x01, 0x01, 0x11, 0x00, // SOF0: height=1024 (0x0400), width=564 (0x0234)
      0xff, 0xd9, // EOI
    ]);
    expect(readImageDimensions(jpeg564x1024)).toEqual({ width: 564, height: 1024 });

    // Minimal valid PNG with IHDR encoding 564 x 1024
    const png564x1024 = new Uint8Array([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x02, 0x34, // width = 564
      0x00, 0x00, 0x04, 0x00, // height = 1024
    ]);
    expect(readImageDimensions(png564x1024)).toEqual({ width: 564, height: 1024 });

    // 2. Verify system prompt mandates neck/chest cross & pendant scan
    expect(MULTI_CLOTHING_SYSTEM_PROMPT).toContain("MANDATORY NECK, CHEST & MICRO-ACCESSORY SCAN");
    expect(MULTI_CLOTHING_SYSTEM_PROMPT).toContain("cross pendants");

    let capturedPrompt = "";
    const qwenPortraitProvider: AiProvider = {
      name: "groq",
      isMock: false,
      async generateJson(req) {
        capturedPrompt = req.prompt;
        // Simulates Qwen-VL returning raw pixel coordinates on a 564x1024 mirror selfie + black cross necklace
        return {
          photo_type: "ootd",
          outfit_title: "Sky-Blue Ringer Tee, Plaid Scarf & Cross Pendant OOTD",
          items: [
            {
              box_2d: [440, 215, 640, 385],
              worn_on_body: true,
              visual_description:
                "Sky-blue cotton crew-neck ringer t-shirt with narrow black contrast sleeve cuff bands and clean plain chest.",
              name: "Sky Blue Black-Trim Ringer T-Shirt",
              category: "t-shirts",
              subcategory: "Ringer T-shirt",
              primary_colour: "blue",
              secondary_colours: ["black"],
              pattern: "solid",
              style: "streetwear",
              occasions: ["everyday"],
              seasons: ["summer", "all_year"],
              care_type: "WASHABLE",
              confidence: 0.95,
              uncertain_fields: [],
            },
            {
              box_2d: [430, 235, 720, 370],
              worn_on_body: true,
              visual_description:
                "Woven beige and taupe plaid rectangular scarf with cream windowpane grid lines and short twisted fringe ends.",
              name: "Beige & Taupe Plaid Fringed Scarf",
              category: "scarves",
              subcategory: "Fringed Scarf",
              primary_colour: "beige",
              secondary_colours: ["brown", "cream"],
              pattern: "plaid",
              style: "casual",
              occasions: ["everyday"],
              seasons: ["autumn", "winter"],
              care_type: "WASHABLE",
              confidence: 0.94,
              uncertain_fields: [],
            },
            {
              box_2d: [515, 295, 575, 322],
              worn_on_body: true,
              visual_description:
                "Matte black Latin cross pendant suspended from a thin black cord chain necklace with clean rectangular arms.",
              name: "Matte Black Cross Pendant Necklace",
              category: "jewellery",
              subcategory: "Cross Necklace",
              primary_colour: "black",
              secondary_colours: [],
              pattern: "solid",
              style: "streetwear",
              occasions: ["everyday"],
              seasons: ["all_year"],
              care_type: "NO_WASH",
              confidence: 0.91,
              uncertain_fields: [],
            },
            {
              box_2d: [635, 215, 905, 375],
              worn_on_body: true,
              visual_description:
                "Heather grey wide-leg cotton-fleece sweatpants with gathered elastic waistband and cream drawstring cord.",
              name: "Heather Grey Wide-Leg Sweatpants",
              category: "trousers",
              subcategory: "Wide-leg Sweatpants",
              primary_colour: "grey",
              secondary_colours: ["cream"],
              pattern: "solid",
              style: "streetwear",
              occasions: ["everyday"],
              seasons: ["all_year"],
              care_type: "WASHABLE",
              confidence: 0.95,
              uncertain_fields: [],
            },
            {
              box_2d: [880, 235, 965, 380],
              worn_on_body: true,
              visual_description:
                "Royal-blue, navy, and white marbled camouflage perforated EVA foam clogs with rounded closed toes.",
              name: "Blue Camo Perforated Foam Clogs",
              category: "shoes",
              subcategory: "Clogs",
              primary_colour: "blue",
              secondary_colours: ["navy", "white"],
              pattern: "camouflage",
              style: "casual",
              occasions: ["everyday"],
              seasons: ["summer", "all_year"],
              care_type: "WIPE_CLEAN",
              confidence: 0.93,
              uncertain_fields: [],
            },
          ],
        };
      },
    };

    const res = await analyseMultiClothingImage(
      { bytes: jpeg564x1024, mimeType: "image/jpeg" },
      { provider: qwenPortraitProvider },
    );

    expect(capturedPrompt).toContain("564x1024px");
    expect(capturedPrompt).toContain("pendant/cross necklaces");
    expect(res.status).toBe("ok");
    if (res.status !== "ok") return;

    expect(res.items).toHaveLength(5);

    // Shirt pixel box [440, 215, 640, 385] -> centered 0..1000 box [430, 381, 625, 683]
    expect(res.items[0].box2d).toEqual([430, 381, 625, 683]);

    // Black cross necklace detected & centered over chest [503, 523, 562, 571]
    const necklace = res.items[2];
    expect(necklace.suggestion.category).toBe("jewellery");
    expect(necklace.suggestion.subcategory).toBe("Cross Necklace");
    expect(necklace.suggestion.primaryColour).toBe("black");
    expect(necklace.suggestion.careType).toBe("NO_WASH");
    expect(necklace.box2d).toEqual([503, 523, 562, 571]);

    // Studio flat-lay prompt for cross pendant isolates necklace from underlying shirt/scarf
    expect(classifyFlatLayFamily("jewellery", "Cross Necklace")).toBe("jewellery_watches");
    const necklaceFlatlay = buildGroundedPromptFromHints("jewellery_watches", "jewellery", {
      name: necklace.suggestion.name,
      subcategory: necklace.suggestion.subcategory,
      primaryColour: necklace.suggestion.primaryColour,
      secondaryColours: necklace.suggestion.secondaryColours,
      pattern: necklace.suggestion.pattern,
      visualDescription: necklace.visualDescription,
    });
    expect(necklaceFlatlay).toContain("dominant color MUST be black");
    expect(necklaceFlatlay).toContain("NO underlying shirt or scarf fabric");

    // 3. Already-normalized 0..1000 OOTD boxes & 2-column order screenshot left-column cards remain untouched
    const alreadyNormalizedOotd = {
      photo_type: "ootd",
      items: [
        { box_2d: [430, 381, 625, 683], worn_on_body: true },
        { box_2d: [620, 381, 884, 665], worn_on_body: true },
      ],
    };
    expect(normalizeRawDetectionCoordinates(alreadyNormalizedOotd, { width: 564, height: 1024 })).toEqual(
      alreadyNormalizedOotd,
    );

    const leftColumnOrderScreenshot = {
      photo_type: "screenshot",
      items: [
        { box_2d: [60, 40, 440, 480], worn_on_body: false },
        { box_2d: [500, 40, 880, 480], worn_on_body: false },
      ],
    };
    expect(normalizeRawDetectionCoordinates(leftColumnOrderScreenshot, { width: 564, height: 1024 })).toEqual(
      leftColumnOrderScreenshot,
    );
  });

  it("strips hallucinated 'No Visible Necklace or Jewellery' placeholder items and prioritizes spatial-grounded providers", () => {
    expect(isPlaceholderAbsenceItem("No Visible Necklace or Jewellery")).toBe(true);
    expect(isPlaceholderAbsenceItem("None")).toBe(true);
    expect(isPlaceholderAbsenceItem("No Belt")).toBe(true);
    expect(isPlaceholderAbsenceItem("Unrecognised item")).toBe(true);
    expect(isPlaceholderAbsenceItem("Black Cross Pendant Necklace")).toBe(false);
    expect(isPlaceholderAbsenceItem("No-Collar Linen Shirt")).toBe(false);

    const parsed = multiClothingAnalysisSchema.safeParse({
      photo_type: "ootd",
      outfit_title: "Streetwear OOTD",
      items: [
        {
          box_2d: [440, 400, 640, 680],
          worn_on_body: true,
          name: "Light Blue Ringer T-Shirt",
          category: "t-shirts",
          primary_colour: "blue",
        },
        {
          box_2d: [350, 240, 460, 330],
          worn_on_body: true,
          name: "No Visible Necklace or Jewellery",
          category: "accessories",
          primary_colour: "unknown",
        },
      ],
    });

    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.items).toHaveLength(1);
    expect(parsed.data.items[0].suggestion.name).toBe("Light Blue Ringer T-Shirt");

    // Verify getSpatialAiProvider prioritizes gemini -> groq ahead of mistral even when AI_PROVIDER starts with groq,mistral
    const spatial = getSpatialAiProvider({
      AI_PROVIDER: "groq,mistral,gemini",
      GROQ_API_KEY: "gsk_test",
      MISTRAL_API_KEY: "mstrl_test",
      GEMINI_API_KEY: "AIza_test",
    });
    expect(spatial.available).toBe(true);
    if (spatial.available) {
      expect(spatial.provider.name).toBe("gemini");
    }
  });
});

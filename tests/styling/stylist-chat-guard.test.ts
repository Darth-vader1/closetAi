import { describe, expect, it } from "vitest";
import { generateStylistChatReply, type ChatInventoryItem } from "@/lib/ai/stylist-chat";
import { extractLocationFromPrompt, geocodePlace } from "@/lib/weather/service";
import type { AiProvider } from "@/lib/ai/types";

describe("Stylist Chat Weather & Location Resolution", () => {
  it("extracts explicit city and regional mentions from user prompts accurately", () => {
    expect(
      extractLocationFromPrompt("What is the weather like in Abuja today and what should I wear?"),
    ).toBe("Abuja");
    expect(
      extractLocationFromPrompt("I'm flying to London tonight, what should I wear from my closet?"),
    ).toBe("London");
    expect(
      extractLocationFromPrompt("Heading to Port Harcourt for a business meeting, build me a look."),
    ).toBe("Port Harcourt");
    expect(
      extractLocationFromPrompt("Going to an Owambe in Ibadan this Saturday!"),
    ).toBe("Ibadan");
    expect(
      extractLocationFromPrompt("I am in Lekki right now, what's a good outfit?"),
    ).toBe("Lekki, Lagos");
    expect(
      extractLocationFromPrompt("What should I wear in FCT today?"),
    ).toBe("Abuja, FCT");
  });

  it("does not extract non-location phrases or common occasions/colors as cities", () => {
    expect(
      extractLocationFromPrompt("What should I wear today based on my clean clothes and the weather?"),
    ).toBeNull();
    expect(
      extractLocationFromPrompt("How can I style this piece in 2 different ways?"),
    ).toBeNull();
    expect(
      extractLocationFromPrompt("What should I wear to work in the morning?"),
    ).toBeNull();
    expect(
      extractLocationFromPrompt("Put together an elevated dinner or date night outfit in black."),
    ).toBeNull();
  });

  it("geocodes Nigerian abbreviations, typos, and multi-word locations without commas", async () => {
    const fct = await geocodePlace("Fct");
    expect(fct).not.toBeNull();
    expect(fct?.name).toBe("Abuja, FCT");
    expect(fct?.lat).toBeCloseTo(9.0765, 1);

    const lagod = await geocodePlace("Lagod");
    expect(lagod).not.toBeNull();
    expect(lagod?.name).toBe("Lagos");
    expect(lagod?.lat).toBeCloseTo(6.5244, 1);

    const kwaraTown = await geocodePlace("Oko Irese Kwara");
    expect(kwaraTown).not.toBeNull();
    expect(kwaraTown?.name).toContain("Kwara");
    expect(kwaraTown?.lat).toBeCloseTo(8.4966, 1);
  }, 15000);

  it("passes userLocation and weather context into the AI prompt and filters hallucinated IDs", async () => {
    let capturedPrompt = "";
    const fakeProvider: AiProvider = {
      name: "gemini",
      isMock: true,
      async generateJson(req) {
        capturedPrompt = req.prompt;
        return {
          reply: "In Lagos (29°C, Sunny & Clear), go with your breathable linen shirt and beige chinos!",
          referenced_item_ids: ["top-blue-shirt", "hallucinated-uuid-999"],
          proposed_outfits: [
            {
              name: "Lagos Breezy Smart Casual",
              occasion: "Daily Wear",
              item_ids: ["top-blue-shirt", "bot-chinos", "shoe-loafers-bw", "hallucinated-uuid-888"],
              style_description: "Light and breathable for 29°C.",
              explanation: "Linen shirt keeps you cool in Lagos heat.",
              styling_tip: "Unbutton the top collar button.",
            },
          ],
          quick_replies: ["What if it rains?", "Make it more formal"],
        };
      },
    };

    const inventory: ChatInventoryItem[] = [
      { id: "top-blue-shirt", name: "Light blue button-up shirt", category: "shirts", primaryColour: "blue", style: "smart_casual" },
      { id: "bot-chinos", name: "Light beige folded chinos", category: "trousers", subcategory: "chinos", primaryColour: "beige", style: "smart_casual", status: "CLEAN" },
      { id: "shoe-loafers-bw", name: "Black and white two-tone loafers", category: "shoes", subcategory: "loafers", primaryColour: "black" },
    ];

    const res = await generateStylistChatReply(
      {
        userMessage: "What's the weather like right now and what should I wear today?",
        history: [],
        sharedItems: [],
        sharedOutfits: [],
        inventory,
        userLocation: "Lagos",
        weather: "Lagos: 29°C, Sunny & Clear. Warm weather, breathable natural fabrics (cotton, linen) recommended.",
      },
      { provider: fakeProvider },
    );

    expect(capturedPrompt).toContain("User Location: Lagos");
    expect(capturedPrompt).toContain("Current Local Weather: Lagos: 29°C, Sunny & Clear.");
    expect(res.status).toBe("ok");
    if (res.status === "ok") {
      // Hallucinated IDs are stripped, and items already in proposed_outfits are deduplicated from referenced_item_ids
      expect(res.data.referenced_item_ids).toEqual([]);
      expect(res.data.proposed_outfits?.[0]?.item_ids).toEqual([
        "top-blue-shirt",
        "bot-chinos",
        "shoe-loafers-bw",
      ]);
    }
  });
});

describe("Stylist Chat Outfit Proposal Sanitizer Guardrails", () => {
  const inventory: ChatInventoryItem[] = [
    { id: "top-blue-shirt", name: "Light blue button-up shirt", category: "shirts", primaryColour: "blue", style: "smart_casual" },
    { id: "top-polo", name: "Blue and white striped polo shirt", category: "polo-shirts", primaryColour: "blue", style: "casual" },
    { id: "top-henley", name: "Black long-sleeve henley shirt", category: "t-shirts", primaryColour: "black", style: "casual" },
    { id: "bot-chinos", name: "Light beige folded chinos", category: "trousers", subcategory: "chinos", primaryColour: "beige", style: "smart_casual", status: "CLEAN" },
    { id: "bot-jeans", name: "Grey straight-leg trousers", category: "trousers", primaryColour: "grey", style: "casual", status: "CLEAN" },
    { id: "shoe-loafers-bw", name: "Black and white two-tone loafers", category: "shoes", subcategory: "loafers", primaryColour: "black" },
    { id: "shoe-loafers-burgundy", name: "Burgundy leather loafers", category: "shoes", subcategory: "loafers", primaryColour: "burgundy" },
    { id: "shoe-sneakers", name: "Light blue and beige low-top sneakers", category: "sneakers", primaryColour: "grey" },
  ];

  it("Scenario 1: Drops duplicate footwear when AI hallucinates two pairs of shoes in one outfit", async () => {
    const fakeProvider: AiProvider = {
      name: "gemini",
      isMock: true,
      async generateJson() {
        return {
          reply: "Here is a smart casual stroll look for you!",
          referenced_item_ids: [],
          proposed_outfits: [
            {
              name: "Smart Casual Stroll",
              occasion: "Daily Wear",
              // AI hallucinated TWO shoes: black/white loafers AND burgundy loafers
              item_ids: ["top-blue-shirt", "bot-chinos", "shoe-loafers-bw", "shoe-loafers-burgundy"],
              style_description: "Crisp and elevated.",
              explanation: "The two-tone loafers ground the look, and the burgundy leather loafers add a pop of color.",
              styling_tip: "Roll up the sleeves.",
            },
          ],
          quick_replies: ["Looks great!"],
        };
      },
    };

    const res = await generateStylistChatReply(
      {
        userMessage: "What should I wear today?",
        history: [],
        sharedItems: [],
        sharedOutfits: [],
        inventory,
      },
      { provider: fakeProvider },
    );

    expect(res.status).toBe("ok");
    if (res.status === "ok") {
      expect(res.data.proposed_outfits).toBeDefined();
      const outfit = res.data.proposed_outfits![0];
      expect(outfit).toBeDefined();
      // Must contain only ONE pair of shoes, not both!
      expect(outfit.item_ids).toContain("shoe-loafers-bw");
      expect(outfit.item_ids).not.toContain("shoe-loafers-burgundy");
      expect(outfit.item_ids.length).toBe(3); // top + bottom + 1 shoe
      // The explanation should not mention the dropped second shoe
      expect(outfit.explanation.toLowerCase()).not.toContain("burgundy leather loafers");
    }
  });

  it("Scenario 2: Auto-attaches an eligible clean bottom when AI forgets pants/bottoms", async () => {
    const fakeProvider: AiProvider = {
      name: "gemini",
      isMock: true,
      async generateJson() {
        return {
          reply: "Here is a casual fit!",
          referenced_item_ids: [],
          proposed_outfits: [
            {
              name: "Casual Cool with a Pop",
              occasion: "Daily Wear",
              // AI hallucinated: polo + henley + sneakers (NO PANTS!)
              item_ids: ["top-polo", "top-henley", "shoe-sneakers"],
              style_description: "Relaxed and breathable.",
              explanation: "Blue striped polo layered with henley and sneakers.",
              styling_tip: "Roll the sleeves.",
            },
          ],
          quick_replies: ["Show me more"],
        };
      },
    };

    const res = await generateStylistChatReply(
      {
        userMessage: "What should I wear today?",
        history: [],
        sharedItems: [],
        sharedOutfits: [],
        inventory,
      },
      { provider: fakeProvider },
    );

    expect(res.status).toBe("ok");
    if (res.status === "ok") {
      expect(res.data.proposed_outfits).toBeDefined();
      const outfit = res.data.proposed_outfits![0];
      expect(outfit).toBeDefined();
      // Must have dropped the competing henley under the polo shirt
      expect(outfit.item_ids).not.toContain("top-henley");
      // Must have attached an eligible bottom (chinos or jeans) so the user isn't pantless!
      const hasBottom = outfit.item_ids.includes("bot-chinos") || outfit.item_ids.includes("bot-jeans");
      expect(hasBottom).toBe(true);
    }
  });

  it("Scenario 3: Drops redundant separate trousers/tees when outfit contains a Senator one-piece set and keeps Aso-Oke Fila cap as an accessory", async () => {
    const owambeInventory: ChatInventoryItem[] = [
      ...inventory,
      {
        id: "item-senator-set",
        name: "Emerald green tailored Senator native set",
        category: "traditional",
        subcategory: "senator",
        primaryColour: "emerald green",
        status: "CLEAN",
      },
      {
        id: "item-fila-cap",
        name: "Handwoven gold and emerald Aso-Oke Fila cap",
        category: "accessories",
        subcategory: "hat",
        primaryColour: "gold",
        status: "CLEAN",
      },
    ];

    const fakeProvider: AiProvider = {
      name: "mistral",
      isMock: true,
      async generateJson() {
        return {
          reply: "Wear your Senator native set (item-senator-set) with your Aso-Oke Fila cap (item-fila-cap)!",
          referenced_item_ids: [],
          proposed_outfits: [
            {
              name: "Owambe Royalty",
              occasion: "Owambe / Celebration",
              // AI tried to combine a full Senator set with separate chinos and a polo shirt
              item_ids: [
                "item-senator-set",
                "bot-chinos",
                "top-polo",
                "shoe-loafers-burgundy",
                "item-fila-cap",
              ],
              style_description: "Regal celebration look.",
              explanation: "Emerald Senator set with matching Fila cap and loafers.",
              styling_tip: "Tilt the Fila slightly.",
            },
          ],
          quick_replies: ["Looks great!"],
        };
      },
    };

    const res = await generateStylistChatReply(
      {
        userMessage: "Help me style a standout celebration or Owambe look.",
        history: [],
        sharedItems: [],
        sharedOutfits: [],
        inventory: owambeInventory,
      },
      { provider: fakeProvider },
    );

    expect(res.status).toBe("ok");
    if (res.status === "ok") {
      // Leaked item IDs in parentheses are stripped from reply
      expect(res.data.reply).not.toContain("(item-senator-set)");
      expect(res.data.reply).not.toContain("(item-fila-cap)");
      const outfit = res.data.proposed_outfits![0];
      expect(outfit.item_ids).toEqual([
        "item-senator-set",
        "shoe-loafers-burgundy",
        "item-fila-cap",
      ]);
    }
  });
});

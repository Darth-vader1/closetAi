import { describe, expect, it } from "vitest";
import { generateStylistChatReply, type ChatInventoryItem } from "@/lib/ai/stylist-chat";
import type { AiProvider } from "@/lib/ai/types";

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
});

import { AiProviderError, type AiJsonRequest, type AiProvider } from "@/lib/ai/types";

/**
 * Development-only stand-in. It does NOT look at the image. It returns one of a few fixed samples,
 * picked from a hash of the image bytes so different photos give different (but repeatable) results.
 * The UI labels these results as development samples so nobody mistakes them for real analysis.
 */
const SAMPLES = [
  { name: "Sample navy T-shirt", category: "t-shirts", subcategory: "crew neck", primary_colour: "navy", secondary_colours: [], pattern: "solid", style: "casual", occasions: ["everyday", "school"], seasons: ["all_year"] },
  { name: "Sample white shirt", category: "shirts", subcategory: "button-up", primary_colour: "white", secondary_colours: [], pattern: "solid", style: "smart_casual", occasions: ["work", "formal_event"], seasons: ["all_year"] },
  { name: "Sample stone chinos", category: "trousers", subcategory: "chinos", primary_colour: "beige", secondary_colours: [], pattern: "solid", style: "smart_casual", occasions: ["work", "everyday"], seasons: ["spring", "summer", "autumn"] },
  { name: "Sample blue jeans", category: "jeans", subcategory: "straight", primary_colour: "blue", secondary_colours: [], pattern: "solid", style: "casual", occasions: ["everyday", "travel"], seasons: ["all_year"] },
  { name: "Sample white sneakers", category: "sneakers", subcategory: "low-top", primary_colour: "white", secondary_colours: ["grey"], pattern: "solid", style: "casual", occasions: ["everyday", "sport"], seasons: ["all_year"] },
] as const;

function pick(bytes: Uint8Array): (typeof SAMPLES)[number] {
  let hash = 0;
  for (let i = 0; i < bytes.length; i += Math.max(1, Math.floor(bytes.length / 64))) hash = (hash * 31 + bytes[i]) >>> 0;
  return SAMPLES[hash % SAMPLES.length];
}

export function createMockProvider(): AiProvider {
  return {
    name: "mock",
    isMock: true,
    async generateJson(req: AiJsonRequest): Promise<unknown> {
      if (req.task === "stylist_recommendation") {
        return {
          outfits: [
            {
              name: "Clean Everyday Minimalist",
              occasion: "Casual",
              item_ids: [],
              style_description: "A relaxed, well-balanced look for any day.",
              explanation: "Classic pairing of versatile basics with clean color harmony.",
              styling_tip: "Keep the silhouette neat with a simple tuck or rolled cuffs.",
            },
          ],
          overall_advice: "Great clean pieces for a crisp look.",
        };
      }
      if (req.task !== "clothing_analysis" || !req.image) {
        throw new AiProviderError("The mock provider only supports clothing analysis and stylist recommendations.", false);
      }
      return { ...pick(req.image.bytes), confidence: 0.5, uncertain_fields: ["category", "primary_colour"] };
    },
  };
}

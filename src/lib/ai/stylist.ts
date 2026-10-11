import { STYLIST_JSON_SCHEMA, STYLIST_SYSTEM_PROMPT, stylistResponseSchema, type StylistResponse } from "@/lib/ai/stylist-schemas";
import { AiProviderError, type AiProvider } from "@/lib/ai/types";
import { getAiProvider } from "@/lib/ai/service";
import { logger } from "@/lib/logger";

export interface StylistRequestOptions {
  userPrompt: string;
  occasion?: string | null;
  weather?: string | null;
  stylePreferences?: string[];
  inventory: Array<{
    id: string;
    name: string;
    category: string;
    subcategory?: string | null;
    primaryColour?: string | null;
    secondaryColours?: string[];
    pattern?: string | null;
    material?: string | null;
    style?: string | null;
    occasions?: string[];
    warmthLevel?: number | null;
  }>;
}

export type StylistResult =
  | { status: "ok"; data: StylistResponse; provider: AiProvider["name"]; isMock: boolean }
  | { status: "unavailable"; reason: string }
  | { status: "failed"; message: string };

export async function generateStylistRecommendations(
  input: StylistRequestOptions,
  options: { provider?: AiProvider; signal?: AbortSignal } = {},
): Promise<StylistResult> {
  const provider = options.provider ?? getAiProvider().provider;
  if (!provider) {
    return { status: "unavailable", reason: "AI isn't configured on this deployment." };
  }

  const prompt = [
    `User Request: "${input.userPrompt}"`,
    input.occasion ? `Target Occasion: ${input.occasion}` : null,
    input.weather ? `Weather Context: ${input.weather}` : null,
    input.stylePreferences?.length ? `User's Preferred Styles: ${input.stylePreferences.join(", ")}` : null,
    "",
    "Available Clean Wardrobe Inventory:",
    JSON.stringify(input.inventory, null, 2),
    "",
    "Recommend 1 to 3 outfits using strictly the item IDs provided above.",
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const raw = await provider.generateJson({
      task: "stylist_recommendation",
      kind: "text",
      system: STYLIST_SYSTEM_PROMPT,
      prompt,
      jsonSchema: STYLIST_JSON_SCHEMA,
      signal: options.signal,
    });

    console.log(`\n👗 [AI STYLIST RAW OUTPUT (${provider.name})]`);
    console.dir(raw, { depth: null, colors: true });

    const parsed = stylistResponseSchema.safeParse(raw);
    if (parsed.success) {
      // Validate that all referenced item_ids genuinely exist in the provided inventory
      const validIds = new Set(input.inventory.map((i) => i.id));
      const filteredOutfits = parsed.data.outfits
        .map((outfit) => ({
          ...outfit,
          item_ids: outfit.item_ids.filter((id) => validIds.has(id)),
        }))
        .filter((outfit) => outfit.item_ids.length > 0);

      if (filteredOutfits.length === 0) {
        return { status: "failed", message: "The stylist couldn't find a matching outfit combination from your current clothes." };
      }

      return {
        status: "ok",
        data: { outfits: filteredOutfits, overall_advice: parsed.data.overall_advice },
        provider: provider.name,
        isMock: provider.isMock,
      };
    }

    console.warn("⚠️ [STYLIST SCHEMA ISSUES]:", parsed.error.issues);
    return { status: "failed", message: "The stylist returned suggestions we couldn't format properly." };
  } catch (err) {
    if (err instanceof AiProviderError) {
      return { status: "failed", message: err.message };
    }
    logger.error("ai.stylist_unexpected_error", { err });
    return { status: "failed", message: err instanceof Error ? err.message : "The stylist encountered an unexpected error." };
  }
}

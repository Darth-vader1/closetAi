import { createGeminiProvider } from "@/lib/ai/gemini";
import { createMockProvider } from "@/lib/ai/mock";
import { CLOTHING_SYSTEM_PROMPT, clothingAnalysisJsonSchema, clothingAnalysisSchema, type ClothingSuggestion } from "@/lib/ai/schemas";
import { AiProviderError, type AiImage, type AiProvider } from "@/lib/ai/types";
import { resolveAiConfig } from "@/lib/env";
import { logger } from "@/lib/logger";

export type AiAvailability = { available: true; provider: AiProvider } | { available: false; reason: string };

/** Build the configured provider, or explain why AI is unavailable. Never throws. */
export function getAiProvider(source?: Record<string, string | undefined>): AiAvailability {
  const resolved = resolveAiConfig(source);
  if (!resolved.ok) return { available: false, reason: resolved.reason };
  const { config } = resolved;
  if (config.provider === "mock") return { available: true, provider: createMockProvider() };
  return { available: true, provider: createGeminiProvider(config) };
}

export type AnalyseResult =
  | { status: "ok"; suggestion: ClothingSuggestion; provider: AiProvider["name"]; isMock: boolean }
  | { status: "unavailable"; reason: string }
  | { status: "failed"; message: string };

/**
 * Ask the model to describe one garment photo. The output is untrusted: it is validated against a
 * strict schema, and if validation fails we retry once before giving up. Nothing here writes to the
 * database; the caller shows the suggestion in a review form for the user to confirm or correct.
 */
export async function analyseClothingImage(
  image: AiImage,
  options: { provider?: AiProvider; signal?: AbortSignal } = {},
): Promise<AnalyseResult> {
  let provider = options.provider;
  if (!provider) {
    const availability = getAiProvider();
    if (!availability.available) return { status: "unavailable", reason: availability.reason };
    provider = availability.provider;
  }

  const MAX_ATTEMPTS = 1;
  let lastMessage = "The AI service couldn't analyse this photo.";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const raw = await provider.generateJson({
        task: "clothing_analysis",
        kind: "vision",
        system: CLOTHING_SYSTEM_PROMPT,
        prompt: "Catalogue the item in this photo.",
        image,
        jsonSchema: clothingAnalysisJsonSchema,
        signal: options.signal,
      });
      const parsed = clothingAnalysisSchema.safeParse(raw);
      if (parsed.success) {
        return { status: "ok", suggestion: parsed.data, provider: provider.name, isMock: provider.isMock };
      }
      logger.warn("ai.analysis_invalid_output", { provider: provider.name, attempt, issues: parsed.error.issues.length });
      lastMessage = "The AI returned details we couldn't use.";
    } catch (err) {
      if (err instanceof AiProviderError) {
        logger.warn("ai.provider_error", { provider: provider.name, attempt, retryable: err.retryable, errorMessage: err.message });
        lastMessage = err.message;
        if (!err.retryable) break;
      } else {
        logger.error("ai.unexpected_error", { provider: provider.name, attempt, err });
        lastMessage = err instanceof Error ? err.message : "The AI service encountered an unexpected error.";
        break;
      }
    }
    if (options.signal?.aborted) break;
  }

  return { status: "failed", message: `${lastMessage} You can enter the details yourself.` };
}

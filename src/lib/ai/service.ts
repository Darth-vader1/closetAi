import { createGeminiProvider } from "@/lib/ai/gemini";
import { createGroqProvider } from "@/lib/ai/groq";
import { createMistralProvider } from "@/lib/ai/mistral";
import { createMockProvider } from "@/lib/ai/mock";
import { CLOTHING_SYSTEM_PROMPT, clothingAnalysisJsonSchema, clothingAnalysisSchema, type ClothingSuggestion } from "@/lib/ai/schemas";
import { AiProviderError, type AiImage, type AiProvider } from "@/lib/ai/types";
import { resolveAiConfig } from "@/lib/env";
import { logger } from "@/lib/logger";

export type AiAvailability = { available: true; provider: AiProvider } | { available: false; reason: string };

/**
 * Wrap multiple providers in a fallback chain: tries each provider in order and only throws if all fail.
 */
export function createMultiProvider(providers: AiProvider[]): AiProvider {
  if (providers.length === 1) return providers[0];
  let lastUsedName = providers[0].name;

  return {
    get name() {
      return lastUsedName;
    },
    isMock: providers.every((p) => p.isMock),
    async generateJson(req) {
      let lastError: unknown = null;
      for (let i = 0; i < providers.length; i++) {
        const current = providers[i];
        try {
          const result = await current.generateJson(req);
          lastUsedName = current.name;
          return result;
        } catch (err) {
          lastError = err;
          if (i < providers.length - 1 && !req.signal?.aborted) {
            const next = providers[i + 1];
            logger.warn("ai.provider_fallback", {
              failedProvider: current.name,
              nextProvider: next.name,
              errorMessage: err instanceof Error ? err.message : String(err),
            });
            continue;
          }
        }
      }
      throw lastError instanceof Error
        ? lastError
        : new AiProviderError("All configured AI providers failed.", false);
    },
  };
}

function buildProviderFromConfig(config: Extract<ReturnType<typeof resolveAiConfig>, { ok: true }>["config"]): AiProvider {
  if (config.provider === "mock") return createMockProvider();
  if (config.provider === "groq") return createGroqProvider(config);
  if (config.provider === "mistral") return createMistralProvider(config);
  return createGeminiProvider(config);
}

/** Build the configured provider (plus any backup providers with keys present), or explain why AI is unavailable. Never throws. */
export function getAiProvider(source: Record<string, string | undefined> = process.env): AiAvailability {
  const resolved = resolveAiConfig(source);
  if (!resolved.ok) return { available: false, reason: resolved.reason };
  const { config } = resolved;
  if (config.provider === "mock") return { available: true, provider: createMockProvider() };

  const primary = buildProviderFromConfig(config);
  const chain: AiProvider[] = [primary];
  const seen = new Set<string>([config.provider]);

  // Determine candidate fallback order: explicit comma-separated AI_PROVIDER list first, then groq -> mistral -> gemini
  const explicitOrder = (source.AI_PROVIDER ?? "")
    .toLowerCase()
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const candidateOrder = [...new Set([...explicitOrder, "groq", "mistral", "gemini"])];

  for (const candidate of candidateOrder) {
    if (seen.has(candidate)) continue;

    if (candidate === "groq") {
      const groqKey = (source.GROQ_API_KEY || (source.AI_API_KEY?.startsWith("gsk_") ? source.AI_API_KEY : "") || "").trim();
      if (groqKey) {
        const keys = groqKey.split(",").map((k) => k.trim()).filter(Boolean);
        chain.push(
          createGroqProvider({
            apiKey: keys[0],
            apiKeys: keys,
            visionModel: "qwen/qwen3.8-27b",
            textModel: "openai/gpt-oss-120b",
          }),
        );
        seen.add("groq");
      }
    } else if (candidate === "mistral") {
      const mistralKey = (
        source.MISTRAL_API_KEY ||
        (source.AI_API_KEY?.startsWith("mstrl_") ? source.AI_API_KEY : "") ||
        ""
      ).trim();
      if (mistralKey) {
        const keys = mistralKey.split(",").map((k) => k.trim()).filter(Boolean);
        chain.push(
          createMistralProvider({
            apiKey: keys[0],
            apiKeys: keys,
            visionModel: "pixtral-12b-2409",
            textModel: "mistral-small-latest",
          }),
        );
        seen.add("mistral");
      }
    } else if (candidate === "gemini") {
      const geminiKey = (
        source.GEMINI_API_KEY ||
        (source.AI_API_KEY && !source.AI_API_KEY.startsWith("gsk_") && !source.AI_API_KEY.startsWith("mstrl_")
          ? source.AI_API_KEY
          : "") ||
        ""
      ).trim();
      if (geminiKey) {
        const keys = geminiKey.split(",").map((k) => k.trim()).filter(Boolean);
        chain.push(
          createGeminiProvider({
            apiKey: keys[0],
            apiKeys: keys,
            visionModel: "gemini-2.5-flash",
            textModel: "gemini-2.5-flash",
          }),
        );
        seen.add("gemini");
      }
    }
  }

  return { available: true, provider: createMultiProvider(chain) };
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

  const MAX_ATTEMPTS = 2;
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
        lastMessage = "The AI service encountered an unexpected error.";
        break;
      }
    }
    if (options.signal?.aborted) break;
  }

  return { status: "failed", message: `${lastMessage} You can enter the details yourself.` };
}

export {
  generateStylistRecommendations,
  type StylistRequestOptions,
  type StylistResult,
} from "@/lib/ai/stylist";

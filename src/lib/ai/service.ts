import { createGeminiProvider } from "@/lib/ai/gemini";
import { createGroqProvider } from "@/lib/ai/groq";
import { createMistralProvider } from "@/lib/ai/mistral";
import { createMockProvider } from "@/lib/ai/mock";
import {
  CLOTHING_SYSTEM_PROMPT,
  clothingAnalysisJsonSchema,
  clothingAnalysisSchema,
  type ClothingSuggestion,
  MULTI_CLOTHING_SYSTEM_PROMPT,
  multiClothingAnalysisJsonSchema,
  multiClothingAnalysisSchema,
  type DetectedClothingItem,
} from "@/lib/ai/schemas";
import { AiProviderError, type AiImage, type AiProvider } from "@/lib/ai/types";
import { resolveAiConfig } from "@/lib/env";
import { logger } from "@/lib/logger";
import { readImageDimensions, type ImageDimensions } from "@/lib/security/image-sniff";

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
            visionModel: "gemini-flash-latest",
            textModel: "gemini-flash-latest",
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

export type MultiAnalyseResult =
  | {
      status: "ok";
      photoType: "ootd" | "screenshot" | "flatlay";
      outfitTitle: string | null;
      items: DetectedClothingItem[];
      provider: string;
      isMock: boolean;
    }
  | { status: "unavailable"; reason: string }
  | { status: "failed"; message: string };

/**
 * Normalizes vision-model `box_2d` coordinates (`[ymin, xmin, ymax, xmax]`) into the `0..1000`
 * relative coordinate space expected by the client cropper & bounding-box overlay.
 *
 * Handles three common VLM quirks (especially Qwen-VL on non-square portrait photos like 564x1024
 * where height ≈ 1000 tricks the model into outputting raw pixel coordinates):
 * 1. Float `[0..1]` coordinates -> multiplied by 1000.
 * 2. Explicit pixel coordinates (`> 1002`) -> divided by `(height, width) * 1000`.
 * 3. Sub-1000 portrait/landscape pixel coordinates -> detected when all boxes fit inside `dims`
 *    and appear shifted into the left/top margin in `0..1000` space while centering naturally in pixel space.
 */
export function normalizeRawDetectionCoordinates(
  raw: unknown,
  dims: ImageDimensions | null,
): unknown {
  if (!raw || (typeof raw !== "object" && !Array.isArray(raw))) return raw;

  let itemsKey: string | null = null;
  let rawItems: unknown[] | null = null;

  if (Array.isArray(raw)) {
    rawItems = raw;
  } else {
    const obj = raw as Record<string, unknown>;
    for (const key of ["items", "garments", "clothing", "products", "clothes"]) {
      if (Array.isArray(obj[key])) {
        itemsKey = key;
        rawItems = obj[key] as unknown[];
        break;
      }
    }
  }

  if (!rawItems || rawItems.length === 0) return raw;

  type ParsedBox = { index: number; coords: [number, number, number, number] };
  const validBoxes: ParsedBox[] = [];

  rawItems.forEach((entry, index) => {
    if (!entry || typeof entry !== "object") return;
    const box = (entry as Record<string, unknown>).box_2d;
    if (!Array.isArray(box) || box.length < 4) return;
    const nums = [Number(box[0]), Number(box[1]), Number(box[2]), Number(box[3])] as [
      number,
      number,
      number,
      number,
    ];
    if (nums.every((n) => Number.isFinite(n))) {
      validBoxes.push({ index, coords: nums });
    }
  });

  if (validBoxes.length === 0) return raw;

  const allCoords = validBoxes.flatMap((b) => b.coords);
  const maxCoord = Math.max(...allCoords);

  let scaleY = 1;
  let scaleX = 1;

  if (maxCoord > 0 && maxCoord <= 1.0) {
    scaleY = 1000;
    scaleX = 1000;
  } else if (dims && dims.width > 0 && dims.height > 0) {
    if (maxCoord > 1002) {
      scaleY = 1000 / dims.height;
      scaleX = 1000 / dims.width;
    } else {
      const obj = !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
      const rawPhotoType = typeof obj?.photo_type === "string" ? obj.photo_type.toLowerCase().trim() : "";
      const isOotd =
        rawPhotoType === "ootd" ||
        rawPhotoType === "worn" ||
        rawPhotoType === "selfie" ||
        rawItems.some(
          (entry) =>
            Boolean(entry && typeof entry === "object" && (entry as Record<string, unknown>).worn_on_body === true),
        );

      const minY = Math.min(...validBoxes.map((b) => Math.min(b.coords[0], b.coords[2])));
      const maxY = Math.max(...validBoxes.map((b) => Math.max(b.coords[0], b.coords[2])));
      const minX = Math.min(...validBoxes.map((b) => Math.min(b.coords[1], b.coords[3])));
      const maxX = Math.max(...validBoxes.map((b) => Math.max(b.coords[1], b.coords[3])));

      const fitsWithinPixelBounds = maxY <= dims.height + 16 && maxX <= dims.width + 16;

      // Portrait pixel-coordinate trap (e.g. 564x1024 mirror selfie where pixel x ≈ 215..385 looks like 22%..38% instead of 38%..68%)
      if (fitsWithinPixelBounds && dims.width < dims.height * 0.82 && dims.width < 900) {
        const midX = (minX + maxX) / 2;
        const pixelCenterRatioX = midX / dims.width;
        const looksShiftedLeftInNormalizedSpace =
          midX < 395 &&
          maxX <= dims.width * 0.92 &&
          (isOotd || (validBoxes.length >= 2 && minX >= dims.width * 0.16));
        if (looksShiftedLeftInNormalizedSpace && pixelCenterRatioX >= 0.34 && pixelCenterRatioX <= 0.74) {
          scaleY = 1000 / dims.height;
          scaleX = 1000 / dims.width;
        }
      } else if (fitsWithinPixelBounds && dims.height < dims.width * 0.82 && dims.height < 900) {
        // Symmetric landscape pixel-coordinate trap (e.g. 1024x576)
        const midY = (minY + maxY) / 2;
        const pixelCenterRatioY = midY / dims.height;
        const looksShiftedUpInNormalizedSpace =
          midY < 395 &&
          maxY <= dims.height * 0.92 &&
          (isOotd || (validBoxes.length >= 2 && minY >= dims.height * 0.16));
        if (looksShiftedUpInNormalizedSpace && pixelCenterRatioY >= 0.34 && pixelCenterRatioY <= 0.74) {
          scaleY = 1000 / dims.height;
          scaleX = 1000 / dims.width;
        }
      }
    }
  }

  const boxByIndex = new Map(validBoxes.map((b) => [b.index, b.coords]));
  const normalizedItems = rawItems.map((entry, index) => {
    const coords = boxByIndex.get(index);
    if (!coords || !entry || typeof entry !== "object") return entry;
    const rawY1 = coords[0] * scaleY;
    const rawX1 = coords[1] * scaleX;
    const rawY2 = coords[2] * scaleY;
    const rawX2 = coords[3] * scaleX;
    const ymin = Math.max(0, Math.min(1000, Math.round(Math.min(rawY1, rawY2))));
    const xmin = Math.max(0, Math.min(1000, Math.round(Math.min(rawX1, rawX2))));
    const ymax = Math.max(0, Math.min(1000, Math.round(Math.max(rawY1, rawY2))));
    const xmax = Math.max(0, Math.min(1000, Math.round(Math.max(rawX1, rawX2))));
    return {
      ...(entry as Record<string, unknown>),
      box_2d: [ymin, xmin, ymax, xmax],
    };
  });

  if (Array.isArray(raw)) return normalizedItems;
  return {
    ...(raw as Record<string, unknown>),
    [itemsKey!]: normalizedItems,
  };
}

export async function analyseMultiClothingImage(
  image: AiImage,
  options: { provider?: AiProvider; signal?: AbortSignal; dimensions?: ImageDimensions | null } = {},
): Promise<MultiAnalyseResult> {
  let provider = options.provider;
  if (!provider) {
    const availability = getAiProvider();
    if (!availability.available) return { status: "unavailable", reason: availability.reason };
    provider = availability.provider;
  }

  const dims = options.dimensions === undefined ? readImageDimensions(image.bytes) : options.dimensions;
  const dimensionHint =
    dims && dims.width > 0 && dims.height > 0
      ? ` Image resolution is ${dims.width}x${dims.height}px — normalize EVERY box_2d [ymin, xmin, ymax, xmax] strictly to 0..1000 across the full ${dims.width}px width and ${dims.height}px height (divide pixel y by ${dims.height} * 1000 and pixel x by ${dims.width} * 1000; horizontal center x=${Math.round(dims.width / 2)}px MUST be 500, NOT ${Math.round(dims.width / 2)}).`
      : " Normalize EVERY box_2d [ymin, xmin, ymax, xmax] strictly to 0..1000 across the full image width and height (horizontal center is x=500).";

  const MAX_ATTEMPTS = 2;
  let lastMessage = "The AI service couldn't detect garments in this photo.";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const raw = await provider.generateJson({
        task: "multi_clothing_analysis",
        kind: "vision",
        system: MULTI_CLOTHING_SYSTEM_PROMPT,
        prompt:
          "Detect whether this is a worn OOTD/mirror selfie ('ootd'), flatlay ('flatlay'), or order screenshot ('screenshot'). Focus strictly on the primary foreground person (ignore background bystanders). Identify each distinct garment, neckwear/scarf, footwear pair (clogs vs slides vs sneakers), belt, tie, and accessory — AND perform a dedicated micro-scan of the neck and center chest (especially between open scarf ends, collars, or layered over a t-shirt/top) so pendant/cross necklaces, chains, watches, bracelets, and eyewear are NEVER missed! Return worn_on_body, a rich standalone visual_description of each item's exact colors/trims/fabric/pendant/silhouette (excluding overlapping pieces), and cataloguing attributes." +
          dimensionHint,
        image,
        jsonSchema: multiClothingAnalysisJsonSchema,
        signal: options.signal,
      });

      const normalizedRaw = normalizeRawDetectionCoordinates(raw, dims);
      const parsed = multiClothingAnalysisSchema.safeParse(normalizedRaw);
      if (parsed.success) {
        return {
          status: "ok",
          photoType: parsed.data.photoType,
          outfitTitle: parsed.data.outfitTitle,
          items: parsed.data.items,
          provider: provider.name,
          isMock: provider.isMock,
        };
      }

      logger.warn("ai.multi_analysis_invalid_output", {
        provider: provider.name,
        attempt,
        issues: parsed.error.issues.length,
      });
      lastMessage = "The AI returned detection data we couldn't parse.";
    } catch (err) {
      if (err instanceof AiProviderError) {
        logger.warn("ai.provider_error", {
          provider: provider.name,
          attempt,
          retryable: err.retryable,
          errorMessage: err.message,
        });
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

  return { status: "failed", message: `${lastMessage} You can still enter details manually.` };
}

export {
  generateStylistRecommendations,
  type StylistRequestOptions,
  type StylistResult,
} from "@/lib/ai/stylist";

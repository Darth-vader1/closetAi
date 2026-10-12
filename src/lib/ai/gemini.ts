import { GoogleGenAI } from "@google/genai";
import { AiProviderError, type AiJsonRequest, type AiProvider } from "@/lib/ai/types";

export interface GeminiOptions {
  apiKey: string;
  apiKeys?: string[];
  visionModel: string;
  textModel: string;
  /** Per-request timeout in ms. */
  timeoutMs?: number;
}

/** The slice of the SDK we use, so tests can supply a fake without network access. */
export interface GeminiLikeClient {
  models: {
    generateContent(params: {
      model: string;
      contents: unknown;
      config?: Record<string, unknown>;
    }): Promise<{ text?: string }>;
  };
}

export function createGeminiProvider(options: GeminiOptions, client?: GeminiLikeClient): AiProvider {
  const keys = options.apiKeys && options.apiKeys.length > 0 ? options.apiKeys : [options.apiKey];
  let activeKeyIndex = 0;
  const clientCache = new Map<string, GeminiLikeClient>();

  const getClientForKey = (key: string): GeminiLikeClient => {
    if (client) return client;
    let cached = clientCache.get(key);
    if (!cached) {
      cached = new GoogleGenAI({ apiKey: key }) as unknown as GeminiLikeClient;
      clientCache.set(key, cached);
    }
    return cached;
  };

  const timeout = options.timeoutMs ?? 18_000;

  return {
    name: "gemini",
    isMock: false,
    async generateJson(req: AiJsonRequest): Promise<unknown> {
      const parts: Array<Record<string, unknown>> = [];
      if (req.image) {
        parts.push({ inlineData: { mimeType: req.image.mimeType, data: Buffer.from(req.image.bytes).toString("base64") } });
      }
      parts.push({ text: req.prompt });

      const timeoutSignal = AbortSignal.timeout(timeout);
      const signal = req.signal ? AbortSignal.any([req.signal, timeoutSignal]) : timeoutSignal;

      const primaryModel = req.kind === "vision" ? options.visionModel : options.textModel;
      let response: { text?: string } | undefined;

      const maxKeyAttempts = Math.min(keys.length, 2);
      for (let attempt = 0; attempt < maxKeyAttempts; attempt++) {
        const currentKey = keys[activeKeyIndex];
        const ai = getClientForKey(currentKey);

        try {
          response = await ai.models.generateContent({
            model: primaryModel,
            contents: [{ role: "user", parts }],
            config: {
              systemInstruction: req.system,
              responseMimeType: "application/json",
              responseJsonSchema: req.jsonSchema,
              temperature: 0.2,
              abortSignal: signal,
            },
          });
          break; // Success!
        } catch (err) {
          console.error(`Gemini API error with model [${primaryModel}] (key #${activeKeyIndex + 1}/${keys.length}):`, err);
          const errorText = extractErrorMessage(err).toLowerCase();
          const isModelIssue = errorText.includes("404") || errorText.includes("not found") || errorText.includes("no longer available");
          const isRateLimit = errorText.includes("429") || errorText.includes("quota") || errorText.includes("rate limit");

          // If rate limited and we have other keys in the pool, instantly switch keys!
          if (isRateLimit && keys.length > 1 && attempt < maxKeyAttempts - 1 && !signal.aborted) {
            activeKeyIndex = (activeKeyIndex + 1) % keys.length;
            console.warn(`Rotating to API key #${activeKeyIndex + 1}/${keys.length} due to rate limit...`);
            continue;
          }

          if (isRateLimit && !signal.aborted) {
            console.warn("Gemini rate limit encountered on all keys. Waiting 3.5s before final retry...");
            await new Promise((res) => setTimeout(res, 3500));
            if (!signal.aborted) {
              try {
                response = await ai.models.generateContent({
                  model: primaryModel,
                  contents: [{ role: "user", parts }],
                  config: {
                    systemInstruction: req.system,
                    responseMimeType: "application/json",
                    responseJsonSchema: req.jsonSchema,
                    temperature: 0.2,
                    abortSignal: signal,
                  },
                });
                break;
              } catch (retryErr) {
                console.error("Gemini retry after rate limit failed:", retryErr);
                throw toProviderError(retryErr, signal);
              }
            } else {
              throw toProviderError(err, signal);
            }
          } else if (isModelIssue && primaryModel !== "gemini-flash-latest" && !signal.aborted) {
            console.warn(`Attempting fallback to 'gemini-flash-latest' because [${primaryModel}] was rejected...`);
            try {
              response = await ai.models.generateContent({
                model: "gemini-flash-latest",
                contents: [{ role: "user", parts }],
                config: {
                  systemInstruction: req.system,
                  responseMimeType: "application/json",
                  responseJsonSchema: req.jsonSchema,
                  temperature: 0.2,
                  abortSignal: signal,
                },
              });
              break;
            } catch (fallbackErr) {
              console.error("Gemini fallback also failed:", fallbackErr);
              throw toProviderError(fallbackErr, signal);
            }
          } else {
            throw toProviderError(err, signal);
          }
        }
      }

      if (!response) throw new AiProviderError("The AI service could not complete the request.", false);

      const text = response.text;
      if (!text) throw new AiProviderError("The model returned an empty response.", true);
      try {
        return JSON.parse(text);
      } catch {
        throw new AiProviderError("The model returned text that was not valid JSON.", true);
      }
    },
  };
}

function extractErrorMessage(err: unknown): string {
  if (!err) return "";
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "object") {
    const record = err as Record<string, unknown>;
    if (typeof record.message === "string" && record.message) return record.message;
    if (record.error && typeof record.error === "object") {
      const inner = record.error as Record<string, unknown>;
      if (typeof inner.message === "string" && inner.message) return inner.message;
    }
  }
  return String(err);
}

function toProviderError(err: unknown, signal: AbortSignal): AiProviderError {
  if (signal.aborted) return new AiProviderError("The AI request timed out or was cancelled.", false);
  const msg = extractErrorMessage(err);
  const status =
    typeof err === "object" && err !== null && "status" in err
      ? Number((err as { status: unknown }).status)
      : typeof err === "object" && err !== null && "httpMeta" in err
        ? Number((err as { httpMeta?: { status?: unknown } }).httpMeta?.status)
        : NaN;

  const lower = msg.toLowerCase();
  if (lower.includes("prepay") || lower.includes("credit") || lower.includes("depleted")) {
    return new AiProviderError("Google AI Studio prepay credits are depleted. Please redeem credits or use an unbilled free project key.", false);
  }
  if (status === 429 || lower.includes("429") || lower.includes("quota") || lower.includes("rate limit")) {
    return new AiProviderError("The AI service is busy or over quota. Try again in a moment.", false);
  }
  if (
    status === 400 ||
    status === 401 ||
    status === 403 ||
    status === 404 ||
    lower.includes("404") ||
    lower.includes("400") ||
    lower.includes("not found") ||
    lower.includes("no longer available") ||
    lower.includes("api_key_invalid") ||
    lower.includes("api key not valid")
  ) {
    return new AiProviderError("The AI service rejected the request due to a configuration or authentication error.", false);
  }
  return new AiProviderError("The AI service had a temporary problem.", true);
}

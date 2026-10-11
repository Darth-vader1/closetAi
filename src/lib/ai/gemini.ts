import { GoogleGenAI } from "@google/genai";
import { AiProviderError, type AiJsonRequest, type AiProvider } from "@/lib/ai/types";

export interface GeminiOptions {
  apiKey: string;
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
  const ai: GeminiLikeClient = client ?? (new GoogleGenAI({ apiKey: options.apiKey }) as unknown as GeminiLikeClient);
  const timeout = options.timeoutMs ?? 45_000;

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
      let response: { text?: string };
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
      } catch (err) {
        console.error(`Gemini API error with model [${primaryModel}]:`, err);
        const errorText = extractErrorMessage(err).toLowerCase();
        const isModelIssue = errorText.includes("404") || errorText.includes("not found") || errorText.includes("no longer available");
        const isRateLimit = errorText.includes("429") || errorText.includes("quota") || errorText.includes("rate limit");

        if (isRateLimit && !signal.aborted) {
          console.warn("Gemini rate limit encountered. Waiting 3.5s before retrying...");
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
          } catch (fallbackErr) {
            console.error("Gemini fallback also failed:", fallbackErr);
            throw toProviderError(fallbackErr, signal);
          }
        } else {
          throw toProviderError(err, signal);
        }
      }

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
    return new AiProviderError(`AI configuration error: ${msg.slice(0, 150)}`, false);
  }
  return new AiProviderError(msg.length > 0 ? msg.slice(0, 150) : "The AI service had a temporary problem.", true);
}

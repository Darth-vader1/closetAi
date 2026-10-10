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
  const timeout = options.timeoutMs ?? 30_000;

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

      let response: { text?: string };
      try {
        response = await ai.models.generateContent({
          model: req.kind === "vision" ? options.visionModel : options.textModel,
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
        throw toProviderError(err, signal);
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

function toProviderError(err: unknown, signal: AbortSignal): AiProviderError {
  if (signal.aborted) return new AiProviderError("The AI request timed out or was cancelled.", false);
  const status = typeof err === "object" && err !== null && "status" in err ? Number((err as { status: unknown }).status) : NaN;
  if (status === 429) return new AiProviderError("The AI service is busy or over quota. Try again in a moment.", false);
  if (status === 400 || status === 401 || status === 403 || status === 404) {
    // Bad key, unknown model, or request rejected: not worth retrying, and the raw message may be verbose.
    return new AiProviderError("The AI service rejected the request. Check the API key and model settings.", false);
  }
  return new AiProviderError("The AI service had a temporary problem.", true);
}

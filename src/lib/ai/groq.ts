import { AiProviderError, type AiJsonRequest, type AiProvider } from "@/lib/ai/types";

export interface GroqOptions {
  apiKey: string;
  apiKeys?: string[];
  visionModel?: string;
  textModel?: string;
  timeoutMs?: number;
}

export const DEFAULT_GROQ_VISION_MODEL = "qwen/qwen3.8-27b";
export const DEFAULT_GROQ_TEXT_MODEL = "openai/gpt-oss-120b";
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

export function createGroqProvider(options: GroqOptions): AiProvider {
  const keys = options.apiKeys && options.apiKeys.length > 0 ? options.apiKeys : [options.apiKey];
  let activeKeyIndex = 0;
  const timeout = options.timeoutMs ?? 25_000;
  const visionModel = options.visionModel || DEFAULT_GROQ_VISION_MODEL;
  const textModel = options.textModel || DEFAULT_GROQ_TEXT_MODEL;

  return {
    name: "groq",
    isMock: false,
    async generateJson(req: AiJsonRequest): Promise<unknown> {
      const model = req.kind === "vision" ? visionModel : textModel;
      const timeoutSignal = AbortSignal.timeout(timeout);
      const signal = req.signal ? AbortSignal.any([req.signal, timeoutSignal]) : timeoutSignal;

      const promptWithSchema = `${req.prompt}\nRespond strictly with valid JSON conforming to this schema:\n${JSON.stringify(req.jsonSchema)}`;

      const userContent: string | Array<Record<string, unknown>> = req.image
        ? [
            {
              type: "text",
              text: promptWithSchema,
            },
            {
              type: "image_url",
              image_url: {
                url: `data:${req.image.mimeType};base64,${Buffer.from(req.image.bytes).toString("base64")}`,
              },
            },
          ]
        : promptWithSchema;

      const body = {
        model,
        messages: [
          { role: "system", content: req.system },
          { role: "user", content: userContent },
        ],
        response_format: { type: "json_object" },
        temperature: 0.2,
      };

      const maxAttempts = Math.min(keys.length, 3);
      let lastError: unknown = null;

      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const currentKey = keys[activeKeyIndex];

        try {
          const res = await fetch(GROQ_API_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${currentKey}`,
            },
            body: JSON.stringify(body),
            signal,
          });

          if (!res.ok) {
            if (res.status === 429) {
              if (keys.length > 1 && attempt < maxAttempts - 1 && !signal.aborted) {
                activeKeyIndex = (activeKeyIndex + 1) % keys.length;
                continue;
              }
              throw new AiProviderError("Groq AI service is busy or rate-limited. Please try again in a moment.", false);
            }

            if (res.status === 401 || res.status === 403) {
              throw new AiProviderError("Groq authentication failed. Please check your GROQ_API_KEY.", false);
            }

            if (res.status === 400 || res.status === 404) {
              throw new AiProviderError("Groq rejected the request due to a model or configuration error.", false);
            }

            throw new AiProviderError("Groq service encountered a temporary error.", true);
          }

          const data = (await res.json()) as {
            choices?: Array<{ message?: { content?: string } }>;
          };

          const rawContent = data.choices?.[0]?.message?.content;
          if (!rawContent) {
            throw new AiProviderError("Groq returned an empty response.", true);
          }

          try {
            return JSON.parse(rawContent);
          } catch {
            throw new AiProviderError("Groq returned text that was not valid JSON.", true);
          }
        } catch (err) {
          lastError = err;
          if (signal.aborted) {
            throw new AiProviderError("The AI request timed out or was cancelled.", false);
          }
          if (err instanceof AiProviderError && !err.retryable) {
            throw err;
          }
          if (keys.length > 1 && attempt < maxAttempts - 1) {
            activeKeyIndex = (activeKeyIndex + 1) % keys.length;
            continue;
          }
        }
      }

      if (lastError instanceof AiProviderError) throw lastError;
      throw new AiProviderError("Groq request failed. Please check your connection and API key.", false);
    },
  };
}

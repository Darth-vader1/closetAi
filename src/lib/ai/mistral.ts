import { AiProviderError, type AiJsonRequest, type AiProvider } from "@/lib/ai/types";

export interface MistralOptions {
  apiKey: string;
  apiKeys?: string[];
  visionModel?: string;
  textModel?: string;
  timeoutMs?: number;
}

const DEFAULT_VISION_MODEL = "pixtral-12b-2409";
const DEFAULT_TEXT_MODEL = "mistral-small-latest";
const MISTRAL_API_URL = "https://api.mistral.ai/v1/chat/completions";

export function createMistralProvider(options: MistralOptions): AiProvider {
  const keys = options.apiKeys && options.apiKeys.length > 0 ? options.apiKeys : [options.apiKey];
  let activeKeyIndex = 0;
  const timeout = options.timeoutMs ?? 25_000;
  const visionModel = options.visionModel || DEFAULT_VISION_MODEL;
  const textModel = options.textModel || DEFAULT_TEXT_MODEL;

  return {
    name: "mistral",
    isMock: false,
    async generateJson(req: AiJsonRequest): Promise<unknown> {
      const model = req.kind === "vision" ? visionModel : textModel;
      const timeoutSignal = AbortSignal.timeout(timeout);
      const signal = req.signal ? AbortSignal.any([req.signal, timeoutSignal]) : timeoutSignal;

      const userContent: Array<Record<string, unknown>> = [
        {
          type: "text",
          text: `${req.prompt}\nRespond strictly with valid JSON conforming to this schema:\n${JSON.stringify(req.jsonSchema)}`,
        },
      ];

      if (req.image) {
        const base64Data = Buffer.from(req.image.bytes).toString("base64");
        userContent.push({
          type: "image_url",
          image_url: `data:${req.image.mimeType};base64,${base64Data}`,
        });
      }

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
          const res = await fetch(MISTRAL_API_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${currentKey}`,
            },
            body: JSON.stringify(body),
            signal,
          });

          if (!res.ok) {
            const errText = await res.text().catch(() => "");
            let jsonErr: Record<string, unknown> | null = null;
            try {
              jsonErr = JSON.parse(errText);
            } catch {
              /* ignore */
            }

            const errorMsg =
              (typeof jsonErr?.message === "string" ? jsonErr.message : null) ??
              (typeof (jsonErr?.error as Record<string, unknown>)?.message === "string"
                ? String((jsonErr!.error as Record<string, unknown>).message)
                : null) ??
              errText ??
              `HTTP ${res.status}`;

            console.error(`Mistral API error (${res.status}) [key #${activeKeyIndex + 1}]:`, errorMsg);

            // Handle rate limits and key rotation
            if (res.status === 429) {
              if (keys.length > 1 && attempt < maxAttempts - 1 && !signal.aborted) {
                activeKeyIndex = (activeKeyIndex + 1) % keys.length;
                console.warn(`Mistral 429 rate limit. Rotating to key #${activeKeyIndex + 1}/${keys.length}...`);
                continue;
              }
              throw new AiProviderError("Mistral AI service is busy or rate-limited. Please try again in a moment.", false);
            }

            if (res.status === 401 || res.status === 403) {
              throw new AiProviderError(`Mistral authentication failed: ${errorMsg.slice(0, 120)}`, false);
            }

            if (res.status === 400 || res.status === 404) {
              throw new AiProviderError(`Mistral request error: ${errorMsg.slice(0, 120)}`, false);
            }

            throw new AiProviderError(`Mistral service error: ${errorMsg.slice(0, 120)}`, true);
          }

          const data = (await res.json()) as {
            choices?: Array<{ message?: { content?: string } }>;
          };

          const rawContent = data.choices?.[0]?.message?.content;
          if (!rawContent) {
            throw new AiProviderError("Mistral returned an empty response.", true);
          }

          try {
            return JSON.parse(rawContent);
          } catch {
            throw new AiProviderError("Mistral returned text that was not valid JSON.", true);
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
      throw new AiProviderError(
        lastError instanceof Error ? lastError.message : "Mistral request failed. Please check your connection and API key.",
        false,
      );
    },
  };
}

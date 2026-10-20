/**
 * Provider-independent AI contract. Providers only move JSON in and out of a model; they never
 * touch the database and never decide what is trusted. Everything they return is `unknown` until
 * the service layer validates it against a Zod schema.
 */
export type AiTask =
  | "clothing_analysis"
  | "multi_clothing_analysis"
  | "stylist_recommendation"
  | "travel_packing_capsule"
  | "packing_plan"
  | "garment_enhancement";

export interface AiImage {
  bytes: Uint8Array;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
}

export interface AiJsonRequest {
  task: AiTask;
  /** Which configured model to use. */
  kind: "vision" | "text";
  system: string;
  prompt: string;
  image?: AiImage;
  /** JSON Schema describing the required output shape. */
  jsonSchema: Record<string, unknown>;
  signal?: AbortSignal;
}

export interface AiProvider {
  readonly name: "gemini" | "mistral" | "groq" | "mock";
  /** True for development sample data that did NOT come from a real model. */
  readonly isMock: boolean;
  generateJson(request: AiJsonRequest): Promise<unknown>;
}

export class AiProviderError extends Error {
  constructor(
    message: string,
    public readonly retryable: boolean,
  ) {
    super(message);
    this.name = "AiProviderError";
  }
}

import { describe, expect, it, vi } from "vitest";
import { createGeminiProvider, type GeminiLikeClient } from "@/lib/ai/gemini";
import { createMockProvider } from "@/lib/ai/mock";
import { isOverLimit } from "@/lib/ai/rate-limit";
import { clothingAnalysisSchema } from "@/lib/ai/schemas";
import { analyseClothingImage, getAiProvider } from "@/lib/ai/service";
import { AiProviderError, type AiProvider } from "@/lib/ai/types";
import { resolveAiConfig } from "@/lib/env";

const image = { bytes: new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3, 4, 5, 6, 7, 8, 9]), mimeType: "image/jpeg" as const };

const validRaw = {
  name: "Navy T-shirt",
  category: "t-shirts",
  subcategory: "crew neck",
  primary_colour: "navy",
  secondary_colours: ["white", "navy", "unknown"],
  pattern: "solid",
  style: "casual",
  occasions: ["everyday", "everyday", "school"],
  seasons: ["all_year"],
  confidence: 0.9,
  uncertain_fields: ["style"],
};

function providerReturning(...results: Array<unknown | Error>): AiProvider & { calls: number } {
  let i = 0;
  const p = {
    name: "gemini" as const,
    isMock: false,
    calls: 0,
    async generateJson() {
      p.calls += 1;
      const r = results[Math.min(i++, results.length - 1)];
      if (r instanceof Error) throw r;
      return r;
    },
  };
  return p;
}

describe("clothingAnalysisSchema", () => {
  it("accepts valid output, de-duplicates lists and normalises 'unknown' to null", () => {
    const out = clothingAnalysisSchema.parse({ ...validRaw, pattern: "unknown", subcategory: "" });
    expect(out.pattern).toBeNull();
    expect(out.subcategory).toBeNull();
    expect(out.secondaryColours).toEqual(["white"]); // primary and unknown removed
    expect(out.occasions).toEqual(["everyday", "school"]);
  });

  it.each([
    ["unknown category", { category: "spacesuit" }],
    ["confidence above 1", { confidence: 7 }],
    ["missing name", { name: "" }],
    ["unknown colour", { primary_colour: "ultraviolet" }],
    ["too many occasions", { occasions: Array(9).fill("work") }],
    ["bogus uncertain field", { uncertain_fields: ["material"] }],
  ])("rejects %s", (_label, override) => {
    expect(clothingAnalysisSchema.safeParse({ ...validRaw, ...override }).success).toBe(false);
  });

  it("has no way to carry material or brand through", () => {
    const out = clothingAnalysisSchema.parse({ ...validRaw, material: "silk", brand: "Gucci" });
    expect(out).not.toHaveProperty("material");
    expect(out).not.toHaveProperty("brand");
  });
});

describe("analyseClothingImage", () => {
  it("returns a validated suggestion and reports whether the provider is a mock", async () => {
    const result = await analyseClothingImage(image, { provider: providerReturning(validRaw) });
    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.suggestion.category).toBe("t-shirts");
      expect(result.isMock).toBe(false);
    }
  });

  it("retries once when the model returns invalid data, then succeeds", async () => {
    const provider = providerReturning({ nonsense: true }, validRaw);
    const result = await analyseClothingImage(image, { provider });
    expect(result.status).toBe("ok");
    expect(provider.calls).toBe(2);
  });

  it("fails cleanly after two invalid responses and never returns the bad data", async () => {
    const provider = providerReturning({ category: "x" });
    const result = await analyseClothingImage(image, { provider });
    expect(result.status).toBe("failed");
    expect(provider.calls).toBe(2);
    if (result.status === "failed") expect(result.message).toMatch(/enter the details yourself/i);
  });

  it("retries a retryable provider error but not a permanent one", async () => {
    const flaky = providerReturning(new AiProviderError("blip", true), validRaw);
    expect((await analyseClothingImage(image, { provider: flaky })).status).toBe("ok");

    const fatal = providerReturning(new AiProviderError("bad key", false), validRaw);
    const result = await analyseClothingImage(image, { provider: fatal });
    expect(result.status).toBe("failed");
    expect(fatal.calls).toBe(1);
  });

  it("does not leak unexpected error details to the caller", async () => {
    const provider = providerReturning(new Error("secret internal detail sk-123"));
    const result = await analyseClothingImage(image, { provider });
    expect(result.status).toBe("failed");
    expect(JSON.stringify(result)).not.toContain("sk-123");
  });
});

describe("getAiProvider / resolveAiConfig", () => {
  it("is unavailable when nothing is configured", () => {
    const r = getAiProvider({});
    expect(r.available).toBe(false);
  });

  it("explains which variables are missing for gemini", () => {
    const r = resolveAiConfig({ AI_PROVIDER: "gemini" });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toMatch(/AI_API_KEY.*AI_VISION_MODEL/);
  });

  it("defaults the text model to the vision model", () => {
    const r = resolveAiConfig({ AI_PROVIDER: "gemini", AI_API_KEY: "k", AI_VISION_MODEL: "m1" });
    expect(r.ok && r.config.provider === "gemini" && r.config.textModel).toBe("m1");
  });

  it("allows the mock provider in development but refuses it in production", () => {
    expect(resolveAiConfig({ AI_PROVIDER: "mock", NODE_ENV: "development" }).ok).toBe(true);
    expect(resolveAiConfig({ AI_PROVIDER: "mock", NODE_ENV: "production" }).ok).toBe(false);
  });

  it("rejects unknown providers", () => {
    expect(resolveAiConfig({ AI_PROVIDER: "skynet" }).ok).toBe(false);
  });

  it("chains multiple providers when AI_PROVIDER is comma-separated or backup keys exist", async () => {
    const { createMultiProvider } = await import("@/lib/ai/service");
    const primary: AiProvider = {
      name: "groq",
      isMock: false,
      async generateJson() {
        throw new AiProviderError("Groq rate limited", false);
      },
    };
    const backup: AiProvider = {
      name: "mistral",
      isMock: false,
      async generateJson() {
        return validRaw;
      },
    };
    const multi = createMultiProvider([primary, backup]);
    const res = await analyseClothingImage(image, { provider: multi });
    expect(res.status).toBe("ok");
    if (res.status === "ok") {
      expect(res.provider).toBe("mistral");
    }
  });
});

describe("mock provider", () => {
  it("is flagged as a mock and produces schema-valid, repeatable output", async () => {
    const mock = createMockProvider();
    expect(mock.isMock).toBe(true);
    const a = await analyseClothingImage(image, { provider: mock });
    const b = await analyseClothingImage(image, { provider: mock });
    expect(a.status).toBe("ok");
    expect(a).toEqual(b);
    if (a.status === "ok") expect(a.isMock).toBe(true);
  });
});

describe("gemini provider (fake client, no network)", () => {
  function fakeClient(text: string | undefined, error?: unknown) {
    const generateContent = vi.fn(async (params: { model: string; contents: unknown; config?: Record<string, unknown> }) => {
      void params;
      if (error) throw error;
      return { text };
    });
    return { client: { models: { generateContent } } as GeminiLikeClient, generateContent };
  }
  const options = { apiKey: "k", visionModel: "vision-model", textModel: "text-model" };
  const request = {
    task: "clothing_analysis" as const,
    kind: "vision" as const,
    system: "sys",
    prompt: "p",
    image,
    jsonSchema: { type: "object" },
  };

  it("sends the image, schema and configured model, and parses the JSON reply", async () => {
    const { client, generateContent } = fakeClient(JSON.stringify(validRaw));
    const out = await createGeminiProvider(options, client).generateJson(request);
    expect(out).toEqual(validRaw);
    const call = generateContent.mock.calls[0][0] as { model: string; contents: Array<{ parts: Array<Record<string, unknown>> }>; config: Record<string, unknown> };
    expect(call.model).toBe("vision-model");
    expect(call.config.responseMimeType).toBe("application/json");
    expect(call.config.responseJsonSchema).toEqual({ type: "object" });
    expect(call.contents[0].parts[0]).toHaveProperty("inlineData.mimeType", "image/jpeg");
  });

  it("uses the text model for text requests", async () => {
    const { client, generateContent } = fakeClient("{}");
    await createGeminiProvider(options, client).generateJson({ ...request, kind: "text", image: undefined });
    expect((generateContent.mock.calls[0][0] as { model: string }).model).toBe("text-model");
  });

  it("turns non-JSON output into a retryable error", async () => {
    const { client } = fakeClient("not json");
    await expect(createGeminiProvider(options, client).generateJson(request)).rejects.toMatchObject({ retryable: true });
  });

  it("maps quota and auth failures to non-retryable errors with safe messages", async () => {
    for (const status of [429, 401, 403]) {
      const { client } = fakeClient(undefined, Object.assign(new Error("raw upstream text with key=abc"), { status }));
      const err = await createGeminiProvider(options, client).generateJson(request).catch((e: AiProviderError) => e);
      expect(err).toBeInstanceOf(AiProviderError);
      expect((err as AiProviderError).retryable).toBe(false);
      expect((err as AiProviderError).message).not.toContain("abc");
    }
  });
});

describe("isOverLimit", () => {
  it("blocks at the limit, not before", () => {
    expect(isOverLimit(59, 60)).toBe(false);
    expect(isOverLimit(60, 60)).toBe(true);
  });
});

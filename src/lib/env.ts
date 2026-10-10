import { z } from "zod";

/**
 * Environment validation, done lazily per integration so that an unconfigured
 * optional service (AI, email) never takes the whole site down.
 * Each getter throws a ConfigError naming exactly which variables are missing.
 */

export class ConfigError extends Error {
  constructor(
    public readonly integration: string,
    public readonly missing: string[],
  ) {
    super(
      `${integration} is not configured. Missing or invalid environment variables: ${missing.join(", ")}. See .env.example.`,
    );
    this.name = "ConfigError";
  }
}

function parse<T extends z.ZodType>(integration: string, schema: T, source: Record<string, unknown>): z.infer<T> {
  const result = schema.safeParse(source);
  if (!result.success) {
    const missing = [...new Set(result.error.issues.map((i) => String(i.path[0] ?? "unknown")))];
    throw new ConfigError(integration, missing);
  }
  return result.data;
}

const nonEmpty = z.string().min(1);

/** Public Supabase settings; safe to read in browser and server code. */
export function getSupabasePublicEnv() {
  // NEXT_PUBLIC_* must be referenced statically so Next.js can inline them in the browser bundle.
  return parse(
    "Supabase",
    z.object({
      NEXT_PUBLIC_SUPABASE_URL: z.url(),
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: nonEmpty,
    }),
    {
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    },
  );
}

export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
}

/** Server-only. Used exclusively by trusted scheduled jobs. */
export function getSupabaseServiceEnv() {
  return parse(
    "Supabase service role",
    z.object({ SUPABASE_SERVICE_ROLE_KEY: nonEmpty }),
    process.env,
  );
}

export function getAppUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000").replace(/\/$/, "");
}

/**
 * AI provider configuration.
 *  - AI_PROVIDER=gemini  : real calls. Needs AI_API_KEY and AI_VISION_MODEL (AI_TEXT_MODEL defaults to it).
 *  - AI_PROVIDER=mock    : clearly labelled development sample data. Refused in production.
 *  - anything else/unset : AI is simply unavailable and the app falls back to manual entry.
 */
export type AiConfig =
  | { provider: "gemini"; apiKey: string; visionModel: string; textModel: string }
  | { provider: "mock" };

export type AiConfigResult = { ok: true; config: AiConfig } | { ok: false; reason: string };

export function resolveAiConfig(source: Record<string, string | undefined> = process.env): AiConfigResult {
  const provider = (source.AI_PROVIDER ?? "").trim().toLowerCase();
  if (!provider) return { ok: false, reason: "AI isn't configured on this deployment." };

  if (provider === "mock") {
    if (source.NODE_ENV === "production") {
      return { ok: false, reason: "The mock AI provider is for development only and is disabled in production." };
    }
    return { ok: true, config: { provider: "mock" } };
  }

  if (provider === "gemini") {
    const missing = ["AI_API_KEY", "AI_VISION_MODEL"].filter((k) => !source[k]?.trim());
    if (missing.length > 0) return { ok: false, reason: new ConfigError("AI provider", missing).message };
    const visionModel = source.AI_VISION_MODEL!.trim();
    return {
      ok: true,
      config: {
        provider: "gemini",
        apiKey: source.AI_API_KEY!.trim(),
        visionModel,
        textModel: source.AI_TEXT_MODEL?.trim() || visionModel,
      },
    };
  }

  return { ok: false, reason: `Unknown AI_PROVIDER "${provider}". Supported values: gemini, mock.` };
}

export function getEmailEnv() {
  return parse(
    "Resend email",
    z.object({
      RESEND_API_KEY: nonEmpty,
      EMAIL_FROM: nonEmpty,
    }),
    process.env,
  );
}

export function getCronEnv() {
  return parse("Cron", z.object({ CRON_SECRET: z.string().min(16) }), process.env);
}

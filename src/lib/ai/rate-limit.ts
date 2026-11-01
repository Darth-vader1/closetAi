import type { SupabaseClient } from "@supabase/supabase-js";

export type AiOperation = "ANALYSE_IMAGE" | "STYLE_OUTFITS" | "CHAT" | "GENERATE_PHOTO";

export const IMAGE_ANALYSIS_METHODS = [
  "SINGLE_GARMENT_SCAN",
  "OOTD_EXTRACT",
  "SCREENSHOT_DETECT",
  "FLATLAY_DETECT",
  "BEAUTIFY_FLATLAY",
  "BEAUTIFY_CUTOUT",
  "BEAUTIFY_ENHANCE",
] as const;

export type ImageAnalysisMethod = (typeof IMAGE_ANALYSIS_METHODS)[number];

export const VISION_METHOD_KEYS = [
  ...IMAGE_ANALYSIS_METHODS,
  "VISION_LEGACY",
] as const;

export type VisionMethodKey = (typeof VISION_METHOD_KEYS)[number];

export const AI_SUB_OPERATIONS = [
  ...IMAGE_ANALYSIS_METHODS,
  "STYLIST_OUTFITS",
  "TRIP_PACKING",
  "STYLIST_CHAT",
  "BRIEFING_PREVIEW",
  "LOOKBOOK_PHOTO",
] as const;

export type AiSubOperation = (typeof AI_SUB_OPERATIONS)[number];

export type AnyAiMethodKey = AiSubOperation | "VISION_LEGACY" | "STYLE_LEGACY" | "CHAT_LEGACY";

export interface AiMethodDescriptor {
  label: string;
  shortLabel: string;
  route: string;
  description: string;
  category: "single_scan" | "multi_detect" | "studio_beautify" | "legacy_vision" | "stylist" | "chat" | "photo";
}

export const AI_METHOD_META: Record<AnyAiMethodKey, AiMethodDescriptor> = {
  SINGLE_GARMENT_SCAN: {
    label: "Single Garment Photo Scan",
    shortLabel: "Photo Scan",
    route: "/api/ai/analyse",
    description: "Single clothing photo attribute, colour & fabric tagging",
    category: "single_scan",
  },
  OOTD_EXTRACT: {
    label: "OOTD Outfit Extraction",
    shortLabel: "OOTD Scan",
    route: "/api/ai/detect-items · ootd",
    description: "Full-body or mirror outfit scan extracting worn pieces",
    category: "multi_detect",
  },
  SCREENSHOT_DETECT: {
    label: "Order Screenshot Scan",
    shortLabel: "Screenshot",
    route: "/api/ai/detect-items · screenshot",
    description: "Multi-item shopping cart or order screenshot detection",
    category: "multi_detect",
  },
  FLATLAY_DETECT: {
    label: "Multi-Item Flat-Lay Scan",
    shortLabel: "Multi Flat-Lay",
    route: "/api/ai/detect-items · flatlay",
    description: "Multiple garments laid out together in one frame",
    category: "multi_detect",
  },
  BEAUTIFY_FLATLAY: {
    label: "De-Body Studio Flat-Lay",
    shortLabel: "De-Body Flat-Lay",
    route: "/api/ai/beautify · catalog-flatlay",
    description: "Removes body/skin and reconstructs unworn studio flat-lay",
    category: "studio_beautify",
  },
  BEAUTIFY_CUTOUT: {
    label: "Background Cutout",
    shortLabel: "Bg Cutout",
    route: "/api/ai/beautify · clean-cutout",
    description: "Neural background removal onto clean studio backdrop",
    category: "studio_beautify",
  },
  BEAUTIFY_ENHANCE: {
    label: "AI Studio Enhance",
    shortLabel: "AI Enhance",
    route: "/api/ai/beautify · ai-enhance",
    description: "Studio cutout with AI lighting, drape & fabric calibration",
    category: "studio_beautify",
  },
  VISION_LEGACY: {
    label: "Legacy Vision Scan (Pre-Tracking)",
    shortLabel: "Legacy Vision",
    route: "/api/ai/analyse · detect-items · beautify",
    description: "Image call logged before granular method telemetry",
    category: "legacy_vision",
  },
  STYLIST_OUTFITS: {
    label: "Daily Outfit Stylist",
    shortLabel: "Outfit Stylist",
    route: "/api/ai/stylist",
    description: "AI outfit recommendations from clean closet inventory",
    category: "stylist",
  },
  TRIP_PACKING: {
    label: "Trip & Capsule Packing",
    shortLabel: "Trip Packing",
    route: "/api/ai/packing",
    description: "Multi-day travel or rotation capsule planner",
    category: "stylist",
  },
  STYLE_LEGACY: {
    label: "AI Stylist / Packing",
    shortLabel: "Stylist",
    route: "/api/ai/stylist · /api/ai/packing",
    description: "Outfit styling or trip packing request",
    category: "stylist",
  },
  STYLIST_CHAT: {
    label: "@ClosetAI Stylist Chat",
    shortLabel: "Stylist Chat",
    route: "/api/ai/stylist/chat",
    description: "Conversational styling advice with closet context",
    category: "chat",
  },
  BRIEFING_PREVIEW: {
    label: "WhatsApp Briefing Test",
    shortLabel: "Briefing Test",
    route: "Settings · Test Briefing",
    description: "User-triggered WhatsApp daily outfit test preview",
    category: "chat",
  },
  CHAT_LEGACY: {
    label: "Stylist Chat / Briefing",
    shortLabel: "Chat",
    route: "/api/ai/stylist/chat",
    description: "Conversational stylist or briefing dispatch",
    category: "chat",
  },
  LOOKBOOK_PHOTO: {
    label: "Lookbook Photoshoot",
    shortLabel: "Lookbook Photo",
    route: "/api/outfits/generate-photo",
    description: "Editorial AI outfit lookbook image generation",
    category: "photo",
  },
};

export interface AiQuotaTelemetry {
  subOperation?: AiSubOperation;
  provider?: string | null;
  model?: string | null;
  metadata?: Record<string, unknown> | null;
}

export interface InMemoryAiTelemetryEntry {
  eventId: string;
  userId: string;
  operation: AiOperation;
  createdAtMs: number;
  subOperation?: AiSubOperation;
  provider?: string | null;
  model?: string | null;
  metadata?: Record<string, unknown> | null;
}

const MAX_IN_MEMORY_TELEMETRY = 1000;

function getTelemetryStore(): Map<string, InMemoryAiTelemetryEntry> {
  const g = globalThis as typeof globalThis & {
    __closetAiTelemetryStore?: Map<string, InMemoryAiTelemetryEntry>;
  };
  if (!g.__closetAiTelemetryStore) {
    g.__closetAiTelemetryStore = new Map<string, InMemoryAiTelemetryEntry>();
  }
  return g.__closetAiTelemetryStore;
}

export function rememberInMemoryAiTelemetry(entry: InMemoryAiTelemetryEntry): void {
  const store = getTelemetryStore();
  store.set(entry.eventId, entry);
  if (store.size > MAX_IN_MEMORY_TELEMETRY) {
    const oldestKey = store.keys().next().value;
    if (oldestKey) store.delete(oldestKey);
  }
}

export function lookupInMemoryAiTelemetry(
  eventId: string,
  userId: string,
  operation: AiOperation,
  createdAtIso: string,
): InMemoryAiTelemetryEntry | null {
  const store = getTelemetryStore();
  const exact = store.get(eventId);
  if (exact) return exact;

  const targetMs = Date.parse(createdAtIso);
  if (!Number.isFinite(targetMs)) return null;

  let best: InMemoryAiTelemetryEntry | null = null;
  let bestDelta = 3000;
  for (const candidate of store.values()) {
    if (candidate.userId !== userId || candidate.operation !== operation) continue;
    const delta = Math.abs(candidate.createdAtMs - targetMs);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = candidate;
    }
  }
  return best;
}

function isMissingTelemetryColumnError(err: { code?: string; message?: string } | null | undefined): boolean {
  if (!err) return false;
  const code = String(err.code ?? "");
  const msg = String(err.message ?? "").toLowerCase();
  return (
    code === "PGRST204" ||
    code === "42703" ||
    msg.includes("sub_operation") ||
    msg.includes("provider") ||
    msg.includes("model") ||
    msg.includes("metadata")
  );
}

/** Requests allowed per rolling hour, per user, per operation. */
export const AI_HOURLY_LIMITS: Record<AiOperation, number> = {
  ANALYSE_IMAGE: 60,
  STYLE_OUTFITS: 30,
  CHAT: 60,
  GENERATE_PHOTO: 10,
};

export function isOverLimit(recentCount: number, limit: number): boolean {
  return recentCount >= limit;
}

/**
 * Counts the user's AI calls in the last hour and records a new one if under the limit.
 * Uses the caller's own (RLS-scoped) client. The count-then-insert is not atomic, so a burst of
 * parallel requests can slightly overshoot the limit. That is acceptable for cost control; it is
 * not a security boundary.
 */
export async function takeAiQuota(
  supabase: SupabaseClient,
  userId: string,
  operation: AiOperation,
  nowOrTelemetry?: Date | AiQuotaTelemetry,
  maybeNow?: Date,
): Promise<{ allowed: true; eventId?: string } | { allowed: false; retryAfterMinutes: number }> {
  const hasTelemetry = Boolean(nowOrTelemetry && !(nowOrTelemetry instanceof Date));
  const telemetry = hasTelemetry ? (nowOrTelemetry as AiQuotaTelemetry) : undefined;
  const now =
    nowOrTelemetry instanceof Date
      ? nowOrTelemetry
      : (maybeNow ?? new Date());

  const since = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const { count, error } = await supabase
    .from("ai_usage_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("operation", operation)
    .gte("created_at", since);
  if (error) throw new Error(`Could not check AI usage: ${error.message}`);

  if (isOverLimit(count ?? 0, AI_HOURLY_LIMITS[operation])) return { allowed: false, retryAfterMinutes: 60 };

  if (!telemetry) {
    const { error: insertError } = await supabase.from("ai_usage_events").insert({ user_id: userId, operation });
    if (insertError) throw new Error(`Could not record AI usage: ${insertError.message}`);
    return { allowed: true };
  }

  const eventId = crypto.randomUUID();
  rememberInMemoryAiTelemetry({
    eventId,
    userId,
    operation,
    createdAtMs: now.getTime(),
    subOperation: telemetry.subOperation,
    provider: telemetry.provider ?? null,
    model: telemetry.model ?? null,
    metadata: telemetry.metadata ?? null,
  });

  const richRow: Record<string, unknown> = {
    id: eventId,
    user_id: userId,
    operation,
    sub_operation: telemetry.subOperation ?? null,
    provider: telemetry.provider ?? null,
    model: telemetry.model ?? null,
    metadata: telemetry.metadata ?? null,
  };

  const { error: richInsertError } = await supabase.from("ai_usage_events").insert(richRow);
  if (!richInsertError) {
    return { allowed: true, eventId };
  }

  if (isMissingTelemetryColumnError(richInsertError)) {
    const { error: fallbackInsertError } = await supabase
      .from("ai_usage_events")
      .insert({ id: eventId, user_id: userId, operation });
    if (fallbackInsertError) {
      throw new Error(`Could not record AI usage: ${fallbackInsertError.message}`);
    }
    return { allowed: true, eventId };
  }

  throw new Error(`Could not record AI usage: ${richInsertError.message}`);
}

/**
 * Best-effort post-execution enrichment so routes can record the resolved AI provider,
 * model, or detected photo type (e.g. OOTD vs Screenshot vs Flatlay) without blocking responses.
 */
export async function recordAiQuotaOutcome(
  supabase: SupabaseClient | null | undefined,
  eventId: string | undefined,
  userId: string,
  patch: AiQuotaTelemetry,
): Promise<void> {
  if (!eventId) return;

  const store = getTelemetryStore();
  const existing = store.get(eventId);
  if (existing) {
    store.set(eventId, {
      ...existing,
      subOperation: patch.subOperation ?? existing.subOperation,
      provider: patch.provider !== undefined ? patch.provider : existing.provider,
      model: patch.model !== undefined ? patch.model : existing.model,
      metadata:
        patch.metadata !== undefined
          ? { ...(existing.metadata ?? {}), ...(patch.metadata ?? {}) }
          : existing.metadata,
    });
  }

  if (!supabase || typeof supabase.from !== "function") return;

  try {
    const updates: Record<string, unknown> = {};
    if (patch.subOperation !== undefined) updates.sub_operation = patch.subOperation;
    if (patch.provider !== undefined) updates.provider = patch.provider;
    if (patch.model !== undefined) updates.model = patch.model;
    if (patch.metadata !== undefined) updates.metadata = patch.metadata;
    if (Object.keys(updates).length === 0) return;

    await supabase
      .from("ai_usage_events")
      .update(updates)
      .eq("id", eventId)
      .eq("user_id", userId);
  } catch {
    // Non-fatal: in-memory store still holds live session telemetry if migration hasn't run yet.
  }
}

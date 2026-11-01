import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  getClearBackdropApiKey,
  getClipDropApiKey,
  getPhotoRoomApiKey,
  getRemoveBgApiKey,
  isSupabaseConfigured,
  resolveAiConfig,
} from "@/lib/env";
import { getResendClient } from "@/lib/email/service";
import { getWhatsAppConfig } from "@/lib/whatsapp/service";
import { AI_HOURLY_LIMITS, type AiOperation } from "@/lib/ai/rate-limit";
import { getPlanLimits } from "@/lib/billing/plans";

export type HealthState = "healthy" | "warning" | "degraded" | "unconfigured";

export interface SystemServiceHealth {
  id: string;
  name: string;
  category: "core" | "ai" | "messaging" | "billing";
  state: HealthState;
  statusLabel: string;
  summary: string;
  checks: Array<{
    label: string;
    value: string;
    ok: boolean;
  }>;
  latencyMs?: number | null;
}

export interface CronDeliverySummary {
  sent7d: number;
  failed7d: number;
  pending7d: number;
  skipped7d: number;
  lastSentAt: string | null;
  lastFailureError: string | null;
  lastFailureAt: string | null;
}

export interface AdminSystemHealthReport {
  checkedAt: string;
  overallState: HealthState;
  services: SystemServiceHealth[];
  cron: CronDeliverySummary;
}

export interface LiveProbeResult {
  id: string;
  name: string;
  ok: boolean;
  latencyMs: number;
  detail: string;
}

export interface DailyAiPoint {
  date: string; // YYYY-MM-DD (UTC)
  label: string; // e.g. "Oct 28"
  total: number;
  analyseImage: number;
  styleOutfits: number;
  chat: number;
  generatePhoto: number;
}

export interface AdminAiUserUsageRow {
  userId: string;
  email: string | null;
  displayName: string | null;
  role: string;
  planLabel: string;
  isSubscribed: boolean;
  calls24h: number;
  calls7d: number;
  calls30d: number;
  analyseImage30d: number;
  styleOutfits30d: number;
  chat30d: number;
  generatePhoto30d: number;
  outfitQuotaUsed: number;
  outfitQuotaLimit: number | null;
  outfitQuotaWindow: "week" | "month";
  beautifyQuotaUsed: number;
  beautifyQuotaLimit: number | null;
  isQuotaExhausted: boolean;
  lastAiAt: string | null;
}

export interface AdminAiRecentEvent {
  id: string;
  userId: string;
  userEmail: string | null;
  userName: string | null;
  operation: AiOperation;
  createdAt: string;
}

export interface AdminAiUsageReport {
  generatedAt: string;
  calls24h: number;
  calls7d: number;
  calls30d: number;
  totalCallsAllTime: number;
  activeUsers24h: number;
  activeUsers7d: number;
  activeUsers30d: number;
  rateLimitedUsersLastHour: number;
  quotaExhaustedUsersCount: number;
  byOperation30d: Record<AiOperation, number>;
  byOperation7d: Record<AiOperation, number>;
  dailyTrend14d: DailyAiPoint[];
  userLeaderboard: AdminAiUserUsageRow[];
  recentEvents: AdminAiRecentEvent[];
}

function countKeyPool(raw: string | undefined): number {
  if (!raw) return 0;
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean).length;
}

function describeKeyMode(key: string, livePrefix: string, testPrefix: string): {
  mode: "live" | "test" | "custom" | "missing";
  label: string;
} {
  const trimmed = key.trim();
  if (!trimmed) return { mode: "missing", label: "Not set" };
  if (trimmed.startsWith(livePrefix)) return { mode: "live", label: "Live key" };
  if (trimmed.startsWith(testPrefix)) return { mode: "test", label: "Test key" };
  return { mode: "custom", label: "Configured" };
}

/**
 * Evaluates real server configuration, database latency, and 7-day cron delivery health.
 * Never exposes raw API keys or secrets.
 */
export async function getAdminSystemHealth(
  env: Record<string, string | undefined> = process.env,
): Promise<AdminSystemHealthReport> {
  const checkedAt = new Date().toISOString();
  const services: SystemServiceHealth[] = [];

  // 1. Supabase Database & Service Role Check
  let dbLatencyMs: number | null = null;
  let dbOk = false;
  let dbErrorMsg: string | null = null;
  const hasPublicSupabase = isSupabaseConfigured();
  const hasServiceRole = Boolean(env.SUPABASE_SERVICE_ROLE_KEY?.trim());

  const adminClient = hasPublicSupabase && hasServiceRole ? createAdminClient() : null;

  if (adminClient) {
    const start = Date.now();
    try {
      const { error } = await adminClient
        .from("profiles")
        .select("id", { count: "exact", head: true });
      dbLatencyMs = Date.now() - start;
      if (error) {
        dbErrorMsg = error.message;
      } else {
        dbOk = true;
      }
    } catch (err) {
      dbLatencyMs = Date.now() - start;
      dbErrorMsg = err instanceof Error ? err.message : "Database ping failed";
    }
  }

  services.push({
    id: "supabase",
    name: "Supabase Postgres & Auth",
    category: "core",
    state: !dbOk
      ? "degraded"
      : dbLatencyMs !== null && dbLatencyMs > 800
        ? "warning"
        : "healthy",
    statusLabel: !dbOk
      ? "Connection Error"
      : dbLatencyMs !== null && dbLatencyMs > 800
        ? `Slow (${dbLatencyMs}ms)`
        : `Operational (${dbLatencyMs ?? 0}ms)`,
    summary: dbOk
      ? "Primary Postgres database, Row-Level Security, and Admin Auth API responded normally."
      : dbErrorMsg || "Supabase public URL or service role key is missing.",
    latencyMs: dbLatencyMs,
    checks: [
      { label: "Public URL & Anon Key", value: hasPublicSupabase ? "Configured" : "Missing", ok: hasPublicSupabase },
      { label: "Service Role Key", value: hasServiceRole ? "Configured" : "Missing", ok: hasServiceRole },
      {
        label: "Query Round-Trip",
        value: dbOk ? `${dbLatencyMs}ms` : dbErrorMsg || "Failed",
        ok: dbOk,
      },
    ],
  });

  // 2. AI Stylist & Vision Provider Chain
  const aiResolved = resolveAiConfig(env);
  const groqPool = countKeyPool(
    env.GROQ_API_KEY || (env.AI_API_KEY?.startsWith("gsk_") ? env.AI_API_KEY : undefined),
  );
  const mistralPool = countKeyPool(
    env.MISTRAL_API_KEY || (env.AI_API_KEY?.startsWith("mstrl_") ? env.AI_API_KEY : undefined),
  );
  const geminiPool = countKeyPool(
    env.GEMINI_API_KEY ||
      (env.AI_API_KEY && !env.AI_API_KEY.startsWith("gsk_") && !env.AI_API_KEY.startsWith("mstrl_")
        ? env.AI_API_KEY
        : undefined),
  );

  let aiState: HealthState = "unconfigured";
  let aiStatusLabel = "Not Configured";
  let aiSummary = "No AI provider is active; app will fall back to manual garment entry and deterministic outfit rules.";

  if (aiResolved.ok) {
    if (aiResolved.config.provider === "mock") {
      aiState = "warning";
      aiStatusLabel = "Mock Mode (Dev)";
      aiSummary = "Running deterministic mock AI responses. Switch AI_PROVIDER to groq, mistral, or gemini for production.";
    } else {
      const backups = [
        groqPool > 0 && aiResolved.config.provider !== "groq" ? "Groq" : null,
        mistralPool > 0 && aiResolved.config.provider !== "mistral" ? "Mistral" : null,
        geminiPool > 0 && aiResolved.config.provider !== "gemini" ? "Gemini" : null,
      ].filter(Boolean);

      aiState = "healthy";
      aiStatusLabel = backups.length > 0
        ? `Primary: ${aiResolved.config.provider.toUpperCase()} (+${backups.length} fallback)`
        : `Single Provider (${aiResolved.config.provider.toUpperCase()})`;
      aiSummary = `Vision: ${aiResolved.config.visionModel} · Text: ${aiResolved.config.textModel}${
        backups.length > 0 ? ` · Automatic failover to ${backups.join(" → ")}` : " · No backup provider keys configured"
      }.`;
    }
  } else {
    aiSummary = aiResolved.reason;
  }

  services.push({
    id: "ai_models",
    name: "AI Stylist & Vision Engine",
    category: "ai",
    state: aiState,
    statusLabel: aiStatusLabel,
    summary: aiSummary,
    checks: [
      {
        label: "Primary AI_PROVIDER",
        value: aiResolved.ok ? aiResolved.config.provider.toUpperCase() : "Invalid / Missing",
        ok: aiResolved.ok && aiResolved.config.provider !== "mock",
      },
      { label: "Groq Key Pool", value: groqPool > 0 ? `${groqPool} key(s)` : "Not set", ok: groqPool > 0 },
      { label: "Mistral Key Pool", value: mistralPool > 0 ? `${mistralPool} key(s)` : "Not set", ok: mistralPool > 0 },
      { label: "Gemini Key Pool", value: geminiPool > 0 ? `${geminiPool} key(s)` : "Not set", ok: geminiPool > 0 },
    ],
  });

  // 3. Garment Neural Beautification Waterfall
  const hasRemoveBg = Boolean(getRemoveBgApiKey(env));
  const hasClearBackdrop = Boolean(getClearBackdropApiKey(env));
  const hasPhotoRoom = Boolean(getPhotoRoomApiKey(env));
  const hasClipDrop = Boolean(getClipDropApiKey(env));
  const activeSegCount = [hasRemoveBg, hasClearBackdrop, hasPhotoRoom, hasClipDrop].filter(Boolean).length;

  services.push({
    id: "beautify",
    name: "Product Studio Beautification",
    category: "ai",
    state: activeSegCount > 0 ? "healthy" : "warning",
    statusLabel:
      activeSegCount > 0
        ? `${activeSegCount} Cloud Tier${activeSegCount > 1 ? "s" : ""} Active`
        : "Local Fallback Only",
    summary:
      activeSegCount > 0
        ? "Multi-tier neural background removal waterfall configured with automatic local Sharp edge-matting fallback."
        : "No cloud segmentation API keys set; Beautify is running on local Sharp edge-flood background matting only.",
    checks: [
      { label: "Remove.bg", value: hasRemoveBg ? "Configured" : "Not set", ok: hasRemoveBg },
      { label: "PhotoRoom", value: hasPhotoRoom ? "Configured" : "Not set", ok: hasPhotoRoom },
      { label: "ClearBackdrop", value: hasClearBackdrop ? "Configured" : "Not set", ok: hasClearBackdrop },
      { label: "ClipDrop", value: hasClipDrop ? "Configured" : "Not set", ok: hasClipDrop },
    ],
  });

  // 4. Email Delivery & Cron Jobs
  const emailConfig = getResendClient();
  const cronSecretLen = (env.CRON_SECRET ?? "").trim().length;
  const hasValidCronSecret = cronSecretLen >= 16;

  const cronStats: CronDeliverySummary = {
    sent7d: 0,
    failed7d: 0,
    pending7d: 0,
    skipped7d: 0,
    lastSentAt: null,
    lastFailureError: null,
    lastFailureAt: null,
  };

  if (adminClient) {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    try {
      const { data: logs } = await adminClient
        .from("email_logs")
        .select("status, sent_at, updated_at, last_error")
        .gte("updated_at", sevenDaysAgo)
        .order("updated_at", { ascending: false })
        .limit(500);

      for (const row of logs ?? []) {
        if (row.status === "SENT") {
          cronStats.sent7d++;
          if (row.sent_at && (!cronStats.lastSentAt || row.sent_at > cronStats.lastSentAt)) {
            cronStats.lastSentAt = row.sent_at;
          }
        } else if (row.status === "FAILED") {
          cronStats.failed7d++;
          if (!cronStats.lastFailureAt) {
            cronStats.lastFailureAt = row.updated_at;
            cronStats.lastFailureError = row.last_error || "Delivery failed";
          }
        } else if (row.status === "PENDING") {
          cronStats.pending7d++;
        } else if (row.status === "SKIPPED") {
          cronStats.skipped7d++;
        }
      }
    } catch {
      // Non-fatal if email_logs query fails
    }
  }

  const emailTransportLabel = emailConfig
    ? emailConfig.provider === "gmail_api"
      ? "Gmail REST OAuth2"
      : emailConfig.provider === "gmail_smtp"
        ? "Gmail SMTP (App Password)"
        : "Resend API"
    : "Not Configured";

  const emailState: HealthState = !emailConfig
    ? "unconfigured"
    : cronStats.failed7d > 0 && cronStats.sent7d === 0
      ? "degraded"
      : !hasValidCronSecret || cronStats.failed7d > 0
        ? "warning"
        : "healthy";

  services.push({
    id: "email_cron",
    name: "Email Delivery & Daily Cron",
    category: "messaging",
    state: emailState,
    statusLabel: !emailConfig
      ? "Not Configured"
      : cronStats.failed7d > 0
        ? `${emailTransportLabel} (${cronStats.failed7d} failed)`
        : emailTransportLabel,
    summary: emailConfig
      ? `Sending from ${emailConfig.from}. 7-day cron digest: ${cronStats.sent7d} sent, ${cronStats.failed7d} failed, ${cronStats.skipped7d} skipped.`
      : "Set GMAIL_USER + GMAIL_APP_PASSWORD (or GMAIL_CLIENT_ID/REFRESH_TOKEN or RESEND_API_KEY) to send transactional & broadcast emails.",
    checks: [
      { label: "Active Transport", value: emailTransportLabel, ok: Boolean(emailConfig) },
      {
        label: "CRON_SECRET (>= 16 chars)",
        value: hasValidCronSecret ? "Configured" : cronSecretLen > 0 ? "Too short (<16)" : "Missing",
        ok: hasValidCronSecret,
      },
      {
        label: "7-Day Cron Deliveries",
        value: `${cronStats.sent7d} sent · ${cronStats.failed7d} failed`,
        ok: cronStats.failed7d === 0,
      },
    ],
  });

  // 5. WhatsApp Cloud / Twilio Messaging
  const waConfig = getWhatsAppConfig();
  const hasWaVerifyToken = Boolean(
    env.WHATSAPP_VERIFY_TOKEN?.trim() || env.META_WEBHOOK_VERIFY_TOKEN?.trim(),
  );

  services.push({
    id: "whatsapp",
    name: "WhatsApp Briefings & Webhook",
    category: "messaging",
    state: waConfig ? "healthy" : "unconfigured",
    statusLabel: waConfig
      ? waConfig.provider === "meta"
        ? "Meta Cloud API"
        : "Twilio WhatsApp"
      : "Not Configured",
    summary: waConfig
      ? `Connected via ${waConfig.provider === "meta" ? "Meta WhatsApp Cloud API" : "Twilio"} for daily outfit and laundry briefings.`
      : "Optional channel: set WHATSAPP_ACCESS_TOKEN & WHATSAPP_PHONE_NUMBER_ID (or Twilio credentials) to enable WhatsApp delivery.",
    checks: [
      {
        label: "Messaging Provider",
        value: waConfig ? (waConfig.provider === "meta" ? "Meta Cloud" : "Twilio") : "Not set",
        ok: Boolean(waConfig),
      },
      {
        label: "Webhook Verify Token",
        value: hasWaVerifyToken ? "Configured" : "Not set",
        ok: hasWaVerifyToken,
      },
    ],
  });

  // 6. Payment Gateways (Paystack & Stripe)
  const paystackSecret = describeKeyMode(env.PAYSTACK_SECRET_KEY || "", "sk_live_", "sk_test_");
  const paystackPublic = describeKeyMode(
    env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY || "",
    "pk_live_",
    "pk_test_",
  );
  const stripeSecret = describeKeyMode(env.STRIPE_SECRET_KEY || "", "sk_live_", "sk_test_");
  const hasStripeWebhook = Boolean(env.STRIPE_WEBHOOK_SECRET?.trim());

  const anyLiveGateway = paystackSecret.mode === "live" || stripeSecret.mode === "live";
  const anyConfiguredGateway = paystackSecret.mode !== "missing" || stripeSecret.mode !== "missing";
  const stripeMissingWebhook = stripeSecret.mode !== "missing" && !hasStripeWebhook;

  const billingState: HealthState = !anyConfiguredGateway
    ? "unconfigured"
    : stripeMissingWebhook
      ? "warning"
      : anyLiveGateway
        ? "healthy"
        : "warning";

  const billingStatusLabel = !anyConfiguredGateway
    ? "No Gateway Keys"
    : paystackSecret.mode === "live" && stripeSecret.mode === "live"
      ? "Paystack & Stripe Live"
      : paystackSecret.mode === "live"
        ? "Paystack Live"
        : stripeSecret.mode === "live"
          ? "Stripe Live"
          : "Test / Sandbox Keys";

  services.push({
    id: "billing",
    name: "Payment Gateways (Paystack & Stripe)",
    category: "billing",
    state: billingState,
    statusLabel: billingStatusLabel,
    summary: anyConfiguredGateway
      ? `Paystack: ${paystackSecret.label} · Stripe: ${stripeSecret.label}${
          stripeMissingWebhook ? " (Warning: STRIPE_WEBHOOK_SECRET is missing)" : ""
        }.`
      : "Neither PAYSTACK_SECRET_KEY nor STRIPE_SECRET_KEY is configured on this deployment.",
    checks: [
      {
        label: "Paystack Secret Key",
        value: paystackSecret.label,
        ok: paystackSecret.mode === "live" || paystackSecret.mode === "test",
      },
      {
        label: "Paystack Public Key",
        value: paystackPublic.label,
        ok: paystackPublic.mode === "live" || paystackPublic.mode === "test",
      },
      {
        label: "Stripe Secret Key",
        value: stripeSecret.label,
        ok: stripeSecret.mode !== "missing",
      },
      {
        label: "Stripe Webhook Secret",
        value: hasStripeWebhook ? "Configured" : stripeSecret.mode === "missing" ? "N/A" : "Missing",
        ok: stripeSecret.mode === "missing" || hasStripeWebhook,
      },
    ],
  });

  // Compute overall system state
  const hasDegraded = services.some((s) => s.state === "degraded");
  const hasCoreUnconfigured = services.some(
    (s) => (s.id === "supabase" || s.id === "ai_models") && s.state === "unconfigured",
  );
  const hasWarning = services.some((s) => s.state === "warning");

  const overallState: HealthState = hasDegraded || hasCoreUnconfigured
    ? "degraded"
    : hasWarning
      ? "warning"
      : "healthy";

  return {
    checkedAt,
    overallState,
    services,
    cron: cronStats,
  };
}

/**
 * Runs active network reachability probes against external APIs (Supabase, AI providers, Open-Meteo, Paystack)
 * with strict 4.5s timeouts so an admin can verify live credentials & upstream uptime on demand.
 */
export async function runAdminLiveConnectivityProbes(
  env: Record<string, string | undefined> = process.env,
): Promise<{ checkedAt: string; probes: LiveProbeResult[] }> {
  const probes: LiveProbeResult[] = [];

  async function timedFetch(
    id: string,
    name: string,
    fn: (signal: AbortSignal) => Promise<string>,
  ): Promise<LiveProbeResult> {
    const start = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4500);
    try {
      const detail = await fn(controller.signal);
      return { id, name, ok: true, latencyMs: Date.now() - start, detail };
    } catch (err) {
      return {
        id,
        name,
        ok: false,
        latencyMs: Date.now() - start,
        detail: err instanceof Error ? err.message : "Probe failed",
      };
    } finally {
      clearTimeout(timer);
    }
  }

  const tasks: Array<Promise<LiveProbeResult>> = [];

  // 1. Supabase Postgres + Auth Admin
  tasks.push(
    timedFetch("supabase_db", "Supabase Postgres & Auth", async () => {
      const adminClient = createAdminClient();
      const { count, error } = await adminClient
        .from("profiles")
        .select("id", { count: "exact", head: true });
      if (error) throw new Error(error.message);
      return `Connected · ${count ?? 0} profiles reachable`;
    }),
  );

  // 2. Groq API (if key configured)
  const groqKey = (
    env.GROQ_API_KEY || (env.AI_API_KEY?.startsWith("gsk_") ? env.AI_API_KEY : "") || ""
  )
    .split(",")[0]
    ?.trim();
  if (groqKey) {
    tasks.push(
      timedFetch("groq_api", "Groq Inference API", async (signal) => {
        const res = await fetch("https://api.groq.com/openai/v1/models", {
          headers: { Authorization: `Bearer ${groqKey}` },
          signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return "API key valid · Models endpoint reachable";
      }),
    );
  }

  // 3. Mistral API (if key configured)
  const mistralKey = (
    env.MISTRAL_API_KEY || (env.AI_API_KEY?.startsWith("mstrl_") ? env.AI_API_KEY : "") || ""
  )
    .split(",")[0]
    ?.trim();
  if (mistralKey) {
    tasks.push(
      timedFetch("mistral_api", "Mistral Inference API", async (signal) => {
        const res = await fetch("https://api.mistral.ai/v1/models", {
          headers: { Authorization: `Bearer ${mistralKey}` },
          signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return "API key valid · Models endpoint reachable";
      }),
    );
  }

  // 4. Gemini API (if key configured)
  const geminiKey = (
    env.GEMINI_API_KEY ||
    (env.AI_API_KEY && !env.AI_API_KEY.startsWith("gsk_") && !env.AI_API_KEY.startsWith("mstrl_")
      ? env.AI_API_KEY
      : "") ||
    ""
  )
    .split(",")[0]
    ?.trim();
  if (geminiKey) {
    tasks.push(
      timedFetch("gemini_api", "Google Gemini API", async (signal) => {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?pageSize=1&key=${encodeURIComponent(geminiKey)}`,
          { signal },
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return "API key valid · Gemini endpoint reachable";
      }),
    );
  }

  // 5. Open-Meteo Weather API
  tasks.push(
    timedFetch("open_meteo", "Open-Meteo Weather API", async (signal) => {
      const res = await fetch(
        "https://api.open-meteo.com/v1/forecast?latitude=6.5244&longitude=3.3792&current=temperature_2m",
        { signal },
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = (await res.json()) as { current?: { temperature_2m?: number } };
      const temp = json.current?.temperature_2m;
      return typeof temp === "number"
        ? `Live Lagos forecast reachable (${temp}°C)`
        : "Forecast endpoint reachable";
    }),
  );

  // 6. Paystack API (if secret configured)
  const paystackSecret = (env.PAYSTACK_SECRET_KEY || "").trim();
  if (paystackSecret) {
    tasks.push(
      timedFetch("paystack_api", "Paystack Billing API", async (signal) => {
        const res = await fetch("https://api.paystack.co/plan?perPage=1", {
          headers: { Authorization: `Bearer ${paystackSecret}` },
          signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return paystackSecret.startsWith("sk_live_")
          ? "Live secret verified against api.paystack.co"
          : "Test secret verified against api.paystack.co";
      }),
    );
  }

  const settled = await Promise.all(tasks);
  probes.push(...settled);

  return {
    checkedAt: new Date().toISOString(),
    probes,
  };
}

/**
 * Aggregates per-user and platform-wide AI usage from `public.ai_usage_events`
 * and billing-window feature quotas from `public.usage_records`.
 */
export async function getAdminAiUsageAnalytics(
  now: Date = new Date(),
): Promise<AdminAiUsageReport> {
  const adminClient = createAdminClient();

  const oneHourAgoIso = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
  const oneDayAgoIso = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const sevenDaysAgoIso = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const thirtyDaysAgoIso = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const oneHourMs = now.getTime() - 60 * 60 * 1000;
  const oneDayMs = now.getTime() - 24 * 60 * 60 * 1000;
  const sevenDaysMs = now.getTime() - 7 * 24 * 60 * 60 * 1000;

  // 1. Run exact headline count queries + profile/usage fetches concurrently
  const [
    allTimeRes,
    calls24hRes,
    calls7dRes,
    calls30dRes,
    profilesRes,
    usageRecordsRes,
    authListRes,
  ] = await Promise.all([
    adminClient.from("ai_usage_events").select("id", { count: "exact", head: true }),
    adminClient
      .from("ai_usage_events")
      .select("id", { count: "exact", head: true })
      .gte("created_at", oneDayAgoIso),
    adminClient
      .from("ai_usage_events")
      .select("id", { count: "exact", head: true })
      .gte("created_at", sevenDaysAgoIso),
    adminClient
      .from("ai_usage_events")
      .select("id", { count: "exact", head: true })
      .gte("created_at", thirtyDaysAgoIso),
    adminClient
      .from("profiles")
      .select("id, display_name, role, subscription_status, subscription_plan, subscription_provider"),
    adminClient
      .from("usage_records")
      .select("user_id, feature, period_start, period_end, count")
      .gte("period_end", now.toISOString()),
    adminClient.auth.admin.listUsers({ perPage: 1000 }).catch(() => ({ data: { users: [] } })),
  ]);

  // 2. Paginate 30-day ai_usage_events (up to 5 pages x 1000 = 5,000 events) so per-user & 14d charts don't truncate at 1,000
  const events30d: Array<{
    id: string;
    user_id: string;
    operation: AiOperation;
    created_at: string;
  }> = [];

  const PAGE_SIZE = 1000;
  for (let page = 0; page < 5; page++) {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await adminClient
      .from("ai_usage_events")
      .select("id, user_id, operation, created_at")
      .gte("created_at", thirtyDaysAgoIso)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (error || !data || data.length === 0) break;
    events30d.push(
      ...(data as Array<{
        id: string;
        user_id: string;
        operation: AiOperation;
        created_at: string;
      }>),
    );
    if (data.length < PAGE_SIZE) break;
  }

  // Hydrate email map
  const emailMap = new Map<string, string>();
  for (const u of authListRes.data?.users ?? []) {
    if (u.email) emailMap.set(u.id, u.email);
  }

  const profileMap = new Map<
    string,
    {
      displayName: string | null;
      role: string;
      subscriptionStatus: string;
      subscriptionPlan: string | null;
      subscriptionProvider: string | null;
    }
  >();
  for (const p of profilesRes.data ?? []) {
    profileMap.set(p.id, {
      displayName: p.display_name,
      role: (p as { role?: string }).role || "user",
      subscriptionStatus: (p as { subscription_status?: string }).subscription_status || "free",
      subscriptionPlan: (p as { subscription_plan?: string }).subscription_plan || null,
      subscriptionProvider: (p as { subscription_provider?: string }).subscription_provider || null,
    });
  }

  // Active billing-window usage map per user
  const activeQuotaMap = new Map<
    string,
    { outfitUsed: number; beautifyUsed: number }
  >();
  for (const rec of usageRecordsRes.data ?? []) {
    const entry = activeQuotaMap.get(rec.user_id) ?? { outfitUsed: 0, beautifyUsed: 0 };
    if (rec.feature === "outfit_recommendations") {
      entry.outfitUsed = Math.max(entry.outfitUsed, rec.count ?? 0);
    } else if (rec.feature === "beautify_processing") {
      entry.beautifyUsed = Math.max(entry.beautifyUsed, rec.count ?? 0);
    }
    activeQuotaMap.set(rec.user_id, entry);
  }

  // Initialize 14-day buckets (oldest -> newest)
  const dayBuckets = new Map<string, DailyAiPoint>();
  for (let i = 13; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - i));
    const dateKey = d.toISOString().slice(0, 10);
    const label = d.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
    dayBuckets.set(dateKey, {
      date: dateKey,
      label,
      total: 0,
      analyseImage: 0,
      styleOutfits: 0,
      chat: 0,
      generatePhoto: 0,
    });
  }

  const byOperation30d: Record<AiOperation, number> = {
    ANALYSE_IMAGE: 0,
    STYLE_OUTFITS: 0,
    CHAT: 0,
    GENERATE_PHOTO: 0,
  };
  const byOperation7d: Record<AiOperation, number> = {
    ANALYSE_IMAGE: 0,
    STYLE_OUTFITS: 0,
    CHAT: 0,
    GENERATE_PHOTO: 0,
  };

  const users24h = new Set<string>();
  const users7d = new Set<string>();
  const users30d = new Set<string>();

  // Per-user accumulator
  interface UserAgg {
    calls24h: number;
    calls7d: number;
    calls30d: number;
    analyseImage30d: number;
    styleOutfits30d: number;
    chat30d: number;
    generatePhoto30d: number;
    hourlyByOp: Record<AiOperation, number>;
    lastAiAt: string | null;
  }

  const userAggMap = new Map<string, UserAgg>();

  const ensureAgg = (userId: string): UserAgg => {
    let agg = userAggMap.get(userId);
    if (!agg) {
      agg = {
        calls24h: 0,
        calls7d: 0,
        calls30d: 0,
        analyseImage30d: 0,
        styleOutfits30d: 0,
        chat30d: 0,
        generatePhoto30d: 0,
        hourlyByOp: {
          ANALYSE_IMAGE: 0,
          STYLE_OUTFITS: 0,
          CHAT: 0,
          GENERATE_PHOTO: 0,
        },
        lastAiAt: null,
      };
      userAggMap.set(userId, agg);
    }
    return agg;
  };

  for (const ev of events30d) {
    const op = ev.operation in byOperation30d ? ev.operation : "CHAT";
    const ts = Date.parse(ev.created_at);

    byOperation30d[op]++;
    users30d.add(ev.user_id);

    const agg = ensureAgg(ev.user_id);
    agg.calls30d++;
    if (!agg.lastAiAt || ev.created_at > agg.lastAiAt) {
      agg.lastAiAt = ev.created_at;
    }

    if (op === "ANALYSE_IMAGE") agg.analyseImage30d++;
    else if (op === "STYLE_OUTFITS") agg.styleOutfits30d++;
    else if (op === "CHAT") agg.chat30d++;
    else if (op === "GENERATE_PHOTO") agg.generatePhoto30d++;

    if (ts >= sevenDaysMs) {
      byOperation7d[op]++;
      users7d.add(ev.user_id);
      agg.calls7d++;
    }
    if (ts >= oneDayMs) {
      users24h.add(ev.user_id);
      agg.calls24h++;
    }
    if (ts >= oneHourMs && ev.created_at >= oneHourAgoIso) {
      agg.hourlyByOp[op]++;
    }

    const dayKey = ev.created_at.slice(0, 10);
    const bucket = dayBuckets.get(dayKey);
    if (bucket) {
      bucket.total++;
      if (op === "ANALYSE_IMAGE") bucket.analyseImage++;
      else if (op === "STYLE_OUTFITS") bucket.styleOutfits++;
      else if (op === "CHAT") bucket.chat++;
      else if (op === "GENERATE_PHOTO") bucket.generatePhoto++;
    }
  }

  // Also include users who have active `usage_records` even if they had 0 `ai_usage_events` in the window
  for (const userId of activeQuotaMap.keys()) {
    ensureAgg(userId);
  }

  let rateLimitedUsersLastHour = 0;
  let quotaExhaustedUsersCount = 0;

  const userLeaderboard: AdminAiUserUsageRow[] = [];

  for (const [userId, agg] of userAggMap.entries()) {
    const profile = profileMap.get(userId);
    const isSubscribed =
      profile?.subscriptionStatus === "active" || profile?.subscriptionStatus === "trialing";
    const isAdmin = profile?.role === "admin" || profile?.role === "superadmin";
    const planId = isSubscribed ? profile?.subscriptionPlan || "monthly" : "free";
    const limits = getPlanLimits(planId);
    const quota = activeQuotaMap.get(userId) ?? { outfitUsed: 0, beautifyUsed: 0 };

    const outfitLimit = isAdmin ? null : limits.outfit_recommendations.limit;
    const beautifyLimit = isAdmin ? null : limits.beautify_processing.limit;

    const isOutfitExhausted = outfitLimit !== null && quota.outfitUsed >= outfitLimit;
    const isBeautifyExhausted = beautifyLimit !== null && quota.beautifyUsed >= beautifyLimit;
    const isQuotaExhausted = !isAdmin && (isOutfitExhausted || isBeautifyExhausted);

    if (isQuotaExhausted) {
      quotaExhaustedUsersCount++;
    }

    const hitHourlyCap = (Object.keys(AI_HOURLY_LIMITS) as AiOperation[]).some(
      (op) => agg.hourlyByOp[op] >= AI_HOURLY_LIMITS[op],
    );
    if (hitHourlyCap) {
      rateLimitedUsersLastHour++;
    }

    userLeaderboard.push({
      userId,
      email: emailMap.get(userId) || null,
      displayName: profile?.displayName || null,
      role: profile?.role || "user",
      planLabel: isAdmin
        ? "Staff (Unlimited)"
        : isSubscribed
          ? `Pro (${profile?.subscriptionProvider || planId})`
          : "Free",
      isSubscribed,
      calls24h: agg.calls24h,
      calls7d: agg.calls7d,
      calls30d: agg.calls30d,
      analyseImage30d: agg.analyseImage30d,
      styleOutfits30d: agg.styleOutfits30d,
      chat30d: agg.chat30d,
      generatePhoto30d: agg.generatePhoto30d,
      outfitQuotaUsed: quota.outfitUsed,
      outfitQuotaLimit: outfitLimit,
      outfitQuotaWindow: limits.outfit_recommendations.window,
      beautifyQuotaUsed: quota.beautifyUsed,
      beautifyQuotaLimit: beautifyLimit,
      isQuotaExhausted,
      lastAiAt: agg.lastAiAt,
    });
  }

  userLeaderboard.sort((a, b) => {
    if (b.calls30d !== a.calls30d) return b.calls30d - a.calls30d;
    if (b.calls7d !== a.calls7d) return b.calls7d - a.calls7d;
    return (b.lastAiAt || "").localeCompare(a.lastAiAt || "");
  });

  const recentEvents: AdminAiRecentEvent[] = events30d.slice(0, 25).map((ev) => ({
    id: ev.id,
    userId: ev.user_id,
    userEmail: emailMap.get(ev.user_id) || null,
    userName: profileMap.get(ev.user_id)?.displayName || null,
    operation: ev.operation,
    createdAt: ev.created_at,
  }));

  return {
    generatedAt: now.toISOString(),
    calls24h: calls24hRes.count ?? events30d.filter((e) => Date.parse(e.created_at) >= oneDayMs).length,
    calls7d: calls7dRes.count ?? events30d.filter((e) => Date.parse(e.created_at) >= sevenDaysMs).length,
    calls30d: calls30dRes.count ?? events30d.length,
    totalCallsAllTime: allTimeRes.count ?? events30d.length,
    activeUsers24h: users24h.size,
    activeUsers7d: users7d.size,
    activeUsers30d: users30d.size,
    rateLimitedUsersLastHour,
    quotaExhaustedUsersCount,
    byOperation30d,
    byOperation7d,
    dailyTrend14d: Array.from(dayBuckets.values()),
    userLeaderboard,
    recentEvents,
  };
}

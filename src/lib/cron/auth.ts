import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { ConfigError, getCronEnv } from "@/lib/env";
import { logger } from "@/lib/logger";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Verifies the incoming request has a valid `Authorization: Bearer <CRON_SECRET>` header.
 * Fails closed (500) if CRON_SECRET is missing or < 16 characters, and returns 401 on mismatch.
 */
export function verifyCronRequest(request: NextRequest): NextResponse | null {
  let cronSecret: string;
  try {
    cronSecret = getCronEnv().CRON_SECRET.trim();
  } catch (err) {
    logger.error("cron.secret_not_configured", {
      error: err instanceof ConfigError ? err.message : "Missing CRON_SECRET",
    });
    return NextResponse.json({ error: "Cron secret is not configured on this server." }, { status: 500 });
  }

  const authHeader = request.headers.get("authorization") ?? "";
  const expected = `Bearer ${cronSecret}`;

  const actualBuf = Buffer.from(authHeader, "utf8");
  const expectedBuf = Buffer.from(expected, "utf8");

  if (actualBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(actualBuf, expectedBuf)) {
    return NextResponse.json({ error: "Unauthorized cron trigger." }, { status: 401 });
  }

  return null;
}

export interface UserLocalClock {
  /** YYYY-MM-DD in user's timezone */
  localDate: string;
  /** HH:MM (24-hour) in user's timezone */
  localTime: string;
  /** 0 = Sunday .. 6 = Saturday in user's timezone */
  weekdayIndex: number;
  /** ISO week period key, e.g. '2026-W41' */
  isoWeekKey: string;
}

const WEEKDAY_MAP: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

/**
 * Computes the user's current local date, 24h time, weekday (0-6), and ISO week key.
 * Falls back to UTC if the stored timezone is invalid.
 */
export function getUserLocalClock(timezone?: string | null, now: Date = new Date()): UserLocalClock {
  let tz = (timezone || "UTC").trim();
  let parts: Intl.DateTimeFormatPart[];

  const getFormatter = (timeZone: string) =>
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      weekday: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });

  try {
    parts = getFormatter(tz).formatToParts(now);
  } catch {
    tz = "UTC";
    parts = getFormatter("UTC").formatToParts(now);
  }

  const map: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== "literal") {
      map[part.type] = part.value;
    }
  }

  const year = Number(map.year);
  const month = map.month || "01";
  const day = map.day || "01";
  const rawHour = map.hour === "24" ? "00" : map.hour || "00";
  const minute = map.minute || "00";
  const weekdayIndex = WEEKDAY_MAP[map.weekday ?? "Sun"] ?? 0;

  const localDate = `${year}-${month}-${day}`;
  const localTime = `${rawHour.padStart(2, "0")}:${minute.padStart(2, "0")}`;
  const isoWeekKey = computeIsoWeekKey(year, Number(month), Number(day));

  return {
    localDate,
    localTime,
    weekdayIndex,
    isoWeekKey,
  };
}

function computeIsoWeekKey(year: number, month: number, day: number): string {
  const d = new Date(Date.UTC(year, month - 1, day));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}

/**
 * Normalizes a SQL TIME value (e.g. '07:00:00' or '07:00') to 'HH:MM'.
 */
export function normalizeTimeHHMM(sqlTime: string | null | undefined, fallback: string): string {
  if (!sqlTime) return fallback;
  const trimmed = sqlTime.trim();
  const match = /^(\d{2}):(\d{2})/.exec(trimmed);
  return match ? `${match[1]}:${match[2]}` : fallback;
}

/**
 * Atomically claims an idempotency slot in `public.email_logs` for (user_id, kind, period_key).
 * Returns the log row ID if this invocation should proceed, or null if already SENT/PENDING
 * (or exhausted retries).
 */
export async function claimEmailLogSlot(
  adminClient: SupabaseClient,
  userId: string,
  kind: "DAILY" | "WEEKLY",
  periodKey: string,
): Promise<{ logId: string; attemptCount: number } | null> {
  // 1. Try inserting a fresh PENDING row; ignoreDuplicates ensures atomic conflict handling
  const { data: inserted, error: insertErr } = await adminClient
    .from("email_logs")
    .upsert(
      {
        user_id: userId,
        kind,
        period_key: periodKey,
        status: "PENDING",
        attempt_count: 1,
      },
      { onConflict: "user_id,kind,period_key", ignoreDuplicates: true },
    )
    .select("id, attempt_count")
    .maybeSingle();

  if (insertErr) {
    logger.error("cron.claim_slot_insert_error", { userId, kind, periodKey, error: insertErr });
    return null;
  }

  if (inserted?.id) {
    return { logId: inserted.id, attemptCount: inserted.attempt_count };
  }

  // 2. Row already existed — inspect status for retry eligibility (FAILED or stale PENDING > 15m, < 3 attempts)
  const { data: existing, error: fetchErr } = await adminClient
    .from("email_logs")
    .select("id, status, attempt_count, updated_at")
    .eq("user_id", userId)
    .eq("kind", kind)
    .eq("period_key", periodKey)
    .maybeSingle();

  if (fetchErr || !existing) {
    return null;
  }

  const updatedAtMs = existing.updated_at ? new Date(existing.updated_at).getTime() : 0;
  const isStalePending =
    existing.status === "PENDING" &&
    updatedAtMs > 0 &&
    Date.now() - updatedAtMs > 15 * 60 * 1000;

  if ((existing.status === "FAILED" || isStalePending) && existing.attempt_count < 3) {
    const nextAttempt = existing.attempt_count + 1;
    const { data: claimed } = await adminClient
      .from("email_logs")
      .update({ status: "PENDING", attempt_count: nextAttempt })
      .eq("id", existing.id)
      .eq("status", existing.status)
      .select("id, attempt_count")
      .maybeSingle();

    if (claimed?.id) {
      return { logId: claimed.id, attemptCount: claimed.attempt_count };
    }
  }

  return null;
}

export async function finalizeEmailLogSlot(
  adminClient: SupabaseClient,
  logId: string,
  result:
    | { status: "SENT"; providerMessageId?: string }
    | { status: "FAILED"; lastError: string }
    | { status: "SKIPPED"; reason?: string },
): Promise<void> {
  if (result.status === "SENT") {
    await adminClient
      .from("email_logs")
      .update({
        status: "SENT",
        sent_at: new Date().toISOString(),
        provider_message_id: result.providerMessageId ?? null,
        last_error: null,
      })
      .eq("id", logId);
  } else if (result.status === "FAILED") {
    await adminClient
      .from("email_logs")
      .update({
        status: "FAILED",
        last_error: result.lastError.slice(0, 500),
      })
      .eq("id", logId);
  } else {
    await adminClient
      .from("email_logs")
      .update({
        status: "SKIPPED",
        last_error: result.reason ? result.reason.slice(0, 500) : null,
      })
      .eq("id", logId);
  }
}

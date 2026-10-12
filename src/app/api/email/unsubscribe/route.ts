import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAppUrl } from "@/lib/env";
import { logger } from "@/lib/logger";

const uuidSchema = z.uuid();
const typeSchema = z.enum(["daily", "weekly", "all"]).catch("all");

function renderHtmlPage(title: string, bodyHtml: string, status = 200): NextResponse {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title} · ClosetAI</title>
</head>
<body style="margin:0;padding:40px 16px;background:#fafaf9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1c1917;">
  <div style="max-width:460px;margin:0 auto;background:#ffffff;border:1px solid #e7e5e4;border-radius:16px;padding:32px;text-align:center;box-shadow:0 4px 12px rgba(0,0,0,0.03);">
    <div style="font-size:11px;text-transform:uppercase;letter-spacing:2px;color:#78716c;margin-bottom:8px;">CLOSET·AI</div>
    ${bodyHtml}
  </div>
</body>
</html>`;

  return new NextResponse(html, {
    status,
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * GET /api/email/unsubscribe?token=<uuid>&type=daily|weekly|all
 * Renders a confirmation form without mutating database state (safe against email link scanners).
 */
export async function GET(request: NextRequest) {
  const rawToken = request.nextUrl.searchParams.get("token") ?? "";
  const type = typeSchema.parse(request.nextUrl.searchParams.get("type") ?? "all");

  if (!uuidSchema.safeParse(rawToken).success) {
    return renderHtmlPage(
      "Invalid Unsubscribe Link",
      `<h1 style="font-family:Georgia,serif;font-size:22px;font-weight:normal;margin:0 0 12px;">Invalid unsubscribe link</h1>
       <p style="font-size:14px;color:#57534e;line-height:1.5;margin:0 0 24px;">This unsubscribe link is missing or malformed. You can manage your notification schedule anytime from your account settings.</p>
       <a href="${escapeAttr(getAppUrl())}/settings" style="display:inline-block;background:#1c1917;color:#fff;text-decoration:none;padding:12px 24px;border-radius:999px;font-size:14px;">Open Settings</a>`,
      400,
    );
  }

  const label =
    type === "daily"
      ? "daily outfit emails"
      : type === "weekly"
        ? "weekly laundry digest emails"
        : "all ClosetAI notification emails";

  return renderHtmlPage(
    "Confirm Unsubscribe",
    `<h1 style="font-family:Georgia,serif;font-size:22px;font-weight:normal;margin:0 0 12px;">Unsubscribe from ${escapeAttr(label)}?</h1>
     <p style="font-size:14px;color:#57534e;line-height:1.5;margin:0 0 24px;">Click below to confirm. You can re-enable notifications at any time in your ClosetAI settings.</p>
     <form method="POST" action="/api/email/unsubscribe">
       <input type="hidden" name="token" value="${escapeAttr(rawToken)}" />
       <input type="hidden" name="type" value="${escapeAttr(type)}" />
       <button type="submit" style="cursor:pointer;border:none;background:#1c1917;color:#ffffff;padding:12px 28px;border-radius:999px;font-size:14px;font-weight:500;">
         Confirm Unsubscribe
       </button>
     </form>`,
  );
}

/**
 * POST /api/email/unsubscribe
 * Validates the unsubscribe_token UUID and disables the requested notification schedule.
 */
export async function POST(request: NextRequest) {
  let rawToken = request.nextUrl.searchParams.get("token") ?? "";
  let rawType = request.nextUrl.searchParams.get("type") ?? "";

  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/x-www-form-urlencoded") || contentType.includes("multipart/form-data")) {
    const formData = await request.formData().catch(() => null);
    if (formData) {
      if (!rawToken && typeof formData.get("token") === "string") {
        rawToken = String(formData.get("token"));
      }
      if (!rawType && typeof formData.get("type") === "string") {
        rawType = String(formData.get("type"));
      }
    }
  } else if (contentType.includes("application/json")) {
    const body = (await request.json().catch(() => null)) as { token?: string; type?: string } | null;
    if (body) {
      if (!rawToken && typeof body.token === "string") rawToken = body.token;
      if (!rawType && typeof body.type === "string") rawType = body.type;
    }
  }

  const parsedToken = uuidSchema.safeParse(rawToken.trim());
  if (!parsedToken.success) {
    return renderHtmlPage(
      "Invalid Unsubscribe Token",
      `<h1 style="font-family:Georgia,serif;font-size:22px;font-weight:normal;margin:0 0 12px;">Invalid unsubscribe link</h1>
       <p style="font-size:14px;color:#57534e;line-height:1.5;margin:0 0 24px;">We couldn't verify that unsubscribe token.</p>
       <a href="${escapeAttr(getAppUrl())}/settings" style="display:inline-block;background:#1c1917;color:#fff;text-decoration:none;padding:12px 24px;border-radius:999px;font-size:14px;">Manage Settings</a>`,
      400,
    );
  }

  const type = typeSchema.parse(rawType || "all");

  try {
    const adminClient = createAdminClient();

    const { data: pref, error: findErr } = await adminClient
      .from("email_preferences")
      .select("user_id")
      .eq("unsubscribe_token", parsedToken.data)
      .maybeSingle();

    if (findErr) {
      logger.error("unsubscribe.lookup_failed", { error: findErr });
      return renderHtmlPage(
        "Unsubscribe Error",
        `<h1 style="font-family:Georgia,serif;font-size:22px;font-weight:normal;margin:0 0 12px;">Something went wrong</h1>
         <p style="font-size:14px;color:#57534e;line-height:1.5;margin:0 0 24px;">We couldn't update your preferences right now. Please try again in a moment.</p>`,
        500,
      );
    }

    if (!pref) {
      return renderHtmlPage(
        "Link Expired or Invalid",
        `<h1 style="font-family:Georgia,serif;font-size:22px;font-weight:normal;margin:0 0 12px;">Unsubscribe link not found</h1>
         <p style="font-size:14px;color:#57534e;line-height:1.5;margin:0 0 24px;">This unsubscribe token was not recognised. You can manage notifications directly in your account settings.</p>
         <a href="${escapeAttr(getAppUrl())}/settings" style="display:inline-block;background:#1c1917;color:#fff;text-decoration:none;padding:12px 24px;border-radius:999px;font-size:14px;">Open Settings</a>`,
        404,
      );
    }

    const baseUpdate: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };
    if (type === "daily" || type === "all") {
      baseUpdate.daily_enabled = false;
    }
    if (type === "weekly" || type === "all") {
      baseUpdate.weekly_enabled = false;
    }

    const fullUpdate =
      type === "all"
        ? { ...baseUpdate, whatsapp_daily_enabled: false }
        : baseUpdate;

    let { error: updateErr } = await adminClient
      .from("email_preferences")
      .update(fullUpdate)
      .eq("user_id", pref.user_id);

    if (updateErr && (updateErr.code === "42703" || updateErr.code === "PGRST204" || updateErr.message?.includes("whatsapp"))) {
      const retry = await adminClient
        .from("email_preferences")
        .update(baseUpdate)
        .eq("user_id", pref.user_id);
      updateErr = retry.error;
    }

    if (updateErr) {
      logger.error("unsubscribe.update_failed", { userId: pref.user_id, error: updateErr });
      return renderHtmlPage(
        "Unsubscribe Error",
        `<h1 style="font-family:Georgia,serif;font-size:22px;font-weight:normal;margin:0 0 12px;">Could not update preferences</h1>
         <p style="font-size:14px;color:#57534e;line-height:1.5;margin:0 0 24px;">Please try again or update your preferences in Settings.</p>`,
        500,
      );
    }

    return renderHtmlPage(
      "Unsubscribed",
      `<h1 style="font-family:Georgia,serif;font-size:22px;font-weight:normal;margin:0 0 12px;">You've been unsubscribed</h1>
       <p style="font-size:14px;color:#57534e;line-height:1.5;margin:0 0 24px;">Your ClosetAI notification preferences have been updated.</p>
       <a href="${escapeAttr(getAppUrl())}/settings" style="display:inline-block;background:#1c1917;color:#fff;text-decoration:none;padding:12px 24px;border-radius:999px;font-size:14px;">Manage Preferences</a>`,
      200,
    );
  } catch (err) {
    logger.error("unsubscribe.exception", { err });
    return renderHtmlPage(
      "Unsubscribe Error",
      `<h1 style="font-family:Georgia,serif;font-size:22px;font-weight:normal;margin:0 0 12px;">Something went wrong</h1>
       <p style="font-size:14px;color:#57534e;line-height:1.5;margin:0;">Please try again later.</p>`,
      500,
    );
  }
}

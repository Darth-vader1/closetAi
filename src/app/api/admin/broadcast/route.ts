import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/admin";
import { sendEmail } from "@/lib/email/service";
import {
  DEFAULT_ANNOUNCEMENT_SUPER_SUBJECT,
  renderFeatureAnnouncementHtml,
} from "@/lib/email/templates";
import { isSameOrigin } from "@/lib/security/origin";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

const broadcastRequestSchema = z.object({
  mode: z.enum(["test", "broadcast"]),
  testEmail: z.string().trim().optional(),
  subject: z.string().trim().max(180).optional(),
  heading: z.string().trim().max(140).optional(),
  intro: z.string().trim().max(600).optional(),
  confirmedOnly: z.boolean().optional().default(true),
});

const BATCH_SIZE = 3;
const BATCH_DELAY_MS = 150;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function POST(req: Request) {
  if (!isSameOrigin(req.headers)) {
    return NextResponse.json(
      { error: "Cross-origin requests are not allowed." },
      { status: 403 },
    );
  }

  const admin = await requireAdmin();
  const adminClient = createAdminClient();

  const rawBody = await req.json().catch(() => null);
  const parsed = broadcastRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid broadcast request payload." },
      { status: 400 },
    );
  }

  const { mode, testEmail, subject, heading, intro, confirmedOnly } = parsed.data;
  const resolvedSubject = subject || DEFAULT_ANNOUNCEMENT_SUPER_SUBJECT;

  if (mode === "test") {
    if (!testEmail || !z.email().safeParse(testEmail).success) {
      return NextResponse.json(
        { error: "Please provide a valid test email address." },
        { status: 400 },
      );
    }

    const html = renderFeatureAnnouncementHtml({
      displayName: "ClosetAI Preview",
      ...(heading ? { heading } : {}),
      ...(intro ? { intro } : {}),
    });

    const res = await sendEmail({
      to: testEmail,
      subject: resolvedSubject,
      html,
    });

    const { error: auditError } = await adminClient
      .from("admin_audit_logs")
      .insert({
        admin_id: admin.id,
        action: "TEST_BROADCAST",
        details: { testEmail, subject: resolvedSubject, success: res.success },
      });

    if (auditError) {
      logger.error("admin.broadcast.audit_failed", { adminId: admin.id, error: auditError });
      return NextResponse.json({ error: "Failed to record audit log." }, { status: 500 });
    }

    if (res.success) {
      return NextResponse.json({ ok: true, id: res.id });
    }
    return NextResponse.json({ error: res.error || "Failed to send test email." }, { status: 500 });
  }

  // mode === "broadcast"
  // 1. Paginate through Supabase Auth users to get verified email addresses
  const authUsers: Array<{ id: string; email: string; confirmed: boolean }> = [];
  let page = 1;
  const perPage = 1000;

  while (true) {
    const { data: listData, error: listErr } = await adminClient.auth.admin.listUsers({
      page,
      perPage,
    });
    if (listErr) {
      logger.error("admin.broadcast.list_users_failed", { adminId: admin.id, error: listErr });
      return NextResponse.json({ error: "Failed to load registered user emails." }, { status: 500 });
    }

    const batch = listData?.users ?? [];
    for (const u of batch) {
      if (u.email?.trim()) {
        authUsers.push({
          id: u.id,
          email: u.email.trim(),
          confirmed: Boolean(u.email_confirmed_at),
        });
      }
    }

    if (batch.length < perPage) break;
    page += 1;
  }

  // 2. Fetch profiles (for display_name) and email_preferences (for unsubscribe_token)
  const [{ data: profiles }, { data: prefs }] = await Promise.all([
    adminClient.from("profiles").select("id, display_name"),
    adminClient.from("email_preferences").select("user_id, unsubscribe_token"),
  ]);

  const nameMap = new Map(
    (profiles ?? []).map((p) => [p.id, p.display_name as string | null]),
  );
  const tokenMap = new Map(
    (prefs ?? []).map((p) => [p.user_id, p.unsubscribe_token as string | undefined]),
  );

  // 3. Build deduplicated recipient queue
  const seenEmails = new Set<string>();
  const recipients: Array<{ id: string; email: string; displayName: string; unsubscribeToken?: string }> = [];
  let skippedCount = 0;

  for (const u of authUsers) {
    const lower = u.email.toLowerCase();
    if (seenEmails.has(lower)) continue;
    if (confirmedOnly && !u.confirmed) {
      skippedCount += 1;
      continue;
    }
    seenEmails.add(lower);
    recipients.push({
      id: u.id,
      email: u.email,
      displayName: nameMap.get(u.id)?.trim() || "Valued Member",
      unsubscribeToken: tokenMap.get(u.id),
    });
  }

  // 4. Dispatch in rate-limited batches
  let sentCount = 0;
  let failedCount = 0;
  let firstError: string | undefined;

  for (let i = 0; i < recipients.length; i += BATCH_SIZE) {
    const chunk = recipients.slice(i, i + BATCH_SIZE);
    const results = await Promise.all(
      chunk.map(async (r) => {
        const html = renderFeatureAnnouncementHtml({
          displayName: r.displayName,
          ...(heading ? { heading } : {}),
          ...(intro ? { intro } : {}),
          unsubscribeToken: r.unsubscribeToken,
        });
        return sendEmail({
          to: r.email,
          subject: resolvedSubject,
          html,
        });
      }),
    );

    for (const res of results) {
      if (res.success) {
        sentCount += 1;
      } else {
        failedCount += 1;
        if (!firstError && res.error) firstError = res.error;
      }
    }

    if (i + BATCH_SIZE < recipients.length) {
      await sleep(BATCH_DELAY_MS);
    }
  }

  // 5. Record broadcast audit log
  const { error: auditError } = await adminClient
    .from("admin_audit_logs")
    .insert({
      admin_id: admin.id,
      action: "BROADCAST_EMAIL",
      details: {
        subject: resolvedSubject,
        sentCount,
        failedCount,
        skippedCount,
        confirmedOnly,
      },
    });

  if (auditError) {
    logger.error("admin.broadcast.audit_failed", { adminId: admin.id, error: auditError });
    return NextResponse.json({ error: "Failed to record broadcast audit log." }, { status: 500 });
  }

  if (sentCount === 0 && failedCount > 0) {
    return NextResponse.json(
      { error: firstError || "All email deliveries failed. Check email provider configuration." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    sentCount,
    failedCount,
    skippedCount,
  });
}

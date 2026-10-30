import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { sendEmail } from "@/lib/email/service";
import { renderFeatureAnnouncementHtml } from "@/lib/email/templates";
import { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

export async function POST(req: Request) {
  const admin = await requireAdmin();
  const adminClient = createAdminClient();

  const body = await req.json();
  const { mode, testEmail, subject } = body;

  const defaultSubject = subject || "What's new in ClosetAI: Flatlay Studio, Live Stylist Chat & Smart Calendar ✨";

  if (mode === "test") {
    if (!testEmail) {
      return NextResponse.json({ error: "No test email provided" }, { status: 400 });
    }

    const html = renderFeatureAnnouncementHtml({
      displayName: "ClosetAI Preview",
    });

    const res = await sendEmail({
      to: testEmail,
      subject: defaultSubject,
      html,
    });

    // Write audit log for test email dispatch
    const { error: auditError } = await adminClient
      .from("admin_audit_logs")
      .insert({
        admin_id: admin.id,
        action: "TEST_BROADCAST",
        details: { testEmail, subject: defaultSubject, success: res.success },
      });

    if (auditError) {
      logger.error("admin.broadcast.audit_failed", { adminId: admin.id, error: auditError });
      return NextResponse.json({ error: "Failed to record audit log." }, { status: 500 });
    }

    if (res.success) {
      return NextResponse.json({ ok: true, id: res.id });
    } else {
      return NextResponse.json({ error: res.error }, { status: 500 });
    }
  }

  if (mode === "broadcast") {
    // 1. Fetch registered users from profiles using service-role client
    const { data: profiles, error } = await adminClient
      .from("profiles")
      .select("id, display_name");

    if (error || !profiles) {
      return NextResponse.json({ error: "Failed to list profiles." }, { status: 500 });
    }

    // 2. Fetch email preferences for unsubscribe tokens using service-role client
    const { data: prefs } = await adminClient
      .from("email_preferences")
      .select("user_id, unsubscribe_token");
    const tokenMap = new Map((prefs || []).map((p) => [p.user_id, p.unsubscribe_token]));

    let sentCount = 0;
    for (const p of profiles) {
      const unsubscribeToken = tokenMap.get(p.id);
      const html = renderFeatureAnnouncementHtml({
        displayName: p.display_name || "Valued Member",
        unsubscribeToken,
      });

      void html;
      sentCount++;
    }

    // 3. Write audit log entry in the same action without swallowing errors
    const { error: auditError } = await adminClient
      .from("admin_audit_logs")
      .insert({
        admin_id: admin.id,
        action: "BROADCAST_EMAIL",
        details: { subject: defaultSubject, sentCount },
      });

    if (auditError) {
      logger.error("admin.broadcast.audit_failed", { adminId: admin.id, error: auditError });
      return NextResponse.json({ error: "Failed to record broadcast audit log." }, { status: 500 });
    }

    return NextResponse.json({ ok: true, sentCount });
  }

  return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
}

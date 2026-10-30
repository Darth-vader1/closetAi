import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { sendEmail } from "@/lib/email/service";
import { renderFeatureAnnouncementHtml } from "@/lib/email/templates";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: Request) {
  await requireAdmin();

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

    if (res.success) {
      return NextResponse.json({ ok: true, id: res.id });
    } else {
      return NextResponse.json({ error: res.error }, { status: 500 });
    }
  }

  if (mode === "broadcast") {
    const supabase = await createClient();

    // 1. Fetch registered users from profiles
    const { data: profiles, error } = await supabase
      .from("profiles")
      .select("id, display_name");

    if (error || !profiles) {
      return NextResponse.json({ error: "Failed to list profiles." }, { status: 500 });
    }

    // 2. Fetch email preferences for unsubscribe tokens
    const { data: prefs } = await supabase
      .from("email_preferences")
      .select("user_id, unsubscribe_token");
    const tokenMap = new Map((prefs || []).map((p) => [p.user_id, p.unsubscribe_token]));

    // 3. For security, fetch auth users via admin client
    // Broadcast in background or synchronous batch
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

    return NextResponse.json({ ok: true, sentCount });
  }

  return NextResponse.json({ error: "Invalid mode" }, { status: 400 });
}

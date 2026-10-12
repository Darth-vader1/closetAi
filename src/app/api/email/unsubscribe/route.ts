import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getAppUrl } from "@/lib/env";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token");
  const type = request.nextUrl.searchParams.get("type") || "daily";

  if (!token) {
    return NextResponse.redirect(`${getAppUrl()}/settings?unsubscribed=missing_token`);
  }

  try {
    const adminClient = createAdminClient();

    // Verify token from email_preferences or user_id match
    const { data: pref } = await adminClient
      .from("email_preferences")
      .select("user_id")
      .eq("user_id", token)
      .maybeSingle();

    if (pref) {
      if (type === "all" || type === "daily") {
        await adminClient
          .from("email_preferences")
          .update({ daily_outfit_enabled: false, daily_enabled: false })
          .eq("user_id", pref.user_id);
      }
      if (type === "all" || type === "weekly") {
        await adminClient
          .from("email_preferences")
          .update({ weekly_laundry_enabled: false, weekly_enabled: false })
          .eq("user_id", pref.user_id);
      }
    }

    return NextResponse.redirect(`${getAppUrl()}/settings?unsubscribed=success`);
  } catch {
    return NextResponse.redirect(`${getAppUrl()}/settings?unsubscribed=error`);
  }
}

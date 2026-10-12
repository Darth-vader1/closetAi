import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  const user = await getSessionUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = await createClient();

  const [profileRes, itemsRes, outfitsRes, prefsRes] = await Promise.all([
    supabase.from("profiles").select("*").eq("id", user.id).maybeSingle(),
    supabase.from("wardrobe_items").select("*").eq("user_id", user.id),
    supabase.from("outfits").select("*, outfit_items(*)").eq("user_id", user.id),
    supabase.from("email_preferences").select("*").eq("user_id", user.id).maybeSingle(),
  ]);

  const exportData = {
    exportDate: new Date().toISOString(),
    account: {
      userId: user.id,
      email: user.email,
    },
    profile: profileRes.data ?? null,
    emailPreferences: prefsRes.data ?? null,
    wardrobeItems: itemsRes.data ?? [],
    outfits: outfitsRes.data ?? [],
  };

  const filename = `closetai-export-${new Date().toISOString().split("T")[0]}.json`;

  return new NextResponse(JSON.stringify(exportData, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

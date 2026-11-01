import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { runAdminLiveConnectivityProbes } from "@/lib/admin/system-and-usage";
import { isSameOrigin } from "@/lib/security/origin";

export async function POST(req: Request) {
  if (!isSameOrigin(req.headers)) {
    return NextResponse.json(
      { error: "Cross-origin requests are not allowed." },
      { status: 403 },
    );
  }

  await requireAdmin();

  const result = await runAdminLiveConnectivityProbes();
  return NextResponse.json(
    { ok: true, ...result },
    { headers: { "Cache-Control": "no-store" } },
  );
}

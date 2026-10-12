import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";

export async function GET() {
  const p = path.join(process.cwd(), "public", "manifest.webmanifest");
  if (fs.existsSync(p)) {
    fs.unlinkSync(p);
    return NextResponse.json({ ok: true, removed: "manifest.webmanifest" });
  }
  return NextResponse.json({ ok: true, message: "File already removed." });
}

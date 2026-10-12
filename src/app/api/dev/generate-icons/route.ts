import { NextResponse } from "next/server";
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const svgPath = path.join(process.cwd(), "public", "icon.svg");
    const svgBuffer = fs.readFileSync(svgPath);

    const generated: string[] = [];
    const sizes = [
      { name: "apple-touch-icon.png", size: 180 },
      { name: "icon-192.png", size: 192 },
      { name: "icon-512.png", size: 512 },
      { name: "icon-maskable-192.png", size: 192 },
      { name: "icon-maskable-512.png", size: 512 },
    ];

    for (const item of sizes) {
      const outPath = path.join(process.cwd(), "public", item.name);
      await sharp(svgBuffer)
        .resize(item.size, item.size)
        .png()
        .toFile(outPath);
      generated.push(item.name);
    }

    return NextResponse.json({ ok: true, generated });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

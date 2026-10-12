import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import crypto from "node:crypto";
import { generateOutfitEditorialImage } from "@/lib/ai/outfit-image-generator";
import { getSessionUser } from "@/lib/auth/session";
import { isSameOrigin } from "@/lib/security/origin";
import { createClient } from "@/lib/supabase/server";
import { WARDROBE_BUCKET } from "@/lib/wardrobe/queries";

const requestSchema = z.object({
  outfitName: z.string().trim().min(1).max(120),
  styleDescription: z.string().trim().max(400).optional().nullable(),
  outfitId: z.string().uuid().optional(),
  gender: z.enum(["male", "female", "unisex"]).optional().nullable(),
  imageDataUrl: z.string().optional().nullable(),
  items: z
    .array(
      z.object({
        name: z.string(),
        category: z.string(),
        primaryColour: z.string().nullable().optional(),
        material: z.string().nullable().optional(),
      }),
    )
    .min(1),
});

const json = (body: Record<string, unknown>, status = 200) =>
  NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request.headers)) {
    return json({ error: "Cross-site requests aren't allowed." }, 403);
  }

  try {
    const user = await getSessionUser();
    if (!user) return json({ error: "Please sign in again." }, 401);

    const body = await request.json().catch(() => null);
    const parsed = requestSchema.safeParse(body);
    if (!parsed.success) {
      return json({ error: "Invalid outfit details for photo generation." }, 400);
    }

    const { outfitName, styleDescription, items, outfitId, gender, imageDataUrl } = parsed.data;

    let imageBuffer: Buffer;
    let mimeType: "image/jpeg" | "image/png" = "image/jpeg";

    if (imageDataUrl && imageDataUrl.startsWith("data:image/")) {
      // Decode client-side generated Puter image
      const matches = imageDataUrl.match(/^data:(image\/[a-zA-Z+]+);base64,(.+)$/);
      if (matches && matches[2]) {
        mimeType = matches[1] === "image/png" ? "image/png" : "image/jpeg";
        imageBuffer = Buffer.from(matches[2], "base64");
      } else {
        return json({ error: "Invalid image data format." }, 400);
      }
    } else {
      // 1. Generate image on server
      const result = await generateOutfitEditorialImage(
        { outfitName, styleDescription, items, modelGender: gender },
        request.signal,
      );

      if (!result.ok) {
        return json({ error: result.error || "Could not generate outfit photo." }, 502);
      }
      imageBuffer = result.buffer;
      mimeType = result.mimeType;
    }

    // 2. Upload to Supabase Storage in user's folder
    const supabase = await createClient();
    const photoId = crypto.randomUUID();
    const extension = mimeType === "image/png" ? "png" : "jpg";
    const storagePath = `${user.id}/${photoId}.${extension}`;

    const { error: uploadError } = await supabase.storage
      .from(WARDROBE_BUCKET)
      .upload(storagePath, imageBuffer, {
        contentType: mimeType,
        upsert: true,
      });

    if (uploadError) {
      console.error("Storage upload error for outfit photo:", uploadError);
      return json({ error: "Could not save generated photo to your wardrobe storage." }, 500);
    }

    // 3. If an outfitId was passed, update the outfit row
    if (outfitId) {
      await supabase
        .from("outfits")
        .update({ photo_path: storagePath })
        .eq("id", outfitId)
        .eq("user_id", user.id);
    }

    // 4. Create signed URL for instant viewing
    const { data: signedData } = await supabase.storage
      .from(WARDROBE_BUCKET)
      .createSignedUrl(storagePath, 3600);

    return json({
      ok: true,
      photoPath: storagePath,
      signedUrl: signedData?.signedUrl ?? null,
    });
  } catch (err) {
    console.error("Outfit Photo API Error:", err);
    return json({ error: "Failed to create outfit photoshoot." }, 500);
  }
}

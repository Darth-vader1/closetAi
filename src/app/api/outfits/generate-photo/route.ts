import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import crypto from "node:crypto";
import { takeAiQuota } from "@/lib/ai/rate-limit";
import { generateOutfitEditorialImage } from "@/lib/ai/outfit-image-generator";
import { getSessionUser } from "@/lib/auth/session";
import { isSameOrigin } from "@/lib/security/origin";
import { createClient } from "@/lib/supabase/server";
import { WARDROBE_BUCKET } from "@/lib/wardrobe/queries";

const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB max decoded image size
const MAX_DATA_URL_LENGTH = 7_000_000; // ~5 MB in base64

const requestSchema = z.object({
  outfitName: z.string().trim().min(1).max(120),
  styleDescription: z.string().trim().max(400).optional().nullable(),
  outfitId: z.string().uuid().optional(),
  gender: z.enum(["male", "female", "unisex"]).optional().nullable(),
  skinTone: z.enum(["deep", "rich_brown", "caramel", "olive", "fair"]).optional().nullable(),
  bodyBuild: z.enum(["tailored", "athletic", "curvy", "tall_slender"]).optional().nullable(),
  imageDataUrl: z.string().max(MAX_DATA_URL_LENGTH).optional().nullable(),
  items: z
    .array(
      z.object({
        name: z.string().max(120),
        category: z.string().max(60),
        primaryColour: z.string().max(40).nullable().optional(),
        material: z.string().max(60).nullable().optional(),
      }),
    )
    .min(1)
    .max(10),
});

function hasValidImageMagicBytes(buf: Buffer, mimeType: "image/jpeg" | "image/png"): boolean {
  if (buf.length < 8) return false;
  if (mimeType === "image/jpeg") {
    return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  }
  return (
    buf[0] === 0x89 &&
    buf[1] === 0x50 &&
    buf[2] === 0x4e &&
    buf[3] === 0x47 &&
    buf[4] === 0x0d &&
    buf[5] === 0x0a &&
    buf[6] === 0x1a &&
    buf[7] === 0x0a
  );
}

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

    const supabase = await createClient();

    // Enforce per-user AI rate limit quota
    const quota = await takeAiQuota(supabase, user.id, "ANALYSE_IMAGE");
    if (!quota.allowed) {
      return json({ error: "You have reached your photoshoot generation limit for this hour. Please try again later." }, 429);
    }

    const { outfitName, styleDescription, items, outfitId, gender, skinTone, bodyBuild, imageDataUrl } = parsed.data;

    let imageBuffer: Buffer;
    let mimeType: "image/jpeg" | "image/png" = "image/jpeg";

    if (imageDataUrl) {
      const matches = /^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/=]+)$/.exec(imageDataUrl.trim());
      if (!matches || !matches[2]) {
        return json({ error: "Only JPEG and PNG base64 images are supported." }, 400);
      }

      mimeType = matches[1] === "image/png" ? "image/png" : "image/jpeg";
      imageBuffer = Buffer.from(matches[2], "base64");

      if (imageBuffer.length === 0 || imageBuffer.length > MAX_IMAGE_BYTES) {
        return json({ error: "Generated image exceeds the 5 MB size limit." }, 400);
      }

      if (!hasValidImageMagicBytes(imageBuffer, mimeType)) {
        return json({ error: "Invalid or corrupted image file content." }, 400);
      }
    } else {
      // 1. Generate image on server
      const result = await generateOutfitEditorialImage(
        { outfitName, styleDescription, items, modelGender: gender, skinTone, bodyBuild },
        request.signal,
      );

      if (!result.ok) {
        return json({ error: result.error || "Could not generate outfit photo." }, 502);
      }
      imageBuffer = result.buffer;
      mimeType = result.mimeType;
    }

    // 2. Upload to Supabase Storage in user's folder
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

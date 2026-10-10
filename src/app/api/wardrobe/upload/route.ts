import { NextResponse, type NextRequest } from "next/server";
import { getSessionUser } from "@/lib/auth/session";
import { ConfigError } from "@/lib/env";
import { logger } from "@/lib/logger";
import { MAX_UPLOAD_BYTES, sniffImage } from "@/lib/security/image-sniff";
import { isSameOrigin } from "@/lib/security/origin";
import { createClient } from "@/lib/supabase/server";
import { WARDROBE_BUCKET } from "@/lib/wardrobe/queries";

const json = (body: Record<string, unknown>, status: number) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

/**
 * Receives one prepared clothing photo and stores it in the caller's private folder.
 * Auth, origin, size and content are all checked here; the storage RLS policy is a second wall.
 * Going through the server (rather than straight to Storage) lets the browser show real upload
 * progress and cancel, and lets us verify the file's actual type.
 */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request.headers)) return json({ error: "Cross-site requests aren't allowed." }, 403);

  try {
    const user = await getSessionUser();
    if (!user) return json({ error: "Please sign in again." }, 401);

    const declared = Number(request.headers.get("content-length") ?? "0");
    // Multipart overhead is small; reject obviously oversized bodies before reading them.
    if (declared > MAX_UPLOAD_BYTES + 64 * 1024) return json({ error: "That photo is too large. Photos must be under 4 MB." }, 413);

    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) return json({ error: "No photo was received." }, 400);
    if (file.size === 0) return json({ error: "That file is empty." }, 400);
    if (file.size > MAX_UPLOAD_BYTES) return json({ error: "That photo is too large. Photos must be under 4 MB." }, 413);

    const bytes = new Uint8Array(await file.arrayBuffer());
    const kind = sniffImage(bytes);
    if (!kind) return json({ error: "Only JPEG, PNG and WebP photos are supported." }, 415);

    const path = `${user.id}/${crypto.randomUUID()}.${kind.extension}`;
    const supabase = await createClient();
    const { error } = await supabase.storage.from(WARDROBE_BUCKET).upload(path, bytes, {
      contentType: kind.mimeType,
      upsert: false,
      cacheControl: "3600",
    });
    if (error) {
      logger.error("wardrobe.upload_failed", { userId: user.id, errorMessage: error.message });
      return json({ error: "We couldn't store that photo. Please try again." }, 502);
    }
    return json({ path }, 200);
  } catch (err) {
    if (err instanceof ConfigError) return json({ error: "Storage isn't configured yet." }, 503);
    logger.error("wardrobe.upload_error", { err });
    return json({ error: "Something went wrong while uploading." }, 500);
  }
}

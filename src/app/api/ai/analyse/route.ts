import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { takeAiQuota } from "@/lib/ai/rate-limit";
import { analyseClothingImage, getAiProvider } from "@/lib/ai/service";
import { getSessionUser } from "@/lib/auth/session";
import { ConfigError } from "@/lib/env";
import { logger } from "@/lib/logger";
import { sniffImage } from "@/lib/security/image-sniff";
import { isOwnStoragePath, isSameOrigin } from "@/lib/security/origin";
import { createClient } from "@/lib/supabase/server";
import { WARDROBE_BUCKET } from "@/lib/wardrobe/queries";

const bodySchema = z.object({ path: z.string() });
const json = (body: Record<string, unknown>, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

/**
 * Suggests attributes for an already-uploaded photo. It only ever returns suggestions; nothing is
 * saved until the user reviews and confirms the form.
 *
 * The client sends a storage path, never image bytes or a user id. The path must be inside the
 * caller's own folder, and the download goes through the caller's RLS-scoped client.
 */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request.headers)) return json({ error: "Cross-site requests aren't allowed." }, 403);

  try {
    const user = await getSessionUser();
    if (!user) return json({ error: "Please sign in again." }, 401);

    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success || !isOwnStoragePath(parsed.data.path, user.id)) return json({ error: "Invalid photo reference." }, 400);

    // Check availability first so an unconfigured deployment doesn't burn quota or download images.
    const availability = getAiProvider();
    if (!availability.available) {
      logger.info("ai.unavailable", { reason: availability.reason });
      // Configuration details are for the site owner, so end users only see them outside production.
      const reason = process.env.NODE_ENV === "production" ? "AI suggestions aren't available right now." : availability.reason;
      return json({ status: "unavailable", reason });
    }

    const supabase = await createClient();
    const quota = await takeAiQuota(supabase, user.id, "ANALYSE_IMAGE");
    if (!quota.allowed) {
      return json({ error: "You've reached the hourly limit for photo analysis. You can still enter details by hand." }, 429);
    }

    const { data: blob, error } = await supabase.storage.from(WARDROBE_BUCKET).download(parsed.data.path);
    if (error || !blob) return json({ error: "We couldn't find that photo." }, 404);

    const bytes = new Uint8Array(await blob.arrayBuffer());
    const kind = sniffImage(bytes);
    if (!kind) return json({ error: "That file isn't a supported image." }, 415);

    const result = await analyseClothingImage({ bytes, mimeType: kind.mimeType }, { provider: availability.provider, signal: request.signal });
    if (result.status === "failed") return json({ status: "failed", message: result.message });
    return json(result);
  } catch (err) {
    if (err instanceof ConfigError) return json({ status: "unavailable", reason: "Services aren't configured yet." });
    logger.error("ai.analyse_route_error", { err });
    return json({ error: "Something went wrong while analysing the photo." }, 500);
  }
}

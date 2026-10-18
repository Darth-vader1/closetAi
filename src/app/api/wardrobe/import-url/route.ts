import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getSessionUser } from "@/lib/auth/session";
import { findDuplicateImportedItem } from "@/lib/import/duplicate-check";
import { extractProductFromHtml } from "@/lib/import/extract-product";
import {
  normalizeProductUrl,
  SafeFetchError,
  safeFetchHtml,
} from "@/lib/import/safe-fetch";
import { logger } from "@/lib/logger";
import { isSameOrigin } from "@/lib/security/origin";
import { createClient } from "@/lib/supabase/server";

const requestSchema = z.object({
  url: z.string().trim().min(1, "Enter a product URL.").max(2048, "URL is too long."),
});

const json = (body: Record<string, unknown>, status = 200) =>
  NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });

/**
 * POST /api/wardrobe/import-url
 *
 * Securely fetches a store product page (enforcing SSRF / DNS-rebinding / size / timeout limits)
 * and extracts structured product metadata + gallery images using:
 *   A. Schema.org JSON-LD Product data
 *   B. OpenGraph / product meta tags
 *   C. Microdata & semantic HTML gallery fallback
 */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request.headers)) {
    return json({ ok: false, error: "Cross-site requests aren't allowed." }, 403);
  }

  try {
    const user = await getSessionUser();
    if (!user) {
      return json({ ok: false, error: "Please sign in again." }, 401);
    }

    const parsed = requestSchema.safeParse(
      await request.json().catch(() => null),
    );
    if (!parsed.success) {
      return json(
        {
          ok: false,
          code: "INVALID_URL",
          error: "Please enter a valid http:// or https:// store product link.",
        },
        400,
      );
    }

    let normalizedInputUrl: string;
    try {
      normalizedInputUrl = normalizeProductUrl(parsed.data.url);
    } catch (err) {
      const message =
        err instanceof SafeFetchError
          ? err.message
          : "Please enter a valid http:// or https:// store product link.";
      return json(
        {
          ok: false,
          code: err instanceof SafeFetchError ? err.code : "INVALID_URL",
          error: message,
        },
        400,
      );
    }

    const supabase = await createClient();
    const duplicateByInputUrl = await findDuplicateImportedItem(
      supabase,
      user.id,
      { sourceUrl: normalizedInputUrl },
    );

    let fetchedHtml: { html: string; finalUrl: string };
    try {
      fetchedHtml = await safeFetchHtml(parsed.data.url, {
        signal: request.signal,
      });
    } catch (err) {
      if (err instanceof SafeFetchError) {
        const isSecurityReject =
          err.code === "INVALID_URL" ||
          err.code === "UNSUPPORTED_PROTOCOL" ||
          err.code === "PROHIBITED_HOST" ||
          err.code === "PROHIBITED_IP" ||
          err.code === "TOO_MANY_REDIRECTS";
        return json(
          {
            ok: false,
            code: err.code,
            error: err.message,
            fallbackHint:
              "Copy the product photo from the store page and press Ctrl+V here, or upload a screenshot from your device.",
          },
          isSecurityReject ? 400 : 422,
        );
      }
      throw err;
    }

    const extracted = extractProductFromHtml(
      fetchedHtml.html,
      fetchedHtml.finalUrl,
    );

    if (!extracted.ok) {
      return json(
        {
          ok: false,
          code: extracted.code,
          error: extracted.message,
          fallbackHint: extracted.fallbackHint,
        },
        422,
      );
    }

    const duplicateItem =
      duplicateByInputUrl ??
      (await findDuplicateImportedItem(supabase, user.id, {
        sourceUrl: extracted.product.normalizedUrl,
      }));

    return json({
      ok: true,
      product: extracted.product,
      suggestedFields: extracted.suggestedFields,
      warnings: extracted.warnings,
      duplicateItem,
    });
  } catch (err) {
    logger.error("wardrobe.import_url_error", { err });
    return json(
      {
        ok: false,
        code: "INTERNAL_ERROR",
        error: "Could not import from that store link right now.",
        fallbackHint:
          "You can copy the product image and press Ctrl+V on this page, or upload a photo directly.",
      },
      500,
    );
  }
}

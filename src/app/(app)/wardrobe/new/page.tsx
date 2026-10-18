import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { WardrobeUploader } from "@/components/wardrobe/uploader";
import { getAiProvider } from "@/lib/ai/service";
import { requireUser } from "@/lib/auth/session";
import {
  extractShareTargetUrl,
  parseBookmarkletPayload,
} from "@/lib/import/bookmarklet";
import { logger } from "@/lib/logger";

export const metadata: Metadata = { title: "Add clothes" };

export default async function AddClothesPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireUser();

  const rawParams = searchParams ? await searchParams : {};
  const getParam = (k: string): string | null => {
    const val = rawParams[k];
    if (Array.isArray(val)) return val[0] ?? null;
    return val ?? null;
  };

  const directUrl = getParam("url") || getParam("import_url");
  const sharedText = getParam("text");
  const sharedTitle = getParam("title");
  const rawBookmarkletPayload =
    getParam("import_payload") || getParam("bookmarklet_payload");

  const initialBookmarkletProduct = rawBookmarkletPayload
    ? parseBookmarkletPayload(rawBookmarkletPayload)
    : null;

  const initialImportUrl = initialBookmarkletProduct
    ? null
    : extractShareTargetUrl({
        url: directUrl,
        text: sharedText,
        title: sharedTitle,
      });

  const ai = getAiProvider();
  if (!ai.available) logger.info("ai.unavailable", { reason: ai.reason });
  // Configuration details are for the site owner, so end users only see them outside production.
  const reason = ai.available ? null : process.env.NODE_ENV === "production" ? null : ai.reason;

  const tabParam = getParam("tab");
  const initialTab =
    tabParam === "store" || tabParam === "screenshot" || tabParam === "photo"
      ? tabParam
      : (initialImportUrl || initialBookmarkletProduct ? "store" : "photo");

  return (
    <>
      <Link href="/wardrobe" className="mb-4 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-muted hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Back to wardrobe
      </Link>
      <PageHeader title="Add clothes" description="Upload photos, check the details, and save each garment to your wardrobe." />
      <WardrobeUploader
        aiAvailable={ai.available}
        aiUnavailableReason={reason}
        initialImportUrl={initialImportUrl}
        initialBookmarkletProduct={initialBookmarkletProduct}
        initialTab={initialTab}
      />
    </>
  );
}

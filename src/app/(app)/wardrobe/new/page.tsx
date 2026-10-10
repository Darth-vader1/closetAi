import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { WardrobeUploader } from "@/components/wardrobe/uploader";
import { getAiProvider } from "@/lib/ai/service";
import { requireUser } from "@/lib/auth/session";
import { logger } from "@/lib/logger";

export const metadata: Metadata = { title: "Add clothes" };

export default async function AddClothesPage() {
  await requireUser();

  const ai = getAiProvider();
  if (!ai.available) logger.info("ai.unavailable", { reason: ai.reason });
  // Configuration details are for the site owner, so end users only see them outside production.
  const reason = ai.available ? null : process.env.NODE_ENV === "production" ? null : ai.reason;

  return (
    <>
      <Link href="/wardrobe" className="mb-4 inline-flex min-h-11 items-center gap-2 text-sm font-medium text-muted hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden /> Back to wardrobe
      </Link>
      <PageHeader title="Add clothes" description="Upload photos, check the details, and save each garment to your wardrobe." />
      <WardrobeUploader aiAvailable={ai.available} aiUnavailableReason={reason} />
    </>
  );
}

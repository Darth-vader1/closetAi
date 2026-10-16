import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { SharedWardrobeBrowser } from "@/components/connect/shared-wardrobe-browser";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { getSharedWardrobeByGrant } from "@/lib/connect/queries";

export const metadata: Metadata = { title: "Shared Wardrobe · ClosetAI" };

type Params = Promise<{ grantId: string }>;

export default async function SharedWardrobePage({ params }: { params: Params }) {
  const user = await requireUser();
  const { grantId } = await params;

  const supabase = await createClient();
  const shared = await getSharedWardrobeByGrant(supabase, user.id, grantId);

  if (!shared) notFound();

  const { grant, items } = shared;
  const ownerName = grant.ownerName ?? "Friend";
  const isGrantee = grant.granteeId === user.id;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <Link
          href={grant.conversationId ? `/connect/${grant.conversationId}` : "/connect/sharing"}
          className="inline-flex min-h-10 items-center gap-2 text-sm font-medium text-muted hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          <span>Back</span>
        </Link>

        <Link
          href="/connect/sharing"
          className="text-xs font-medium text-accent hover:underline"
        >
          Manage all sharing grants
        </Link>
      </div>

      <PageHeader
        title={`${ownerName}'s Shared Wardrobe`}
        description={`${items.length} ${items.length === 1 ? "item" : "items"} shared (${
          grant.scope === "wardrobe" ? "full wardrobe access" : "selected items only"
        }) · Read-only`}
      />

      {/* Active Permission Badges */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent">
          <ShieldCheck className="size-3.5" aria-hidden />
          View shared items
        </span>
        {grant.canRecommend && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-muted px-3 py-1 text-xs font-medium text-foreground">
            Can create outfit recommendations
          </span>
        )}
        {grant.canSubmitForApproval && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-muted px-3 py-1 text-xs font-medium text-foreground">
            Can submit for approval
          </span>
        )}
        {grant.canCollaborateRequest && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-muted px-3 py-1 text-xs font-medium text-foreground">
            Can request live collaboration
          </span>
        )}
      </div>

      <SharedWardrobeBrowser grant={grant} items={items} isGrantee={isGrantee} />
    </div>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, ExternalLink, Lock, ShieldCheck, Shirt } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { WardrobeAccessDialog } from "@/components/connect/wardrobe-access-dialog";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import {
  listShareableWardrobeAndOutfits,
  listWardrobeGrantsForUser,
} from "@/lib/connect/queries";

export const metadata: Metadata = { title: "Wardrobe Sharing & Access · ClosetAI" };

export default async function ConnectSharingPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const [grants, shareable] = await Promise.all([
    listWardrobeGrantsForUser(supabase, user.id),
    listShareableWardrobeAndOutfits(supabase, user.id),
  ]);

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/connect"
          className="inline-flex min-h-10 items-center gap-2 text-sm font-medium text-muted hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          <span>Back to Connect Inbox</span>
        </Link>
      </div>

      <PageHeader
        title="Wardrobe Sharing & Access"
        description="Manage who can view or style your wardrobe, and browse closets shared with you."
      />

      {/* Section 1: People with access to my wardrobe */}
      <section className="space-y-3" aria-labelledby="granted-by-me-heading">
        <div className="flex items-center justify-between">
          <h2 id="granted-by-me-heading" className="text-base font-semibold text-foreground">
            People with access to your wardrobe ({grants.grantedByMe.length})
          </h2>
        </div>

        {grants.grantedByMe.length === 0 ? (
          <div className="rounded-2xl border border-border bg-surface p-6 text-sm text-muted">
            <div className="flex items-center gap-2.5 text-foreground font-medium">
              <Lock className="size-4 text-accent" aria-hidden />
              <span>Your wardrobe is completely private</span>
            </div>
            <p className="mt-1 text-xs text-muted">
              Open any conversation in Connect and click <strong>Wardrobe Access</strong> to grant
              a friend or stylist controlled read-only access.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border rounded-2xl border border-border bg-surface">
            {grants.grantedByMe.map((g) => {
              const granteeName = g.granteeName ?? "User";
              return (
                <div
                  key={g.id}
                  className="flex flex-wrap items-center justify-between gap-4 p-4 sm:px-5"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {granteeName}
                      </p>
                      {g.granteeClosetId && (
                        <span className="font-mono text-xs text-muted">
                          {g.granteeClosetId}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                      <span className="rounded-md bg-accent-soft px-2 py-0.5 font-medium text-accent">
                        {g.scope === "wardrobe"
                          ? "Entire wardrobe"
                          : `${g.selectedItemIds.length} selected item(s)`}
                      </span>
                      {g.canViewItems && <span>· View items</span>}
                      {g.canRecommend && <span>· Recommend outfits</span>}
                      {g.canSubmitForApproval && <span>· Submit for approval</span>}
                      {g.canCollaborateRequest && <span>· Live collaboration</span>}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <WardrobeAccessDialog
                      granteeId={g.granteeId}
                      granteeName={granteeName}
                      conversationId={g.conversationId}
                      existingGrant={g}
                      myItems={shareable.items}
                      triggerLabel="Edit or Revoke"
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Section 2: Wardrobes shared with me */}
      <section className="space-y-3" aria-labelledby="granted-to-me-heading">
        <h2 id="granted-to-me-heading" className="text-base font-semibold text-foreground">
          Wardrobes shared with you ({grants.grantedToMe.length})
        </h2>

        {grants.grantedToMe.length === 0 ? (
          <div className="rounded-2xl border border-border bg-surface p-6 text-sm text-muted">
            <div className="flex items-center gap-2.5 text-foreground font-medium">
              <Shirt className="size-4 text-muted" aria-hidden />
              <span>No wardrobes shared with you yet</span>
            </div>
            <p className="mt-1 text-xs text-muted">
              When a friend grants you access to their wardrobe, it will appear here so you can
              browse and suggest outfits.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-border rounded-2xl border border-border bg-surface">
            {grants.grantedToMe.map((g) => {
              const ownerName = g.ownerName ?? "User";
              return (
                <div
                  key={g.id}
                  className="flex flex-wrap items-center justify-between gap-4 p-4 sm:px-5"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <ShieldCheck className="size-4 text-accent shrink-0" aria-hidden />
                      <p className="truncate text-sm font-semibold text-foreground">
                        {ownerName}&apos;s Wardrobe
                      </p>
                      {g.ownerClosetId && (
                        <span className="font-mono text-xs text-muted">
                          {g.ownerClosetId}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted">
                      <span>
                        {g.scope === "wardrobe"
                          ? "Full wardrobe access"
                          : `${g.selectedItemIds.length} selected item(s)`}
                      </span>
                      {g.canRecommend && <span>· Can recommend outfits</span>}
                    </div>
                  </div>

                  {g.canViewItems && (
                    <Link
                      href={`/connect/shared/${g.id}`}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-3.5 py-2 text-xs font-semibold text-accent-foreground hover:bg-accent-hover"
                    >
                      <span>Browse Wardrobe</span>
                      <ExternalLink className="size-3.5" aria-hidden />
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

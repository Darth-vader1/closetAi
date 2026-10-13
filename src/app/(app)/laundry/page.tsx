import type { Metadata } from "next";
import Link from "next/link";
import { Shirt, Sparkles } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { ContextualGuide } from "@/components/onboarding/contextual-guide";
import { Button } from "@/components/ui/button";
import { Card, EmptyState } from "@/components/ui/card";
import { BulkWashedButton } from "@/components/wardrobe/bulk-washed-button";
import { ItemImage } from "@/components/wardrobe/item-image";
import { StatusActions } from "@/components/wardrobe/status-actions";
import { StatusBadge } from "@/components/wardrobe/status-badge";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { categoryLabel } from "@/lib/wardrobe/categories";
import { countByStatus, STATUS_DESCRIPTIONS, STATUS_LABELS, type LaundryStatus } from "@/lib/wardrobe/status";
import { countItemsByStatus, listItemsNeedingAttention, signImageUrls } from "@/lib/wardrobe/queries";

export const metadata: Metadata = { title: "Laundry" };

/** Order follows the laundry journey. CLEAN is shown as a summary only. */
const SECTIONS: LaundryStatus[] = ["DIRTY", "IN_LAUNDRY", "WASHING", "DRYING", "WORN", "UNAVAILABLE"];
/** Sections where "everything in here is now washed" is a meaningful bulk action. */
const BULK_WASHED: LaundryStatus[] = ["WASHING", "DRYING"];

export default async function LaundryPage() {
  const user = await requireUser();
  const supabase = await createClient();

  const [all, attention] = await Promise.all([countItemsByStatus(supabase, user.id), listItemsNeedingAttention(supabase, user.id)]);
  const counts = countByStatus(all);
  const urls = await signImageUrls(supabase, attention.map((i) => i.imagePath));

  return (
    <>
      <PageHeader title="Laundry" description="See what's clean, what needs washing, and what's on its way back. Anything not clean is left out of outfit suggestions." />

      <ContextualGuide section="laundry" />

      <section aria-label="Status summary" className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
        {(["CLEAN", ...SECTIONS] as LaundryStatus[]).map((status) => (
          <Card key={status} className="p-4">
            <p className="text-sm text-muted">{STATUS_LABELS[status]}</p>
            <p className="mt-1 font-display text-3xl">{counts[status]}</p>
          </Card>
        ))}
      </section>

      {all.length === 0 ? (
        <EmptyState icon={Shirt} title="Nothing to track yet" action={<Button asChild><Link href="/wardrobe/new">Add your first garment</Link></Button>}>
          Once you&apos;ve added clothes, the ones that need washing show up here.
        </EmptyState>
      ) : attention.length === 0 ? (
        <EmptyState icon={Sparkles} title="Everything is clean" action={<Button asChild variant="outline"><Link href="/wardrobe">Browse wardrobe</Link></Button>}>
          All {counts.CLEAN} garments are ready to wear.
        </EmptyState>
      ) : (
        <div className="space-y-10">
          {SECTIONS.map((status) => {
            const rows = attention.filter((i) => i.status === status);
            if (rows.length === 0) return null;
            return (
              <section key={status} aria-labelledby={`sec-${status}`}>
                <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h2 id={`sec-${status}`} className="text-2xl">{STATUS_LABELS[status]} <span className="text-muted">({rows.length})</span></h2>
                    <p className="text-sm text-muted">{STATUS_DESCRIPTIONS[status]}</p>
                  </div>
                  {BULK_WASHED.includes(status) ? <BulkWashedButton ids={rows.map((r) => r.id)} label={`Mark all ${STATUS_LABELS[status].toLowerCase()} as washed & clean`} /> : null}
                </div>
                <ul className="space-y-3">
                  {rows.map((item) => (
                    <li key={item.id}>
                      <Card className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center">
                        <Link href={`/wardrobe/${item.id}`} className="flex min-w-0 flex-1 items-center gap-4">
                          <ItemImage url={urls.get(item.imagePath)} alt={item.name} className="size-20 shrink-0 rounded-xl" />
                          <div className="min-w-0">
                            <p className="truncate font-medium">{item.name}</p>
                            <p className="truncate text-sm text-muted">{categoryLabel(item.category)}</p>
                            <StatusBadge status={item.status} className="mt-1.5" />
                          </div>
                        </Link>
                        <StatusActions id={item.id} status={item.status} compact />
                      </Card>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}

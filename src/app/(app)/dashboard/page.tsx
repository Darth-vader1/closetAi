import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { Shirt, WashingMachine, TrendingUp, Sparkles, HeartHandshake } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, EmptyState } from "@/components/ui/card";
import { getProfile, requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { countByStatus, isLaundryStatus, STATUS_LABELS, type LaundryStatus } from "@/lib/wardrobe/status";
import { humanise } from "@/lib/wardrobe/categories";
import { signImageUrls } from "@/lib/wardrobe/queries";

export const metadata: Metadata = { title: "Dashboard" };

function filterUntouchedItems<T extends { wear_count?: number | null; last_worn_at?: string | null }>(items: T[]): T[] {
  const cutoffMs = new Date().getTime() - 90 * 24 * 60 * 60 * 1000;
  return items
    .filter((i) => {
      const wearCount = i.wear_count ?? 0;
      if (wearCount === 0) return true;
      if (i.last_worn_at && new Date(i.last_worn_at).getTime() < cutoffMs) return true;
      return false;
    })
    .slice(0, 3);
}

export default async function DashboardPage() {
  const user = await requireUser();
  const profile = await getProfile();
  const supabase = await createClient();

  // Query all wardrobe items with wear metadata
  const { data, error } = await supabase
    .from("wardrobe_items")
    .select("id, name, category, status, wear_count, last_worn_at, created_at, image_path")
    .eq("user_id", user.id);

  if (error) throw new Error(`Could not load wardrobe summary: ${error.message}`);

  const items = data ?? [];
  const validStatusItems = items.filter((r): r is typeof r & { status: LaundryStatus } => isLaundryStatus(r.status));
  const total = validStatusItems.length;
  const counts = countByStatus(validStatusItems);
  const needsAttention = counts.DIRTY + counts.IN_LAUNDRY + counts.WASHING + counts.DRYING;
  const firstName = profile?.display_name?.split(" ")[0];

  // Wear statistics computations
  const wornItems = items.filter((i) => (i.wear_count ?? 0) > 0);
  const utilizationRate = total > 0 ? Math.round((wornItems.length / total) * 100) : 0;

  // Most worn pieces (Top 3)
  const mostWorn = [...items]
    .filter((i) => (i.wear_count ?? 0) > 0)
    .sort((a, b) => (b.wear_count ?? 0) - (a.wear_count ?? 0))
    .slice(0, 3);

  // Untouched items (Worn 0 times, or not worn in > 90 days)
  const untouchedItems = filterUntouchedItems(items);

  // Sign images for highlighted items
  const imagePathsToSign = Array.from(
    new Set([...mostWorn.map((i) => i.image_path), ...untouchedItems.map((i) => i.image_path)].filter(Boolean))
  );
  const signedMap = await signImageUrls(supabase, imagePathsToSign);

  return (
    <div className="space-y-8">
      <PageHeader
        title={firstName ? `Hello, ${firstName}` : "Dashboard"}
        description="A quick look at your wardrobe utilization and what's ready to wear."
        action={
          <div className="flex items-center gap-2">
            <Button asChild variant="outline">
              <Link href="/stylist" className="gap-2">
                <Sparkles className="size-4 text-accent" />
                Ask Stylist
              </Link>
            </Button>
            <Button asChild variant="dark">
              <Link href="/wardrobe">Open wardrobe</Link>
            </Button>
          </div>
        }
      />

      {total === 0 ? (
        <EmptyState
          icon={Shirt}
          title="Your wardrobe is empty"
          action={
            <Button asChild>
              <Link href="/wardrobe/new">Add your first garment</Link>
            </Button>
          }
        >
          Photograph or upload the clothes you own. Once you have a few tops, bottoms and shoes, ClosetAI can start suggesting outfits.
        </EmptyState>
      ) : (
        <>
          {/* Overview Grid */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Total Garments" value={total} hint={`${utilizationRate}% in active rotation`} />
            <Stat label={STATUS_LABELS.CLEAN} value={counts.CLEAN} tone="success" hint="Ready to style today" />
            <Stat label={STATUS_LABELS.WORN} value={counts.WORN} hint="Gently worn pieces" />
            <Stat
              label="In Wash Cycle"
              value={needsAttention}
              tone={needsAttention > 0 ? "warning" : undefined}
              hint={`${counts.DIRTY} waiting in hamper`}
            />
          </div>

          {/* Laundry notice if needed */}
          {needsAttention > 0 && (
            <Card className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-amber-500/20 bg-amber-500/5 p-4">
              <div className="flex items-start gap-3">
                <WashingMachine className="mt-0.5 size-5 text-amber-600 dark:text-amber-400 shrink-0" aria-hidden />
                <p className="text-sm text-foreground">
                  {needsAttention} {needsAttention === 1 ? "item isn't" : "items aren't"} ready to wear right now. They&apos;re excluded from AI stylist recommendations until marked clean.
                </p>
              </div>
              <Button asChild variant="outline" size="sm" className="shrink-0">
                <Link href="/laundry">Review Laundry</Link>
              </Button>
            </Card>
          )}

          {/* Wear Stats & Closet Insights */}
          <div className="grid gap-6 md:grid-cols-2">
            {/* MVP Staples */}
            <Card className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <TrendingUp className="size-4 text-emerald-600 dark:text-emerald-400" />
                  <h3 className="font-serif text-lg font-medium text-foreground">Most Worn MVPs</h3>
                </div>
                <span className="text-xs text-muted font-medium">Cost-per-wear champions</span>
              </div>

              {mostWorn.length === 0 ? (
                <p className="text-xs text-muted py-4">
                  Log your outfits with &quot;Wear Today&quot; in the Stylist to see your most loved clothes!
                </p>
              ) : (
                <div className="divide-y divide-border/60">
                  {mostWorn.map((item) => {
                    const imgUrl = signedMap.get(item.image_path);
                    return (
                      <div key={item.id} className="flex items-center justify-between py-3">
                        <div className="flex items-center gap-3">
                          <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-surface-muted border border-border">
                            {imgUrl ? (
                              <Image src={imgUrl} alt={item.name} fill sizes="44px" className="object-cover" />
                            ) : (
                              <Shirt className="m-auto size-5 text-muted" />
                            )}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-foreground">{item.name}</p>
                            <p className="text-xs text-muted capitalize">{humanise(item.category)}</p>
                          </div>
                        </div>
                        <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                          {item.wear_count} {item.wear_count === 1 ? "wear" : "wears"}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </Card>

            {/* Declutter & Untouched Nudge */}
            <Card className="p-6 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <HeartHandshake className="size-4 text-accent" />
                  <h3 className="font-serif text-lg font-medium text-foreground">Declutter & Untouched</h3>
                </div>
                <span className="text-xs text-muted font-medium">Not worn recently</span>
              </div>

              {untouchedItems.length === 0 ? (
                <p className="text-xs text-muted py-4">
                  Amazing job! Every piece in your closet is actively worn.
                </p>
              ) : (
                <div className="divide-y divide-border/60">
                  {untouchedItems.map((item) => {
                    const imgUrl = signedMap.get(item.image_path);
                    return (
                      <div key={item.id} className="flex items-center justify-between py-3">
                        <div className="flex items-center gap-3">
                          <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-surface-muted border border-border">
                            {imgUrl ? (
                              <Image src={imgUrl} alt={item.name} fill sizes="44px" className="object-cover" />
                            ) : (
                              <Shirt className="m-auto size-5 text-muted" />
                            )}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-foreground">{item.name}</p>
                            <p className="text-xs text-muted capitalize">{humanise(item.category)}</p>
                          </div>
                        </div>
                        <span className="rounded-full bg-surface-muted border border-border px-2.5 py-1 text-xs font-medium text-muted">
                          {(item.wear_count ?? 0) === 0 ? "0 wears" : "Untouched"}
                        </span>
                      </div>
                    );
                  })}
                  <p className="pt-3 text-[11px] text-muted">
                    💡 <strong>Stylist Tip:</strong> Try styling these pieces this week, or consider donating them if unloved for 6+ months.
                  </p>
                </div>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, tone, hint }: { label: string; value: number; tone?: "success" | "warning"; hint?: string }) {
  const color = tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : "text-foreground";
  return (
    <Card className="p-5">
      <p className="text-sm text-muted">{label}</p>
      <p className={`mt-1 font-display text-4xl ${color}`}>{value}</p>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </Card>
  );
}

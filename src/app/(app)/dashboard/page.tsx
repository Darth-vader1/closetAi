import type { Metadata } from "next";
import Link from "next/link";
import { Shirt, WashingMachine } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, EmptyState } from "@/components/ui/card";
import { getProfile, requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { countByStatus, isLaundryStatus, STATUS_LABELS, type LaundryStatus } from "@/lib/wardrobe/status";

export const metadata: Metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await requireUser();
  const profile = await getProfile();
  const supabase = await createClient();

  // RLS already scopes this to the signed-in user; the explicit filter documents intent.
  const { data, error } = await supabase.from("wardrobe_items").select("status").eq("user_id", user.id);
  if (error) throw new Error(`Could not load wardrobe summary: ${error.message}`);

  const items = (data ?? []).filter((r): r is { status: LaundryStatus } => isLaundryStatus(r.status));
  const total = items.length;
  const counts = countByStatus(items);
  const needsAttention = counts.DIRTY + counts.IN_LAUNDRY + counts.WASHING + counts.DRYING;
  const firstName = profile?.display_name?.split(" ")[0];

  return (
    <>
      <PageHeader
        title={firstName ? `Hello, ${firstName}` : "Dashboard"}
        description="A quick look at what's ready to wear."
        action={
          <Button asChild variant="dark">
            <Link href="/wardrobe">Open wardrobe</Link>
          </Button>
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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="Garments" value={total} />
          <Stat label={STATUS_LABELS.CLEAN} value={counts.CLEAN} tone="success" />
          <Stat label={STATUS_LABELS.WORN} value={counts.WORN} />
          <Stat label="In the wash cycle" value={needsAttention} tone={needsAttention > 0 ? "warning" : undefined} hint={`${counts.DIRTY} need washing`} />
        </div>
      )}

      {total > 0 && needsAttention > 0 ? (
        <Card className="mt-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <WashingMachine className="mt-1 size-5 text-accent" aria-hidden />
            <p>
              {needsAttention} {needsAttention === 1 ? "item isn't" : "items aren't"} ready to wear right now. They&apos;re left out of outfit suggestions until you mark them clean.
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href="/laundry">Review laundry</Link>
          </Button>
        </Card>
      ) : null}
    </>
  );
}

function Stat({ label, value, tone, hint }: { label: string; value: number; tone?: "success" | "warning"; hint?: string }) {
  const color = tone === "success" ? "text-success" : tone === "warning" ? "text-warning" : "text-foreground";
  return (
    <Card className="p-5">
      <p className="text-sm text-muted">{label}</p>
      <p className={`mt-1 font-display text-4xl ${color}`}>{value}</p>
      {hint ? <p className="mt-1 text-sm text-muted">{hint}</p> : null}
    </Card>
  );
}

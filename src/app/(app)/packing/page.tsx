import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { ContextualGuide } from "@/components/onboarding/contextual-guide";
import { PackingClient } from "@/components/packing/packing-client";
import { getProfile, requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Pack for… · ClosetAI",
  description: "Plan a mix-and-match capsule and essentials checklist for trips, school terms, work placements, events, and longer stays.",
};

export default async function PackingPage() {
  const user = await requireUser();
  const profile = await getProfile();
  const supabase = await createClient();

  const { count: cleanCount } = await supabase
    .from("wardrobe_items")
    .select("id", { count: "exact", head: true })
    .eq("user_id", user.id)
    .in("status", profile?.rewear_worn_items ? ["CLEAN", "WORN"] : ["CLEAN"]);

  return (
    <>
      <PageHeader
        title="Pack for…"
        description="Plan for a trip, school term, work placement, special event, or long stay. ClosetAI checks local weather or seasonal norms, builds a capsule or laundry-cycle rotation from your wardrobe, and prepares a 'Don't forget' checklist."
      />
      <ContextualGuide section="packing" />
      <PackingClient initialCleanCount={cleanCount ?? 0} />
    </>
  );
}

import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { ContextualGuide } from "@/components/onboarding/contextual-guide";
import { PackingClient } from "@/components/packing/packing-client";
import { getProfile, requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Travel Packing Capsule · ClosetAI",
  description: "Curate a carry-on friendly mix-and-match capsule for your upcoming trips.",
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
        title="Travel Packing Capsule"
        description="Pick a destination and duration. The AI checks local weather and packs an interchangeable carry-on capsule from your wardrobe."
      />
      <ContextualGuide section="packing" />
      <PackingClient initialCleanCount={cleanCount ?? 0} />
    </>
  );
}

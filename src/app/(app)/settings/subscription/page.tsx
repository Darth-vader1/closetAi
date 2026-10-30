import type { Metadata } from "next";
import { PageHeader } from "@/components/layout/page-header";
import { SubscriptionManagement } from "@/components/settings/subscription-management";
import { requireUser } from "@/lib/auth/session";
import { getAllUsageSummaries, getUserPlan } from "@/lib/billing/entitlements";
import { PRICING_PLANS } from "@/lib/billing/plans";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Subscription & Usage · ClosetAI",
  description: "View your current plan, check feature allowances, and manage billing.",
};

export const dynamic = "force-dynamic";

export default async function SettingsSubscriptionPage() {
  const user = await requireUser();
  const [planInfo, usageSummaries, supabase] = await Promise.all([
    getUserPlan(user.id),
    getAllUsageSummaries(user.id),
    createClient(),
  ]);

  // Fetch payment records from payment_transactions (or subscriptions fallback)
  let payments: Array<{
    id: string;
    reference: string;
    amount: number;
    currency: string;
    status: string;
    plan_id: string;
    created_at: string;
  }> = [];

  try {
    const { data: txs } = await supabase
      .from("payment_transactions")
      .select("id, reference, amount, currency, status, plan_id, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);

    if (txs && txs.length > 0) {
      payments = txs;
    } else {
      // Fallback: check subscriptions table
      const { data: subs } = await supabase
        .from("subscriptions")
        .select("id, plan_code, amount, currency, status, created_at, provider_subscription_id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20);

      if (subs) {
        payments = subs.map((s) => ({
          id: s.id,
          reference: s.provider_subscription_id || s.id,
          amount: s.amount,
          currency: s.currency,
          status: s.status,
          plan_id: s.plan_code,
          created_at: s.created_at,
        }));
      }
    }
  } catch {
    payments = [];
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Subscription & Allowances"
        description="Monitor your feature limits, see usage consumption, and manage your ClosetAI membership."
      />

      <SubscriptionManagement
        userEmail={user.email || ""}
        planInfo={planInfo}
        usageSummaries={usageSummaries}
        payments={payments}
        plans={PRICING_PLANS}
      />
    </div>
  );
}

import { Card } from "@/components/ui/card";
import { CreditCard, DollarSign } from "lucide-react";
import { getAdminMetrics } from "@/lib/admin/queries";

export const metadata = {
  title: "Subscriptions & Revenue · ClosetAI Admin",
};

export default async function AdminSubscriptionsPage() {
  const metrics = await getAdminMetrics();

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div>
        <h1 className="font-serif text-2xl font-medium tracking-tight text-foreground">
          Subscriptions & Revenue
        </h1>
        <p className="text-xs text-muted mt-1">
          Detailed metrics across Paystack (NGN) and Stripe (USD) payment gateways.
        </p>
      </div>

      {/* Financial Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <Card className="p-6 bg-surface border-border space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted">Paystack (NGN)</span>
            <span className="text-xs font-semibold rounded-md bg-emerald-500/10 text-emerald-600 px-2 py-0.5">
              Active
            </span>
          </div>
          <div>
            <div className="font-serif text-3xl font-medium tracking-tight text-foreground">
              ₦{metrics.mrrNGN.toLocaleString()}
            </div>
            <p className="text-xs text-muted mt-1">
              {metrics.subscribersPaystack} subscribers @ ₦999/mo
            </p>
          </div>
        </Card>

        <Card className="p-6 bg-surface border-border space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted">Stripe (USD)</span>
            <span className="text-xs font-semibold rounded-md bg-blue-500/10 text-blue-600 px-2 py-0.5">
              Active
            </span>
          </div>
          <div>
            <div className="font-serif text-3xl font-medium tracking-tight text-foreground">
              ${metrics.mrrUSD.toFixed(2)}
            </div>
            <p className="text-xs text-muted mt-1">
              {metrics.subscribersStripe} subscribers @ $4.99/mo
            </p>
          </div>
        </Card>

        <Card className="p-6 bg-surface border-border space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted">Total Paid Members</span>
            <CreditCard className="size-4 text-accent" />
          </div>
          <div>
            <div className="font-serif text-3xl font-medium tracking-tight text-foreground">
              {metrics.activeSubscribers}
            </div>
            <p className="text-xs text-muted mt-1">
              {metrics.totalUsers > 0 ? ((metrics.activeSubscribers / metrics.totalUsers) * 100).toFixed(1) : 0}% conversion rate
            </p>
          </div>
        </Card>
      </div>

      {/* Gateway Information & Instructions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="p-6 bg-surface border-border space-y-4">
          <div className="flex items-center gap-2">
            <CreditCard className="size-4 text-accent" />
            <h3 className="font-medium text-sm text-foreground">Paystack Settings</h3>
          </div>
          <div className="text-xs text-muted space-y-2 leading-relaxed">
            <p>
              Paystack handles all Nigerian Naira subscriptions. Webhook events automatically update the user profile upon renewal:
            </p>
            <div className="p-3 bg-surface-muted/60 rounded-xl font-mono text-[11px] text-foreground">
              https://closet-ai-official.vercel.app/api/webhook/paystack
            </div>
            <p className="text-[11px]">
              Rate: <strong>₦999/month</strong> or <strong>₦9,990/year</strong>
            </p>
          </div>
        </Card>

        <Card className="p-6 bg-surface border-border space-y-4">
          <div className="flex items-center gap-2">
            <DollarSign className="size-4 text-accent" />
            <h3 className="font-medium text-sm text-foreground">Stripe Settings</h3>
          </div>
          <div className="text-xs text-muted space-y-2 leading-relaxed">
            <p>
              Stripe handles international subscriptions with card and Apple Pay / Google Pay support:
            </p>
            <div className="p-3 bg-surface-muted/60 rounded-xl font-mono text-[11px] text-foreground">
              https://closet-ai-official.vercel.app/api/webhook/stripe
            </div>
            <p className="text-[11px]">
              Rate: <strong>$4.99/month</strong> or <strong>$49.99/year</strong>
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}

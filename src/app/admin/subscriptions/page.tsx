import { Card } from "@/components/ui/card";
import { CreditCard, DollarSign, CheckCircle2, AlertCircle, ArrowUpRight, Receipt, Users } from "lucide-react";
import { getAdminMetrics, listAdminSubscribers, listAdminTransactions } from "@/lib/admin/queries";
import Link from "next/link";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Subscriptions & Revenue · ClosetAI Admin",
};

export default async function AdminSubscriptionsPage() {
  const [metrics, subscribers, transactions] = await Promise.all([
    getAdminMetrics(),
    listAdminSubscribers(),
    listAdminTransactions(25),
  ]);

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      <div>
        <h1 className="font-serif text-2xl sm:text-3xl font-medium tracking-tight text-foreground">
          Subscriptions & Revenue
        </h1>
        <p className="text-xs text-muted mt-1">
          Real-time member subscriptions, live payment ledger, and gateway configurations.
        </p>
      </div>

      {/* Financial Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Paystack MRR */}
        <Card className="p-5 bg-surface border-border space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted">Paystack MRR</span>
            <span className="text-[10px] font-semibold rounded-md bg-emerald-500/10 text-emerald-600 px-2 py-0.5">
              Live
            </span>
          </div>
          <div>
            <div className="font-serif text-2xl sm:text-3xl font-medium tracking-tight text-foreground">
              ₦{metrics.mrrNGN.toLocaleString()}
            </div>
            <p className="text-xs text-muted mt-1">
              {metrics.subscribersPaystack} subscriber{metrics.subscribersPaystack === 1 ? "" : "s"} @ ₦999/mo
            </p>
          </div>
        </Card>

        {/* Stripe MRR */}
        <Card className="p-5 bg-surface border-border space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted">Stripe MRR</span>
            <span className="text-[10px] font-semibold rounded-md bg-blue-500/10 text-blue-600 px-2 py-0.5">
              Global
            </span>
          </div>
          <div>
            <div className="font-serif text-2xl sm:text-3xl font-medium tracking-tight text-foreground">
              ${metrics.mrrUSD.toFixed(2)}
            </div>
            <p className="text-xs text-muted mt-1">
              {metrics.subscribersStripe} subscriber{metrics.subscribersStripe === 1 ? "" : "s"} @ $4.99/mo
            </p>
          </div>
        </Card>

        {/* Total Paid Subscribers */}
        <Card className="p-5 bg-surface border-border space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted">Active Subscribers</span>
            <Users className="size-4 text-accent" />
          </div>
          <div>
            <div className="font-serif text-2xl sm:text-3xl font-medium tracking-tight text-foreground">
              {metrics.activeSubscribers}
            </div>
            <p className="text-xs text-muted mt-1">
              {metrics.totalUsers > 0 ? ((metrics.activeSubscribers / metrics.totalUsers) * 100).toFixed(1) : 0}% of {metrics.totalUsers} total members
            </p>
          </div>
        </Card>

        {/* Gross Revenue */}
        <Card className="p-5 bg-surface border-border space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted">Gross Captured</span>
            <Receipt className="size-4 text-emerald-600" />
          </div>
          <div>
            <div className="font-serif text-2xl sm:text-3xl font-medium tracking-tight text-foreground">
              ₦{metrics.totalRevenueNGN.toLocaleString()}
            </div>
            <p className="text-xs text-muted mt-1">
              From verified payment transactions
            </p>
          </div>
        </Card>
      </div>

      {/* Active Subscribers Table */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-serif text-lg font-medium text-foreground">Active Paid Members</h2>
            <p className="text-xs text-muted">Subscribers with active Pro recurring billing status.</p>
          </div>
          <span className="text-xs font-mono text-muted">{subscribers.length} total</span>
        </div>

        <Card className="overflow-hidden border-border bg-surface">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-border bg-surface-muted/40 text-muted uppercase text-[10px] tracking-wider font-semibold">
                  <th className="py-3 px-4">Member</th>
                  <th className="py-3 px-4">Plan</th>
                  <th className="py-3 px-4">Gateway</th>
                  <th className="py-3 px-4">Next Renewal</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Directory</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {subscribers.map((sub) => {
                  const renewalDate = sub.currentPeriodEnd
                    ? new Date(sub.currentPeriodEnd).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        year: "numeric",
                      })
                    : "Continuous";

                  return (
                    <tr key={sub.id} className="hover:bg-surface-muted/30 transition-colors">
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="size-8 rounded-full bg-accent-soft text-accent grid place-items-center font-serif text-sm font-semibold shrink-0">
                            {(sub.userName || sub.userEmail || "U")[0]?.toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="font-medium text-foreground truncate max-w-[200px]">
                              {sub.userName || "Subscriber"}
                            </p>
                            <p className="text-[11px] text-muted truncate max-w-[220px]">
                              {sub.userEmail || sub.userId}
                            </p>
                          </div>
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="capitalize font-medium text-foreground">
                          {sub.planId === "annual"
                            ? "Annual (₦9,990/yr)"
                            : sub.planId === "free"
                            ? "Free Tier"
                            : "Monthly (₦999/mo)"}
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="capitalize text-muted font-mono text-[11px]">
                          {sub.provider}
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-muted">
                        {renewalDate}
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 text-emerald-600 px-2.5 py-0.5 text-[10px] font-semibold uppercase">
                          <CheckCircle2 className="size-3" />
                          <span>{sub.status}</span>
                        </span>
                      </td>

                      <td className="py-3.5 px-4 text-right">
                        <Link
                          href={`/admin/users?q=${encodeURIComponent(sub.userEmail || sub.userName || "")}`}
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-accent hover:underline"
                        >
                          <span>Manage</span>
                          <ArrowUpRight className="size-3" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {subscribers.length === 0 && (
            <div className="text-center py-12 text-muted text-xs">
              No active paid subscribers found.
            </div>
          )}
        </Card>
      </div>

      {/* Payment Transactions Ledger */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-serif text-lg font-medium text-foreground">Payment Transactions Ledger</h2>
            <p className="text-xs text-muted">Audit trail of verified payment transactions via Paystack and Stripe.</p>
          </div>
          <span className="text-xs font-mono text-muted">{transactions.length} entries</span>
        </div>

        <Card className="overflow-hidden border-border bg-surface">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-border bg-surface-muted/40 text-muted uppercase text-[10px] tracking-wider font-semibold">
                  <th className="py-3 px-4">Reference</th>
                  <th className="py-3 px-4">Customer</th>
                  <th className="py-3 px-4">Amount</th>
                  <th className="py-3 px-4">Gateway</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Date & Time</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {transactions.map((tx) => {
                  const txDate = new Date(tx.createdAt).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  });

                  const isSuccess = tx.status === "success";

                  return (
                    <tr key={tx.id} className="hover:bg-surface-muted/30 transition-colors">
                      <td className="py-3.5 px-4 font-mono text-[11px] text-foreground">
                        {tx.reference}
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="min-w-0">
                          <p className="font-medium text-foreground truncate max-w-[180px]">
                            {tx.userName || tx.userEmail || "Customer"}
                          </p>
                          <p className="text-[10px] text-muted truncate max-w-[200px]">
                            {tx.userEmail || tx.userId.slice(0, 8) + "…"}
                          </p>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 font-medium text-foreground">
                        {tx.currency === "NGN" ? `₦${tx.amount.toLocaleString()}` : `$${tx.amount.toFixed(2)}`}
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="capitalize text-muted font-mono text-[11px]">
                          {tx.provider}
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        {isSuccess ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 text-emerald-600 px-2 py-0.5 text-[10px] font-semibold uppercase">
                            <CheckCircle2 className="size-3" />
                            <span>Paid</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/10 text-amber-600 px-2 py-0.5 text-[10px] font-semibold uppercase">
                            <AlertCircle className="size-3" />
                            <span>{tx.status}</span>
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4 text-right text-muted font-mono text-[11px]">
                        {txDate}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {transactions.length === 0 && (
            <div className="text-center py-12 text-muted text-xs">
              No transactions recorded in the ledger yet.
            </div>
          )}
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
              Paystack handles Nigerian Naira payments and recurring cards. Webhook events automatically renew user memberships:
            </p>
            <div className="p-3 bg-surface-muted/60 rounded-xl font-mono text-[11px] text-foreground break-all select-all">
              https://closet-ai-official.vercel.app/api/webhook/paystack
            </div>
            <p className="text-[11px]">
              Active Tier: <strong>₦999/month</strong> or <strong>₦9,990/year</strong>
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
            <div className="p-3 bg-surface-muted/60 rounded-xl font-mono text-[11px] text-foreground break-all select-all">
              https://closet-ai-official.vercel.app/api/webhook/stripe
            </div>
            <p className="text-[11px]">
              Active Tier: <strong>$4.99/month</strong> or <strong>$49.99/year</strong>
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}

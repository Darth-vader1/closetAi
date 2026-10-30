import { getAdminMetrics, listAdminUsers, listAdminTransactions } from "@/lib/admin/queries";
import { Card } from "@/components/ui/card";
import {
  Users,
  CreditCard,
  Shirt,
  TrendingUp,
  Send,
  CheckCircle2,
  ArrowRight,
  Sparkles,
} from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Admin Console · ClosetAI",
  description: "Platform analytics, subscribers, user management, and broadcast tools.",
};

export default async function AdminOverviewPage() {
  const [metrics, recentUsersData, recentTransactions] = await Promise.all([
    getAdminMetrics(),
    listAdminUsers({ page: 1, limit: 5 }),
    listAdminTransactions(5),
  ]);

  return (
    <div className="space-y-8 animate-in fade-in duration-300">
      {/* Top Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl font-medium tracking-tight text-foreground">
            Platform Overview
          </h1>
          <p className="text-xs text-muted mt-1">
            Real-time subscriber metrics, wardrobe counts, and platform activity.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/admin/broadcasts"
            className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-accent-contrast shadow-sm hover:bg-accent-hover transition-colors"
          >
            <Send className="size-3.5" />
            <span>Send Announcement</span>
          </Link>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* MRR Card */}
        <Card className="p-5 space-y-3 bg-surface border-border">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted">Estimated MRR</span>
            <div className="size-8 rounded-lg bg-emerald-500/10 text-emerald-600 grid place-items-center">
              <TrendingUp className="size-4" />
            </div>
          </div>
          <div>
            <div className="font-serif text-2xl sm:text-3xl font-medium tracking-tight text-foreground">
              ₦{metrics.mrrNGN.toLocaleString()} <span className="text-xs font-sans text-muted">/mo</span>
            </div>
            {metrics.mrrUSD > 0 && (
              <p className="text-xs text-muted mt-0.5">
                + ${metrics.mrrUSD.toFixed(2)} USD (Stripe)
              </p>
            )}
          </div>
          <p className="text-[11px] text-muted border-t border-border/60 pt-2">
            Active Paystack & Stripe subscribers
          </p>
        </Card>

        {/* Active Subscribers */}
        <Card className="p-5 space-y-3 bg-surface border-border">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted">Paid Subscribers</span>
            <div className="size-8 rounded-lg bg-accent-soft text-accent grid place-items-center">
              <CreditCard className="size-4" />
            </div>
          </div>
          <div>
            <div className="font-serif text-2xl sm:text-3xl font-medium tracking-tight text-foreground">
              {metrics.activeSubscribers}
            </div>
            <p className="text-xs text-muted mt-0.5">
              {metrics.subscribersPaystack} Paystack · {metrics.subscribersStripe} Stripe
            </p>
          </div>
          <p className="text-[11px] text-muted border-t border-border/60 pt-2">
            ₦999/mo & $4.99/mo Pro members
          </p>
        </Card>

        {/* Total Registered Users */}
        <Card className="p-5 space-y-3 bg-surface border-border">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted">Total Users</span>
            <div className="size-8 rounded-lg bg-sky-500/10 text-sky-600 grid place-items-center">
              <Users className="size-4" />
            </div>
          </div>
          <div>
            <div className="font-serif text-2xl sm:text-3xl font-medium tracking-tight text-foreground">
              {metrics.totalUsers}
            </div>
            <p className="text-xs text-muted mt-0.5">
              +{metrics.newUsersThisWeek} new signups this week
            </p>
          </div>
          <p className="text-[11px] text-muted border-t border-border/60 pt-2">
            Registered accounts on platform
          </p>
        </Card>

        {/* Wardrobe Items Cataloged */}
        <Card className="p-5 space-y-3 bg-surface border-border">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted">Wardrobe Clothes</span>
            <div className="size-8 rounded-lg bg-purple-500/10 text-purple-600 grid place-items-center">
              <Shirt className="size-4" />
            </div>
          </div>
          <div>
            <div className="font-serif text-2xl sm:text-3xl font-medium tracking-tight text-foreground">
              {metrics.totalGarments.toLocaleString()}
            </div>
            <p className="text-xs text-muted mt-0.5">
              {metrics.totalOutfits} curated outfits
            </p>
          </div>
          <p className="text-[11px] text-muted border-t border-border/60 pt-2">
            {metrics.totalFlatlays} flatlay boards composed
          </p>
        </Card>
      </div>

      {/* Recent Activity Split View */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Members */}
        <Card className="p-6 bg-surface border-border space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="size-4 text-accent" />
              <h2 className="font-serif text-base font-medium text-foreground">Recent Member Signups</h2>
            </div>
            <Link
              href="/admin/users"
              className="inline-flex items-center gap-1 text-xs text-accent hover:underline font-medium"
            >
              <span>View all ({metrics.totalUsers})</span>
              <ArrowRight className="size-3" />
            </Link>
          </div>

          <div className="divide-y divide-border/60">
            {recentUsersData.users.map((user) => (
              <div key={user.id} className="py-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="size-8 rounded-full bg-accent-soft text-accent grid place-items-center font-serif text-xs font-semibold shrink-0">
                    {(user.displayName || user.email || "U")[0]?.toUpperCase()}
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">
                      {user.displayName || "Member"}
                    </p>
                    <p className="text-[11px] text-muted truncate">
                      {user.email || user.id.slice(0, 8) + "…"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <span className="text-[11px] text-muted hidden sm:inline">
                    {user.garmentCount} items
                  </span>
                  {user.subscriptionStatus === "active" ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 text-emerald-600 px-2 py-0.5 text-[10px] font-semibold">
                      <CheckCircle2 className="size-2.5" />
                      <span>Pro</span>
                    </span>
                  ) : (
                    <span className="rounded-full bg-surface-muted text-muted px-2 py-0.5 text-[10px] font-medium">
                      Free
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </Card>

        {/* Recent Transactions & Gateways */}
        <Card className="p-6 bg-surface border-border space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CreditCard className="size-4 text-accent" />
              <h2 className="font-serif text-base font-medium text-foreground">Recent Payments</h2>
            </div>
            <Link
              href="/admin/subscriptions"
              className="inline-flex items-center gap-1 text-xs text-accent hover:underline font-medium"
            >
              <span>Ledger ({recentTransactions.length})</span>
              <ArrowRight className="size-3" />
            </Link>
          </div>

          <div className="divide-y divide-border/60">
            {recentTransactions.map((tx) => (
              <div key={tx.id} className="py-3 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-foreground truncate">
                    {tx.userName || tx.userEmail || "Customer"}
                  </p>
                  <p className="text-[10px] font-mono text-muted truncate">
                    {tx.reference}
                  </p>
                </div>

                <div className="text-right shrink-0">
                  <p className="text-xs font-semibold text-foreground">
                    {tx.currency === "NGN" ? `₦${tx.amount.toLocaleString()}` : `$${tx.amount.toFixed(2)}`}
                  </p>
                  <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 font-medium">
                    <CheckCircle2 className="size-2.5" />
                    <span className="capitalize">{tx.provider}</span>
                  </span>
                </div>
              </div>
            ))}

            {recentTransactions.length === 0 && (
              <div className="py-8 text-center text-xs text-muted">
                No transactions recorded yet.
              </div>
            )}
          </div>
        </Card>
      </div>

      {/* Quick Launchpad & Management Shortcuts */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="p-6 space-y-3 bg-surface border-border">
          <div className="flex items-center gap-2">
            <Users className="size-4 text-accent" />
            <h3 className="font-medium text-sm text-foreground">Manage Users & Closets</h3>
          </div>
          <p className="text-xs text-muted leading-relaxed">
            Search users by email or name, inspect wardrobe contents, check styling histories, and grant manual VIP access.
          </p>
          <Link
            href="/admin/users"
            className="inline-block text-xs font-semibold text-accent hover:underline pt-2"
          >
            Open User Directory →
          </Link>
        </Card>

        <Card className="p-6 space-y-3 bg-surface border-border">
          <div className="flex items-center gap-2">
            <CreditCard className="size-4 text-accent" />
            <h3 className="font-medium text-sm text-foreground">Subscription Records</h3>
          </div>
          <p className="text-xs text-muted leading-relaxed">
            Track incoming payments from Paystack & Stripe, inspect transaction references, and manage recurring plans.
          </p>
          <Link
            href="/admin/subscriptions"
            className="inline-block text-xs font-semibold text-accent hover:underline pt-2"
          >
            View Subscriptions & Ledgers →
          </Link>
        </Card>

        <Card className="p-6 space-y-3 bg-surface border-border">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-accent" />
            <h3 className="font-medium text-sm text-foreground">AI & System Services</h3>
          </div>
          <p className="text-xs text-muted leading-relaxed">
            Verify connectivity for Groq, Mistral, Gemini, PhotoRoom background removal, and daily morning cron status.
          </p>
          <Link
            href="/admin/system"
            className="inline-block text-xs font-semibold text-accent hover:underline pt-2"
          >
            Inspect System Health →
          </Link>
        </Card>
      </div>
    </div>
  );
}

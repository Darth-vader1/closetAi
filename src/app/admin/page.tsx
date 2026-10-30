import { getAdminMetrics } from "@/lib/admin/queries";
import { Card } from "@/components/ui/card";
import {
  Users,
  CreditCard,
  Shirt,
  TrendingUp,
  ShieldCheck,
  Send,
} from "lucide-react";
import Link from "next/link";

export default async function AdminOverviewPage() {
  const metrics = await getAdminMetrics();

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
            ₦999/mo & $4.99/mo pro members
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

      {/* Quick Launchpad & Management Shortcuts */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card className="p-6 space-y-3 bg-surface border-border">
          <div className="flex items-center gap-2">
            <Users className="size-4 text-accent" />
            <h3 className="font-medium text-sm text-foreground">Manage Users & Closets</h3>
          </div>
          <p className="text-xs text-muted leading-relaxed">
            Search users, view wardrobe item breakdown, check onboarding completion, and grant manual VIP access.
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
            Track incoming payments from Paystack & Stripe, monitor failed renewals, and view customer codes.
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
            <ShieldCheck className="size-4 text-accent" />
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

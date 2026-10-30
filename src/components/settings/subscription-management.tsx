"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Sparkles,
  ShieldCheck,
  Clock,
  ArrowRight,
  CheckCircle2,
  History,
  Layers,
  Sparkle,
  Shirt,
  RefreshCw,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { UserPlanInfo, UsageCheckResult } from "@/lib/billing/entitlements";
import type { UsageFeatureKey, PricingPlan } from "@/lib/billing/plans";
import { createSubscriptionCheckoutAction } from "@/app/subscription/actions";

interface PaymentRecord {
  id: string;
  reference: string;
  amount: number;
  currency: string;
  status: string;
  plan_id: string;
  created_at: string;
}

interface SubscriptionManagementProps {
  userEmail: string;
  planInfo: UserPlanInfo;
  usageSummaries: Record<UsageFeatureKey, UsageCheckResult>;
  payments: PaymentRecord[];
  plans: Record<string, PricingPlan>;
}

const FEATURE_META: Record<UsageFeatureKey, { label: string; description: string; icon: typeof Shirt }> = {
  wardrobe_items: {
    label: "Digital Wardrobe Items",
    description: "Total garments catalogued in your private wardrobe.",
    icon: Shirt,
  },
  outfit_recommendations: {
    label: "AI Outfit Recommendations",
    description: "Personalized looks styled by ClosetAI from your clean garments.",
    icon: Sparkles,
  },
  saved_outfits: {
    label: "Saved Outfits in Studio",
    description: "Custom outfits designed and saved to your personal lookbook.",
    icon: Layers,
  },
  flatlay_designs: {
    label: "Flatlay Studio Boards",
    description: "Collages created in Flatlay Studio with realistic lighting.",
    icon: Layers,
  },
  beautify_processing: {
    label: "Garment Beautify & Background Cuts",
    description: "AI-enhanced garment clean cutouts and crease smoothing.",
    icon: Sparkle,
  },
};

export function SubscriptionManagement({
  userEmail,
  planInfo,
  usageSummaries,
  payments,
  plans,
}: SubscriptionManagementProps) {
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "annual">("monthly");
  const [currency, setCurrency] = useState<"NGN" | "USD">("NGN");
  const [loadingAction, setLoadingAction] = useState<"paystack" | "stripe" | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const selectedPlan = billingPeriod === "annual" ? plans.annual : plans.monthly;

  const handleUpgrade = async () => {
    const provider = currency === "NGN" ? "paystack" : "stripe";
    setLoadingAction(provider);
    setErrorMessage(null);
    try {
      const res = await createSubscriptionCheckoutAction(billingPeriod, provider);
      if (res && !res.ok) {
        setErrorMessage(res.error || "Could not start checkout.");
      }
    } catch (err: unknown) {
      if ((err as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw err;
      setErrorMessage(err instanceof Error ? err.message : "Payment error occurred.");
    } finally {
      setLoadingAction(null);
    }
  };

  const formatDate = (isoStr: string | null) => {
    if (!isoStr) return "N/A";
    try {
      return new Date(isoStr).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
    } catch {
      return isoStr;
    }
  };

  return (
    <div className="space-y-8 max-w-4xl">
      {/* 1. CURRENT PLAN CARD */}
      <Card className="p-6 sm:p-8 border-border bg-card space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/60 pb-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted">Current Plan</span>
              {planInfo.isPremium ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 text-accent border border-accent/30 px-2.5 py-0.5 text-xs font-semibold">
                  <Sparkles className="size-3" />
                  Premium Active
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-surface-muted text-muted border border-border px-2.5 py-0.5 text-xs font-semibold">
                  Free Tier
                </span>
              )}
            </div>
            <h2 className="text-2xl sm:text-3xl font-serif font-semibold text-foreground">
              {planInfo.isPremium
                ? planInfo.planId === "annual"
                  ? "ClosetAI Premium (Annual)"
                  : "ClosetAI Premium (Monthly)"
                : "ClosetAI Free"}
            </h2>
            <p className="text-xs sm:text-sm text-muted">
              {planInfo.isPremium
                ? "Full access to unlimited wardrobe items, high-capacity AI recommendations, and complete styling."
                : "Essential wardrobe organizer with 30 items and weekly AI styling recommendations."}
            </p>
          </div>

          <div className="text-left sm:text-right">
            <div className="text-xs text-muted">Account</div>
            <div className="text-sm font-medium text-foreground">{userEmail}</div>
            {planInfo.expiresAt && (
              <div className="text-xs text-muted mt-1 flex items-center sm:justify-end gap-1">
                <Clock className="size-3 text-accent" />
                <span>Renews: {formatDate(planInfo.expiresAt)}</span>
              </div>
            )}
          </div>
        </div>

        {/* Upgrade / Renewal Callout if Free */}
        {!planInfo.isPremium && (
          <div className="rounded-xl border border-accent/30 bg-accent-soft/20 p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1">
                <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
                  <Sparkles className="size-4 text-accent" />
                  Upgrade to ClosetAI Premium
                </h3>
                <p className="text-xs sm:text-sm text-muted">
                  Unlock unlimited digital wardrobe garments, 100 outfit recommendations/month, and 30 Beautify operations.
                </p>
              </div>

              {/* Billing Toggle & Currency */}
              <div className="flex items-center gap-2 flex-wrap">
                <div className="inline-flex rounded-full border border-border bg-surface-muted/60 p-0.5 text-xs font-medium">
                  <button
                    type="button"
                    onClick={() => setBillingPeriod("monthly")}
                    className={`px-3 py-1 rounded-full transition-all ${
                      billingPeriod === "monthly"
                        ? "bg-accent text-accent-contrast shadow-xs"
                        : "text-muted hover:text-foreground"
                    }`}
                  >
                    Monthly (₦999)
                  </button>
                  <button
                    type="button"
                    onClick={() => setBillingPeriod("annual")}
                    className={`px-3 py-1 rounded-full transition-all flex items-center gap-1 ${
                      billingPeriod === "annual"
                        ? "bg-accent text-accent-contrast shadow-xs"
                        : "text-muted hover:text-foreground"
                    }`}
                  >
                    <span>Annual (₦9,990)</span>
                    <span className="text-[10px] bg-white/20 dark:bg-black/20 rounded px-1 font-bold">
                      -17%
                    </span>
                  </button>
                </div>

                <div className="inline-flex rounded-full border border-border bg-surface-muted/60 p-0.5 text-xs font-medium">
                  <button
                    type="button"
                    onClick={() => setCurrency("NGN")}
                    className={`px-2.5 py-1 rounded-full transition-all ${
                      currency === "NGN" ? "bg-foreground text-background" : "text-muted"
                    }`}
                  >
                    ₦ NGN
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrency("USD")}
                    className={`px-2.5 py-1 rounded-full transition-all ${
                      currency === "USD" ? "bg-foreground text-background" : "text-muted"
                    }`}
                  >
                    $ USD
                  </button>
                </div>
              </div>
            </div>

            {errorMessage && (
              <div className="rounded-lg bg-danger-soft/40 border border-danger/40 p-2 text-xs text-danger">
                {errorMessage}
              </div>
            )}

            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-1">
              <Button
                type="button"
                className="w-full sm:w-auto text-sm font-medium bg-accent hover:bg-accent/90 text-accent-contrast shadow-sm"
                onClick={handleUpgrade}
                loading={loadingAction === "paystack" || loadingAction === "stripe"}
              >
                Upgrade to Premium ({currency === "NGN" ? selectedPlan.formattedNGN : selectedPlan.formattedUSD})
                <ArrowRight className="size-4 ml-1.5" />
              </Button>
              <Link
                href="/subscription"
                className="text-xs text-accent hover:underline font-medium"
              >
                View full feature comparison table →
              </Link>
            </div>
          </div>
        )}
      </Card>

      {/* 2. USAGE METERS & ALLOWANCES */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-serif font-semibold text-foreground">
              Usage & Feature Allowances
            </h3>
            <p className="text-xs text-muted">
              Live consumption against your active plan limits.
            </p>
          </div>
          <Link
            href="/subscription"
            className="text-xs text-accent hover:underline font-medium inline-flex items-center gap-1"
          >
            <span>Change Plan</span>
            <ArrowRight className="size-3" />
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {(Object.keys(usageSummaries) as UsageFeatureKey[]).map((featureKey) => {
            const usage = usageSummaries[featureKey];
            const meta = FEATURE_META[featureKey];
            const Icon = meta.icon;

            const isUnlimited = usage.limit === null;
            const percentage = isUnlimited
              ? 0
              : Math.min(100, Math.round((usage.current / (usage.limit || 1)) * 100));

            const isNearLimit = !isUnlimited && percentage >= 80 && percentage < 100;
            const isAtLimit = !isUnlimited && percentage >= 100;

            return (
              <Card key={featureKey} className="p-5 border-border bg-card space-y-4 flex flex-col justify-between">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="size-8 rounded-lg bg-surface-muted flex items-center justify-center text-muted">
                        <Icon className="size-4 text-foreground" />
                      </div>
                      <span className="text-sm font-semibold text-foreground">
                        {meta.label}
                      </span>
                    </div>

                    {isAtLimit ? (
                      <span className="rounded-full bg-danger-soft text-danger text-[10px] font-semibold px-2 py-0.5">
                        Limit Reached
                      </span>
                    ) : isNearLimit ? (
                      <span className="rounded-full bg-warning-soft text-warning text-[10px] font-semibold px-2 py-0.5">
                        Near Limit
                      </span>
                    ) : (
                      <span className="rounded-full bg-surface-muted text-muted text-[10px] font-medium px-2 py-0.5">
                        {isUnlimited ? "Unlimited" : "Active"}
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-muted leading-relaxed">
                    {meta.description}
                  </p>
                </div>

                <div className="space-y-2 pt-2 border-t border-border/50">
                  <div className="flex items-baseline justify-between text-xs">
                    <span className="text-muted">Current Usage</span>
                    <span className="font-semibold text-foreground">
                      {isUnlimited ? (
                        `${usage.current} used (Unlimited)`
                      ) : (
                        `${usage.current} / ${usage.limit} (${usage.remaining} remaining)`
                      )}
                    </span>
                  </div>

                  {!isUnlimited && (
                    <div className="h-1.5 w-full rounded-full bg-surface-muted overflow-hidden">
                      <div
                        className={`h-full transition-all duration-500 rounded-full ${
                          isAtLimit
                            ? "bg-danger"
                            : isNearLimit
                            ? "bg-warning"
                            : "bg-accent"
                        }`}
                        style={{ width: `${percentage}%` }}
                      />
                    </div>
                  )}

                  {usage.resetsAt && (
                    <p className="text-[11px] text-muted flex items-center gap-1 pt-1">
                      <RefreshCw className="size-3 text-muted shrink-0" />
                      <span>Allowance resets on {formatDate(usage.resetsAt)}</span>
                    </p>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      {/* 3. DOWNGRADE & DATA PRESERVATION SAFETY GUARANTEE */}
      <Card className="p-6 border-border/80 bg-surface-muted/30 space-y-3">
        <div className="flex items-start gap-3">
          <ShieldCheck className="size-5 text-accent shrink-0 mt-0.5" />
          <div className="space-y-1">
            <h4 className="text-sm font-semibold text-foreground">
              Zero-Data-Loss Guarantee
            </h4>
            <p className="text-xs sm:text-sm text-muted leading-relaxed">
              If your Premium subscription expires or you choose to switch back to Free, your digital wardrobe, saved outfits, photos, and preferences will <strong>never be deleted</strong>. If your existing wardrobe exceeds the Free limit, your existing items remain safe and viewable; adding new items will simply be paused until you upgrade or free up space.
            </p>
          </div>
        </div>
      </Card>

      {/* 4. BILLING & PAYMENT HISTORY */}
      <div className="space-y-4">
        <div>
          <h3 className="text-lg font-serif font-semibold text-foreground">
            Payment & Billing History
          </h3>
          <p className="text-xs text-muted">
            All verified transactions processed through Paystack and Stripe.
          </p>
        </div>

        {payments.length === 0 ? (
          <Card className="p-8 text-center text-muted border-dashed border-border bg-card">
            <History className="size-8 mx-auto text-muted mb-2 opacity-50" />
            <p className="text-sm">No payment history yet.</p>
            <p className="text-xs mt-1">When you upgrade or renew, your invoices will appear here.</p>
          </Card>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-left text-xs sm:text-sm">
              <thead>
                <tr className="border-b border-border bg-surface-muted/40 text-muted font-medium">
                  <th className="p-3 sm:p-4">Date</th>
                  <th className="p-3 sm:p-4">Reference</th>
                  <th className="p-3 sm:p-4">Plan</th>
                  <th className="p-3 sm:p-4">Amount</th>
                  <th className="p-3 sm:p-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60 text-foreground/90">
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td className="p-3 sm:p-4 text-muted">{formatDate(p.created_at)}</td>
                    <td className="p-3 sm:p-4 font-mono text-[11px] sm:text-xs text-muted">
                      {p.reference.slice(0, 16)}...
                    </td>
                    <td className="p-3 sm:p-4 capitalize">{p.plan_id}</td>
                    <td className="p-3 sm:p-4 font-semibold">
                      {p.currency === "NGN"
                        ? `₦${(p.amount / 100).toLocaleString()}`
                        : `$${(p.amount / 100).toFixed(2)}`}
                    </td>
                    <td className="p-3 sm:p-4">
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                        <CheckCircle2 className="size-3" />
                        {p.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

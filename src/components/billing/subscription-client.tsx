"use client";

import { useState, useTransition } from "react";
import {
  Check,
  ShieldCheck,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  PRICING_PLANS,
  type PlanId,
} from "@/lib/billing/plans";
import {
  continueWithFreePlanAction,
  createSubscriptionCheckoutAction,
} from "@/app/subscription/actions";

interface SubscriptionClientProps {
  currentPlanId?: PlanId;
  userEmail?: string;
  isCanceled?: boolean;
}

export function SubscriptionClient({
  isCanceled,
}: SubscriptionClientProps) {
  const [selectedTier, setSelectedTier] = useState<"free" | "premium">("premium");
  const [billingPeriod, setBillingPeriod] = useState<"monthly" | "annual">("monthly");
  const [currency, setCurrency] = useState<"NGN" | "USD">("NGN");
  const [loadingAction, setLoadingAction] = useState<"free" | "paystack" | "stripe" | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const freePlan = PRICING_PLANS.free;
  const premiumPlan = billingPeriod === "annual" ? PRICING_PLANS.annual : PRICING_PLANS.monthly;

  const handleContinueFree = () => {
    setLoadingAction("free");
    setErrorMessage(null);
    startTransition(async () => {
      try {
        await continueWithFreePlanAction();
      } catch (err: unknown) {
        if ((err as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw err;
        setErrorMessage(err instanceof Error ? err.message : "Could not continue with Free plan.");
        setLoadingAction(null);
      }
    });
  };

  const handleGetPremium = async () => {
    const provider = currency === "NGN" ? "paystack" : "stripe";
    setLoadingAction(provider);
    setErrorMessage(null);
    try {
      const res = await createSubscriptionCheckoutAction(billingPeriod, provider);
      if (res && !res.ok) {
        setErrorMessage(res.error || "Payment checkout could not be started.");
      }
    } catch (err: unknown) {
      if ((err as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw err;
      setErrorMessage(err instanceof Error ? err.message : "Payment error occurred.");
    } finally {
      setLoadingAction(null);
    }
  };

  return (
    <div className="space-y-10 animate-in fade-in duration-500 max-w-5xl mx-auto px-4 sm:px-6">
      {/* Header */}
      <div className="text-center space-y-4 max-w-2xl mx-auto">
        <div className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent-soft/40 px-3.5 py-1 text-xs font-semibold text-accent tracking-wide uppercase">
          <Sparkles className="size-3.5 text-accent" />
          <span>Transparent Freemium Styling</span>
        </div>

        <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl font-medium tracking-tight text-foreground">
          Choose your styling journey
        </h1>

        <p className="text-sm sm:text-base text-muted leading-relaxed">
          Start for free with essential wardrobe cataloguing and weekly AI outfits, or unlock ClosetAI Premium for unlimited styling and high-capacity studio access.
        </p>

        {isCanceled && (
          <div className="rounded-xl border border-warning/40 bg-warning-soft/30 p-3 text-xs text-warning text-center">
            Checkout was canceled. You can continue with Free or select a plan below whenever you are ready.
          </div>
        )}

        {errorMessage && (
          <div className="rounded-xl border border-danger/40 bg-danger-soft/30 p-3 text-xs text-danger text-center">
            {errorMessage}
          </div>
        )}
      </div>

      {/* Plan Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-8 lg:gap-10 items-stretch max-w-4xl mx-auto pt-3">
        {/* FREE PLAN CARD */}
        <Card
          onClick={() => setSelectedTier("free")}
          className={`p-6 sm:p-8 flex flex-col justify-between transition-all duration-300 cursor-pointer rounded-2xl relative ${
            selectedTier === "free"
              ? "border-2 border-border-strong ring-2 ring-foreground/10 shadow-md bg-surface"
              : "border border-border/80 bg-surface/70 hover:border-border hover:bg-surface opacity-90 hover:opacity-100"
          }`}
        >
          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl sm:text-2xl font-serif font-semibold text-foreground">
                    {freePlan.name}
                  </h2>
                  {selectedTier === "free" && (
                    <span className="inline-flex size-2 rounded-full bg-muted" title="Active selection" />
                  )}
                </div>
                <p className="text-xs text-muted mt-0.5">{freePlan.tagline}</p>
              </div>
              <span className="rounded-full bg-surface-muted px-3 py-1 text-xs font-medium text-muted border border-border/60">
                Free Forever
              </span>
            </div>

            <div className="py-2">
              <div className="flex items-baseline gap-1">
                <span className="font-serif text-3xl sm:text-4xl font-semibold text-foreground">
                  Free
                </span>
                <span className="text-xs text-muted">/ forever</span>
              </div>
              <p className="text-xs text-muted mt-2 leading-relaxed">
                {freePlan.description}
              </p>
            </div>

            <div className="border-t border-border/60 pt-5 space-y-3">
              <p className="text-xs font-semibold tracking-wider text-muted uppercase">
                What&apos;s Included:
              </p>
              <ul className="space-y-2.5 text-xs sm:text-sm text-foreground/90">
                {freePlan.features.map((feat, idx) => (
                  <li key={idx} className="flex items-start gap-2.5">
                    <Check className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="pt-8 mt-6 border-t border-border/60">
            <Button
              type="button"
              variant={selectedTier === "free" ? "dark" : "outline"}
              className={`w-full text-sm font-medium py-5 transition-all ${
                selectedTier === "free"
                  ? "bg-foreground text-background hover:bg-foreground/90 shadow-xs"
                  : "border-border hover:bg-surface-muted text-foreground"
              }`}
              onClick={(e) => {
                e.stopPropagation();
                handleContinueFree();
              }}
              loading={loadingAction === "free" || isPending}
            >
              Continue with Free
            </Button>
            <p className="text-center text-[11px] text-muted mt-2">
              No credit card required. Upgrade anytime.
            </p>
          </div>
        </Card>

        {/* PREMIUM PLAN CARD — HIGHLIGHTED BY DEFAULT */}
        <Card
          onClick={() => setSelectedTier("premium")}
          className={`p-6 sm:p-8 flex flex-col justify-between relative transition-all duration-300 cursor-pointer rounded-2xl ${
            selectedTier === "premium"
              ? "border-2 border-accent ring-4 ring-accent/15 shadow-2xl shadow-accent/15 bg-gradient-to-b from-accent-soft/30 via-surface to-surface md:-translate-y-1.5"
              : "border-2 border-accent/60 bg-accent-soft/10 hover:border-accent hover:shadow-md"
          }`}
        >
          {/* Professional Centered Recommendation Badge */}
          <div className="absolute -top-3.5 left-1/2 -translate-x-1/2 z-20">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r from-accent via-[#a85338] to-accent px-4 py-1 text-[10.5px] font-bold text-white shadow-md shadow-accent/30 tracking-[0.14em] uppercase ring-1 ring-white/30 backdrop-blur-xs whitespace-nowrap">
              <Sparkles className="size-3 text-amber-200 fill-amber-200/40" />
              <span>Recommended &middot; Stylist Choice</span>
            </div>
          </div>

          <div className="space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-xl sm:text-2xl font-serif font-semibold text-foreground">
                    {premiumPlan.name}
                  </h2>
                  <span className="inline-flex items-center gap-1 rounded-full bg-accent/15 text-accent text-[10px] font-bold px-2 py-0.5 uppercase tracking-wider">
                    Full Access
                  </span>
                </div>
                <p className="text-xs text-muted mt-0.5">{premiumPlan.tagline}</p>
              </div>
            </div>

            {/* Billing Toggle & Currency Switcher */}
            <div className="space-y-3 pt-1">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                {/* Monthly vs Annual */}
                <div className="inline-flex rounded-full border border-border bg-surface-muted/60 p-0.5 text-xs font-medium">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setBillingPeriod("monthly");
                    }}
                    className={`px-3 py-1 rounded-full transition-all ${
                      billingPeriod === "monthly"
                        ? "bg-accent text-accent-contrast shadow-xs font-semibold"
                        : "text-muted hover:text-foreground"
                    }`}
                  >
                    Monthly
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setBillingPeriod("annual");
                    }}
                    className={`px-3 py-1 rounded-full transition-all flex items-center gap-1 ${
                      billingPeriod === "annual"
                        ? "bg-accent text-accent-contrast shadow-xs font-semibold"
                        : "text-muted hover:text-foreground"
                    }`}
                  >
                    <span>Annual</span>
                    <span className="text-[10px] font-bold bg-white/20 rounded px-1">
                      Save 17%
                    </span>
                  </button>
                </div>

                {/* Currency Switcher */}
                <div className="inline-flex rounded-full border border-border bg-surface-muted/60 p-0.5 text-xs font-medium">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setCurrency("NGN");
                    }}
                    className={`px-2.5 py-1 rounded-full transition-all ${
                      currency === "NGN"
                        ? "bg-foreground text-background shadow-xs font-semibold"
                        : "text-muted hover:text-foreground"
                    }`}
                  >
                    ₦ NGN
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setCurrency("USD");
                    }}
                    className={`px-2.5 py-1 rounded-full transition-all ${
                      currency === "USD"
                        ? "bg-foreground text-background shadow-xs font-semibold"
                        : "text-muted hover:text-foreground"
                    }`}
                  >
                    $ USD
                  </button>
                </div>
              </div>

              {/* Price display */}
              <div className="py-1">
                <div className="flex items-baseline gap-1">
                  <span className="font-serif text-3xl sm:text-4xl font-semibold text-foreground">
                    {currency === "NGN" ? premiumPlan.formattedNGN : premiumPlan.formattedUSD}
                  </span>
                  <span className="text-xs text-muted">
                    {billingPeriod === "annual" ? "/ year" : "/ month"}
                  </span>
                </div>
                <p className="text-xs text-muted mt-1 leading-relaxed">
                  {premiumPlan.description}
                </p>
              </div>
            </div>

            <div className="border-t border-border/60 pt-5 space-y-3">
              <p className="text-xs font-semibold tracking-wider text-accent uppercase">
                Included with Premium:
              </p>
              <ul className="space-y-2.5 text-xs sm:text-sm text-foreground/90">
                {premiumPlan.features.map((feat, idx) => (
                  <li key={idx} className="flex items-start gap-2.5">
                    <Check className="size-4 text-accent shrink-0 mt-0.5 font-bold" />
                    <span className="font-medium">{feat}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="pt-8 mt-6 border-t border-border/60">
            <Button
              type="button"
              className="w-full text-sm font-semibold py-5 bg-gradient-to-r from-accent via-[#a85338] to-accent hover:brightness-105 text-accent-contrast shadow-md shadow-accent/25 transition-all"
              onClick={(e) => {
                e.stopPropagation();
                handleGetPremium();
              }}
              loading={loadingAction === "paystack" || loadingAction === "stripe"}
            >
              <span>Get Premium ({currency === "NGN" ? premiumPlan.formattedNGN : premiumPlan.formattedUSD})</span>
              <ArrowRight className="size-4 ml-1.5" />
            </Button>
            <p className="text-center text-[11px] text-muted mt-2">
              Safe 256-bit checkout via {currency === "NGN" ? "Paystack" : "Stripe"}. Cancel anytime.
            </p>
          </div>
        </Card>
      </div>

      {/* Feature Comparison Table */}
      <div className="max-w-4xl mx-auto pt-6">
        <h3 className="text-lg sm:text-xl font-serif font-medium text-center text-foreground mb-6">
          Detailed Plan Feature Comparison
        </h3>

        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-left text-xs sm:text-sm">
            <thead>
              <tr className="border-b border-border bg-surface-muted/40 text-muted font-medium">
                <th className="p-3.5 sm:p-4">Feature / Capability</th>
                <th className="p-3.5 sm:p-4 w-32 sm:w-44 font-semibold text-foreground">ClosetAI Free</th>
                <th className="p-3.5 sm:p-4 w-36 sm:w-48 font-semibold text-accent">ClosetAI Premium</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60 text-foreground/90">
              <tr>
                <td className="p-3.5 sm:p-4 font-medium">Digital Wardrobe Capacity</td>
                <td className="p-3.5 sm:p-4 text-muted">Up to 30 items</td>
                <td className="p-3.5 sm:p-4 font-semibold text-accent">Unlimited items</td>
              </tr>
              <tr>
                <td className="p-3.5 sm:p-4 font-medium">AI Outfit Recommendations</td>
                <td className="p-3.5 sm:p-4 text-muted">5 / week (resets Mondays)</td>
                <td className="p-3.5 sm:p-4 font-semibold text-accent">100 / month</td>
              </tr>
              <tr>
                <td className="p-3.5 sm:p-4 font-medium">Saved Outfits in Studio</td>
                <td className="p-3.5 sm:p-4 text-muted">Up to 10 outfits</td>
                <td className="p-3.5 sm:p-4 font-semibold text-accent">Unlimited saved outfits</td>
              </tr>
              <tr>
                <td className="p-3.5 sm:p-4 font-medium">Flatlay Studio Saved Designs</td>
                <td className="p-3.5 sm:p-4 text-muted">3 saved boards</td>
                <td className="p-3.5 sm:p-4 font-semibold text-accent">Unlimited saved boards</td>
              </tr>
              <tr>
                <td className="p-3.5 sm:p-4 font-medium">Garment Beautify & Background Cuts</td>
                <td className="p-3.5 sm:p-4 text-muted">2 / month</td>
                <td className="p-3.5 sm:p-4 font-semibold text-accent">30 / month</td>
              </tr>
              <tr>
                <td className="p-3.5 sm:p-4 font-medium">Personalized Styling Depth</td>
                <td className="p-3.5 sm:p-4 text-muted">Basic recommendations</td>
                <td className="p-3.5 sm:p-4 font-semibold text-accent">Advanced deep-context styling</td>
              </tr>
              <tr>
                <td className="p-3.5 sm:p-4 font-medium">ClosetAI Connect Social Sharing</td>
                <td className="p-3.5 sm:p-4 text-muted">Basic connect access</td>
                <td className="p-3.5 sm:p-4 font-semibold text-accent">Full messaging & outfit sharing</td>
              </tr>
              <tr>
                <td className="p-3.5 sm:p-4 font-medium">Wardrobe & Cost-Per-Wear Analytics</td>
                <td className="p-3.5 sm:p-4 text-muted">Basic item counts</td>
                <td className="p-3.5 sm:p-4 font-semibold text-accent">Comprehensive analytics</td>
              </tr>
              <tr>
                <td className="p-3.5 sm:p-4 font-medium">7-Stage Laundry Tracking</td>
                <td className="p-3.5 sm:p-4 text-emerald-600 dark:text-emerald-400 font-medium">Full access</td>
                <td className="p-3.5 sm:p-4 text-emerald-600 dark:text-emerald-400 font-medium">Full access</td>
              </tr>
              <tr>
                <td className="p-3.5 sm:p-4 font-medium">Smart Weather & Packing Capsules</td>
                <td className="p-3.5 sm:p-4 text-emerald-600 dark:text-emerald-400 font-medium">Included</td>
                <td className="p-3.5 sm:p-4 text-emerald-600 dark:text-emerald-400 font-medium">Included</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* Trust & Guarantee Footer */}
      <div className="text-center max-w-xl mx-auto space-y-2 pt-4 border-t border-border/50 text-xs text-muted">
        <div className="flex items-center justify-center gap-4 text-foreground/80">
          <span className="inline-flex items-center gap-1">
            <ShieldCheck className="size-4 text-accent" />
            256-bit Secure Checkout
          </span>
          <span>•</span>
          <span>Cancel Anytime</span>
          <span>•</span>
          <span>No Lock-in</span>
        </div>
        <p className="leading-relaxed">
          If you ever cancel or your subscription expires, your wardrobe, outfits, photos, and preferences are safely preserved and never deleted.
        </p>
      </div>
    </div>
  );
}

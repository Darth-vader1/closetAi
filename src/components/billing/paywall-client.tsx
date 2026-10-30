"use client";

import { useState } from "react";
import { Check, ShieldCheck, Sparkles, CreditCard, Globe, Zap, ArrowRight, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { PricingPlan } from "@/lib/billing/plans";
import { createPaystackCheckoutAction, createStripeCheckoutAction } from "@/app/paywall/actions";

interface PaywallClientProps {
  userEmail?: string;
  plans: PricingPlan[];
  isCanceled?: boolean;
}

export function PaywallClient({ plans, isCanceled }: PaywallClientProps) {
  const [selectedPlanId, setSelectedPlanId] = useState<string>("monthly");
  const [currency, setCurrency] = useState<"NGN" | "USD">("NGN");
  const [loadingProvider, setLoadingProvider] = useState<"paystack" | "stripe" | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const selectedPlan = plans.find((p) => p.id === selectedPlanId) || plans[0]!;

  const handlePaystackCheckout = async () => {
    setLoadingProvider("paystack");
    setErrorMessage(null);
    try {
      const res = await createPaystackCheckoutAction(selectedPlan.id);
      if (res && !res.ok) {
        setErrorMessage(res.error || "Could not start Paystack checkout.");
      }
    } catch (err: unknown) {
      if ((err as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw err;
      setErrorMessage(err instanceof Error ? err.message : "Payment error occurred.");
    } finally {
      setLoadingProvider(null);
    }
  };

  const handleStripeCheckout = async () => {
    setLoadingProvider("stripe");
    setErrorMessage(null);
    try {
      const res = await createStripeCheckoutAction(selectedPlan.id);
      if (res && !res.ok) {
        setErrorMessage(res.error || "Could not start Stripe checkout.");
      }
    } catch (err: unknown) {
      if ((err as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw err;
      setErrorMessage(err instanceof Error ? err.message : "Payment error occurred.");
    } finally {
      setLoadingProvider(null);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header Badge & Title */}
      <div className="text-center space-y-3 max-w-2xl mx-auto">
        <div className="inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-accent-soft/50 px-3.5 py-1 text-xs font-semibold text-accent tracking-wide uppercase">
          <Sparkles className="size-3.5 text-accent" />
          <span>Membership Access</span>
        </div>

        <h1 className="font-serif text-3xl sm:text-4xl md:text-5xl font-medium tracking-tight text-foreground">
          Unlock your complete AI wardrobe stylist
        </h1>

        <p className="text-sm sm:text-base text-muted leading-relaxed">
          Your profile & styling preferences are saved! Subscribe to activate your intelligent digital closet, daily weather outfits, and AI flatlay studio.
        </p>

        {isCanceled && (
          <div className="rounded-xl border border-warning/40 bg-warning-soft/30 p-3 text-xs text-warning text-center">
            Checkout was canceled. Select a plan below whenever you are ready.
          </div>
        )}

        {errorMessage && (
          <div className="rounded-xl border border-danger/40 bg-danger-soft/30 p-3 text-xs text-danger text-center">
            {errorMessage}
          </div>
        )}
      </div>

      {/* Currency Switcher Toggle */}
      <div className="flex justify-center">
        <div className="inline-flex rounded-full border border-border bg-surface-muted/50 p-1 text-xs font-medium">
          <button
            type="button"
            onClick={() => setCurrency("NGN")}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full transition-all ${
              currency === "NGN"
                ? "bg-accent text-accent-contrast shadow-xs"
                : "text-muted hover:text-foreground"
            }`}
          >
            <span>₦ Naira (Paystack)</span>
          </button>
          <button
            type="button"
            onClick={() => setCurrency("USD")}
            className={`flex items-center gap-1.5 px-4 py-1.5 rounded-full transition-all ${
              currency === "USD"
                ? "bg-accent text-accent-contrast shadow-xs"
                : "text-muted hover:text-foreground"
            }`}
          >
            <Globe className="size-3.5" />
            <span>USD / International (Stripe)</span>
          </button>
        </div>
      </div>

      {/* Pricing Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-3xl mx-auto items-stretch">
        {plans.map((plan) => {
          const isSelected = plan.id === selectedPlanId;
          const displayPrice = currency === "NGN" ? plan.formattedNGN : plan.formattedUSD;
          const periodLabel = plan.period === "monthly" ? "/month" : "/year";

          return (
            <Card
              key={plan.id}
              onClick={() => setSelectedPlanId(plan.id)}
              className={`relative flex flex-col justify-between p-6 sm:p-8 cursor-pointer rounded-3xl transition-all duration-200 border-2 ${
                isSelected
                  ? "border-accent shadow-xl bg-surface ring-2 ring-accent/20"
                  : "border-border bg-surface/70 hover:border-border-strong hover:bg-surface"
              }`}
            >
              {plan.badge && (
                <span className="absolute -top-3 right-6 rounded-full bg-accent px-3 py-0.5 text-[11px] font-semibold text-accent-contrast shadow-sm uppercase tracking-wide">
                  {plan.badge}
                </span>
              )}

              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-serif text-xl font-medium text-foreground">{plan.name}</h3>
                  <div
                    className={`size-5 rounded-full border-2 grid place-items-center transition-colors ${
                      isSelected ? "border-accent bg-accent text-accent-contrast" : "border-muted"
                    }`}
                  >
                    {isSelected && <Check className="size-3 stroke-[3]" />}
                  </div>
                </div>

                <p className="text-xs text-muted leading-relaxed min-h-[32px]">{plan.description}</p>

                <div className="pt-2">
                  <span className="font-serif text-3xl sm:text-4xl font-medium tracking-tight text-foreground">
                    {displayPrice}
                  </span>
                  <span className="text-xs text-muted font-medium ml-1.5">{periodLabel}</span>
                </div>

                <div className="border-t border-border/70 pt-4 space-y-2.5">
                  <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">What&apos;s included:</span>
                  <ul className="space-y-2 text-xs text-foreground/90">
                    {plan.features.map((feat) => (
                      <li key={feat} className="flex items-start gap-2.5">
                        <Check className="size-4 shrink-0 text-accent mt-0.5" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Checkout Action Area */}
      <div className="max-w-md mx-auto space-y-4 text-center">
        {currency === "NGN" ? (
          <Button
            type="button"
            variant="primary"
            size="lg"
            onClick={handlePaystackCheckout}
            loading={loadingProvider === "paystack"}
            className="w-full text-sm font-semibold rounded-2xl py-6 gap-2 shadow-lg"
          >
            <span>Pay {selectedPlan.formattedNGN} with Paystack</span>
            <ArrowRight className="size-4" />
          </Button>
        ) : (
          <Button
            type="button"
            variant="primary"
            size="lg"
            onClick={handleStripeCheckout}
            loading={loadingProvider === "stripe"}
            className="w-full text-sm font-semibold rounded-2xl py-6 gap-2 shadow-lg"
          >
            <CreditCard className="size-4" />
            <span>Pay {selectedPlan.formattedUSD} with Stripe</span>
            <ArrowRight className="size-4" />
          </Button>
        )}

        <div className="flex items-center justify-center gap-4 text-[11px] text-muted">
          <span className="inline-flex items-center gap-1">
            <Lock className="size-3 text-accent" />
            Secure Encrypted Checkout
          </span>
          <span>•</span>
          <span className="inline-flex items-center gap-1">
            <Zap className="size-3 text-accent" />
            Instant Activation
          </span>
          <span>•</span>
          <span className="inline-flex items-center gap-1">
            <ShieldCheck className="size-3 text-accent" />
            Cancel Anytime
          </span>
        </div>
      </div>
    </div>
  );
}

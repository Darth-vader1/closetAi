"use server";

import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { getAppUrl } from "@/lib/env";
import { logger } from "@/lib/logger";
import { createClient } from "@/lib/supabase/server";
import { PRICING_PLANS } from "@/lib/billing/plans";
import { initializePaystackTransaction } from "@/lib/billing/paystack";
import { createStripeCheckoutSession } from "@/lib/billing/stripe";

export async function createPaystackCheckoutAction(planId: string = "monthly") {
  const user = await requireUser();
  const plan = PRICING_PLANS[planId] || PRICING_PLANS.monthly;
  const appUrl = getAppUrl();

  const callbackUrl = `${appUrl}/paywall/callback?provider=paystack`;

  try {
    const res = await initializePaystackTransaction({
      email: user.email || "customer@closetai.app",
      amountKobo: plan.priceNGN * 100, // 999 NGN = 99900 kobo
      planCode: plan.paystackPlanCode || undefined,
      callbackUrl,
      metadata: {
        userId: user.id,
        planId: plan.id,
      },
    });

    if (res.status && res.data?.authorization_url) {
      redirect(res.data.authorization_url);
    }

    return { ok: false, error: res.message || "Failed to initialize Paystack transaction." };
  } catch (err: unknown) {
    if ((err as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) {
      throw err;
    }
    logger.error("billing.paystack_init_failed", { userId: user.id, error: err });
    return { ok: false, error: err instanceof Error ? err.message : "Payment initialization failed." };
  }
}

export async function createStripeCheckoutAction(planId: string = "monthly") {
  const user = await requireUser();
  const plan = PRICING_PLANS[planId] || PRICING_PLANS.monthly;
  const appUrl = getAppUrl();

  const successUrl = `${appUrl}/paywall/callback?provider=stripe&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${appUrl}/paywall?canceled=true`;

  try {
    const session = await createStripeCheckoutSession({
      userId: user.id,
      email: user.email || "customer@closetai.app",
      planId: plan.id as "monthly" | "annual",
      priceUSD: plan.priceUSD,
      successUrl,
      cancelUrl,
    });

    if (session.url) {
      redirect(session.url);
    }

    return { ok: false, error: "Failed to generate Stripe checkout URL." };
  } catch (err: unknown) {
    if ((err as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) {
      throw err;
    }
    logger.error("billing.stripe_init_failed", { userId: user.id, error: err });
    return { ok: false, error: err instanceof Error ? err.message : "Stripe checkout failed." };
  }
}

export async function activateUserSubscription(userId: string, data: {
  planId: string;
  provider: "paystack" | "stripe" | "manual";
  customerId?: string;
  subscriptionId?: string;
  amount: number;
  currency: string;
  periodEnd?: string;
}) {
  const supabase = await createClient();

  const expiresAt = data.periodEnd || new Date(Date.now() + 32 * 24 * 60 * 60 * 1000).toISOString();

  // 1. Update profiles table
  await supabase
    .from("profiles")
    .update({
      subscription_status: "active",
      subscription_plan: data.planId,
      subscription_provider: data.provider,
      subscription_expires_at: expiresAt,
      customer_id: data.customerId || null,
    })
    .eq("id", userId);

  // 2. Insert into subscriptions table (if present)
  try {
    await supabase.from("subscriptions").insert({
      user_id: userId,
      provider: data.provider,
      provider_subscription_id: data.subscriptionId || null,
      provider_customer_id: data.customerId || null,
      plan_code: data.planId,
      amount: data.amount,
      currency: data.currency,
      status: "active",
      current_period_start: new Date().toISOString(),
      current_period_end: expiresAt,
    });
  } catch (err) {
    logger.warn("billing.subscriptions_insert_skipped", { error: err });
  }
}

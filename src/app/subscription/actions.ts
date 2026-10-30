"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { requireUser } from "@/lib/auth/session";
import { initializePaystackTransaction } from "@/lib/billing/paystack";
import { PRICING_PLANS } from "@/lib/billing/plans";
import { createStripeCheckoutSession } from "@/lib/billing/stripe";
import { getAppUrl } from "@/lib/env";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

/**
 * Activated when a user clicks "Continue with Free" on the subscription selection page.
 * Guarantees onboarding is marked complete and redirects them to the dashboard.
 */
export async function continueWithFreePlanAction() {
  const user = await requireUser();
  const supabase = await createClient();

  // Ensure onboarding is marked complete
  await supabase
    .from("profiles")
    .update({
      onboarding_completed_at: new Date().toISOString(),
    })
    .eq("id", user.id);

  // Ensure user_subscriptions has a record
  try {
    let adminClient;
    try {
      adminClient = createAdminClient();
    } catch {
      adminClient = supabase;
    }

    await adminClient
      .from("user_subscriptions")
      .upsert({
        user_id: user.id,
        plan_id: "free",
        status: "active",
        provider: "manual",
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
  } catch (err) {
    logger.warn("subscription.free_upsert_failed", { userId: user.id, error: err });
  }

  redirect("/dashboard");
}

async function getRequestOrigin(): Promise<string> {
  try {
    const headerList = await headers();
    const host = headerList.get("x-forwarded-host") || headerList.get("host");
    const proto =
      headerList.get("x-forwarded-proto") ||
      (host?.includes("localhost") || host?.includes("127.0.0.1") ? "http" : "https");
    if (host) {
      return `${proto}://${host}`.replace(/\/$/, "");
    }
  } catch {
    // fallback if headers are unavailable
  }
  return getAppUrl();
}

export async function createSubscriptionCheckoutAction(
  planId: "monthly" | "annual",
  provider: "paystack" | "stripe"
) {
  const user = await requireUser();
  const plan = PRICING_PLANS[planId] || PRICING_PLANS.monthly;
  const appUrl = await getRequestOrigin();

  if (provider === "paystack") {
    const callbackUrl = `${appUrl}/subscription/callback?provider=paystack`;
    try {
      const res = await initializePaystackTransaction({
        email: user.email || "customer@closetai.app",
        amountKobo: plan.priceNGN * 100,
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

      return { ok: false, error: res.message || "Failed to initialize Paystack checkout." };
    } catch (err: unknown) {
      if ((err as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw err;
      logger.error("billing.paystack_init_failed", { userId: user.id, error: err });
      return { ok: false, error: err instanceof Error ? err.message : "Payment initialization failed." };
    }
  }

  // Stripe checkout
  const successUrl = `${appUrl}/subscription/callback?provider=stripe&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${appUrl}/subscription?canceled=true`;

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
    if ((err as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw err;
    logger.error("billing.stripe_init_failed", { userId: user.id, error: err });
    return { ok: false, error: err instanceof Error ? err.message : "Stripe checkout failed." };
  }
}

/**
 * Server-side activation of user premium subscription.
 * Updates user_subscriptions, profiles, and logs to payment_transactions.
 */
export async function activateUserSubscription(
  userId: string,
  data: {
    planId: "monthly" | "annual";
    provider: "paystack" | "stripe" | "manual";
    customerId?: string;
    subscriptionId?: string;
    reference: string;
    amount: number;
    currency: string;
    periodEnd?: string;
  }
) {
  let adminClient;
  try {
    adminClient = createAdminClient();
  } catch {
    adminClient = await createClient();
  }

  const periodDays = data.planId === "annual" ? 366 : 32;
  const expiresAt = data.periodEnd || new Date(Date.now() + periodDays * 24 * 60 * 60 * 1000).toISOString();

  // 1. Update profiles table
  await adminClient
    .from("profiles")
    .update({
      subscription_status: "active",
      subscription_plan: data.planId,
      subscription_provider: data.provider,
      subscription_expires_at: expiresAt,
      customer_id: data.customerId || null,
      onboarding_completed_at: new Date().toISOString(),
    })
    .eq("id", userId);

  // 2. Upsert user_subscriptions table
  try {
    await adminClient
      .from("user_subscriptions")
      .upsert({
        user_id: userId,
        plan_id: data.planId,
        status: "active",
        provider: data.provider,
        provider_subscription_id: data.subscriptionId || null,
        provider_customer_id: data.customerId || null,
        current_period_start: new Date().toISOString(),
        current_period_end: expiresAt,
        cancel_at_period_end: false,
        updated_at: new Date().toISOString(),
      }, { onConflict: "user_id" });
  } catch (err) {
    logger.warn("subscription.user_subscriptions_upsert_failed", { userId, error: err });
  }

  // 3. Insert payment_transactions record
  try {
    await adminClient
      .from("payment_transactions")
      .insert({
        user_id: userId,
        provider: data.provider,
        reference: data.reference,
        amount: data.amount,
        currency: data.currency,
        status: "success",
        plan_id: data.planId,
        metadata: {
          subscriptionId: data.subscriptionId,
          customerId: data.customerId,
          activatedAt: new Date().toISOString(),
        },
      });
  } catch (err) {
    logger.warn("subscription.payment_transactions_insert_failed", { userId, reference: data.reference, error: err });
  }

  logger.info("subscription.activated", {
    userId,
    planId: data.planId,
    provider: data.provider,
    expiresAt,
  });
}

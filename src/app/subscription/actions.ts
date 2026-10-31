"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { requireUser } from "@/lib/auth/session";
import { initializePaystackTransaction } from "@/lib/billing/paystack";
import { PRICING_PLANS, isAllowedPlanId } from "@/lib/billing/plans";
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
  if (!isAllowedPlanId(planId)) {
    return { ok: false, error: "Invalid subscription plan." };
  }
  const plan = PRICING_PLANS[planId];
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

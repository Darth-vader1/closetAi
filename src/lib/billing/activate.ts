import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { PRICING_PLANS, isAllowedPlanId } from "@/lib/billing/plans";
import { logger } from "@/lib/logger";

export interface ActivateSubscriptionInput {
  planId: "monthly" | "annual";
  provider: "paystack" | "stripe" | "manual";
  reference: string;
  amount: number;
  currency: string;
  customerId?: string;
  subscriptionId?: string;
  periodEnd?: string;
}

export interface ActivationResult {
  ok: boolean;
  skipped?: boolean;
  error?: string;
}

/**
 * Finds a user id by payment gateway customer code / customer ID.
 */
export async function findUserIdByCustomerCode(
  provider: "paystack" | "stripe",
  customerCode: string
): Promise<string | null> {
  if (!customerCode) return null;
  const adminClient = createAdminClient();

  // 1. Search user_subscriptions by provider_customer_id
  const { data: sub } = await adminClient
    .from("user_subscriptions")
    .select("user_id")
    .eq("provider", provider)
    .eq("provider_customer_id", customerCode)
    .maybeSingle();

  if (sub?.user_id) return sub.user_id;

  // 2. Search profiles by customer_id
  const { data: prof } = await adminClient
    .from("profiles")
    .select("id")
    .eq("customer_id", customerCode)
    .maybeSingle();

  if (prof?.id) return prof.id;

  // 3. Search subscriptions table
  const { data: legacySub } = await adminClient
    .from("subscriptions")
    .select("user_id")
    .eq("provider", provider)
    .eq("provider_customer_id", customerCode)
    .maybeSingle();

  return legacySub?.user_id || null;
}

/**
 * Extends the subscription period end for renewal events (e.g. invoice.paid).
 */
export async function extendUserSubscriptionExpiry(
  userId: string,
  newPeriodEnd: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const adminClient = createAdminClient();

    await Promise.all([
      adminClient
        .from("profiles")
        .update({
          subscription_status: "active",
          subscription_expires_at: newPeriodEnd,
        })
        .eq("id", userId),
      adminClient
        .from("user_subscriptions")
        .update({
          status: "active",
          current_period_end: newPeriodEnd,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId),
      adminClient
        .from("subscriptions")
        .update({
          status: "active",
          current_period_end: newPeriodEnd,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId),
    ]);

    logger.info("billing.subscription_expiry_extended", { userId, newPeriodEnd });
    return { ok: true };
  } catch (err) {
    logger.error("billing.extend_expiry_failed", { userId, error: err });
    return { ok: false, error: err instanceof Error ? err.message : "Failed to extend expiry" };
  }
}

/**
 * Revokes subscription access when canceled, failed, or disabled.
 */
export async function revokeUserSubscription(
  userId: string,
  status: "canceled" | "past_due" | "unpaid" | "expired" = "canceled"
): Promise<{ ok: boolean; error?: string }> {
  try {
    const adminClient = createAdminClient();

    await Promise.all([
      adminClient
        .from("profiles")
        .update({
          subscription_status: status,
        })
        .eq("id", userId),
      adminClient
        .from("user_subscriptions")
        .update({
          status,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId),
      adminClient
        .from("subscriptions")
        .update({
          status,
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", userId),
    ]);

    logger.info("billing.subscription_revoked", { userId, status });
    return { ok: true };
  } catch (err) {
    logger.error("billing.revoke_failed", { userId, status, error: err });
    return { ok: false, error: err instanceof Error ? err.message : "Failed to revoke access" };
  }
}

/**
 * Records a refunded transaction and revokes access.
 */
export async function recordPaymentRefund(
  reference: string,
  provider: "paystack" | "stripe"
): Promise<{ ok: boolean }> {
  try {
    const adminClient = createAdminClient();

    const { data: tx } = await adminClient
      .from("payment_transactions")
      .select("user_id")
      .eq("reference", reference)
      .maybeSingle();

    await adminClient
      .from("payment_transactions")
      .update({ status: "refunded" })
      .eq("reference", reference);

    if (tx?.user_id) {
      await revokeUserSubscription(tx.user_id, "canceled");
    }

    logger.info("billing.refund_recorded", { reference, provider, userId: tx?.user_id });
    return { ok: true };
  } catch (err) {
    logger.error("billing.refund_record_failed", { reference, error: err });
    return { ok: false };
  }
}

/**
 * Server-side authoritative activation of user premium subscription.
 *
 * Requirements:
 * - Uses createAdminClient() to bypass RLS with service-role permissions.
 * - Validates planId against allowlist ('monthly', 'annual') before indexing PRICING_PLANS.
 * - Verifies paid amount and currency match PRICING_PLANS.
 * - Enforces idempotency: skips if provider+reference was already recorded, catching unique violations.
 */
export async function activateUserSubscription(
  userId: string,
  data: ActivateSubscriptionInput
): Promise<ActivationResult> {
  // 1. Validate planId against allowlist before indexing PRICING_PLANS
  if (!isAllowedPlanId(data.planId)) {
    logger.warn("billing.activate.invalid_plan_rejected", { userId, planId: data.planId });
    return { ok: false, error: "Invalid subscription plan identifier." };
  }

  const expectedPlan = PRICING_PLANS[data.planId];

  // 2. Verify paid amount and currency match PRICING_PLANS
  if (data.provider !== "manual") {
    const currencyUpper = data.currency.toUpperCase();

    if (data.provider === "paystack") {
      const expectedKobo = expectedPlan.priceNGN * 100;
      const matchesKobo = data.amount === expectedKobo;

      if (currencyUpper !== "NGN" || !matchesKobo) {
        logger.error("billing.activate.amount_mismatch_rejected", {
          userId,
          provider: data.provider,
          receivedAmount: data.amount,
          receivedCurrency: data.currency,
          expectedAmountKobo: expectedKobo,
        });
        return { ok: false, error: "Paid amount or currency does not match pricing plan." };
      }
    } else if (data.provider === "stripe") {
      const expectedCents = Math.round(expectedPlan.priceUSD * 100);
      const matchesCents = data.amount === expectedCents;

      if (currencyUpper !== "USD" || !matchesCents) {
        logger.error("billing.activate.amount_mismatch_rejected", {
          userId,
          provider: data.provider,
          receivedAmount: data.amount,
          receivedCurrency: data.currency,
          expectedAmountCents: expectedCents,
        });
        return { ok: false, error: "Paid amount or currency does not match pricing plan." };
      }
    }
  }

  const adminClient = createAdminClient();

  // 3. Skip if provider+reference was already recorded
  const { data: existingTx } = await adminClient
    .from("payment_transactions")
    .select("id")
    .eq("provider", data.provider)
    .eq("reference", data.reference)
    .maybeSingle();

  if (existingTx) {
    logger.info("billing.activate.reference_already_recorded_skipped", {
      userId,
      provider: data.provider,
      reference: data.reference,
    });
    return { ok: true, skipped: true };
  }

  const periodDays = data.planId === "annual" ? 366 : 32;
  const expiresAt = data.periodEnd || new Date(Date.now() + periodDays * 24 * 60 * 60 * 1000).toISOString();

  // 4. Insert payment_transactions record (catching unique violation)
  const { error: txErr } = await adminClient
    .from("payment_transactions")
    .insert({
      user_id: userId,
      provider: data.provider,
      reference: data.reference,
      amount: data.amount,
      currency: data.currency.toUpperCase(),
      status: "success",
      plan_id: data.planId,
      metadata: {
        subscriptionId: data.subscriptionId,
        customerId: data.customerId,
        activatedAt: new Date().toISOString(),
      },
    });

  if (txErr) {
    // Unique violation code: 23505
    if (
      txErr.code === "23505" ||
      txErr.message?.toLowerCase().includes("unique") ||
      txErr.message?.toLowerCase().includes("duplicate")
    ) {
      logger.info("billing.activate.unique_constraint_caught_skipped", {
        userId,
        reference: data.reference,
        error: txErr,
      });
      return { ok: true, skipped: true };
    }

    logger.error("billing.activate.tx_insert_failed", { userId, reference: data.reference, error: txErr });
    return { ok: false, error: "Failed to record payment transaction." };
  }

  // 5. Insert into subscriptions table (catching unique index subscriptions_provider_ref_uniq)
  try {
    await adminClient
      .from("subscriptions")
      .insert({
        user_id: userId,
        provider: data.provider,
        provider_subscription_id: data.reference,
        provider_customer_id: data.customerId || null,
        plan_code: data.planId,
        amount: data.amount,
        currency: data.currency.toUpperCase(),
        status: "active",
        current_period_start: new Date().toISOString(),
        current_period_end: expiresAt,
        metadata: {
          subscriptionId: data.subscriptionId,
          activatedAt: new Date().toISOString(),
        },
      });
  } catch (subErr: unknown) {
    const errObj = subErr as { code?: string; message?: string };
    if (
      errObj?.code === "23505" ||
      errObj?.message?.includes("subscriptions_provider_ref_uniq") ||
      errObj?.message?.toLowerCase().includes("duplicate")
    ) {
      logger.info("billing.activate.subscriptions_table_uniq_caught", { reference: data.reference });
      return { ok: true, skipped: true };
    }
    logger.warn("billing.activate.subscriptions_insert_warning", { userId, error: subErr });
  }

  // 6. Update profiles table
  const { error: profileErr } = await adminClient
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

  if (profileErr) {
    logger.error("billing.activate.profile_update_failed", { userId, error: profileErr });
  }

  // 7. Upsert user_subscriptions table
  try {
    await adminClient
      .from("user_subscriptions")
      .upsert(
        {
          user_id: userId,
          plan_id: data.planId,
          status: "active",
          provider: data.provider,
          provider_subscription_id: data.subscriptionId || data.reference,
          provider_customer_id: data.customerId || null,
          current_period_start: new Date().toISOString(),
          current_period_end: expiresAt,
          cancel_at_period_end: false,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" }
      );
  } catch (userSubErr) {
    logger.warn("billing.activate.user_subscriptions_upsert_failed", { userId, error: userSubErr });
  }

  // 8. Deliver luxury VIP welcome email
  try {
    const { data: userProfile } = await adminClient
      .from("profiles")
      .select("display_name")
      .eq("id", userId)
      .maybeSingle();

    let userEmail: string | null = null;
    try {
      const { data: authUser } = await adminClient.auth.admin.getUserById(userId);
      userEmail = authUser?.user?.email || null;
    } catch {
      // ignore
    }

    if (userEmail) {
      const { renderPremiumWelcomeHtml } = await import("@/lib/email/templates");
      const { sendEmail } = await import("@/lib/email/service");

      const formattedAmount =
        data.currency.toUpperCase() === "NGN"
          ? `₦${(data.amount / 100).toLocaleString()}`
          : `$${(data.amount / 100).toFixed(2)}`;

      await sendEmail({
        to: userEmail,
        subject: "✨ Welcome to ClosetAI Premium — VIP Styling Atelier Unlocked",
        html: renderPremiumWelcomeHtml({
          displayName: userProfile?.display_name,
          planId: data.planId,
          amountFormatted: formattedAmount,
          reference: data.reference,
          provider: data.provider,
          expiresAt,
        }),
      });
      logger.info("billing.activate.welcome_email_dispatched", { userId, email: userEmail, planId: data.planId });
    }
  } catch (emailErr) {
    logger.warn("billing.activate.welcome_email_failed", { userId, error: emailErr });
  }

  logger.info("billing.activate.success", {
    userId,
    planId: data.planId,
    provider: data.provider,
    reference: data.reference,
    expiresAt,
  });

  return { ok: true };
}

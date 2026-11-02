"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { PAYSTACK_SECRET_KEY } from "@/lib/billing/plans";
import {
  activateUserSubscription,
  findUserIdByCustomerCode,
  findUserIdByEmail,
} from "@/lib/billing/activate";
import { logger } from "@/lib/logger";

export async function updateUserRoleAction(
  userId: string,
  newRole: "user" | "admin" | "superadmin"
): Promise<{ ok: boolean; error?: string }> {
  const admin = await requireAdmin();
  const adminClient = createAdminClient();

  // Prevent an admin removing the last superadmin
  if (newRole !== "superadmin") {
    const { data: targetProfile, error: targetError } = await adminClient
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle();

    if (targetError) {
      logger.error("admin.check_target_role_failed", { userId, error: targetError });
      return { ok: false, error: "Failed to verify user permissions." };
    }

    if (targetProfile?.role === "superadmin") {
      const { count, error: countError } = await adminClient
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("role", "superadmin");

      if (countError) {
        logger.error("admin.count_superadmins_failed", { error: countError });
        return { ok: false, error: "Failed to verify superadmin count." };
      }

      if ((count ?? 0) <= 1) {
        return { ok: false, error: "Cannot remove or demote the last superadmin." };
      }
    }
  }

  // Update target user role using service-role client
  const { error: updateError } = await adminClient
    .from("profiles")
    .update({ role: newRole })
    .eq("id", userId);

  if (updateError) {
    logger.error("admin.update_role_failed", { adminId: admin.id, userId, error: updateError });
    return { ok: false, error: "Failed to update user role." };
  }

  // Write audit log entry in the same action without swallowing errors
  const { error: auditError } = await adminClient
    .from("admin_audit_logs")
    .insert({
      admin_id: admin.id,
      action: "UPDATE_ROLE",
      target_user_id: userId,
      details: { newRole },
    });

  if (auditError) {
    logger.error("admin.audit_log_failed", { adminId: admin.id, error: auditError });
    return { ok: false, error: "Failed to record administrative audit log." };
  }

  revalidatePath("/admin/users");
  revalidatePath("/admin");
  return { ok: true };
}

export async function grantVipSubscriptionAction(
  userId: string,
  durationDays: number = 30
): Promise<{ ok: boolean; error?: string }> {
  const admin = await requireAdmin();
  const adminClient = createAdminClient();

  const expiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString();

  // 1. Update profiles table
  const { error: profileError } = await adminClient
    .from("profiles")
    .update({
      subscription_status: "active",
      subscription_plan: "monthly",
      subscription_provider: "manual",
      subscription_expires_at: expiresAt,
    })
    .eq("id", userId);

  if (profileError) {
    logger.error("admin.grant_vip_profile_failed", { adminId: admin.id, userId, error: profileError });
    return { ok: false, error: "Failed to grant subscription." };
  }

  // 2. Update user_subscriptions table
  const { error: userSubError } = await adminClient
    .from("user_subscriptions")
    .upsert(
      {
        user_id: userId,
        plan_id: "monthly",
        status: "active",
        provider: "manual",
        current_period_start: new Date().toISOString(),
        current_period_end: expiresAt,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "user_id" }
    );

  if (userSubError) {
    logger.error("admin.grant_vip_user_sub_failed", { adminId: admin.id, userId, error: userSubError });
    return { ok: false, error: "Failed to update subscription record." };
  }

  // 3. Record in subscriptions table
  const { error: subError } = await adminClient
    .from("subscriptions")
    .insert({
      user_id: userId,
      provider: "manual",
      provider_subscription_id: `manual_vip_${Date.now()}_${userId.slice(0, 8)}`,
      plan_code: "monthly",
      amount: 0,
      currency: "NGN",
      status: "active",
      current_period_start: new Date().toISOString(),
      current_period_end: expiresAt,
      metadata: { grantedBy: admin.id },
    });

  if (subError) {
    logger.warn("admin.grant_vip_legacy_sub_warning", { userId, error: subError });
  }

  // 4. Write audit log entry in the same action without swallowing errors
  const { error: auditError } = await adminClient
    .from("admin_audit_logs")
    .insert({
      admin_id: admin.id,
      action: "GRANT_VIP",
      target_user_id: userId,
      details: { durationDays, expiresAt },
    });

  if (auditError) {
    logger.error("admin.audit_log_failed", { adminId: admin.id, error: auditError });
    return { ok: false, error: "Failed to record administrative audit log." };
  }

  revalidatePath("/admin/users");
  revalidatePath("/admin/subscriptions");
  revalidatePath("/admin");
  return { ok: true };
}

export async function reconcileGatewayPaymentsAction(): Promise<{
  ok: boolean;
  reconciledCount?: number;
  message?: string;
  error?: string;
}> {
  const admin = await requireAdmin();
  const adminClient = createAdminClient();

  const secretKey = process.env.PAYSTACK_SECRET_KEY || PAYSTACK_SECRET_KEY;
  if (!secretKey) {
    return { ok: false, error: "Paystack secret key is not configured." };
  }

  let reconciledCount = 0;

  try {
    const res = await fetch("https://api.paystack.co/transaction?perPage=50&status=success", {
      headers: {
        Authorization: `Bearer ${secretKey}`,
      },
    });

    if (!res.ok) {
      return { ok: false, error: "Failed to communicate with Paystack API." };
    }

    const payload = (await res.json()) as {
      status: boolean;
      data?: Array<{
        id: number;
        status: string;
        reference: string;
        amount: number;
        currency: string;
        customer?: { customer_code: string; email: string };
        metadata?: { userId?: string; planId?: string };
      }>;
    };

    const transactions = payload.data ?? [];

    for (const tx of transactions) {
      if (tx.status !== "success") continue;

      // Check if reference already exists in payment_transactions
      const { data: existingTx } = await adminClient
        .from("payment_transactions")
        .select("id")
        .eq("reference", tx.reference)
        .maybeSingle();

      if (existingTx) continue;

      let userId = tx.metadata?.userId;
      const customerCode = tx.customer?.customer_code;
      const customerEmail = tx.customer?.email;

      if (!userId && customerCode) {
        userId = (await findUserIdByCustomerCode("paystack", customerCode)) ?? undefined;
      }
      if (!userId && customerEmail) {
        userId = (await findUserIdByEmail(customerEmail)) ?? undefined;
      }

      if (userId) {
        const rawPlan = tx.metadata?.planId || (tx.amount >= 900000 ? "annual" : "monthly");
        const planId = rawPlan === "annual" ? "annual" : "monthly";

        const actRes = await activateUserSubscription(userId, {
          planId,
          provider: "paystack",
          customerId: customerCode,
          subscriptionId: tx.reference,
          reference: tx.reference,
          amount: tx.amount,
          currency: tx.currency || "NGN",
        });

        if (actRes.ok) {
          reconciledCount++;
          logger.info("admin.reconciled_payment", {
            adminId: admin.id,
            userId,
            reference: tx.reference,
            amount: tx.amount,
          });
        }
      }
    }

    revalidatePath("/admin/subscriptions");
    revalidatePath("/admin/users");
    revalidatePath("/admin");

    return {
      ok: true,
      reconciledCount,
      message:
        reconciledCount > 0
          ? `Successfully reconciled ${reconciledCount} missing transaction${reconciledCount === 1 ? "" : "s"}.`
          : "All gateway payments are already fully synchronized.",
    };
  } catch (err) {
    logger.error("admin.reconcile_payments_exception", { error: err });
    return { ok: false, error: err instanceof Error ? err.message : "Reconciliation failed" };
  }
}

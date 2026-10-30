"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/admin";
import { createAdminClient } from "@/lib/supabase/admin";
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

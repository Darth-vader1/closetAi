"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/admin";
import { createClient } from "@/lib/supabase/server";
import { logger } from "@/lib/logger";

export async function updateUserRoleAction(userId: string, newRole: "user" | "admin" | "superadmin") {
  const admin = await requireAdmin();
  const supabase = await createClient();

  const { error } = await supabase
    .from("profiles")
    .update({ role: newRole })
    .eq("id", userId);

  if (error) {
    logger.error("admin.update_role_failed", { adminId: admin.id, userId, error });
    return { ok: false, error: "Failed to update user role." };
  }

  // Audit log
  try {
    await supabase.from("admin_audit_logs").insert({
      admin_id: admin.id,
      action: "UPDATE_ROLE",
      target_user_id: userId,
      details: { newRole },
    });
  } catch {
    // ignore if audit table not present
  }

  revalidatePath("/admin/users");
  return { ok: true };
}

export async function grantVipSubscriptionAction(userId: string, durationDays: number = 30) {
  const admin = await requireAdmin();
  const supabase = await createClient();

  const expiresAt = new Date(Date.now() + durationDays * 24 * 60 * 60 * 1000).toISOString();

  const { error } = await supabase
    .from("profiles")
    .update({
      subscription_status: "active",
      subscription_plan: "monthly",
      subscription_provider: "manual",
      subscription_expires_at: expiresAt,
    })
    .eq("id", userId);

  if (error) {
    logger.error("admin.grant_vip_failed", { adminId: admin.id, userId, error });
    return { ok: false, error: "Failed to grant subscription." };
  }

  // Record in subscriptions table
  try {
    await supabase.from("subscriptions").insert({
      user_id: userId,
      provider: "manual",
      provider_subscription_id: `manual_vip_${Date.now()}`,
      plan_code: "monthly",
      amount: 0,
      currency: "NGN",
      status: "active",
      current_period_start: new Date().toISOString(),
      current_period_end: expiresAt,
      metadata: { grantedBy: admin.id },
    });
  } catch {
    // ignore
  }

  revalidatePath("/admin/users");
  revalidatePath("/admin");
  return { ok: true };
}

import "server-only";
import { cache } from "react";
import { isAdminUser } from "@/lib/auth/admin";
import { getProfile, getSessionUser } from "@/lib/auth/session";
import {
  getPlanLimits,
  PREMIUM_PLAN_LIMITS,
  type AccessFeatureKey,
  type PlanId,
  type PlanLimits,
  type UsageFeatureKey,
} from "@/lib/billing/plans";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export interface UserPlanInfo {
  planId: PlanId;
  isPremium: boolean;
  isAdmin: boolean;
  status: "active" | "trialing" | "past_due" | "canceled" | "unpaid" | "expired" | "none";
  expiresAt: string | null;
  cancelAtPeriodEnd: boolean;
  provider: "paystack" | "stripe" | "manual" | null;
}

export interface UsageCheckResult {
  allowed: boolean;
  feature: UsageFeatureKey;
  current: number;
  limit: number | null;
  remaining: number | null;
  resetsAt: string | null;
  upgradeRequired?: boolean;
  message?: string;
}

/**
 * Verifies that the user has an active subscription status.
 * Rejects if subscription status is past_due, unpaid, canceled, or expired.
 */
export async function assertActiveSubscription(userId: string): Promise<{ active: boolean; error?: string }> {
  try {
    const plan = await getUserPlan(userId);
    if (plan.isAdmin) return { active: true };

    const inactiveStatuses = ["past_due", "unpaid", "canceled", "expired"];
    if (inactiveStatuses.includes(plan.status)) {
      return {
        active: false,
        error: `Your subscription is currently ${plan.status.replace("_", " ")}. Please renew your subscription to access AI styling features.`,
      };
    }

    return { active: true };
  } catch (err) {
    logger.warn("billing.assert_active_subscription_fallback", { userId, error: err });
    return { active: true };
  }
}

/**
 * Returns UTC boundaries for the current weekly cycle (Monday 00:00 UTC to next Monday 00:00 UTC).
 */
export function getWeeklyWindow(now = new Date()): { start: Date; end: Date } {
  const date = new Date(now.getTime());
  const day = date.getUTCDay();
  // In JS getUTCDay: 0 = Sun, 1 = Mon, ..., 6 = Sat
  // Distance back to the most recent Monday
  const diffToMonday = day === 0 ? 6 : day - 1;

  const start = new Date(Date.UTC(
    date.getUTCFullYear(),
    date.getUTCMonth(),
    date.getUTCDate() - diffToMonday,
    0, 0, 0, 0
  ));

  const end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
  return { start, end };
}

/**
 * Returns UTC boundaries for the current monthly cycle (1st of month 00:00 UTC to 1st of next month 00:00 UTC).
 */
export function getMonthlyWindow(now = new Date()): { start: Date; end: Date } {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0));
  return { start, end };
}

/**
 * Authoritative server-side plan resolver for a user.
 * Memoized per request with React cache.
 */
export const getUserPlan = cache(async (userId?: string): Promise<UserPlanInfo> => {
  const currentUserId = userId || (await getSessionUser())?.id;
  if (!currentUserId) {
    return {
      planId: "free",
      isPremium: false,
      isAdmin: false,
      status: "none",
      expiresAt: null,
      cancelAtPeriodEnd: false,
      provider: null,
    };
  }

  // 1. Admin check: Admins bypass all limits and have full privileges
  const admin = await isAdminUser({ id: currentUserId, email: null });
  if (admin) {
    return {
      planId: "monthly",
      isPremium: true,
      isAdmin: true,
      status: "active",
      expiresAt: null,
      cancelAtPeriodEnd: false,
      provider: "manual",
    };
  }

  // 2. Profile quick-access check
  const profile = await getProfile();
  const prof = profile as {
    subscription_status?: string | null;
    subscription_plan?: string | null;
    subscription_provider?: string | null;
    subscription_expires_at?: string | null;
  } | null;

  if (prof?.subscription_status === "active" || prof?.subscription_status === "trialing") {
    if (prof.subscription_expires_at) {
      const exp = new Date(prof.subscription_expires_at).getTime();
      if (exp > Date.now()) {
        const pId = prof.subscription_plan === "annual" ? "annual" : "monthly";
        return {
          planId: pId,
          isPremium: true,
          isAdmin: false,
          status: prof.subscription_status,
          expiresAt: prof.subscription_expires_at,
          cancelAtPeriodEnd: false,
          provider: (prof.subscription_provider as UserPlanInfo["provider"]) || "paystack",
        };
      }
    } else {
      const pId = prof.subscription_plan === "annual" ? "annual" : "monthly";
      return {
        planId: pId,
        isPremium: true,
        isAdmin: false,
        status: prof.subscription_status,
        expiresAt: null,
        cancelAtPeriodEnd: false,
        provider: (prof.subscription_provider as UserPlanInfo["provider"]) || "paystack",
      };
    }
  }

  // 3. Fallback: Check user_subscriptions / subscriptions table
  try {
    const supabase = await createClient();
    if (typeof supabase?.from !== "function") {
      return {
        planId: "free",
        isPremium: false,
        isAdmin: false,
        status: "active",
        expiresAt: null,
        cancelAtPeriodEnd: false,
        provider: null,
      };
    }
    const { data: sub } = await supabase
      .from("user_subscriptions")
      .select("plan_id, status, provider, current_period_end, cancel_at_period_end")
      .eq("user_id", currentUserId)
      .maybeSingle();

    if (sub && (sub.status === "active" || sub.status === "trialing")) {
      const isExpired = sub.current_period_end && new Date(sub.current_period_end).getTime() <= Date.now();
      if (!isExpired && (sub.plan_id === "monthly" || sub.plan_id === "annual")) {
        return {
          planId: sub.plan_id,
          isPremium: true,
          isAdmin: false,
          status: sub.status,
          expiresAt: sub.current_period_end,
          cancelAtPeriodEnd: Boolean(sub.cancel_at_period_end),
          provider: sub.provider as UserPlanInfo["provider"],
        };
      }
    }
  } catch (err) {
    logger.warn("entitlements.check_table_failed", { userId: currentUserId, error: err });
  }

  return {
    planId: "free",
    isPremium: false,
    isAdmin: false,
    status: "active",
    expiresAt: null,
    cancelAtPeriodEnd: false,
    provider: null,
  };
});

/**
 * Returns full feature limits for the user's active plan.
 */
export async function getUserEntitlements(userId?: string): Promise<PlanLimits> {
  const plan = await getUserPlan(userId);
  if (plan.isAdmin) return PREMIUM_PLAN_LIMITS;
  return getPlanLimits(plan.planId);
}

/**
 * Checks boolean feature gates (e.g. advanced_styling, closetai_connect, advanced_insights).
 */
export async function checkFeatureAccess(
  userId: string,
  feature: AccessFeatureKey
): Promise<{ allowed: boolean; reason?: string }> {
  const plan = await getUserPlan(userId);
  if (plan.isAdmin || plan.isPremium) return { allowed: true };

  const limits = getPlanLimits(plan.planId);
  if (feature === "advanced_styling") {
    return {
      allowed: limits.advanced_styling,
      reason: limits.advanced_styling ? undefined : "Advanced personalized styling is available on ClosetAI Premium.",
    };
  }

  if (feature === "advanced_insights") {
    return {
      allowed: limits.advanced_insights,
      reason: limits.advanced_insights ? undefined : "Deep wardrobe and cost-per-wear analytics require ClosetAI Premium.",
    };
  }

  return { allowed: true };
}

/**
 * Checks usage limit for a specific feature before an operation begins.
 */
export async function checkUsageLimit(
  userId: string,
  feature: UsageFeatureKey
): Promise<UsageCheckResult> {
  try {
    const plan = await getUserPlan(userId);
    const limits = getPlanLimits(plan.planId);

    // Admins always have unlimited usage
    if (plan.isAdmin) {
      return {
        allowed: true,
        feature,
        current: 0,
        limit: null,
        remaining: null,
        resetsAt: null,
      };
    }

    const supabase = await createClient();
    if (typeof supabase?.from !== "function") {
      return {
        allowed: true,
        feature,
        current: 0,
        limit: null,
        remaining: null,
        resetsAt: null,
      };
    }

  // 1. Persistent count features: live count from database
  if (feature === "wardrobe_items") {
    const limit = limits.wardrobe_items;
    const { count } = await supabase
      .from("wardrobe_items")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);

    const current = count ?? 0;
    const allowed = limit === null || current < limit;
    const remaining = limit === null ? null : Math.max(0, limit - current);

    return {
      allowed,
      feature,
      current,
      limit,
      remaining,
      resetsAt: null,
      upgradeRequired: !allowed,
      message: allowed
        ? undefined
        : `Your wardrobe has reached the Free plan limit of ${limit} items. Upgrade to Premium for unlimited wardrobe items.`,
    };
  }

  if (feature === "saved_outfits") {
    const limit = limits.saved_outfits;
    const { count } = await supabase
      .from("outfits")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);

    const current = count ?? 0;
    const allowed = limit === null || current < limit;
    const remaining = limit === null ? null : Math.max(0, limit - current);

    return {
      allowed,
      feature,
      current,
      limit,
      remaining,
      resetsAt: null,
      upgradeRequired: !allowed,
      message: allowed
        ? undefined
        : `You have reached the Free plan limit of ${limit} saved outfits. Upgrade to Premium to save unlimited outfits.`,
    };
  }

  if (feature === "flatlay_designs") {
    const limit = limits.flatlay_designs;
    const { count } = await supabase
      .from("flatlay_compositions")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId);

    const current = count ?? 0;
    const allowed = limit === null || current < limit;
    const remaining = limit === null ? null : Math.max(0, limit - current);

    return {
      allowed,
      feature,
      current,
      limit,
      remaining,
      resetsAt: null,
      upgradeRequired: !allowed,
      message: allowed
        ? undefined
        : `You have reached the Free plan limit of ${limit} saved Flatlay designs. Upgrade to Premium for unlimited designs.`,
    };
  }

  // 2. Windowed features: outfit_recommendations and beautify_processing
  if (feature === "outfit_recommendations") {
    const conf = limits.outfit_recommendations;
    const limit = conf.limit;
    const windowInfo = conf.window === "week" ? getWeeklyWindow() : getMonthlyWindow();

    let current = 0;
    try {
      const { data } = await supabase
        .from("usage_records")
        .select("count")
        .eq("user_id", userId)
        .eq("feature", "outfit_recommendations")
        .eq("period_start", windowInfo.start.toISOString())
        .maybeSingle();

      current = data?.count ?? 0;
    } catch {
      current = 0;
    }

    const allowed = limit === null || current < limit;
    const remaining = limit === null ? null : Math.max(0, limit - current);
    const windowName = conf.window === "week" ? "this week" : "this month";
    const upgradeSuggestion = conf.window === "week"
      ? "Upgrade to Premium for 100 recommendations every month."
      : "Your monthly recommendations allowance has been reached.";

    return {
      allowed,
      feature,
      current,
      limit,
      remaining,
      resetsAt: windowInfo.end.toISOString(),
      upgradeRequired: !allowed,
      message: allowed
        ? undefined
        : `You've used your ${limit} outfit recommendations for ${windowName}. ${upgradeSuggestion}`,
    };
  }

  if (feature === "beautify_processing") {
    const conf = limits.beautify_processing;
    const limit = conf.limit;
    const windowInfo = getMonthlyWindow();

    let current = 0;
    try {
      const { data } = await supabase
        .from("usage_records")
        .select("count")
        .eq("user_id", userId)
        .eq("feature", "beautify_processing")
        .eq("period_start", windowInfo.start.toISOString())
        .maybeSingle();

      current = data?.count ?? 0;
    } catch {
      current = 0;
    }

    const allowed = limit === null || current < limit;
    const remaining = limit === null ? null : Math.max(0, limit - current);

    return {
      allowed,
      feature,
      current,
      limit,
      remaining,
      resetsAt: windowInfo.end.toISOString(),
      upgradeRequired: !allowed,
      message: allowed
        ? undefined
        : `Your monthly allowance of ${limit} Beautify operations has been reached. Upgrade to Premium for 30 operations per month.`,
    };
  }

    return {
      allowed: true,
      feature,
      current: 0,
      limit: null,
      remaining: null,
      resetsAt: null,
    };
  } catch (err) {
    logger.warn("entitlements.check_usage_limit_error", { userId, feature, error: err });
    return {
      allowed: true,
      feature,
      current: 0,
      limit: null,
      remaining: null,
      resetsAt: null,
    };
  }
}

/**
 * Atomically consumes usage for a windowed feature upon SUCCESSFUL completion.
 * Never call this before or during an operation.
 */
export async function consumeUsage(
  userId: string,
  feature: "outfit_recommendations" | "beautify_processing",
  amount = 1
): Promise<{ success: boolean; current: number; remaining: number | null }> {
  const plan = await getUserPlan(userId);
  if (plan.isAdmin) {
    return { success: true, current: 0, remaining: null };
  }

  const limits = getPlanLimits(plan.planId);
  const windowInfo = feature === "outfit_recommendations" && limits.outfit_recommendations.window === "week"
    ? getWeeklyWindow()
    : getMonthlyWindow();

  try {
    let adminClient;
    try {
      adminClient = createAdminClient();
    } catch {
      adminClient = await createClient();
    }

    // Attempt using stored RPC if available
    const { data: rpcCount, error: rpcErr } = await adminClient.rpc("consume_feature_usage", {
      p_user_id: userId,
      p_feature: feature,
      p_period_start: windowInfo.start.toISOString(),
      p_period_end: windowInfo.end.toISOString(),
      p_amount: amount,
    });

    if (!rpcErr && typeof rpcCount === "number") {
      const limit = feature === "outfit_recommendations"
        ? limits.outfit_recommendations.limit
        : limits.beautify_processing.limit;
      const remaining = limit === null ? null : Math.max(0, limit - rpcCount);
      return { success: true, current: rpcCount, remaining };
    }

    // Fallback: direct table upsert
    const { data: existing } = await adminClient
      .from("usage_records")
      .select("count")
      .eq("user_id", userId)
      .eq("feature", feature)
      .eq("period_start", windowInfo.start.toISOString())
      .maybeSingle();

    const currentCount = (existing?.count ?? 0) + amount;
    await adminClient.from("usage_records").upsert({
      user_id: userId,
      feature,
      period_start: windowInfo.start.toISOString(),
      period_end: windowInfo.end.toISOString(),
      count: currentCount,
      updated_at: new Date().toISOString(),
    });

    const limit = feature === "outfit_recommendations"
      ? limits.outfit_recommendations.limit
      : limits.beautify_processing.limit;
    const remaining = limit === null ? null : Math.max(0, limit - currentCount);

    return { success: true, current: currentCount, remaining };
  } catch (err) {
    logger.error("entitlements.consume_usage_failed", { userId, feature, error: err });
    return { success: false, current: 0, remaining: null };
  }
}

/**
 * Gathers complete usage summaries for all five trackable features.
 */
export async function getAllUsageSummaries(
  userId: string
): Promise<Record<UsageFeatureKey, UsageCheckResult>> {
  const [wardrobe, outfits, flatlays, recommendations, beautify] = await Promise.all([
    checkUsageLimit(userId, "wardrobe_items"),
    checkUsageLimit(userId, "saved_outfits"),
    checkUsageLimit(userId, "flatlay_designs"),
    checkUsageLimit(userId, "outfit_recommendations"),
    checkUsageLimit(userId, "beautify_processing"),
  ]);

  return {
    wardrobe_items: wardrobe,
    saved_outfits: outfits,
    flatlay_designs: flatlays,
    outfit_recommendations: recommendations,
    beautify_processing: beautify,
  };
}

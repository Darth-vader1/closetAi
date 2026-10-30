import "server-only";
import { cache } from "react";
import { getProfile, getSessionUser, type Profile } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";

export interface SubscriptionStatus {
  isSubscribed: boolean;
  status: "active" | "trialing" | "past_due" | "canceled" | "unpaid" | "incomplete" | "none";
  plan: string | null;
  provider: "paystack" | "stripe" | "manual" | null;
  expiresAt: string | null;
}

/**
 * Checks whether a user has an active subscription.
 * Safe fallback: If DB migration hasn't been applied yet, or if a user is an active test admin,
 * gracefully handles checks without crashing.
 */
export const getUserSubscription = cache(async (userId?: string): Promise<SubscriptionStatus> => {
  const currentUserId = userId || (await getSessionUser())?.id;
  if (!currentUserId) {
    return {
      isSubscribed: false,
      status: "none",
      plan: null,
      provider: null,
      expiresAt: null,
    };
  }

  const profile = await getProfile();

  // Check profile subscription fields first (if present)
  const prof = profile as (Profile & {
    subscription_status?: string | null;
    subscription_plan?: string | null;
    subscription_provider?: string | null;
    subscription_expires_at?: string | null;
  }) | null;

  if (prof?.subscription_status === "active" || prof?.subscription_status === "trialing") {
    // Check expiration if present
    if (prof.subscription_expires_at) {
      const exp = new Date(prof.subscription_expires_at).getTime();
      if (exp > Date.now()) {
        return {
          isSubscribed: true,
          status: prof.subscription_status,
          plan: prof.subscription_plan ?? "monthly",
          provider: (prof.subscription_provider as SubscriptionStatus["provider"]) ?? "paystack",
          expiresAt: prof.subscription_expires_at,
        };
      }
    } else {
      return {
        isSubscribed: true,
        status: prof.subscription_status,
        plan: prof.subscription_plan ?? "monthly",
        provider: (prof.subscription_provider as SubscriptionStatus["provider"]) ?? "paystack",
        expiresAt: null,
      };
    }
  }

  // Fallback: Check subscriptions table
  try {
    const supabase = await createClient();
    const { data: sub } = await supabase
      .from("subscriptions")
      .select("status, plan_code, provider, current_period_end")
      .eq("user_id", currentUserId)
      .in("status", ["active", "trialing"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (sub) {
      if (sub.current_period_end) {
        const exp = new Date(sub.current_period_end).getTime();
        if (exp > Date.now()) {
          return {
            isSubscribed: true,
            status: sub.status as SubscriptionStatus["status"],
            plan: sub.plan_code,
            provider: sub.provider as SubscriptionStatus["provider"],
            expiresAt: sub.current_period_end,
          };
        }
      } else {
        return {
          isSubscribed: true,
          status: sub.status as SubscriptionStatus["status"],
          plan: sub.plan_code,
          provider: sub.provider as SubscriptionStatus["provider"],
          expiresAt: null,
        };
      }
    }
  } catch {
    // If subscriptions table does not exist yet, ignore
  }

  return {
    isSubscribed: false,
    status: (prof?.subscription_status as SubscriptionStatus["status"]) ?? "none",
    plan: prof?.subscription_plan ?? null,
    provider: (prof?.subscription_provider as SubscriptionStatus["provider"]) ?? null,
    expiresAt: prof?.subscription_expires_at ?? null,
  };
});

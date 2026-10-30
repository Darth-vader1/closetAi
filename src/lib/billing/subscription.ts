import "server-only";
import { cache } from "react";
import { getUserPlan } from "@/lib/billing/entitlements";

export interface SubscriptionStatus {
  isSubscribed: boolean;
  status: "active" | "trialing" | "past_due" | "canceled" | "unpaid" | "incomplete" | "expired" | "none";
  plan: string | null;
  provider: "paystack" | "stripe" | "manual" | null;
  expiresAt: string | null;
}

/**
 * Checks whether a user has an active subscription.
 * Integrates directly with the centralized entitlement service.
 */
export const getUserSubscription = cache(async (userId?: string): Promise<SubscriptionStatus> => {
  const planInfo = await getUserPlan(userId);
  return {
    isSubscribed: planInfo.isPremium,
    status: planInfo.status as SubscriptionStatus["status"],
    plan: planInfo.planId,
    provider: planInfo.provider,
    expiresAt: planInfo.expiresAt,
  };
});

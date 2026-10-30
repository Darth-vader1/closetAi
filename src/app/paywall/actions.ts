/**
 * Re-exports from subscription actions for backward compatibility
 */
export {
  continueWithFreePlanAction,
  createSubscriptionCheckoutAction,
  activateUserSubscription,
} from "@/app/subscription/actions";

import { createSubscriptionCheckoutAction } from "@/app/subscription/actions";

export async function createPaystackCheckoutAction(planId: string = "monthly") {
  const pId = planId === "annual" ? "annual" : "monthly";
  return createSubscriptionCheckoutAction(pId, "paystack");
}

export async function createStripeCheckoutAction(planId: string = "monthly") {
  const pId = planId === "annual" ? "annual" : "monthly";
  return createSubscriptionCheckoutAction(pId, "stripe");
}

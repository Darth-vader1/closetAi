"use server";

import {
  continueWithFreePlanAction as _continueWithFreePlanAction,
  createSubscriptionCheckoutAction as _createSubscriptionCheckoutAction,
} from "@/app/subscription/actions";

export async function continueWithFreePlanAction() {
  return _continueWithFreePlanAction();
}

export async function createSubscriptionCheckoutAction(
  planId: "monthly" | "annual",
  provider: "paystack" | "stripe"
) {
  return _createSubscriptionCheckoutAction(planId, provider);
}

export async function createPaystackCheckoutAction(planId: string = "monthly") {
  const pId = planId === "annual" ? "annual" : "monthly";
  return _createSubscriptionCheckoutAction(pId, "paystack");
}

export async function createStripeCheckoutAction(planId: string = "monthly") {
  const pId = planId === "annual" ? "annual" : "monthly";
  return _createSubscriptionCheckoutAction(pId, "stripe");
}

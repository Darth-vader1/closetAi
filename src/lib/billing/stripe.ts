import "server-only";
import Stripe from "stripe";
import { STRIPE_SECRET_KEY } from "./plans";

export const stripe = STRIPE_SECRET_KEY
  ? new Stripe(STRIPE_SECRET_KEY)
  : null;

export interface CreateStripeCheckoutParams {
  userId: string;
  email: string;
  planId: "monthly" | "annual";
  successUrl: string;
  cancelUrl: string;
  priceUSD: number; // e.g. 4.99
}

export async function createStripeCheckoutSession(params: CreateStripeCheckoutParams) {
  if (!stripe) {
    throw new Error("Stripe is not configured in environment variables.");
  }

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer_email: params.email,
    client_reference_id: params.userId,
    metadata: {
      userId: params.userId,
      planId: params.planId,
    },
    subscription_data: {
      metadata: {
        userId: params.userId,
        planId: params.planId,
      },
    },
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: `ClosetAI Pro (${params.planId === "annual" ? "Annual" : "Monthly"})`,
            description: "Unlimited AI styling, flatlay studio, trip packing & lookbook generator",
          },
          unit_amount: Math.round(params.priceUSD * 100),
          recurring: {
            interval: params.planId === "annual" ? "year" : "month",
          },
        },
        quantity: 1,
      },
    ],
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
  });

  return session;
}

import { NextResponse } from "next/server";
import { stripe } from "@/lib/billing/stripe";
import { STRIPE_WEBHOOK_SECRET } from "@/lib/billing/plans";
import { activateUserSubscription } from "@/app/subscription/actions";
import { logger } from "@/lib/logger";

export async function POST(req: Request) {
  if (!stripe || !STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ message: "Stripe webhook not configured" }, { status: 400 });
  }

  const rawBody = await req.text();
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ message: "Missing stripe signature" }, { status: 400 });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    logger.error("webhook.stripe.signature_verification_failed", { error: err });
    return NextResponse.json({ message: "Webhook signature failed" }, { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;
      const userId = session.metadata?.userId || session.client_reference_id;
      const rawPlan = session.metadata?.planId;
      const planId = rawPlan === "annual" ? "annual" : "monthly";

      if (userId) {
        await activateUserSubscription(userId, {
          planId,
          provider: "stripe",
          customerId: typeof session.customer === "string" ? session.customer : undefined,
          subscriptionId: typeof session.subscription === "string" ? session.subscription : undefined,
          reference: session.id,
          amount: session.amount_total || (planId === "annual" ? 4999 : 499),
          currency: "USD",
        });
        logger.info("webhook.stripe.session_completed_activated", { userId, planId, ref: session.id });
      }
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    logger.error("webhook.stripe.processing_error", { error: err });
    return NextResponse.json({ error: "Webhook processing error" }, { status: 500 });
  }
}

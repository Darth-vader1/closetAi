import { NextResponse } from "next/server";
import { stripe } from "@/lib/billing/stripe";
import { STRIPE_WEBHOOK_SECRET } from "@/lib/billing/plans";
import {
  activateUserSubscription,
  extendUserSubscriptionExpiry,
  revokeUserSubscription,
  recordPaymentRefund,
  findUserIdByCustomerCode,
} from "@/lib/billing/activate";
import { logger } from "@/lib/logger";

interface StripeInvoicePayload {
  customer?: string | { id?: string };
  metadata?: Record<string, string>;
  subscription_details?: { metadata?: Record<string, string> };
  lines?: { data?: Array<{ period?: { end?: number } }> };
}

interface StripeSubscriptionPayload {
  customer?: string | { id?: string };
  metadata?: Record<string, string>;
}

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
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const userId = session.metadata?.userId || session.client_reference_id;
        const rawPlan = session.metadata?.planId;
        const planId = rawPlan === "annual" ? "annual" : "monthly";

        const amount = session.amount_total ?? null;
        const currency = (session.currency || "USD").toUpperCase();

        if (userId && amount !== null) {
          const actResult = await activateUserSubscription(userId, {
            planId,
            provider: "stripe",
            customerId: typeof session.customer === "string" ? session.customer : undefined,
            subscriptionId: typeof session.subscription === "string" ? session.subscription : undefined,
            reference: session.id,
            amount,
            currency,
          });
          if (actResult.ok) {
            logger.info("webhook.stripe.session_completed_activated", { userId, planId, ref: session.id });
          } else {
            logger.error("webhook.stripe.activation_rejected", { userId, planId, error: actResult.error });
          }
        } else {
          logger.warn("webhook.stripe.session_completed_missing_data", { userId, amount });
        }
        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object as StripeInvoicePayload;
        const customer = invoice.customer;
        const customerId = typeof customer === "string" ? customer : customer?.id;
        let userId: string | null | undefined =
          invoice.subscription_details?.metadata?.userId || invoice.metadata?.userId;

        if (!userId && customerId) {
          userId = await findUserIdByCustomerCode("stripe", customerId);
        }

        if (userId) {
          const lines = invoice.lines?.data;
          const periodEndSec = lines?.[0]?.period?.end;
          const newPeriodEnd = periodEndSec
            ? new Date(periodEndSec * 1000).toISOString()
            : new Date(Date.now() + 32 * 24 * 60 * 60 * 1000).toISOString();

          await extendUserSubscriptionExpiry(userId, newPeriodEnd);
          logger.info("webhook.stripe.invoice_paid_extended", { userId, newPeriodEnd });
        }
        break;
      }

      case "customer.subscription.deleted": {
        const sub = event.data.object as StripeSubscriptionPayload;
        const customer = sub.customer;
        const customerId = typeof customer === "string" ? customer : customer?.id;
        let userId: string | null | undefined = sub.metadata?.userId;

        if (!userId && customerId) {
          userId = await findUserIdByCustomerCode("stripe", customerId);
        }

        if (userId) {
          await revokeUserSubscription(userId, "canceled");
          logger.info("webhook.stripe.subscription_deleted_revoked", { userId });
        }
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as StripeInvoicePayload;
        const customer = invoice.customer;
        const customerId = typeof customer === "string" ? customer : customer?.id;
        let userId: string | null | undefined =
          invoice.subscription_details?.metadata?.userId || invoice.metadata?.userId;

        if (!userId && customerId) {
          userId = await findUserIdByCustomerCode("stripe", customerId);
        }

        if (userId) {
          await revokeUserSubscription(userId, "past_due");
          logger.info("webhook.stripe.payment_failed_revoked", { userId });
        }
        break;
      }

      case "charge.refunded": {
        const charge = event.data.object;
        const reference = charge.payment_intent || charge.id;
        if (typeof reference === "string") {
          await recordPaymentRefund(reference, "stripe");
          logger.info("webhook.stripe.charge_refunded", { reference });
        }
        break;
      }

      default:
        logger.info("webhook.stripe.unhandled_event", { type: event.type });
        break;
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    logger.error("webhook.stripe.processing_error", { error: err });
    return NextResponse.json({ error: "Webhook processing error" }, { status: 500 });
  }
}

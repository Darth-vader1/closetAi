import { redirect } from "next/navigation";
import { activateUserSubscription } from "@/app/subscription/actions";
import { requireUser } from "@/lib/auth/session";
import { verifyPaystackTransaction } from "@/lib/billing/paystack";
import { stripe } from "@/lib/billing/stripe";
import { logger } from "@/lib/logger";

export const metadata = {
  title: "Verifying Subscription · ClosetAI",
};

export const dynamic = "force-dynamic";

export default async function SubscriptionCallbackPage({
  searchParams,
}: {
  searchParams: Promise<{
    provider?: string;
    reference?: string;
    trxref?: string;
    session_id?: string;
  }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const provider = params.provider;

  // 1. Paystack Verification
  if (provider === "paystack") {
    const reference = params.reference || params.trxref;
    if (!reference) {
      redirect("/subscription?canceled=true");
    }

    try {
      const verifyRes = await verifyPaystackTransaction(reference);

      if (verifyRes.status && verifyRes.data?.status === "success") {
        const rawPlan = verifyRes.data.metadata?.planId;
        const planId = rawPlan === "annual" ? "annual" : "monthly";
        const customerCode = verifyRes.data.customer?.customer_code;
        const amount = verifyRes.data.amount;

        await activateUserSubscription(user.id, {
          planId,
          provider: "paystack",
          customerId: customerCode,
          subscriptionId: reference,
          reference,
          amount,
          currency: "NGN",
        });

        redirect("/dashboard?upgraded=true");
      } else {
        logger.warn("billing.paystack_verification_unsuccessful", { reference, verifyRes });
        redirect("/subscription?canceled=true&reason=verification_failed");
      }
    } catch (err: unknown) {
      if ((err as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw err;
      logger.error("billing.paystack_verification_error", { userId: user.id, error: err });
      redirect("/subscription?canceled=true&reason=error");
    }
  }

  // 2. Stripe Verification
  if (provider === "stripe") {
    const sessionId = params.session_id;
    if (!sessionId || !stripe) {
      redirect("/subscription?canceled=true");
    }

    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId);

      if (session.payment_status === "paid" || session.status === "complete") {
        const rawPlan = session.metadata?.planId;
        const planId = rawPlan === "annual" ? "annual" : "monthly";
        const customerId = typeof session.customer === "string" ? session.customer : undefined;
        const subscriptionId = typeof session.subscription === "string" ? session.subscription : undefined;
        const amount = session.amount_total || (planId === "annual" ? 4999 : 499);

        await activateUserSubscription(user.id, {
          planId,
          provider: "stripe",
          customerId,
          subscriptionId,
          reference: session.id,
          amount,
          currency: "USD",
        });

        redirect("/dashboard?upgraded=true");
      } else {
        redirect("/subscription?canceled=true&reason=unpaid");
      }
    } catch (err: unknown) {
      if ((err as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw err;
      logger.error("billing.stripe_verification_error", { userId: user.id, error: err });
      redirect("/subscription?canceled=true&reason=error");
    }
  }

  redirect("/subscription");
}

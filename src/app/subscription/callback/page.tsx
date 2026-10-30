import { redirect } from "next/navigation";
import { activateUserSubscription } from "@/app/subscription/actions";
import { getSessionUser } from "@/lib/auth/session";
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
  const sessionUser = await getSessionUser();
  const params = await searchParams;
  const provider = params.provider;

  // 1. Paystack Verification
  if (provider === "paystack") {
    const reference = params.reference || params.trxref;
    if (!reference) {
      redirect(sessionUser ? "/subscription?canceled=true" : "/login");
    }

    try {
      const verifyRes = await verifyPaystackTransaction(reference);

      if (verifyRes.status && verifyRes.data?.status === "success") {
        const rawPlan = verifyRes.data.metadata?.planId;
        const planId = rawPlan === "annual" ? "annual" : "monthly";
        const customerCode = verifyRes.data.customer?.customer_code;
        const amount = verifyRes.data.amount;
        const targetUserId = verifyRes.data.metadata?.userId || sessionUser?.id;

        if (targetUserId) {
          await activateUserSubscription(targetUserId, {
            planId,
            provider: "paystack",
            customerId: customerCode,
            subscriptionId: reference,
            reference,
            amount,
            currency: "NGN",
          });
        }

        if (sessionUser) {
          redirect("/dashboard?upgraded=true");
        } else {
          redirect("/login?next=/dashboard%3Fupgraded%3Dtrue");
        }
      } else {
        logger.warn("billing.paystack_verification_unsuccessful", { reference, verifyRes });
        redirect(sessionUser ? "/subscription?canceled=true&reason=verification_failed" : "/login");
      }
    } catch (err: unknown) {
      if ((err as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw err;
      logger.error("billing.paystack_verification_error", { userId: sessionUser?.id, error: err });
      redirect(sessionUser ? "/subscription?canceled=true&reason=error" : "/login");
    }
  }

  // 2. Stripe Verification
  if (provider === "stripe") {
    const sessionId = params.session_id;
    if (!sessionId || !stripe) {
      redirect(sessionUser ? "/subscription?canceled=true" : "/login");
    }

    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId);

      if (session.payment_status === "paid" || session.status === "complete") {
        const rawPlan = session.metadata?.planId;
        const planId = rawPlan === "annual" ? "annual" : "monthly";
        const customerId = typeof session.customer === "string" ? session.customer : undefined;
        const subscriptionId = typeof session.subscription === "string" ? session.subscription : undefined;
        const amount = session.amount_total || (planId === "annual" ? 4999 : 499);
        const targetUserId = session.metadata?.userId || sessionUser?.id;

        if (targetUserId) {
          await activateUserSubscription(targetUserId, {
            planId,
            provider: "stripe",
            customerId,
            subscriptionId,
            reference: session.id,
            amount,
            currency: "USD",
          });
        }

        if (sessionUser) {
          redirect("/dashboard?upgraded=true");
        } else {
          redirect("/login?next=/dashboard%3Fupgraded%3Dtrue");
        }
      } else {
        redirect(sessionUser ? "/subscription?canceled=true&reason=unpaid" : "/login");
      }
    } catch (err: unknown) {
      if ((err as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw err;
      logger.error("billing.stripe_verification_error", { userId: sessionUser?.id, error: err });
      redirect(sessionUser ? "/subscription?canceled=true&reason=error" : "/login");
    }
  }

  redirect(sessionUser ? "/subscription" : "/login");
}

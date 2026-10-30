import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { logger } from "@/lib/logger";
import { verifyPaystackTransaction } from "@/lib/billing/paystack";
import { stripe } from "@/lib/billing/stripe";
import { activateUserSubscription } from "@/app/paywall/actions";

export const metadata = {
  title: "Verifying Membership · ClosetAI",
};

export default async function PaywallCallbackPage({
  searchParams,
}: {
  searchParams: Promise<{
    provider?: string;
    reference?: string; // Paystack transaction reference
    trxref?: string;
    session_id?: string; // Stripe checkout session ID
  }>;
}) {
  const user = await requireUser();
  const params = await searchParams;
  const provider = params.provider;

  // 1. Paystack Verification
  if (provider === "paystack") {
    const reference = params.reference || params.trxref;
    if (!reference) {
      redirect("/paywall?canceled=true");
    }

    try {
      const verifyRes = await verifyPaystackTransaction(reference);

      if (verifyRes.status && verifyRes.data?.status === "success") {
        const planId = verifyRes.data.metadata?.planId || "monthly";
        const customerCode = verifyRes.data.customer?.customer_code;
        const amount = verifyRes.data.amount; // in kobo

        await activateUserSubscription(user.id, {
          planId,
          provider: "paystack",
          customerId: customerCode,
          subscriptionId: reference,
          amount,
          currency: "NGN",
        });

        redirect("/dashboard");
      } else {
        logger.warn("billing.paystack_verification_unsuccessful", { reference, verifyRes });
        redirect("/paywall?canceled=true&reason=verification_failed");
      }
    } catch (err: unknown) {
      if ((err as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw err;
      logger.error("billing.paystack_verification_error", { userId: user.id, error: err });
      redirect("/paywall?canceled=true&reason=error");
    }
  }

  // 2. Stripe Verification
  if (provider === "stripe") {
    const sessionId = params.session_id;
    if (!sessionId || !stripe) {
      redirect("/paywall?canceled=true");
    }

    try {
      const session = await stripe.checkout.sessions.retrieve(sessionId);

      if (session.payment_status === "paid" || session.status === "complete") {
        const planId = (session.metadata?.planId as "monthly" | "annual") || "monthly";
        const customerId = typeof session.customer === "string" ? session.customer : undefined;
        const subscriptionId = typeof session.subscription === "string" ? session.subscription : undefined;
        const amount = session.amount_total || (planId === "annual" ? 4999 : 499);

        await activateUserSubscription(user.id, {
          planId,
          provider: "stripe",
          customerId,
          subscriptionId,
          amount,
          currency: "USD",
        });

        redirect("/dashboard");
      } else {
        redirect("/paywall?canceled=true&reason=unpaid");
      }
    } catch (err: unknown) {
      if ((err as { digest?: string })?.digest?.startsWith("NEXT_REDIRECT")) throw err;
      logger.error("billing.stripe_verification_error", { userId: user.id, error: err });
      redirect("/paywall?canceled=true&reason=error");
    }
  }

  redirect("/paywall");
}

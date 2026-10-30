import { NextResponse } from "next/server";
import crypto from "crypto";
import { PAYSTACK_SECRET_KEY } from "@/lib/billing/plans";
import { activateUserSubscription } from "@/app/subscription/actions";
import { logger } from "@/lib/logger";

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-paystack-signature");

    if (!PAYSTACK_SECRET_KEY || !signature) {
      return NextResponse.json({ message: "Invalid signature or configuration" }, { status: 400 });
    }

    const hash = crypto.createHmac("sha512", PAYSTACK_SECRET_KEY).update(rawBody).digest("hex");
    if (hash !== signature) {
      return NextResponse.json({ message: "Signature verification failed" }, { status: 400 });
    }

    const event = JSON.parse(rawBody);

    if (event.event === "charge.success") {
      const data = event.data;
      const userId = data.metadata?.userId;
      const rawPlan = data.metadata?.planId;
      const planId = rawPlan === "annual" ? "annual" : "monthly";

      if (userId) {
        await activateUserSubscription(userId, {
          planId,
          provider: "paystack",
          customerId: data.customer?.customer_code,
          subscriptionId: data.reference,
          reference: data.reference,
          amount: data.amount,
          currency: data.currency || "NGN",
        });
        logger.info("webhook.paystack.charge_success_activated", { userId, planId, ref: data.reference });
      }
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    logger.error("webhook.paystack.error", { error: err });
    return NextResponse.json({ error: "Webhook processing error" }, { status: 500 });
  }
}

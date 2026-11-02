import { NextResponse } from "next/server";
import crypto from "crypto";
import { PAYSTACK_SECRET_KEY } from "@/lib/billing/plans";
import {
  activateUserSubscription,
  revokeUserSubscription,
  findUserIdByCustomerCode,
  findUserIdByEmail,
} from "@/lib/billing/activate";
import { logger } from "@/lib/logger";

export async function POST(req: Request) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get("x-paystack-signature");
    const secretKey = process.env.PAYSTACK_SECRET_KEY || PAYSTACK_SECRET_KEY;

    if (!secretKey || !signature) {
      return NextResponse.json({ message: "Invalid signature or configuration" }, { status: 400 });
    }

    const hash = crypto.createHmac("sha512", secretKey).update(rawBody).digest("hex");
    if (hash !== signature) {
      return NextResponse.json({ message: "Signature verification failed" }, { status: 400 });
    }

    const event = JSON.parse(rawBody);

    switch (event.event) {
      case "charge.success": {
        const data = event.data;
        let userId: string | null | undefined = data.metadata?.userId;
        const customerCode = data.customer?.customer_code;
        const customerEmail = data.customer?.email;

        // If metadata.userId is missing (e.g. automated renewal charge or external flow), look up by customer_code, then by customer email
        if (!userId && customerCode) {
          userId = await findUserIdByCustomerCode("paystack", customerCode);
        }
        if (!userId && customerEmail) {
          userId = await findUserIdByEmail(customerEmail);
        }

        const rawPlan = data.metadata?.planId || (data.amount >= 900000 ? "annual" : "monthly");
        const planId = rawPlan === "annual" ? "annual" : "monthly";

        if (userId) {
          await activateUserSubscription(userId, {
            planId,
            provider: "paystack",
            customerId: customerCode,
            subscriptionId: data.reference,
            reference: data.reference,
            amount: data.amount,
            currency: data.currency || "NGN",
          });
          logger.info("webhook.paystack.charge_success_activated", { userId, planId, ref: data.reference });
        } else {
          logger.warn("webhook.paystack.charge_success_no_user", { customerCode, customerEmail, ref: data.reference });
        }
        break;
      }

      case "subscription.create": {
        const data = event.data;
        let userId: string | null | undefined = data.metadata?.userId;
        const customerCode = data.customer?.customer_code;
        const customerEmail = data.customer?.email;

        if (!userId && customerCode) {
          userId = await findUserIdByCustomerCode("paystack", customerCode);
        }
        if (!userId && customerEmail) {
          userId = await findUserIdByEmail(customerEmail);
        }

        if (userId) {
          const rawPlan = data.plan?.plan_code || data.metadata?.planId || "monthly";
          const planId = rawPlan === "annual" ? "annual" : "monthly";
          const ref = data.subscription_code || `sub_${data.id || Date.now()}`;
          await activateUserSubscription(userId, {
            planId,
            provider: "paystack",
            customerId: customerCode,
            subscriptionId: data.subscription_code || ref,
            reference: ref,
            amount: data.amount || 99900,
            currency: "NGN",
          });
          logger.info("webhook.paystack.subscription_create_activated", { userId, planId, ref });
        }
        break;
      }

      case "invoice.update": {
        const data = event.data;
        if (data.status === "success" || data.paid) {
          let userId: string | null | undefined = data.metadata?.userId;
          const customerCode = data.customer?.customer_code;
          const customerEmail = data.customer?.email;

          if (!userId && customerCode) {
            userId = await findUserIdByCustomerCode("paystack", customerCode);
          }
          if (!userId && customerEmail) {
            userId = await findUserIdByEmail(customerEmail);
          }

          if (userId) {
            const rawPlan = data.metadata?.planId || (data.amount >= 900000 ? "annual" : "monthly");
            const planId = rawPlan === "annual" ? "annual" : "monthly";
            await activateUserSubscription(userId, {
              planId,
              provider: "paystack",
              customerId: customerCode,
              subscriptionId: data.transaction?.reference || data.subscription?.subscription_code || `inv_${data.id}`,
              reference: data.transaction?.reference || `inv_${data.id}`,
              amount: data.amount || 99900,
              currency: "NGN",
            });
            logger.info("webhook.paystack.invoice_update_activated", { userId, planId, ref: data.transaction?.reference });
          }
        }
        break;
      }

      case "subscription.disable": {
        const data = event.data;
        const customerCode = data.customer?.customer_code;
        const customerEmail = data.customer?.email;
        let userId: string | null | undefined = data.metadata?.userId;

        if (!userId && customerCode) {
          userId = await findUserIdByCustomerCode("paystack", customerCode);
        }
        if (!userId && customerEmail) {
          userId = await findUserIdByEmail(customerEmail);
        }

        if (userId) {
          await revokeUserSubscription(userId, "canceled");
          logger.info("webhook.paystack.subscription_disabled_revoked", { userId });
        } else {
          logger.warn("webhook.paystack.subscription_disable_no_user", { customerCode, customerEmail });
        }
        break;
      }

      default:
        logger.info("webhook.paystack.unhandled_event", { event: event.event });
        break;
    }

    return NextResponse.json({ received: true });
  } catch (err) {
    logger.error("webhook.paystack.error", { error: err });
    return NextResponse.json({ error: "Webhook processing error" }, { status: 500 });
  }
}

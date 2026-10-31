import { describe, expect, it, vi, beforeEach } from "vitest";
import { activateUserSubscription } from "@/lib/billing/activate";
import { POST as paystackWebhook } from "@/app/api/webhook/paystack/route";
import { POST as stripeWebhook } from "@/app/api/webhook/stripe/route";

const recordedTransactions = new Set<string>();

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === "payment_transactions") {
        return {
          select: () => ({
            eq: (_col1: string, val1: string) => ({
              eq: (_col2: string, val2: string) => ({
                maybeSingle: async () => {
                  if (recordedTransactions.has(`${val1}:${val2}`)) {
                    return { data: { id: "tx-existing" }, error: null };
                  }
                  return { data: null, error: null };
                },
              }),
            }),
          }),
          insert: async (data: { provider: string; reference: string }) => {
            const key = `${data.provider}:${data.reference}`;
            if (recordedTransactions.has(key)) {
              return { error: { code: "23505", message: "duplicate key value violates unique constraint" } };
            }
            recordedTransactions.add(key);
            return { error: null };
          },
        };
      }

      if (table === "subscriptions") {
        return {
          insert: async () => {
            return { error: null };
          },
        };
      }

      if (table === "profiles") {
        return {
          update: () => ({
            eq: async () => ({ error: null }),
          }),
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({ data: { display_name: "Test User" }, error: null }),
            }),
          }),
        };
      }

      if (table === "user_subscriptions") {
        return {
          upsert: async () => ({ error: null }),
        };
      }

      return {
        select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null }) }) }),
        insert: async () => ({ error: null }),
        update: () => ({ eq: async () => ({ error: null }) }),
        upsert: async () => ({ error: null }),
      };
    },
    auth: {
      admin: {
        getUserById: async () => ({ data: { user: { email: "test@example.com" } }, error: null }),
      },
    },
  }),
}));

vi.mock("@/lib/email/service", () => ({
  sendEmail: vi.fn().mockResolvedValue({ success: true, id: "msg_123" }),
}));

describe("Billing & Webhook Hardening", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    recordedTransactions.clear();
    process.env.PAYSTACK_SECRET_KEY = "test_paystack_secret_key";
    process.env.STRIPE_WEBHOOK_SECRET = "whsec_test_secret";
  });

  describe("Webhook Replay & Idempotency", () => {
    it("activates subscription on first call and skips replayed webhooks without double-activating", async () => {
      const payload = {
        planId: "monthly" as const,
        provider: "paystack" as const,
        reference: "ref_test_idempotent_123",
        amount: 99900,
        currency: "NGN",
      };

      // First webhook call: must activate
      const firstResult = await activateUserSubscription("user_1", payload);
      expect(firstResult.ok).toBe(true);
      expect(firstResult.skipped).toBeUndefined();

      // Second webhook call with identical provider + reference: must skip
      const secondResult = await activateUserSubscription("user_1", payload);
      expect(secondResult.ok).toBe(true);
      expect(secondResult.skipped).toBe(true);
    });

    it("rejects activation when paid amount or currency does not match PRICING_PLANS", async () => {
      // Wrong amount for monthly NGN (expected 99900 kobo, received 50000)
      const resWrongAmount = await activateUserSubscription("user_1", {
        planId: "monthly",
        provider: "paystack",
        reference: "ref_tampered_amount",
        amount: 50000,
        currency: "NGN",
      });
      expect(resWrongAmount.ok).toBe(false);
      expect(resWrongAmount.error).toMatch(/does not match pricing plan/i);

      // Flaw fix test: ₦9.99 (999 kobo) must NEVER match the ₦999 plan
      const resNineNairaBypass = await activateUserSubscription("user_1", {
        planId: "monthly",
        provider: "paystack",
        reference: "ref_nine_naira_bypass",
        amount: 999,
        currency: "NGN",
      });
      expect(resNineNairaBypass.ok).toBe(false);
      expect(resNineNairaBypass.error).toMatch(/does not match pricing plan/i);

      // Flaw fix test: $0 (100% coupon) must NEVER match USD price
      const resZeroDollarBypass = await activateUserSubscription("user_1", {
        planId: "monthly",
        provider: "stripe",
        reference: "ref_zero_dollar_bypass",
        amount: 0,
        currency: "USD",
      });
      expect(resZeroDollarBypass.ok).toBe(false);
      expect(resZeroDollarBypass.error).toMatch(/does not match pricing plan/i);

      // Wrong currency for USD plan
      const resWrongCurrency = await activateUserSubscription("user_1", {
        planId: "monthly",
        provider: "stripe",
        reference: "ref_tampered_curr",
        amount: 499,
        currency: "EUR",
      });
      expect(resWrongCurrency.ok).toBe(false);
      expect(resWrongCurrency.error).toMatch(/does not match pricing plan/i);
    });

    it("rejects invalid planId before indexing PRICING_PLANS", async () => {
      const resInvalidPlan = await activateUserSubscription("user_1", {
        planId: "invalid_hacked_plan" as unknown as "monthly",
        provider: "paystack",
        reference: "ref_invalid_plan",
        amount: 99900,
        currency: "NGN",
      });
      expect(resInvalidPlan.ok).toBe(false);
      expect(resInvalidPlan.error).toMatch(/Invalid subscription plan/i);
    });
  });

  describe("Forged-Signature Webhook Rejection", () => {
    it("rejects Paystack webhook with forged signature", async () => {
      const fakeBody = JSON.stringify({ event: "charge.success", data: { reference: "ref_forge" } });
      const req = new Request("http://localhost/api/webhook/paystack", {
        method: "POST",
        headers: {
          "x-paystack-signature": "forged_invalid_signature_hex",
        },
        body: fakeBody,
      });

      const res = await paystackWebhook(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.message).toMatch(/Signature verification failed/i);
    });

    it("rejects Paystack webhook with missing signature header", async () => {
      const req = new Request("http://localhost/api/webhook/paystack", {
        method: "POST",
        headers: {},
        body: JSON.stringify({ event: "charge.success" }),
      });

      const res = await paystackWebhook(req);
      expect(res.status).toBe(400);
    });

    it("rejects Stripe webhook with forged signature", async () => {
      const fakeBody = JSON.stringify({ type: "checkout.session.completed" });
      const req = new Request("http://localhost/api/webhook/stripe", {
        method: "POST",
        headers: {
          "stripe-signature": "t=12345,v1=forged_hmac_hex",
        },
        body: fakeBody,
      });

      const res = await stripeWebhook(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.message).toMatch(/Webhook signature failed|Stripe webhook not configured/i);
    });

    it("rejects Stripe webhook with missing signature header", async () => {
      const req = new Request("http://localhost/api/webhook/stripe", {
        method: "POST",
        headers: {},
        body: JSON.stringify({ type: "checkout.session.completed" }),
      });

      const res = await stripeWebhook(req);
      expect(res.status).toBe(400);
    });
  });
});

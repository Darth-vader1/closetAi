import "server-only";
import { PAYSTACK_SECRET_KEY } from "./plans";

export interface InitializePaystackParams {
  email: string;
  amountKobo: number; // e.g. 999 * 100 = 99900
  planCode?: string;
  callbackUrl: string;
  metadata: {
    userId: string;
    planId: string;
    [key: string]: unknown;
  };
}

export interface PaystackInitResponse {
  status: boolean;
  message: string;
  data?: {
    authorization_url: string;
    access_code: string;
    reference: string;
  };
}

export async function initializePaystackTransaction(
  params: InitializePaystackParams,
): Promise<PaystackInitResponse> {
  if (!PAYSTACK_SECRET_KEY) {
    throw new Error("Paystack secret key is not configured in environment variables.");
  }

  const payload: Record<string, unknown> = {
    email: params.email,
    amount: params.amountKobo,
    callback_url: params.callbackUrl,
    metadata: params.metadata,
  };

  if (params.planCode) {
    payload.plan = params.planCode;
  }

  const res = await fetch("https://api.paystack.co/transaction/initialize", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = (await res.json()) as PaystackInitResponse;
  return data;
}

export interface PaystackVerifyResponse {
  status: boolean;
  message: string;
  data?: {
    id: number;
    status: string; // 'success'
    reference: string;
    amount: number;
    currency: string;
    customer: {
      id: number;
      customer_code: string;
      email: string;
    };
    metadata?: {
      userId?: string;
      planId?: string;
    };
    plan?: string;
    paid_at?: string;
  };
}

export async function verifyPaystackTransaction(
  reference: string,
): Promise<PaystackVerifyResponse> {
  if (!PAYSTACK_SECRET_KEY) {
    throw new Error("Paystack secret key is not configured.");
  }

  const res = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
    },
  });

  const data = (await res.json()) as PaystackVerifyResponse;
  return data;
}

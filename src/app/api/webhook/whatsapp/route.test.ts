import crypto from "node:crypto";
import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Webhook security and behaviour. The regressions covered here were real: the signature check used
 * to be skipped when WHATSAPP_APP_SECRET was unset, the verify token had a hard-coded default, and
 * STOP/START/verification used a cookie client that cannot work inside a webhook.
 */

type Call = { table: string; op: string; args: unknown[] };
const state = { calls: [] as Call[], dedupeInserts: true };

function chain(table: string) {
  let lastOp = "select";
  const c: Record<string, unknown> = {};
  for (const op of ["upsert", "update", "delete", "insert", "select", "eq"]) {
    c[op] = (...args: unknown[]) => {
      if (op !== "eq" && op !== "select") lastOp = op;
      state.calls.push({ table, op, args });
      return c;
    };
  }
  // Awaiting the chain resolves like a Supabase response.
  c.then = (resolve: (v: unknown) => void) => {
    if (table === "whatsapp_webhook_messages" && lastOp === "upsert") {
      resolve({ data: state.dedupeInserts ? [{ id: "row" }] : [], error: null });
    } else {
      resolve({ data: null, error: null });
    }
  };
  return c;
}

vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: () => ({ from: (t: string) => chain(t) }) }));
vi.mock("@/lib/whatsapp/service", () => ({ sendWhatsAppMessage: vi.fn().mockResolvedValue({ success: true }) }));
vi.mock("@/lib/whatsapp/verification", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/whatsapp/verification")>()),
  verifyCodeFromSender: vi.fn().mockResolvedValue({ success: true, userId: "u1" }),
}));

import { GET, POST } from "./route";
import { sendWhatsAppMessage } from "@/lib/whatsapp/service";
import { verifyCodeFromSender } from "@/lib/whatsapp/verification";

const SECRET = "test-app-secret";
const sign = (body: string, secret = SECRET) => "sha256=" + crypto.createHmac("sha256", secret).update(body).digest("hex");

function payload(messages: Array<{ id: string; from?: string; text: string }>) {
  return JSON.stringify({
    entry: [
      {
        changes: [
          {
            value: {
              messages: messages.map((m) => ({ id: m.id, from: m.from ?? "2348012345678", type: "text", text: { body: m.text } })),
            },
          },
        ],
      },
    ],
  });
}

function post(body: string, signature?: string) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (signature) headers["x-hub-signature-256"] = signature;
  return POST(new NextRequest("http://localhost/api/webhook/whatsapp", { method: "POST", headers, body }));
}

const touched = (table: string, op?: string) => state.calls.some((c) => c.table === table && (!op || c.op === op));

beforeEach(() => {
  state.calls = [];
  state.dedupeInserts = true;
  vi.clearAllMocks();
  process.env.WHATSAPP_APP_SECRET = SECRET;
  process.env.WHATSAPP_VERIFY_TOKEN = "real-verify-token";
});

afterEach(() => {
  delete process.env.WHATSAPP_APP_SECRET;
  delete process.env.WHATSAPP_VERIFY_TOKEN;
});

describe("GET handshake fails closed", () => {
  const url = (token: string) =>
    new NextRequest(`http://localhost/api/webhook/whatsapp?hub.mode=subscribe&hub.challenge=abc123&hub.verify_token=${token}`);

  it("echoes the challenge only for the configured token", async () => {
    const res = await GET(url("real-verify-token"));
    expect(res.status).toBe(200);
    expect(await res.text()).toBe("abc123");
  });

  it("rejects a wrong token", async () => {
    expect((await GET(url("nope"))).status).toBe(403);
  });

  it("refuses to work when no token is configured, and the old hard-coded default no longer works", async () => {
    delete process.env.WHATSAPP_VERIFY_TOKEN;
    expect((await GET(url("closetai_whatsapp_verify_2026"))).status).toBe(500);
  });
});

describe("POST authentication", () => {
  it("returns 500 and does nothing when WHATSAPP_APP_SECRET is not set (unsigned requests are never accepted)", async () => {
    delete process.env.WHATSAPP_APP_SECRET;
    const body = payload([{ id: "m1", text: "STOP" }]);
    expect((await post(body)).status).toBe(500);
    expect((await post(body, sign(body))).status).toBe(500);
    expect(state.calls).toHaveLength(0);
  });

  it("rejects a missing or forged signature and touches no data", async () => {
    const body = payload([{ id: "m1", text: "STOP" }]);
    expect((await post(body)).status).toBe(401);
    expect((await post(body, sign(body, "attacker-secret"))).status).toBe(401);
    expect((await post(body, "sha256=")).status).toBe(401);
    expect(state.calls).toHaveLength(0);
    expect(sendWhatsAppMessage).not.toHaveBeenCalled();
  });

  it("rejects a valid signature over a different body (tampering)", async () => {
    const signedFor = payload([{ id: "m1", text: "hello" }]);
    const tampered = payload([{ id: "m1", text: "STOP" }]);
    expect((await post(tampered, sign(signedFor))).status).toBe(401);
    expect(state.calls).toHaveLength(0);
  });
});

describe("POST message handling (signed)", () => {
  it("STOP records an opt-out and disables every WhatsApp preference for that number", async () => {
    const body = payload([{ id: "m1", text: " stop " }]);
    expect((await post(body, sign(body))).status).toBe(200);
    expect(touched("whatsapp_optouts", "upsert")).toBe(true);
    const update = state.calls.find((c) => c.table === "email_preferences" && c.op === "update" && JSON.stringify(c.args).includes("whatsapp_daily_enabled"));
    expect(JSON.stringify(update?.args)).toContain('"whatsapp_daily_enabled":false');
    expect(state.calls.some((c) => c.op === "eq" && c.args[0] === "whatsapp_phone_digits" && c.args[1] === "2348012345678")).toBe(true);
  });

  it("START clears the opt-out and only re-enables numbers that are verified", async () => {
    const body = payload([{ id: "m2", text: "START" }]);
    await post(body, sign(body));
    expect(touched("whatsapp_optouts", "delete")).toBe(true);
    expect(state.calls.some((c) => c.op === "eq" && c.args[0] === "whatsapp_phone_verified" && c.args[1] === true)).toBe(true);
  });

  it("treats a verification code as a code and passes the SENDER's digits", async () => {
    const body = payload([{ id: "m3", from: "2348099999999", text: "CLOSET-123456" }]);
    await post(body, sign(body));
    expect(verifyCodeFromSender).toHaveBeenCalledWith("2348099999999", "CLOSET-123456");
  });

  it("does NOT treat ordinary chat containing six digits as a code", async () => {
    const body = payload([{ id: "m4", text: "my order 123456 please call me" }]);
    await post(body, sign(body));
    expect(verifyCodeFromSender).not.toHaveBeenCalled();
  });

  it("records the inbound timestamp that starts Meta's 24-hour window", async () => {
    const body = payload([{ id: "m5", text: "hello" }]);
    await post(body, sign(body));
    const touch = state.calls.find((c) => c.table === "email_preferences" && c.op === "update");
    expect(JSON.stringify(touch?.args)).toContain("whatsapp_last_inbound_at");
  });

  it("ignores a message id it has already processed (Meta retries)", async () => {
    state.dedupeInserts = false;
    const body = payload([{ id: "dup", text: "STOP" }]);
    expect((await post(body, sign(body))).status).toBe(200);
    expect(touched("whatsapp_optouts")).toBe(false);
    expect(touched("email_preferences")).toBe(false);
  });

  it("processes every message in a batch, not just the first", async () => {
    const body = payload([
      { id: "b1", from: "2348011111111", text: "CLOSET-111111" },
      { id: "b2", from: "2348022222222", text: "CLOSET-222222" },
    ]);
    await post(body, sign(body));
    expect(verifyCodeFromSender).toHaveBeenCalledTimes(2);
  });

  it("ignores a sender that is not a plausible phone number", async () => {
    const body = payload([{ id: "x1", from: "abc", text: "STOP" }]);
    expect((await post(body, sign(body))).status).toBe(200);
    expect(state.calls).toHaveLength(0);
  });
});

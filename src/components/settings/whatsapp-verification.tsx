"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { startPhoneVerification, verifyPhoneCode } from "@/app/(app)/settings/whatsapp-actions";

interface WhatsAppVerificationProps {
  /** Whether the SAVED number is verified (from the server). */
  verified: boolean;
  /** True when the number in the input differs from the saved one, or nothing is saved yet. */
  needsSave: boolean;
}

/**
 * Proves the user controls the WhatsApp number they saved. The code is sent to that number over
 * WhatsApp and is never shown here: receiving it is the proof. They can type it in, or text it
 * to our business number.
 */
export function WhatsAppVerification({ verified, needsSave }: WhatsAppVerificationProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [sent, setSent] = useState(false);
  const [code, setCode] = useState("");
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  if (verified && !needsSave) {
    return (
      <p className="flex items-center gap-1.5 text-xs text-emerald-700">
        <CheckCircle2 className="h-3.5 w-3.5" />
        Number verified. You&apos;ll get WhatsApp messages on this number.
      </p>
    );
  }

  if (needsSave) {
    return (
      <p className="text-xs text-muted">
        Save your preferences first, then verify this number to start receiving WhatsApp messages.
      </p>
    );
  }

  const send = () => {
    setMessage(null);
    startTransition(async () => {
      const res = await startPhoneVerification();
      if (res.success) {
        setSent(true);
        setMessage({
          type: "success",
          text: `We sent a code to your WhatsApp. It expires in ${res.expiresInMinutes ?? 15} minutes.`,
        });
      } else {
        setMessage({ type: "error", text: res.error ?? "Could not send a code." });
      }
    });
  };

  const confirm = () => {
    setMessage(null);
    startTransition(async () => {
      const res = await verifyPhoneCode(code);
      if (res.success) {
        setMessage({ type: "success", text: "Number verified." });
        setSent(false);
        setCode("");
        router.refresh();
      } else {
        setMessage({ type: "error", text: res.error ?? "That code didn't work." });
      }
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" loading={pending && !sent} onClick={send} className="gap-1.5 text-xs rounded-lg">
          <ShieldCheck className="h-3 w-3" />
          {sent ? "Send a new code" : "Verify this number"}
        </Button>
        {sent && (
          <>
            <Input
              value={code}
              onChange={(e) => setCode(e.target.value)}
              placeholder="CLOSET-123456"
              inputMode="text"
              autoComplete="one-time-code"
              className="text-xs h-9 min-h-0 w-40 bg-surface"
            />
            <Button type="button" size="sm" loading={pending && sent} disabled={code.trim().length < 6} onClick={confirm} className="text-xs rounded-lg">
              Confirm
            </Button>
          </>
        )}
      </div>
      {sent && (
        <p className="text-[11px] text-muted">
          You can also reply to our WhatsApp message with the code instead of typing it here.
        </p>
      )}
      {message && (
        <p className={`text-xs ${message.type === "success" ? "text-emerald-700" : "text-danger"}`} role="status">
          {message.text}
        </p>
      )}
    </div>
  );
}

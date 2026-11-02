"use client";

import { useState } from "react";
import { RefreshCw, CheckCircle2, AlertCircle } from "lucide-react";
import { reconcileGatewayPaymentsAction } from "@/app/admin/actions";
import { useRouter } from "next/navigation";

export function ReconcileGatewayButton() {
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const router = useRouter();

  const handleReconcile = async () => {
    setLoading(true);
    setFeedback(null);

    try {
      const res = await reconcileGatewayPaymentsAction();
      if (res.ok) {
        setFeedback({
          type: "success",
          message: res.message || "Gateway reconciliation complete.",
        });
        router.refresh();
      } else {
        setFeedback({
          type: "error",
          message: res.error || "Failed to reconcile gateway transactions.",
        });
      }
    } catch {
      setFeedback({
        type: "error",
        message: "An unexpected error occurred during reconciliation.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      {feedback && (
        <span
          className={`text-xs inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md transition-all ${
            feedback.type === "success"
              ? "bg-emerald-500/10 text-emerald-600 border border-emerald-500/20"
              : "bg-red-500/10 text-red-600 border border-red-500/20"
          }`}
        >
          {feedback.type === "success" ? (
            <CheckCircle2 className="size-3.5 shrink-0" />
          ) : (
            <AlertCircle className="size-3.5 shrink-0" />
          )}
          <span>{feedback.message}</span>
        </span>
      )}

      <button
        type="button"
        onClick={handleReconcile}
        disabled={loading}
        className="inline-flex items-center gap-2 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-medium text-foreground shadow-sm hover:bg-surface-muted/50 disabled:opacity-50 transition-colors"
        title="Check Paystack & Stripe for completed payments that have not yet synced"
      >
        <RefreshCw className={`size-3.5 text-muted ${loading ? "animate-spin" : ""}`} />
        <span>{loading ? "Reconciling..." : "Reconcile Gateways"}</span>
      </button>
    </div>
  );
}

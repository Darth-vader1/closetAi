import Link from "next/link";
import { Sparkles, AlertCircle } from "lucide-react";
import type { UsageCheckResult } from "@/lib/billing/entitlements";

interface UsageIndicatorProps {
  usage: UsageCheckResult;
  label?: string;
  className?: string;
}

export function UsageIndicator({ usage, label, className = "" }: UsageIndicatorProps) {
  // If unlimited (Premium), don't show pressure
  if (usage.limit === null) {
    return null;
  }

  const percentage = Math.min(100, Math.round((usage.current / usage.limit) * 100));
  const isNearLimit = percentage >= 80 && percentage < 100;
  const isAtLimit = percentage >= 100;

  return (
    <div
      className={`rounded-xl border p-3 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
        isAtLimit
          ? "border-danger/30 bg-danger-soft/20 text-foreground"
          : isNearLimit
          ? "border-warning/30 bg-warning-soft/20 text-foreground"
          : "border-border/60 bg-surface-muted/30 text-muted"
      } ${className}`}
    >
      <div className="flex items-center gap-2.5">
        {isAtLimit ? (
          <AlertCircle className="size-4 text-danger shrink-0" />
        ) : (
          <Sparkles className="size-4 text-accent shrink-0" />
        )}
        <div>
          <span className="font-semibold text-foreground">
            {label || "Free Plan Allowance"}:
          </span>{" "}
          <span>
            {usage.current} of {usage.limit} used ({usage.remaining} remaining)
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3 self-end sm:self-auto">
        <div className="w-24 h-1.5 rounded-full bg-border/40 overflow-hidden hidden sm:block">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              isAtLimit ? "bg-danger" : isNearLimit ? "bg-warning" : "bg-accent"
            }`}
            style={{ width: `${percentage}%` }}
          />
        </div>

        {(isNearLimit || isAtLimit) && (
          <Link
            href="/subscription"
            className="inline-flex items-center gap-1 font-semibold text-accent hover:underline text-xs"
          >
            <span>Upgrade</span>
            <span>→</span>
          </Link>
        )}
      </div>
    </div>
  );
}

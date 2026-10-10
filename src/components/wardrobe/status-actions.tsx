"use client";

import { useState, useTransition } from "react";
import { changeStatusAction } from "@/app/(app)/wardrobe/actions";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/input";
import { LAUNDRY_STATUSES, STATUS_LABELS, statusActions, type LaundryStatus } from "@/lib/wardrobe/status";

/**
 * Quick laundry actions for one garment. Every change goes through the server (and the database
 * function that records the audit event); the page then refreshes with the new state.
 */
export function StatusActions({ id, status, compact = false, showAnyStatus = false }: { id: string; status: LaundryStatus; compact?: boolean; showAnyStatus?: boolean }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const apply = (to: LaundryStatus, confirmWashed: boolean) => {
    setError(null);
    startTransition(async () => {
      const result = await changeStatusAction(id, { to, confirmWashed });
      if (!result.ok) setError(result.error);
    });
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {statusActions(status).map((a) => (
          <Button
            key={a.label}
            type="button"
            size={compact ? "sm" : "default"}
            variant={a.primary ? "dark" : "outline"}
            disabled={pending}
            onClick={() => apply(a.to, a.confirmWashed)}
          >
            {a.label}
          </Button>
        ))}
      </div>
      {showAnyStatus ? (
        <div className="max-w-xs">
          <label htmlFor={`status-${id}`} className="mb-1 block text-sm text-muted">Set status directly</label>
          <Select id={`status-${id}`} value={status} disabled={pending} onChange={(e) => apply(e.target.value as LaundryStatus, false)}>
            {LAUNDRY_STATUSES.map((s) => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </Select>
        </div>
      ) : null}
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}

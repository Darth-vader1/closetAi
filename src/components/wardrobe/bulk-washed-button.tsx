"use client";

import { useState, useTransition } from "react";
import { bulkChangeStatusAction } from "@/app/(app)/wardrobe/actions";
import { Button } from "@/components/ui/button";

/** Confirms a wash for a whole section at once. Only offered where the user has said items are already washing/drying. */
export function BulkWashedButton({ ids, label }: { ids: string[]; label: string }) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-1">
      <Button
        type="button"
        variant="outline"
        size="sm"
        loading={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await bulkChangeStatusAction(ids, { to: "CLEAN", confirmWashed: true });
            if (!result.ok) setError(result.error);
          });
        }}
      >
        {label}
      </Button>
      {error ? <p role="alert" className="text-sm text-danger">{error}</p> : null}
    </div>
  );
}

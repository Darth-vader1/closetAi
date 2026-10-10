"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/card";

/** Error boundary for signed-in pages. The navigation shell stays visible. */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("ui.app_error", { digest: error.digest });
  }, [error]);

  return (
    <div className="mx-auto max-w-lg space-y-4 py-12 text-center">
      <h1 className="text-3xl">This page didn&apos;t load</h1>
      <Alert tone="danger">
        Something went wrong while loading your data. Your wardrobe is safe.
        {error.digest ? <span className="mt-1 block text-xs opacity-80">Reference: {error.digest}</span> : null}
      </Alert>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}

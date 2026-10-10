"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/card";

/** Root error boundary. Shows a calm message, never a stack trace. */
export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // The digest lets you find the matching server log line without exposing details to the user.
    console.error("ui.unhandled_error", { digest: error.digest });
  }, [error]);

  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-6 px-4 text-center">
      <h1 className="text-4xl">Something went wrong</h1>
      <Alert tone="danger">
        We hit an unexpected problem. Trying again usually fixes it.
        {error.digest ? <span className="mt-1 block text-xs opacity-80">Reference: {error.digest}</span> : null}
      </Alert>
      <div className="flex gap-3">
        <Button onClick={reset}>Try again</Button>
        <Button asChild variant="outline">
          <Link href="/">Go home</Link>
        </Button>
      </div>
    </div>
  );
}

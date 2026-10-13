import type { Metadata } from "next";
import Link from "next/link";
import { Wifi, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "You're offline",
};

export default function OfflinePage() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4 bg-surface">
      <div className="w-full max-w-md text-center space-y-6">
        <div className="inline-flex h-16 w-16 items-center justify-center rounded-full bg-surface-muted">
          <Wifi className="h-8 w-8 text-muted" />
        </div>
        
        <div className="space-y-2">
          <h1 className="text-2xl font-serif font-semibold text-foreground">
            You're offline
          </h1>
          <p className="text-sm text-muted">
            It looks like you've lost your internet connection. Some features may not be available until you're back online.
          </p>
        </div>

        <div className="space-y-3 pt-2">
          <Button
            onClick={() => window.location.reload()}
            className="w-full gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Try again
          </Button>
          
          <Link href="/wardrobe">
            <Button variant="outline" className="w-full">
              Go to cached wardrobe
            </Button>
          </Link>
        </div>

        <p className="text-xs text-muted">
          Don't worry — your data is safe. We'll sync any changes when you're back online.
        </p>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Shows update notification when new service worker version is available.
 * Works with @ducanh2912/next-pwa's automatic registration.
 */
export function PwaUpdatePrompt() {
  const [showPrompt, setShowPrompt] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
      return;
    }

    // Check if workbox is available (from next-pwa)
    const wb = (window as any).workbox;

    if (wb) {
      // Use Workbox events
      const showUpdate = () => setShowPrompt(true);
      
      wb.addEventListener("waiting", showUpdate);
      wb.addEventListener("externalwaiting", showUpdate);
      
      // Register and check for updates
      wb.register();
    } else {
      // Fallback: manual service worker handling
      const checkForUpdates = async () => {
        try {
          const reg = await navigator.serviceWorker.getRegistration();
          if (!reg) return;

          reg.addEventListener("updatefound", () => {
            const newWorker = reg.installing;
            if (!newWorker) return;

            newWorker.addEventListener("statechange", () => {
              if (newWorker.state === "installed" && navigator.serviceWorker.controller) {
                setShowPrompt(true);
              }
            });
          });

          navigator.serviceWorker.addEventListener("controllerchange", () => {
            window.location.reload();
          });

          await reg.update();
        } catch (error) {
          console.error("Service worker check failed:", error);
        }
      };

      checkForUpdates();

      // Check for updates every 60 minutes
      const interval = setInterval(() => {
        navigator.serviceWorker.getRegistration().then((reg) => {
          reg?.update();
        });
      }, 60 * 60 * 1000);

      return () => clearInterval(interval);
    }
  }, []);

  const handleUpdate = () => {
    setShowPrompt(false);
    
    const wb = (window as any).workbox;
    
    if (wb && typeof wb.messageSkipWaiting === "function") {
      // Tell workbox to skip waiting and activate
      wb.messageSkipWaiting();
    } else {
      // Fallback
      navigator.serviceWorker.getRegistration().then((reg) => {
        if (reg?.waiting) {
          reg.waiting.postMessage({ type: "SKIP_WAITING" });
        }
      });
    }
    
    // Reload after a short delay to let SW activate
    setTimeout(() => window.location.reload(), 100);
  };

  const handleDismiss = () => {
    setShowPrompt(false);
  };

  if (!showPrompt) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 z-50 animate-in slide-in-from-bottom-4 fade-in duration-300">
      <div className="mx-auto max-w-md rounded-xl border border-accent/30 bg-card shadow-2xl backdrop-blur-sm">
        <div className="flex items-start gap-3 p-4">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-contrast">
            <RefreshCw className="h-5 w-5" />
          </div>
          
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-foreground text-sm">
              New version available!
            </h3>
            <p className="text-xs text-muted mt-0.5">
              An update is ready. Refresh to get the latest features and improvements.
            </p>
            
            <div className="flex gap-2 mt-3">
              <Button
                onClick={handleUpdate}
                size="sm"
                className="h-8 px-3 text-xs"
              >
                Update now
              </Button>
              <Button
                onClick={handleDismiss}
                variant="outline"
                size="sm"
                className="h-8 px-3 text-xs"
              >
                Later
              </Button>
            </div>
          </div>

          <button
            onClick={handleDismiss}
            className="shrink-0 p-1 text-muted hover:text-foreground rounded-md transition-colors"
            aria-label="Dismiss update notification"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { Download, Share2, PlusSquare, Smartphone, X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

export function InstallPwaBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isStandalone] = useState(() => {
    if (typeof window === "undefined") return false;
    return (
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true
    );
  });
  const [isIOS] = useState(() => {
    if (typeof window === "undefined") return false;
    return /iphone|ipad|ipod/.test(window.navigator.userAgent.toLowerCase());
  });
  const [showIOSModal, setShowIOSModal] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    if (isStandalone) return;

    // Listen for Chromium PWA install prompt
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, [isStandalone]);

  if (isStandalone || dismissed) return null;

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      await deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice.outcome === "accepted") {
        setDeferredPrompt(null);
      }
    } else if (isIOS) {
      setShowIOSModal(true);
    } else {
      // General instructions
      alert("To install ClosetAI: In your browser menu, tap 'Install App' or 'Add to Home Screen'.");
    }
  };

  return (
    <>
      <div className="my-2 mx-1 flex items-center justify-between gap-3 rounded-xl border border-accent/20 bg-accent-soft/40 p-2.5 text-xs text-foreground shadow-2xs">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-contrast">
            <Smartphone className="h-4 w-4" />
          </div>
          <div>
            <div className="font-semibold text-foreground">Add ClosetAI to Home Screen</div>
            <div className="text-[11px] text-muted">Use it like a native app on your phone</div>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <Button
            size="sm"
            onClick={handleInstallClick}
            className="h-7 px-2.5 text-xs rounded-lg gap-1.5"
          >
            <Download className="h-3 w-3" />
            <span>Install</span>
          </Button>
          <button
            type="button"
            onClick={() => setDismissed(true)}
            aria-label="Dismiss banner"
            className="p-1 text-muted hover:text-foreground rounded-md"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* iOS Instructions Modal */}
      {showIOSModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-xl space-y-4 animate-in fade-in-50 slide-in-from-bottom-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-serif text-lg font-medium text-foreground">
                <Smartphone className="h-5 w-5 text-accent" />
                <span>Add to Home Screen</span>
              </div>
              <button
                type="button"
                onClick={() => setShowIOSModal(false)}
                className="text-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <p className="text-xs text-muted leading-relaxed">
              Install ClosetAI on your iPhone or iPad for instant full-screen access from your home screen:
            </p>

            <div className="space-y-3 pt-1 text-xs">
              <div className="flex items-start gap-3 rounded-xl border border-border bg-surface-muted/60 p-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent font-semibold">
                  1
                </div>
                <div>
                  <div className="font-medium text-foreground flex items-center gap-1.5">
                    Tap the Share icon <Share2 className="h-3.5 w-3.5 text-accent" />
                  </div>
                  <div className="text-muted text-[11px]">Located at the bottom of Safari</div>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-xl border border-border bg-surface-muted/60 p-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent font-semibold">
                  2
                </div>
                <div>
                  <div className="font-medium text-foreground flex items-center gap-1.5">
                    Tap &quot;Add to Home Screen&quot; <PlusSquare className="h-3.5 w-3.5 text-accent" />
                  </div>
                  <div className="text-muted text-[11px]">Scroll down in the share sheet menu</div>
                </div>
              </div>

              <div className="flex items-start gap-3 rounded-xl border border-border bg-surface-muted/60 p-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-lg bg-accent-soft text-accent font-semibold">
                  3
                </div>
                <div>
                  <div className="font-medium text-foreground">Tap &quot;Add&quot; in top right</div>
                  <div className="text-muted text-[11px]">ClosetAI icon will appear on your home screen!</div>
                </div>
              </div>
            </div>

            <Button
              onClick={() => setShowIOSModal(false)}
              className="w-full rounded-xl"
            >
              Got it
            </Button>
          </div>
        </div>
      )}
    </>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export const START_PRODUCT_TOUR_EVENT = "closetai:start-product-tour";

interface TourStep {
  id: string;
  targetSelector?: string;
  mobileSelector?: string;
  emoji: string;
  title: string;
  description: string;
}

const TOUR_STEPS: TourStep[] = [
  {
    id: "welcome",
    emoji: "👋",
    title: "Welcome to ClosetAI!",
    description:
      "Let's take a quick tour to help you get the most out of your digital wardrobe.",
  },
  {
    id: "dashboard",
    targetSelector: '[data-tour="nav-/dashboard"]',
    mobileSelector: '[data-tour-mobile="nav-/dashboard"]',
    emoji: "📊",
    title: "Your Dashboard",
    description:
      "Get an overview of your wardrobe, outfit recommendations, and clothing activity.",
  },
  {
    id: "wardrobe",
    targetSelector: '[data-tour="nav-/wardrobe"]',
    mobileSelector: '[data-tour-mobile="nav-/wardrobe"]',
    emoji: "👕",
    title: "Your Digital Wardrobe",
    description:
      "Upload your clothes, organize them, and keep track of what is clean, worn, or in the laundry.",
  },
  {
    id: "studio",
    targetSelector: '[data-tour="nav-/studio"]',
    mobileSelector: '[data-tour-mobile="nav-/studio"]',
    emoji: "✨",
    title: "Create Your Outfits",
    description:
      "Combine clothes you already own and discover new outfit combinations.",
  },
  {
    id: "stylist",
    targetSelector: '[data-tour="nav-/stylist"]',
    mobileSelector: '[data-tour-mobile="nav-/stylist"]',
    emoji: "🤖",
    title: "Meet Your AI Stylist",
    description:
      "Get personalized outfit recommendations based on your wardrobe and preferences.",
  },
  {
    id: "packing",
    targetSelector: '[data-tour="nav-/packing"]',
    mobileSelector: '[data-tour-mobile="nav-/packing"]',
    emoji: "🧳",
    title: "Trip Packing Capsule",
    description:
      "Enter any destination and trip duration to pack a weather-aware, carry-on friendly mix-and-match capsule.",
  },
  {
    id: "calendar",
    targetSelector: '[data-tour="nav-/calendar"]',
    mobileSelector: '[data-tour-mobile="nav-/calendar"]',
    emoji: "📅",
    title: "Outfit Calendar",
    description:
      "Schedule your outfits ahead of time and keep a visual history of what you wore each day.",
  },
  {
    id: "laundry",
    targetSelector: '[data-tour="nav-/laundry"]',
    mobileSelector: '[data-tour-mobile="nav-/laundry"]',
    emoji: "🧺",
    title: "Laundry Tracker",
    description:
      "See which garments need a wash and mark loads clean with a single tap so your outfit suggestions stay accurate.",
  },
  {
    id: "finish",
    emoji: "🎉",
    title: "You're all set!",
    description: "Your wardrobe journey starts here. Let's get styling!",
  },
];

interface TargetRect {
  top: number;
  left: number;
  width: number;
  height: number;
  isMobileTarget: boolean;
}

export function triggerProductTour() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(START_PRODUCT_TOUR_EVENT));
  }
}

export function ProductTour({ userId }: { userId: string }) {
  const storageKey = `closetai_product_tour_seen_${userId}`;
  const [open, setOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<TargetRect | null>(null);

  const currentStep = TOUR_STEPS[stepIndex] ?? TOUR_STEPS[0];
  const isWelcome = currentStep.id === "welcome";
  const isFinish = currentStep.id === "finish";
  const isCenteredModal = isWelcome || isFinish;

  const measureTarget = useCallback(() => {
    if (!open || !currentStep.targetSelector) {
      setRect(null);
      return;
    }

    const desktopEl = document.querySelector<HTMLElement>(currentStep.targetSelector);
    if (desktopEl && desktopEl.offsetParent !== null) {
      const r = desktopEl.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        setRect({
          top: r.top,
          left: r.left,
          width: r.width,
          height: r.height,
          isMobileTarget: false,
        });
        return;
      }
    }

    if (currentStep.mobileSelector) {
      const mobileEl = document.querySelector<HTMLElement>(currentStep.mobileSelector);
      if (mobileEl && mobileEl.offsetParent !== null) {
        const r = mobileEl.getBoundingClientRect();
        if (r.width > 0 && r.height > 0) {
          setRect({
            top: r.top,
            left: r.left,
            width: r.width,
            height: r.height,
            isMobileTarget: true,
          });
          return;
        }
      }
    }

    setRect(null);
  }, [open, currentStep]);

  useEffect(() => {
    try {
      const seen = window.localStorage.getItem(storageKey);
      if (!seen) {
        const timer = window.setTimeout(() => {
          setStepIndex(0);
          setOpen(true);
        }, 450);
        return () => window.clearTimeout(timer);
      }
    } catch {
      // Ignore storage errors
    }
  }, [storageKey]);

  useEffect(() => {
    const onStartTour = () => {
      setStepIndex(0);
      setOpen(true);
    };
    window.addEventListener(START_PRODUCT_TOUR_EVENT, onStartTour);
    return () => window.removeEventListener(START_PRODUCT_TOUR_EVENT, onStartTour);
  }, []);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(measureTarget);
    window.addEventListener("resize", measureTarget);
    window.addEventListener("scroll", measureTarget, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", measureTarget);
      window.removeEventListener("scroll", measureTarget, true);
    };
  }, [open, stepIndex, measureTarget]);

  const completeTour = useCallback(() => {
    try {
      window.localStorage.setItem(storageKey, new Date().toISOString());
    } catch {
      // Ignore storage errors
    }
    setOpen(false);
  }, [storageKey]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        completeTour();
      } else if (e.key === "ArrowRight") {
        setStepIndex((i) => Math.min(TOUR_STEPS.length - 1, i + 1));
      } else if (e.key === "ArrowLeft") {
        setStepIndex((i) => Math.max(0, i - 1));
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, completeTour]);

  if (!open) return null;

  const spotlightStepsTotal = TOUR_STEPS.length - 2; // excluding welcome & finish
  const currentSpotlightNumber = Math.max(1, Math.min(spotlightStepsTotal, stepIndex));

  // Compute tooltip position beside the highlighted element on desktop, or centered if no rect
  const hasDesktopRect = rect && !rect.isMobileTarget && !isCenteredModal;
  const hasMobileRect = rect && rect.isMobileTarget && !isCenteredModal;

  const tooltipStyle: React.CSSProperties = hasDesktopRect
    ? {
        position: "fixed",
        top: Math.max(24, Math.min(window.innerHeight - 280, rect.top - 12)),
        left: Math.min(window.innerWidth - 380, rect.left + rect.width + 20),
      }
    : hasMobileRect
      ? {
          position: "fixed",
          bottom: Math.max(96, window.innerHeight - rect.top + 16),
          left: "50%",
          transform: "translateX(-50%)",
        }
      : {
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%, -50%)",
        };

  return (
    <div
      className="fixed inset-0 z-[100]"
      role="dialog"
      aria-modal="true"
      aria-label={currentStep.title}
    >
      {/* Dimmed backdrop when centered modal or when no spotlight target is visible */}
      {isCenteredModal || !rect ? (
        <div
          className="fixed inset-0 bg-foreground/60 backdrop-blur-[2px] transition-opacity duration-300"
          onClick={completeTour}
          aria-hidden="true"
        />
      ) : (
        <>
          {/* Click-outside catcher */}
          <div
            className="fixed inset-0"
            onClick={completeTour}
            aria-hidden="true"
          />
          {/* Smoothly animated spotlight cutout ring */}
          <div
            aria-hidden="true"
            className="pointer-events-none fixed rounded-2xl ring-2 ring-accent ring-offset-2 ring-offset-surface transition-all duration-300 ease-out"
            style={{
              top: rect.top - 4,
              left: rect.left - 4,
              width: rect.width + 8,
              height: rect.height + 8,
              boxShadow: "0 0 0 9999px rgba(15, 14, 13, 0.65)",
            }}
          />
        </>
      )}

      {/* Modal / Tooltip Card */}
      <div
        style={tooltipStyle}
        className="z-[101] w-[calc(100vw-2rem)] max-w-md rounded-2xl border border-border bg-surface p-6 shadow-2xl transition-all duration-300 ease-out"
      >
        {/* Top bar */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span
              className="grid size-10 place-items-center rounded-xl bg-accent-soft text-xl"
              aria-hidden="true"
            >
              {currentStep.emoji}
            </span>
            {!isCenteredModal ? (
              <span className="rounded-full bg-surface-muted px-2.5 py-0.5 text-xs font-medium text-muted">
                Step {currentSpotlightNumber} of {spotlightStepsTotal}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft px-2.5 py-0.5 text-xs font-medium text-accent">
                <Sparkles className="size-3" aria-hidden />
                Quick Tour
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={completeTour}
            className="grid size-8 place-items-center rounded-full text-muted hover:bg-surface-muted hover:text-foreground cursor-pointer"
            aria-label="Close tour"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        {/* Content */}
        <h2 className="mt-4 font-serif text-2xl font-normal text-foreground">
          {currentStep.title}
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          {currentStep.description}
        </p>

        {/* Progress dots for middle steps */}
        {!isCenteredModal ? (
          <div className="mt-5 flex items-center gap-1.5" aria-hidden="true">
            {TOUR_STEPS.slice(1, -1).map((s, idx) => {
              const active = idx + 1 === stepIndex;
              const passed = idx + 1 < stepIndex;
              return (
                <span
                  key={s.id}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    active
                      ? "w-6 bg-accent"
                      : passed
                        ? "w-2 bg-accent/50"
                        : "w-2 bg-border-strong"
                  }`}
                />
              );
            })}
          </div>
        ) : null}

        {/* Actions */}
        <div className="mt-6 flex items-center justify-between gap-3">
          {isWelcome ? (
            <>
              <Button
                type="button"
                variant="ghost"
                onClick={completeTour}
                className="text-muted"
              >
                Skip
              </Button>
              <Button
                type="button"
                onClick={() => setStepIndex(1)}
              >
                Start Tour →
              </Button>
            </>
          ) : isFinish ? (
            <Button
              type="button"
              onClick={completeTour}
              className="w-full"
            >
              Explore ClosetAI
            </Button>
          ) : (
            <>
              <div>
                {stepIndex > 1 ? (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setStepIndex((i) => Math.max(1, i - 1))}
                  >
                    ← Back
                  </Button>
                ) : (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={completeTour}
                    className="text-xs text-muted"
                  >
                    Skip tour
                  </Button>
                )}
              </div>
              <Button
                type="button"
                onClick={() =>
                  setStepIndex((i) => Math.min(TOUR_STEPS.length - 1, i + 1))
                }
              >
                Next →
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

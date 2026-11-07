"use client";

import * as React from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  clampOutfitIndex,
  computeDragTransform,
  computeWindowedDots,
  detectSwipeAxis,
  resolveKeyboardNavigation,
  resolveSwipeRelease,
  type NavigationDirection,
  type SwipeAxis,
} from "@/lib/outfits/swipe-deck-logic";
import { cn } from "@/lib/utils/cn";

export interface SwipeReviewDeckEntrySummary {
  id: string;
  title: string;
  previewUrl: string;
  busy?: boolean;
  hasError?: boolean;
}

export interface SavedReviewTrayItem {
  id: string;
  title: string;
  previewUrl: string;
  savedId: string | null;
}

export interface SwipeReviewDeckProps {
  items: SwipeReviewDeckEntrySummary[];
  activeIndex: number;
  onActiveIndexChange: (index: number) => void;
  renderCard: (id: string, isActive: boolean) => React.ReactNode;
  savedItems?: SavedReviewTrayItem[];
  className?: string;
}

function subscribeReducedMotion(callback: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => {};
  }
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}

function getReducedMotionSnapshot(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function getReducedMotionServerSnapshot(): boolean {
  return false;
}

function usePrefersReducedMotion(): boolean {
  return React.useSyncExternalStore(
    subscribeReducedMotion,
    getReducedMotionSnapshot,
    getReducedMotionServerSnapshot,
  );
}

function shouldIgnoreSwipeTarget(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) return false;
  return Boolean(
    target.closest(
      'button, a, input, select, textarea, label, [role="button"], [data-no-swipe="true"]',
    ),
  );
}

function isEditableElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === "INPUT" ||
    tag === "TEXTAREA" ||
    tag === "SELECT" ||
    target.isContentEditable
  );
}

interface PointerSession {
  pointerId: number;
  startX: number;
  startY: number;
  startTime: number;
  axis: SwipeAxis;
  captured: boolean;
}

export function SwipeReviewDeck({
  items,
  activeIndex,
  onActiveIndexChange,
  renderCard,
  savedItems = [],
  className,
}: SwipeReviewDeckProps) {
  const reducedMotion = usePrefersReducedMotion();
  const totalCount = items.length;
  const currentIndex = clampOutfitIndex(activeIndex, totalCount);

  const stageRef = React.useRef<HTMLDivElement | null>(null);
  const pointerSessionRef = React.useRef<PointerSession | null>(null);
  const transitionTimersRef = React.useRef<number[]>([]);

  const [dragVector, setDragVector] = React.useState<{
    dx: number;
    dy: number;
  } | null>(null);
  const [transitionPhase, setTransitionPhase] = React.useState<
    "idle" | "exiting" | "entering-start" | "entering-active"
  >("idle");
  const [transitionDirection, setTransitionDirection] =
    React.useState<NavigationDirection>("next");

  const clearTimers = React.useCallback(() => {
    for (const id of transitionTimersRef.current) {
      window.clearTimeout(id);
    }
    transitionTimersRef.current = [];
  }, []);

  React.useEffect(() => () => clearTimers(), [clearTimers]);

  // Keep activeIndex clamped if items are saved or removed
  React.useEffect(() => {
    if (totalCount > 0 && activeIndex !== currentIndex) {
      onActiveIndexChange(currentIndex);
    }
  }, [activeIndex, currentIndex, onActiveIndexChange, totalCount]);

  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < totalCount - 1;

  const commitIndexChange = React.useCallback(
    (nextIndex: number) => {
      const clamped = clampOutfitIndex(nextIndex, totalCount);
      onActiveIndexChange(clamped);
    },
    [onActiveIndexChange, totalCount],
  );

  const navigateTo = React.useCallback(
    (targetIndex: number, explicitDirection?: NavigationDirection) => {
      if (totalCount <= 1) return;
      const clamped = clampOutfitIndex(targetIndex, totalCount);
      if (clamped === currentIndex) return;

      const direction: NavigationDirection =
        explicitDirection ?? (clamped > currentIndex ? "next" : "prev");

      clearTimers();
      setDragVector(null);

      if (reducedMotion) {
        setTransitionPhase("idle");
        commitIndexChange(clamped);
        return;
      }

      setTransitionDirection(direction);
      setTransitionPhase("exiting");

      const exitTimer = window.setTimeout(() => {
        commitIndexChange(clamped);
        setTransitionPhase("entering-start");

        const enterFrameTimer = window.setTimeout(() => {
          setTransitionPhase("entering-active");

          const settleTimer = window.setTimeout(() => {
            setTransitionPhase("idle");
          }, 240);
          transitionTimersRef.current.push(settleTimer);
        }, 20);
        transitionTimersRef.current.push(enterFrameTimer);
      }, 150);

      transitionTimersRef.current.push(exitTimer);
    },
    [clearTimers, commitIndexChange, currentIndex, reducedMotion, totalCount],
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (totalCount <= 1 || transitionPhase !== "idle") return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (shouldIgnoreSwipeTarget(e.target)) return;

    pointerSessionRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startTime: performance.now(),
      axis: "pending",
      captured: false,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const session = pointerSessionRef.current;
    if (!session || session.pointerId !== e.pointerId) return;

    const dx = e.clientX - session.startX;
    const dy = e.clientY - session.startY;

    if (session.axis === "pending") {
      const detected = detectSwipeAxis(dx, dy);
      if (detected === "pending") return;
      session.axis = detected;

      if (detected === "vertical") {
        pointerSessionRef.current = null;
        setDragVector(null);
        return;
      }

      try {
        e.currentTarget.setPointerCapture(e.pointerId);
        session.captured = true;
      } catch {
        // Synthetic events may not support pointer capture
      }
    }

    if (session.axis === "horizontal") {
      setDragVector({ dx, dy });
    }
  };

  const finishPointerSession = (
    e: React.PointerEvent<HTMLDivElement>,
    cancelled = false,
  ) => {
    const session = pointerSessionRef.current;
    if (!session || session.pointerId !== e.pointerId) return;

    if (session.captured) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Ignore if already released
      }
    }

    pointerSessionRef.current = null;

    if (cancelled || session.axis !== "horizontal") {
      setDragVector(null);
      return;
    }

    const dx = e.clientX - session.startX;
    const durationMs = Math.max(1, performance.now() - session.startTime);
    const width = stageRef.current?.getBoundingClientRect().width ?? 360;

    const outcome = resolveSwipeRelease({
      dx,
      durationMs,
      containerWidth: width,
      currentIndex,
      totalCount,
    });

    if (outcome.committed && outcome.direction) {
      navigateTo(outcome.nextIndex, outcome.direction);
    } else {
      setDragVector(null);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLElement>) => {
    if (isEditableElement(e.target)) return;
    const nav = resolveKeyboardNavigation(e.key, currentIndex, totalCount);
    if (nav) {
      e.preventDefault();
      navigateTo(nav.nextIndex, nav.direction);
    }
  };

  const dragTransform = dragVector
    ? computeDragTransform({
        dx: dragVector.dx,
        dy: dragVector.dy,
        hasPrev,
        hasNext,
        reducedMotion,
      })
    : null;

  let cardStyle: React.CSSProperties | undefined;
  let cardTransitionClass = "";

  if (dragTransform) {
    cardStyle = {
      transform: `translate3d(${dragTransform.effectiveDx}px, ${dragTransform.effectiveDy}px, 0) rotate(${dragTransform.rotationDeg}deg)`,
      transition: "none",
      willChange: "transform",
    };
  } else if (!reducedMotion && transitionPhase === "exiting") {
    const exitX = transitionDirection === "next" ? "-104%" : "104%";
    const exitRot = transitionDirection === "next" ? "-6deg" : "6deg";
    cardStyle = {
      transform: `translate3d(${exitX}, 10px, 0) rotate(${exitRot})`,
      opacity: 0,
      transition:
        "transform 150ms cubic-bezier(0.32, 0.72, 0, 1), opacity 140ms ease-out",
      willChange: "transform, opacity",
    };
  } else if (!reducedMotion && transitionPhase === "entering-start") {
    const startX = transitionDirection === "next" ? "28px" : "-28px";
    cardStyle = {
      transform: `translate3d(${startX}, 4px, 0) scale(0.985)`,
      opacity: 0.25,
      transition: "none",
      willChange: "transform, opacity",
    };
  } else if (!reducedMotion && transitionPhase === "entering-active") {
    cardStyle = {
      transform: "translate3d(0, 0, 0) scale(1)",
      opacity: 1,
      transition:
        "transform 230ms cubic-bezier(0.22, 1, 0.36, 1), opacity 190ms ease-out",
    };
  } else if (!reducedMotion) {
    cardTransitionClass =
      "transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]";
  }

  const windowedDots = computeWindowedDots(currentIndex, totalCount, 7);
  const stackLift = dragTransform ? dragTransform.progress : 0;

  return (
    <div className={cn("space-y-4 pb-20 sm:pb-8", className)}>
      {totalCount > 0 && (
        <section
          role="region"
          aria-roledescription="carousel"
          aria-label="Garments ready to review"
          tabIndex={0}
          onKeyDown={handleKeyDown}
          className="mx-auto w-full max-w-3xl space-y-3.5 focus-visible:outline-2 focus-visible:outline-ring rounded-2xl"
        >
          {/* Top Deck Header & Horizontal Quick-Scroll Strip (shown when 2+ items) */}
          {totalCount > 1 && (
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    aria-live="polite"
                    aria-atomic="true"
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-xs font-semibold text-foreground shadow-2xs"
                  >
                    <span>
                      Piece {currentIndex + 1} of {totalCount}
                    </span>
                  </span>
                  <span className="hidden text-xs text-muted sm:inline">
                    Swipe left/right or tap a piece below
                  </span>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => navigateTo(currentIndex - 1, "prev")}
                    disabled={!hasPrev}
                    aria-label="Previous garment"
                    className="inline-flex size-10 sm:size-9 items-center justify-center rounded-full border border-border-strong bg-surface text-foreground transition-colors hover:bg-surface-muted disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <ChevronLeft className="size-4" aria-hidden />
                  </button>
                  <button
                    type="button"
                    onClick={() => navigateTo(currentIndex + 1, "next")}
                    disabled={!hasNext}
                    aria-label="Next garment"
                    className="inline-flex size-10 sm:size-9 items-center justify-center rounded-full border border-border-strong bg-surface text-foreground transition-colors hover:bg-surface-muted disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-ring"
                  >
                    <ChevronRight className="size-4" aria-hidden />
                  </button>
                </div>
              </div>

              {/* Horizontal Scrollable Thumbnail Selector */}
              <div
                className="flex items-center gap-2 overflow-x-auto pb-1 pt-0.5"
                role="tablist"
                aria-label="Jump to extracted garment"
              >
                {items.map((item, idx) => {
                  const selected = idx === currentIndex;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      role="tab"
                      aria-selected={selected}
                      onClick={() => navigateTo(idx)}
                      className={cn(
                        "inline-flex shrink-0 items-center gap-2 rounded-xl border px-2.5 py-1.5 text-left text-xs transition-all",
                        selected
                          ? "border-accent bg-accent-soft/45 text-foreground shadow-2xs ring-1 ring-accent/30"
                          : "border-border bg-surface text-muted hover:border-border-strong hover:text-foreground",
                      )}
                    >
                      <div className="relative size-8 shrink-0 overflow-hidden rounded-lg border border-border bg-white">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={item.previewUrl}
                          alt=""
                          className="size-full object-contain"
                        />
                        {item.busy && (
                          <span className="absolute inset-0 grid place-items-center bg-surface/70">
                            <Loader2 className="size-3.5 animate-spin text-accent" />
                          </span>
                        )}
                      </div>
                      <div className="max-w-32 truncate">
                        <span className="font-semibold">#{idx + 1}</span>{" "}
                        <span>{item.title}</span>
                      </div>
                      {item.hasError && (
                        <AlertCircle
                          className="size-3.5 shrink-0 text-danger"
                          aria-label="Needs attention"
                        />
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Tinder-Style Stacked Swipe Stage */}
          <div
            ref={stageRef}
            className={cn("relative", totalCount > 1 && "pb-3")}
          >
            {totalCount > 2 && (
              <div
                aria-hidden="true"
                style={
                  !reducedMotion && stackLift > 0
                    ? {
                        transform: `translateY(${10 - stackLift * 3}px) scale(${0.94 + stackLift * 0.02})`,
                      }
                    : undefined
                }
                className="pointer-events-none absolute inset-x-5 top-3 bottom-0 rounded-[1.25rem] border border-border/70 bg-surface-muted/65 transition-transform duration-200"
              />
            )}
            {totalCount > 1 && (
              <div
                aria-hidden="true"
                style={
                  !reducedMotion && stackLift > 0
                    ? {
                        transform: `translateY(${5 - stackLift * 4}px) scale(${0.97 + stackLift * 0.025})`,
                      }
                    : undefined
                }
                className="pointer-events-none absolute inset-x-2.5 top-1.5 bottom-1 rounded-[1.25rem] border border-border bg-surface/85 shadow-2xs transition-transform duration-200"
              />
            )}

            {/* Active Interactive Card Layer */}
            <div
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={(e) => finishPointerSession(e, false)}
              onPointerCancel={(e) => finishPointerSession(e, true)}
              style={{
                touchAction: "pan-y",
                ...cardStyle,
              }}
              className={cn(
                "relative z-10 select-none touch-pan-y",
                totalCount > 1 && "cursor-grab active:cursor-grabbing",
                cardTransitionClass,
              )}
            >
              {dragTransform?.directionHint && (
                <div
                  aria-hidden="true"
                  className={cn(
                    "pointer-events-none absolute top-4 z-20 inline-flex items-center gap-1.5 rounded-full border border-accent bg-surface/95 px-3 py-1.5 text-xs font-semibold text-accent shadow-md backdrop-blur-xs",
                    dragTransform.directionHint === "next" ? "right-4" : "left-4",
                  )}
                >
                  {dragTransform.directionHint === "prev" ? (
                    <>
                      <ArrowLeft className="size-3.5" />
                      <span>Previous Piece</span>
                    </>
                  ) : (
                    <>
                      <span>Next Piece</span>
                      <ArrowRight className="size-3.5" />
                    </>
                  )}
                </div>
              )}

              {/* Keep all unsaved forms mounted so Save All & OOTD bundling refs stay live */}
              {items.map((item, idx) => {
                const isActive = idx === currentIndex;
                return (
                  <div
                    key={item.id}
                    hidden={!isActive}
                    aria-hidden={!isActive || undefined}
                  >
                    {renderCard(item.id, isActive)}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Bottom Navigation Bar */}
          {totalCount > 1 && (
            <div className="flex items-center justify-between gap-3 pt-0.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!hasPrev}
                onClick={() => navigateTo(currentIndex - 1, "prev")}
                aria-label={`Previous piece (${currentIndex} of ${totalCount})`}
                className="min-h-11 rounded-full px-4 text-xs"
              >
                <ChevronLeft className="size-4" aria-hidden />
                <span>Previous</span>
              </Button>

              <div
                role="group"
                aria-label="Jump to piece"
                className="flex items-center justify-center gap-1.5"
              >
                {windowedDots.map((dotIndex) => {
                  const isCurrent = dotIndex === currentIndex;
                  return (
                    <button
                      key={dotIndex}
                      type="button"
                      onClick={() => navigateTo(dotIndex)}
                      aria-label={`Go to piece ${dotIndex + 1} of ${totalCount}`}
                      aria-current={isCurrent ? "true" : undefined}
                      className={cn(
                        "h-2.5 rounded-full transition-all focus-visible:outline-2 focus-visible:outline-ring",
                        isCurrent
                          ? "w-6 bg-accent"
                          : "w-2.5 bg-border-strong hover:bg-muted",
                      )}
                    />
                  );
                })}
              </div>

              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!hasNext}
                onClick={() => navigateTo(currentIndex + 1, "next")}
                aria-label={`Next piece (${currentIndex + 2} of ${totalCount})`}
                className="min-h-11 rounded-full px-4 text-xs"
              >
                <span>Next</span>
                <ChevronRight className="size-4" aria-hidden />
              </Button>
            </div>
          )}
        </section>
      )}

      {/* Compact Saved-in-Session Strip */}
      {savedItems.length > 0 && (
        <div
          aria-label="Saved in this session"
          className="mx-auto w-full max-w-3xl rounded-2xl border border-border bg-surface p-3.5 shadow-2xs space-y-2.5"
        >
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 font-semibold text-foreground">
              <CheckCircle2 className="size-4 text-success" aria-hidden />
              <span>
                Saved in this session ({savedItems.length})
              </span>
            </span>
            <Link
              href="/wardrobe"
              className="font-medium text-accent underline underline-offset-4"
            >
              Open wardrobe
            </Link>
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-1">
            {savedItems.map((saved) => (
              <div
                key={saved.id}
                className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-border bg-surface-muted/50 p-1.5 pr-3 text-xs"
              >
                <div className="size-9 shrink-0 overflow-hidden rounded-lg border border-border bg-white">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={saved.previewUrl}
                    alt={saved.title}
                    className="size-full object-contain"
                  />
                </div>
                <div className="min-w-0 max-w-36">
                  <p className="truncate font-semibold text-foreground">
                    {saved.title}
                  </p>
                  {saved.savedId ? (
                    <Link
                      href={`/wardrobe/${saved.savedId}`}
                      className="text-[11px] font-medium text-accent underline underline-offset-2"
                    >
                      View item
                    </Link>
                  ) : (
                    <span className="text-[11px] text-muted">Saved</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

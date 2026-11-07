"use client";

import * as React from "react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  ChevronLeft,
  ChevronRight,
  Loader2,
  RefreshCw,
  Sparkles,
} from "lucide-react";
import { OutfitBrowsingCard } from "@/components/outfits/outfit-browsing-card";
import { Button } from "@/components/ui/button";
import { Card, EmptyState } from "@/components/ui/card";
import {
  clampOutfitIndex,
  computeDragTransform,
  computeWindowedDots,
  createInitialDeckState,
  deckStateReducer,
  detectSwipeAxis,
  resolveKeyboardNavigation,
  resolveSwipeRelease,
  type NavigationDirection,
  type SwipeAxis,
  type SwipeableOutfitCardData,
} from "@/lib/outfits/swipe-deck-logic";
import { cn } from "@/lib/utils/cn";

export interface SwipeableOutfitDeckProps {
  outfits: SwipeableOutfitCardData[];
  /** Isolates deck index and expanded state when switching tabs or sections. */
  deckKey?: string;
  /** Optional controlled active index. */
  activeIndex?: number;
  /** Called whenever the active outfit index changes. */
  onActiveIndexChange?: (index: number) => void;
  /** Loading state while recommendations are being generated. */
  loading?: boolean;
  loadingLabel?: string;
  /** Error message when recommendation loading fails. */
  error?: string | null;
  onRetry?: () => void;
  /** Custom empty state or copy when outfits is empty. */
  emptyState?: React.ReactNode;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
  /** Compact card sizing for narrower containers such as Stylist Chat. */
  compact?: boolean;
  ariaLabel?: string;
  /** Optional extra controls rendered in the top toolbar (e.g. 3D / Flatlay mode toggle). */
  headerControlsSlot?: React.ReactNode;
  /** Optional custom preview stage for the active outfit. */
  renderCustomPreview?: (
    outfit: SwipeableOutfitCardData,
    index: number,
  ) => React.ReactNode;
  /** Optional save handler bound to the active outfit. */
  onSaveOutfit?: (outfit: SwipeableOutfitCardData, index: number) => void;
  saveLabel?: string;
  savedLabel?: string;
  /** Optional favourite handler bound to the active outfit. */
  onToggleFavourite?: (outfit: SwipeableOutfitCardData, index: number) => void;
  /** Optional extra controls in the default primary bar. */
  renderPrimaryActions?: (
    outfit: SwipeableOutfitCardData,
    index: number,
  ) => React.ReactNode;
  /** Optional actions rendered inside the expanded details section. */
  renderExpandedActions?: (
    outfit: SwipeableOutfitCardData,
    index: number,
  ) => React.ReactNode;
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

export function SwipeableOutfitDeck({
  outfits,
  deckKey = "default",
  activeIndex: controlledIndex,
  onActiveIndexChange,
  loading = false,
  loadingLabel = "Styling outfit recommendations…",
  error = null,
  onRetry,
  emptyState,
  emptyTitle = "No outfit recommendations yet",
  emptyDescription = "Generate or add outfits to browse them here.",
  emptyAction,
  compact = false,
  ariaLabel = "Outfit recommendations",
  headerControlsSlot,
  renderCustomPreview,
  onSaveOutfit,
  saveLabel,
  savedLabel,
  onToggleFavourite,
  renderPrimaryActions,
  renderExpandedActions,
  className,
}: SwipeableOutfitDeckProps) {
  const reducedMotion = usePrefersReducedMotion();
  const [state, dispatch] = React.useReducer(
    deckStateReducer,
    deckKey,
    createInitialDeckState,
  );

  const isControlled = typeof controlledIndex === "number";
  const totalCount = outfits.length;
  const currentIndex = clampOutfitIndex(
    isControlled ? controlledIndex : state.uncontrolledIndex,
    totalCount,
  );
  const activeOutfit = outfits[currentIndex] ?? null;

  // Keep deckKey isolated when switching between sections or tabs
  React.useEffect(() => {
    dispatch({ type: "SYNC_DECK_KEY", deckKey });
  }, [deckKey]);

  // Clamp index and clear stale expanded IDs when collection mutates
  React.useEffect(() => {
    const validIds = new Set(outfits.map((o) => o.id));
    dispatch({ type: "CLAMP_COUNT", totalCount, validOutfitIds: validIds });
    if (isControlled && totalCount > 0 && controlledIndex !== currentIndex) {
      onActiveIndexChange?.(currentIndex);
    }
  }, [outfits, totalCount, isControlled, controlledIndex, currentIndex, onActiveIndexChange]);

  // Collapse details whenever controlled activeIndex changes externally
  const prevControlledIndexRef = React.useRef(controlledIndex);
  React.useEffect(() => {
    if (prevControlledIndexRef.current !== controlledIndex) {
      prevControlledIndexRef.current = controlledIndex;
      dispatch({ type: "COLLAPSE_DETAILS" });
    }
  }, [controlledIndex]);

  // Gesture & transition state
  const stageRef = React.useRef<HTMLDivElement>(null);
  const pointerRef = React.useRef<PointerSession | null>(null);
  const exitTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const enterTimerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const rafRef = React.useRef<number | null>(null);

  const [dragVector, setDragVector] = React.useState<{ dx: number; dy: number } | null>(
    null,
  );
  const [transitionPhase, setTransitionPhase] = React.useState<
    "idle" | "exiting" | "entering-start" | "entering-active"
  >("idle");
  const [transitionDirection, setTransitionDirection] =
    React.useState<NavigationDirection>("next");

  const clearAnimationTimers = React.useCallback(() => {
    if (exitTimerRef.current !== null) {
      clearTimeout(exitTimerRef.current);
      exitTimerRef.current = null;
    }
    if (enterTimerRef.current !== null) {
      clearTimeout(enterTimerRef.current);
      enterTimerRef.current = null;
    }
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  React.useEffect(() => {
    return () => {
      clearAnimationTimers();
    };
  }, [clearAnimationTimers]);

  const commitIndexChange = React.useCallback(
    (nextIdx: number) => {
      const clamped = clampOutfitIndex(nextIdx, totalCount);
      dispatch({ type: "NAVIGATE", nextIndex: clamped, totalCount });
      onActiveIndexChange?.(clamped);
    },
    [totalCount, onActiveIndexChange],
  );

  const navigateTo = React.useCallback(
    (nextIdx: number, direction?: NavigationDirection) => {
      if (totalCount <= 1) return;
      const clamped = clampOutfitIndex(nextIdx, totalCount);
      if (clamped === currentIndex) return;

      const resolvedDir: NavigationDirection =
        direction ?? (clamped > currentIndex ? "next" : "prev");

      clearAnimationTimers();
      setDragVector(null);

      if (reducedMotion) {
        setTransitionPhase("idle");
        commitIndexChange(clamped);
        return;
      }

      setTransitionDirection(resolvedDir);
      setTransitionPhase("exiting");

      exitTimerRef.current = setTimeout(() => {
        commitIndexChange(clamped);
        setTransitionPhase("entering-start");

        rafRef.current = requestAnimationFrame(() => {
          rafRef.current = requestAnimationFrame(() => {
            setTransitionPhase("entering-active");
            enterTimerRef.current = setTimeout(() => {
              setTransitionPhase("idle");
            }, 240);
          });
        });
      }, 165);
    },
    [totalCount, currentIndex, clearAnimationTimers, reducedMotion, commitIndexChange],
  );

  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < totalCount - 1;

  // Pointer / Touch Drag Handlers
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (totalCount <= 1) return;
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (shouldIgnoreSwipeTarget(e.target)) return;

    clearAnimationTimers();
    if (transitionPhase !== "idle") {
      setTransitionPhase("idle");
    }

    pointerRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      startTime: Date.now(),
      axis: "pending",
      captured: false,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const session = pointerRef.current;
    if (!session || session.pointerId !== e.pointerId) return;

    const dx = e.clientX - session.startX;
    const dy = e.clientY - session.startY;

    if (session.axis === "pending") {
      const detected = detectSwipeAxis(dx, dy);
      if (detected === "pending") return;
      if (detected === "vertical") {
        // Release immediately so native vertical page/card scroll takes over
        pointerRef.current = null;
        setDragVector(null);
        return;
      }
      session.axis = "horizontal";
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
        session.captured = true;
      } catch {
        // Synthetic events or detached targets may not support pointer capture
      }
    }

    if (session.axis === "horizontal") {
      setDragVector({ dx, dy });
    }
  };

  const finishPointerSession = (
    e: React.PointerEvent<HTMLDivElement>,
    cancelled: boolean,
  ) => {
    const session = pointerRef.current;
    if (!session || session.pointerId !== e.pointerId) return;

    if (session.captured) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Ignore if already released
      }
    }
    pointerRef.current = null;

    if (cancelled || session.axis !== "horizontal") {
      setDragVector(null);
      return;
    }

    const dx = e.clientX - session.startX;
    const durationMs = Math.max(1, Date.now() - session.startTime);
    const width = stageRef.current?.clientWidth ?? 360;

    const decision = resolveSwipeRelease({
      dx,
      durationMs,
      containerWidth: width,
      currentIndex,
      totalCount,
    });

    setDragVector(null);
    if (decision.committed && decision.direction) {
      navigateTo(decision.nextIndex, decision.direction);
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

  // Loading State
  if (loading) {
    return (
      <Card
        role="status"
        aria-live="polite"
        aria-busy="true"
        className={cn(
          "flex flex-col items-center justify-center gap-3 border-border bg-surface py-14 text-center",
          className,
        )}
      >
        <Loader2 className="size-6 animate-spin text-accent" aria-hidden />
        <p className="text-sm font-medium text-foreground">{loadingLabel}</p>
      </Card>
    );
  }

  // Error State
  if (error) {
    return (
      <Card
        role="alert"
        className={cn(
          "flex flex-col items-center justify-center gap-3 border-danger/30 bg-danger-soft/50 p-6 text-center",
          className,
        )}
      >
        <AlertCircle className="size-6 text-danger" aria-hidden />
        <p className="text-sm font-medium text-danger">{error}</p>
        {onRetry && (
          <Button type="button" size="sm" variant="outline" onClick={onRetry}>
            <RefreshCw className="size-3.5" aria-hidden />
            <span>Try again</span>
          </Button>
        )}
      </Card>
    );
  }

  // Empty State
  if (totalCount === 0 || !activeOutfit) {
    if (emptyState) return <>{emptyState}</>;
    return (
      <EmptyState icon={Sparkles} title={emptyTitle} action={emptyAction}>
        {emptyDescription}
      </EmptyState>
    );
  }

  const isExpanded = state.expandedOutfitId === activeOutfit.id;
  const dragTransform = dragVector
    ? computeDragTransform({
        dx: dragVector.dx,
        dy: dragVector.dy,
        hasPrev,
        hasNext,
        reducedMotion,
      })
    : null;

  // Compute inline style & classes for smooth drag, spring release, exit, and enter
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
        "transform 165ms cubic-bezier(0.32, 0.72, 0, 1), opacity 155ms ease-out",
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
        "transform 240ms cubic-bezier(0.22, 1, 0.36, 1), opacity 200ms ease-out",
    };
  } else if (!reducedMotion) {
    cardTransitionClass =
      "transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]";
  }

  const windowedDots = computeWindowedDots(currentIndex, totalCount, compact ? 5 : 7);
  const stackLift = dragTransform ? dragTransform.progress : 0;

  return (
    <section
      role="region"
      aria-roledescription="carousel"
      aria-label={ariaLabel}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className={cn(
        "mx-auto w-full space-y-3.5 focus-visible:outline-2 focus-visible:outline-ring rounded-2xl",
        compact ? "max-w-lg" : "max-w-3xl",
        className,
      )}
    >
      {/* Top Deck Bar: Position Indicator + Optional View Controls + Prev/Next */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2">
          <span
            aria-live="polite"
            aria-atomic="true"
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-xs font-semibold text-foreground shadow-2xs"
          >
            <span>
              {currentIndex + 1} of {totalCount}
            </span>
          </span>

          {totalCount > 1 && !compact && (
            <span className="hidden text-xs text-muted sm:inline">
              Swipe card or use arrows
            </span>
          )}
        </div>

        {headerControlsSlot && (
          <div className="flex flex-wrap items-center gap-2">
            {headerControlsSlot}
          </div>
        )}

        {totalCount > 1 && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => navigateTo(currentIndex - 1, "prev")}
              disabled={!hasPrev}
              aria-label="Previous outfit"
              className="inline-flex size-10 sm:size-9 items-center justify-center rounded-full border border-border-strong bg-surface text-foreground transition-colors hover:bg-surface-muted disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-ring"
            >
              <ChevronLeft className="size-4" aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => navigateTo(currentIndex + 1, "next")}
              disabled={!hasNext}
              aria-label="Next outfit"
              className="inline-flex size-10 sm:size-9 items-center justify-center rounded-full border border-border-strong bg-surface text-foreground transition-colors hover:bg-surface-muted disabled:pointer-events-none disabled:opacity-40 focus-visible:outline-2 focus-visible:outline-ring"
            >
              <ChevronRight className="size-4" aria-hidden />
            </button>
          </div>
        )}
      </div>

      {/* Stacked Swipe Stage (Renders ONLY the single active card in DOM) */}
      <div
        ref={stageRef}
        className={cn("relative", totalCount > 1 && "pb-3")}
      >
        {/* Decorative Background Stack Silhouettes for Multi-Outfit Collections */}
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

        {/* Active Interactive Swipe Layer */}
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
          {/* Accessible Non-Colour Drag Direction Cue */}
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
                  <span>Previous Look</span>
                </>
              ) : (
                <>
                  <span>Next Look</span>
                  <ArrowRight className="size-3.5" />
                </>
              )}
            </div>
          )}

          <OutfitBrowsingCard
            key={activeOutfit.id}
            outfit={activeOutfit}
            isExpanded={isExpanded}
            onToggleExpand={() =>
              dispatch({ type: "TOGGLE_DETAILS", outfitId: activeOutfit.id })
            }
            reducedMotion={reducedMotion}
            compact={compact}
            customPreview={renderCustomPreview?.(activeOutfit, currentIndex)}
            onSave={
              onSaveOutfit
                ? () => onSaveOutfit(activeOutfit, currentIndex)
                : undefined
            }
            saveLabel={saveLabel}
            savedLabel={savedLabel}
            onToggleFavourite={
              onToggleFavourite
                ? () => onToggleFavourite(activeOutfit, currentIndex)
                : undefined
            }
            primaryActionsSlot={renderPrimaryActions?.(activeOutfit, currentIndex)}
            expandedActionsSlot={renderExpandedActions?.(
              activeOutfit,
              currentIndex,
            )}
          />
        </div>
      </div>

      {/* Bottom Mobile-First Navigation Controls & Windowed Pagination Dots */}
      {totalCount > 1 && (
        <div className="flex items-center justify-between gap-3 pt-0.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!hasPrev}
            onClick={() => navigateTo(currentIndex - 1, "prev")}
            aria-label={`Previous outfit (${currentIndex} of ${totalCount})`}
            className="min-h-11 rounded-full px-4 text-xs"
          >
            <ChevronLeft className="size-4" aria-hidden />
            <span>Previous</span>
          </Button>

          <div
            role="group"
            aria-label="Jump to outfit"
            className="flex items-center justify-center gap-1.5"
          >
            {windowedDots[0] > 0 && (
              <span className="text-[11px] text-muted" aria-hidden>
                …
              </span>
            )}
            {windowedDots.map((dotIdx) => {
              const isCurrent = dotIdx === currentIndex;
              return (
                <button
                  key={dotIdx}
                  type="button"
                  onClick={() => navigateTo(dotIdx)}
                  aria-label={`Go to outfit ${dotIdx + 1} of ${totalCount}`}
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
            {windowedDots[windowedDots.length - 1] < totalCount - 1 && (
              <span className="text-[11px] text-muted" aria-hidden>
                …
              </span>
            )}
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={!hasNext}
            onClick={() => navigateTo(currentIndex + 1, "next")}
            aria-label={`Next outfit (${currentIndex + 2} of ${totalCount})`}
            className="min-h-11 rounded-full px-4 text-xs"
          >
            <span>Next</span>
            <ChevronRight className="size-4" aria-hidden />
          </Button>
        </div>
      )}
    </section>
  );
}

"use client";

import { useEffect, useState } from "react";

export interface VisualViewportState {
  /** The visible height in pixels, or null during SSR or before client hydration */
  height: number | null;
  /** Vertical offset of the visual viewport relative to the layout viewport */
  offsetTop: number;
  /** True when the virtual on-screen keyboard is open */
  isKeyboardOpen: boolean;
}

export interface WindowMetrics {
  innerWidth: number;
  innerHeight: number;
}

export interface ViewportMetrics {
  height: number;
  offsetTop: number;
}

/**
 * Pure calculation function for determining visual viewport state.
 * Separated for testability and deterministic assertions.
 */
export function calculateVisualViewport(
  vv: ViewportMetrics,
  win: WindowMetrics,
): VisualViewportState {
  // Desktop breakpoint (>= 1024px, matching Tailwind `lg:`).
  // On desktop, physical keyboards are used and the layout is not fixed to mobile viewport.
  if (win.innerWidth >= 1024) {
    return {
      height: null,
      offsetTop: 0,
      isKeyboardOpen: false,
    };
  }

  const currentHeight = vv.height;
  const currentOffsetTop = vv.offsetTop;

  // Virtual keyboards on iOS and Android are at least ~140-150px tall.
  // If the visible height is significantly less than window.innerHeight,
  // the virtual keyboard is open.
  const keyboardOpen = win.innerHeight - currentHeight > 100;

  return {
    height: Math.round(currentHeight),
    offsetTop: Math.max(0, Math.round(currentOffsetTop)),
    isKeyboardOpen: keyboardOpen,
  };
}

/**
 * Hook that tracks window.visualViewport on mobile devices (e.g. iOS Safari and Android Chrome).
 *
 * On iOS Safari, the layout viewport (and CSS dvh / 100vh) does NOT resize when the virtual
 * keyboard slides open. Only `window.visualViewport` shrinks.
 *
 * This hook exposes the exact visible height and vertical offset so fixed containers
 * (such as chat threads) can remain strictly docked above the software keyboard without
 * getting covered.
 */
export function useVisualViewport(): VisualViewportState {
  const [state, setState] = useState<VisualViewportState>({
    height: null,
    offsetTop: 0,
    isKeyboardOpen: false,
  });

  useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) {
      return;
    }

    const vv = window.visualViewport;

    const update = () => {
      const nextState = calculateVisualViewport(
        { height: vv.height, offsetTop: vv.offsetTop },
        { innerWidth: window.innerWidth, innerHeight: window.innerHeight },
      );
      setState(nextState);
    };

    update();

    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
    window.addEventListener("orientationchange", update);

    return () => {
      vv.removeEventListener("resize", update);
      vv.removeEventListener("scroll", update);
      window.removeEventListener("orientationchange", update);
    };
  }, []);

  return state;
}

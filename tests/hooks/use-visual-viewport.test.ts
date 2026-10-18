import { describe, expect, it } from "vitest";
import { calculateVisualViewport } from "@/lib/hooks/use-visual-viewport";

describe("calculateVisualViewport", () => {
  it("returns null height on desktop screens (innerWidth >= 1024px)", () => {
    const state = calculateVisualViewport(
      { height: 900, offsetTop: 0 },
      { innerWidth: 1200, innerHeight: 900 },
    );

    expect(state).toEqual({
      height: null,
      offsetTop: 0,
      isKeyboardOpen: false,
    });
  });

  it("handles mobile viewport with keyboard closed", () => {
    const state = calculateVisualViewport(
      { height: 844, offsetTop: 0 },
      { innerWidth: 390, innerHeight: 844 },
    );

    expect(state).toEqual({
      height: 844,
      offsetTop: 0,
      isKeyboardOpen: false,
    });
  });

  it("detects virtual keyboard open on mobile when visible height drops", () => {
    // iPhone 14/15/16: 844px height, keyboard occupies ~320px -> visible height is 524px
    const state = calculateVisualViewport(
      { height: 524, offsetTop: 0 },
      { innerWidth: 390, innerHeight: 844 },
    );

    expect(state).toEqual({
      height: 524,
      offsetTop: 0,
      isKeyboardOpen: true,
    });
  });

  it("handles visual viewport offset when panned by iOS Safari", () => {
    const state = calculateVisualViewport(
      { height: 510, offsetTop: 34.6 },
      { innerWidth: 390, innerHeight: 844 },
    );

    expect(state.height).toBe(510);
    expect(state.offsetTop).toBe(35);
    expect(state.isKeyboardOpen).toBe(true);
  });

  it("supports tablet in portrait (< 1024px) with keyboard open", () => {
    // iPad mini / 10.2" in portrait: 768px or 820px width
    const state = calculateVisualViewport(
      { height: 750, offsetTop: 0 },
      { innerWidth: 820, innerHeight: 1180 },
    );

    expect(state.height).toBe(750);
    expect(state.isKeyboardOpen).toBe(true);
  });
});

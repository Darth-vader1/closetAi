import { describe, expect, it } from "vitest";
import { safeRedirectPath } from "@/lib/security/redirect";

describe("safeRedirectPath", () => {
  it("allows normal local paths, including query strings", () => {
    expect(safeRedirectPath("/wardrobe")).toBe("/wardrobe");
    expect(safeRedirectPath("/laundry?tab=dirty")).toBe("/laundry?tab=dirty");
  });

  it("falls back for empty input", () => {
    expect(safeRedirectPath(null)).toBe("/dashboard");
    expect(safeRedirectPath(undefined)).toBe("/dashboard");
    expect(safeRedirectPath("")).toBe("/dashboard");
  });

  it.each([
    "https://evil.example",
    "http://evil.example/path",
    "//evil.example",
    "/\\evil.example",
    "javascript:alert(1)",
    "wardrobe",
    "/ok\nHeader: injected",
  ])("rejects unsafe target %j", (target) => {
    expect(safeRedirectPath(target)).toBe("/dashboard");
  });

  it("uses the supplied fallback", () => {
    expect(safeRedirectPath("//x.com", "/onboarding")).toBe("/onboarding");
  });
});

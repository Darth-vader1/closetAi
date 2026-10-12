import { describe, expect, it } from "vitest";
import { isValidTimeZone } from "@/lib/scheduling/timezone";
import { onboardingSchema } from "@/lib/validation/onboarding";

const valid = {
  displayName: "  Gbolahan ",
  preferredStyles: ["smart_casual" as const],
  favouriteColours: ["black" as const, "navy" as const],
  commonOccasions: ["school", "work"],
  location: "Lagos",
  timezone: "Africa/Lagos",
  dailyEnabled: false,
  dailyTime: "07:00",
  weeklyEnabled: false,
  weeklyDay: 0,
  weeklyTime: "18:00",
};

describe("isValidTimeZone", () => {
  it("accepts real IANA zones", () => {
    expect(isValidTimeZone("Africa/Lagos")).toBe(true);
    expect(isValidTimeZone("America/New_York")).toBe(true);
    expect(isValidTimeZone("UTC")).toBe(true);
  });

  it("rejects junk", () => {
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
    expect(isValidTimeZone("")).toBe(false);
    expect(isValidTimeZone(42)).toBe(false);
    expect(isValidTimeZone("x".repeat(100))).toBe(false);
  });
});

describe("onboardingSchema", () => {
  it("accepts a valid submission and trims the name", () => {
    const parsed = onboardingSchema.parse(valid);
    expect(parsed.displayName).toBe("Gbolahan");
    expect(parsed.location).toBe("Lagos");
  });

  it("allows nonessential fields to be empty", () => {
    const parsed = onboardingSchema.parse({ ...valid, preferredStyles: [], favouriteColours: [], commonOccasions: [], location: "" });
    expect(parsed.location).toBeNull();
    expect(parsed.preferredStyles).toEqual([]);
  });

  it.each([
    ["bad timezone", { timezone: "Nowhere/City" }],
    ["bad time of day", { dailyTime: "25:00" }],
    ["bad weekday", { weeklyDay: 7 }],
    ["unknown style", { preferredStyles: ["gothic" as any] }],
    ["unknown colour", { favouriteColours: ["ultraviolet" as any] }],
    ["unknown occasion", { commonOccasions: ["heist"] }],
    ["empty name", { displayName: "   " }],
  ])("rejects %s", (_label, override) => {
    expect(onboardingSchema.safeParse({ ...valid, ...override }).success).toBe(false);
  });

  it("keeps email opt-ins exactly as submitted (never defaulted on)", () => {
    const parsed = onboardingSchema.parse(valid);
    expect(parsed.dailyEnabled).toBe(false);
    expect(parsed.weeklyEnabled).toBe(false);
  });
});

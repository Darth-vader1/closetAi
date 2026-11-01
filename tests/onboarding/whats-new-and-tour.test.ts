import { describe, expect, it } from "vitest";
import { TOUR_STEPS } from "@/components/onboarding/product-tour";
import { GUIDE_CONFIGS, type ContextualGuideSection } from "@/components/onboarding/contextual-guide";
import {
  WHATS_NEW_FEATURES,
  WHATS_NEW_VERSION,
  getProductTourStorageKey,
  getWhatsNewStorageKey,
} from "@/components/onboarding/whats-new-modal";

describe("Onboarding Tour, Contextual Guides & What's New Feature Showcase", () => {
  it("highlights all core and newly added navigation items in ProductTour", () => {
    const stepIds = TOUR_STEPS.map((s) => s.id);
    expect(stepIds).toEqual([
      "welcome",
      "dashboard",
      "wardrobe",
      "studio",
      "connect",
      "stylist",
      "packing",
      "calendar",
      "laundry",
      "finish",
    ]);

    const connectStep = TOUR_STEPS.find((s) => s.id === "connect");
    expect(connectStep?.targetSelector).toBe('[data-tour="nav-/connect"]');
    expect(connectStep?.mobileSelector).toBe('[data-tour-mobile="nav-/connect"]');
  });

  it("provides 3-step contextual guides for all 9 feature sections including connect and flatlay", () => {
    const expectedSections: ContextualGuideSection[] = [
      "wardrobe",
      "studio",
      "flatlay",
      "connect",
      "stylist",
      "packing",
      "calendar",
      "laundry",
      "settings",
    ];

    for (const section of expectedSections) {
      const cfg = GUIDE_CONFIGS[section];
      expect(cfg).toBeDefined();
      expect(cfg.steps).toHaveLength(3);
    }
  });

  it("includes all flagship features with valid app routes in WhatsNewModal", () => {
    expect(WHATS_NEW_FEATURES.length).toBeGreaterThanOrEqual(6);
    const featureIds = WHATS_NEW_FEATURES.map((f) => f.id);
    expect(featureIds).toContain("stylist-chat");
    expect(featureIds).toContain("flatlay-studio");
    expect(featureIds).toContain("inclusive-styling");
    expect(featureIds).toContain("beautify-import");
    expect(featureIds).toContain("connect-sharing");
    expect(featureIds).toContain("packing-whatsapp");

    for (const f of WHATS_NEW_FEATURES) {
      expect(f.href.startsWith("/")).toBe(true);
      expect(f.title.length).toBeGreaterThan(3);
      expect(f.description.length).toBeGreaterThan(20);
    }
  });

  it("scopes What's New storage key by release version and userId", () => {
    const key = getWhatsNewStorageKey("user-123");
    expect(key).toContain(WHATS_NEW_VERSION);
    expect(key).toContain("user-123");
    expect(getProductTourStorageKey("user-123")).toBe("closetai_product_tour_seen_user-123");
  });
});

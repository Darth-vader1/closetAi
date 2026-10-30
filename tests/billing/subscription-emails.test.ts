import { describe, it, expect } from "vitest";
import {
  renderPremiumWelcomeHtml,
  renderOnboardingWelcomeHtml,
} from "@/lib/email/templates";

describe("ClosetAI Welcome and Premium Email Templates", () => {
  describe("renderPremiumWelcomeHtml", () => {
    it("renders VIP receipt and unlocked features properly", () => {
      const html = renderPremiumWelcomeHtml({
        displayName: "Gbemisola",
        planId: "monthly",
        amountFormatted: "₦999",
        reference: "paystack_ref_12345",
        provider: "paystack",
        expiresAt: "2026-11-30T22:00:00.000Z",
      });

      expect(html).toContain("Welcome to Premium, Gbemisola");
      expect(html).toContain("CLOSET·AI VIP ATELIER ACTIVATED");
      expect(html).toContain("₦999");
      expect(html).toContain("paystack_ref_12345");
      expect(html).toContain("PAYSTACK");
      expect(html).toContain("Unlimited Wardrobe Cataloguing");
      expect(html).toContain("100 AI Outfits per Month");
      expect(html).toContain("30 Studio Beautifications / Month");
      expect(html).toContain("Priority AI Stylist Chat");
      expect(html).toContain("/dashboard?upgraded=true");
      expect(html).toContain("/settings/subscription");
    });

    it("escapes user input and handles missing displayName safely", () => {
      const html = renderPremiumWelcomeHtml({
        displayName: "<script>alert('xss')</script>",
        planId: "annual",
        amountFormatted: "$49.99",
        reference: "ch_stripe_9999",
        provider: "stripe",
      });

      expect(html).not.toContain("<script>");
      expect(html).toContain("&lt;script&gt;");
      expect(html).toContain("Annual · 17% Saved");
      expect(html).toContain("$49.99");
    });
  });

  describe("renderOnboardingWelcomeHtml", () => {
    it("renders the 3-step quickstart guide with preferred styles", () => {
      const html = renderOnboardingWelcomeHtml({
        displayName: "Gbemisola",
        preferredStyles: ["Minimalist", "Smart casual", "Formal"],
      });

      expect(html).toContain("Your Closet is Ready, Gbemisola");
      expect(html).toContain("Minimalist, Smart casual, Formal");
      expect(html).toContain("Snap your first 5 essential garments");
      expect(html).toContain("Let AI organize and beautify");
      expect(html).toContain("Ask your Stylist for tomorrow&apos;s look");
      expect(html).toContain("/wardrobe/new");
      expect(html).toContain("/stylist");
    });

    it("handles missing displayName and styles gracefully", () => {
      const html = renderOnboardingWelcomeHtml({});

      expect(html).toContain("Your Closet is Ready");
      expect(html).toContain("/wardrobe/new");
    });
  });
});

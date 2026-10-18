import { describe, expect, it } from "vitest";
import {
  extractShareTargetUrl,
  generateBookmarkletCode,
  parseBookmarkletPayload,
} from "@/lib/import/bookmarklet";

describe("Universal Product Import — Phase 2: Web Share Target & Bookmarklet", () => {
  describe("extractShareTargetUrl", () => {
    it("extracts and normalizes valid direct url param", () => {
      const url = extractShareTargetUrl({
        url: "https://www.zara.com/uk/en/linen-blend-shirt-p07545300.html?utm_source=app&utm_medium=share",
      });
      expect(url).toBe("https://www.zara.com/uk/en/linen-blend-shirt-p07545300.html");
    });

    it("extracts URL embedded inside shared text string", () => {
      const url = extractShareTargetUrl({
        text: "I thought you might like this item from ASOS! https://www.asos.com/prd/12345?ctaref=product_share check it out",
      });
      expect(url).toBe("https://www.asos.com/prd/12345");
    });

    it("prefers direct url param over embedded text if both exist", () => {
      const url = extractShareTargetUrl({
        url: "https://www.uniqlo.com/product/1",
        text: "Other link: https://www.other.com/2",
      });
      expect(url).toBe("https://www.uniqlo.com/product/1");
    });

    it("falls back to title if url and text lack valid links", () => {
      const url = extractShareTargetUrl({
        title: "Check https://shop.mango.com/item/123 for details",
      });
      expect(url).toBe("https://shop.mango.com/item/123");
    });

    it("returns null when no valid http/https URLs are present", () => {
      expect(extractShareTargetUrl({})).toBeNull();
      expect(extractShareTargetUrl({ text: "Just a plain message with no links" })).toBeNull();
      expect(extractShareTargetUrl({ url: "ftp://files.example.com/item.zip" })).toBeNull();
    });
  });

  describe("parseBookmarkletPayload", () => {
    it("parses valid JSON object and populates ExtractedProductMetadata", () => {
      const payload = {
        v: 1,
        url: "https://www.arket.com/en_gbp/men/shirts/product.relaxed-linen-shirt.1054778001.html?utm_campaign=winter",
        title: "Relaxed Linen Shirt",
        brand: "ARKET",
        description: "Woven from pure organic linen with a soft feel.",
        color: "Light Blue",
        material: "100% Linen",
        category: "Shirts",
        images: [
          "https://cdn.arket.com/images/1/shirt-flat.jpg",
          "https://cdn.arket.com/images/2/shirt-model.jpg",
        ],
        extractedAt: Date.now(),
      };

      const result = parseBookmarkletPayload(payload);
      expect(result).not.toBeNull();
      expect(result?.title).toBe("Relaxed Linen Shirt");
      expect(result?.brand).toBe("ARKET");
      expect(result?.color).toBe("Light Blue");
      expect(result?.normalizedUrl).toBe(
        "https://www.arket.com/en_gbp/men/shirts/product.relaxed-linen-shirt.1054778001.html",
      );
      expect(result?.images).toHaveLength(2);
      expect(result?.images[0].kind).toBe("garment-only");
      expect(result?.images[1].kind).toBe("model");
      expect(result?.recommendedImageIndex).toBe(0);
      expect(result?.extractionSource).toBe("microdata");
    });

    it("parses URI-encoded JSON string payload", () => {
      const payloadObj = {
        v: 1,
        url: "https://www.zara.com/item/1",
        title: "Trench Coat",
        images: ["https://cdn.zara.com/img1.jpg"],
      };
      const encoded = encodeURIComponent(JSON.stringify(payloadObj));
      const result = parseBookmarkletPayload(encoded);
      expect(result).not.toBeNull();
      expect(result?.title).toBe("Trench Coat");
      expect(result?.normalizedUrl).toBe("https://www.zara.com/item/1");
    });

    it("sanitizes HTML tags and control characters from text fields", () => {
      const payload = {
        v: 1,
        url: "https://example.com/product",
        title: "<script>alert(1)</script>Silk Scarf",
        brand: "<b>Gucci</b>",
        description: "Great scarf\x00\x1F!",
      };
      const result = parseBookmarkletPayload(payload);
      expect(result?.title).toBe("Silk Scarf");
      expect(result?.brand).toBe("Gucci");
      expect(result?.description).toBe("Great scarf!");
    });

    it("filters out invalid or non-http image schemes and deduplicates", () => {
      const payload = {
        v: 1,
        url: "https://example.com/product",
        images: [
          "javascript:alert(1)",
          "data:image/png;base64,abc",
          "https://example.com/img1.jpg",
          "https://example.com/img1.jpg", // duplicate
          "relative/path.jpg",
          "https://example.com/img2.jpg",
        ],
      };
      const result = parseBookmarkletPayload(payload);
      expect(result?.images).toHaveLength(2);
      expect(result?.images.map((i) => i.url)).toEqual([
        "https://example.com/img1.jpg",
        "https://example.com/img2.jpg",
      ]);
    });

    it("rejects invalid versions or missing URL", () => {
      expect(parseBookmarkletPayload({ v: 2, url: "https://example.com" })).toBeNull();
      expect(parseBookmarkletPayload({ v: 1, url: "" })).toBeNull();
      expect(parseBookmarkletPayload("invalid json")).toBeNull();
      expect(parseBookmarkletPayload(null)).toBeNull();
    });
  });

  describe("generateBookmarkletCode", () => {
    it("generates executable bookmarklet code with the specified app origin", () => {
      const code = generateBookmarkletCode("https://closetai.app");
      expect(code.startsWith("javascript:")).toBe(true);
      expect(code).toContain("https://closetai.app/wardrobe/new?import_payload=");
      expect(code).toContain("application/ld+json");
      expect(code).toContain("og:image");
    });

    it("handles trailing slashes on app origin", () => {
      const code = generateBookmarkletCode("https://closetai.app///");
      expect(code).toContain("https://closetai.app/wardrobe/new?import_payload=");
    });

    it("falls back to location.origin if no origin provided", () => {
      const code = generateBookmarkletCode();
      expect(code).toContain("loc.origin");
    });
  });
});

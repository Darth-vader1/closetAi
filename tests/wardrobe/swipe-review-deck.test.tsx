import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SwipeReviewDeck } from "@/components/wardrobe/swipe-review-deck";
import { runGarmentEnhancementService } from "@/lib/wardrobe/enhancement-service";

describe("SwipeReviewDeck & OOTD Extraction Resilience", () => {
  it("renders active piece visible while keeping inactive pieces mounted with hidden attribute for react-hook-form refs", () => {
    const items = [
      { id: "p-1", title: "Charcoal Wool Jacket", previewUrl: "blob:jacket" },
      { id: "p-2", title: "Plaid Wool Scarf", previewUrl: "blob:scarf" },
      { id: "p-3", title: "Striped Silk Tie", previewUrl: "blob:tie" },
      { id: "p-4", title: "White Leather Belt", previewUrl: "blob:belt" },
    ];

    const html = renderToStaticMarkup(
      <SwipeReviewDeck
        items={items}
        activeIndex={1}
        onActiveIndexChange={() => {}}
        savedItems={[
          {
            id: "saved-1",
            title: "Oxford Dress Shirt",
            previewUrl: "blob:shirt",
            savedId: "uuid-shirt",
          },
        ]}
        renderCard={(id, isActive) => (
          <div data-card={id} data-active={isActive ? "yes" : "no"}>
            Card {id}
          </div>
        )}
      />,
    );

    expect(html).toContain("Piece 2 of 4");
    expect(html).toContain('aria-label="Previous garment"');
    expect(html).toContain('aria-label="Next garment"');
    expect(html).toContain('role="tablist"');
    expect(html).toContain("Charcoal Wool Jacket");
    expect(html).toContain("Plaid Wool Scarf");
    expect(html).toContain("White Leather Belt");
    // All 4 cards remain mounted in markup so Save All & OOTD bundling refs stay live
    expect(html).toContain('data-card="p-1"');
    expect(html).toContain('data-card="p-2"');
    expect(html).toContain('data-card="p-3"');
    expect(html).toContain('data-card="p-4"');
    expect(html).toContain('data-card="p-2" data-active="yes"');
    expect(html).toContain('data-card="p-1" data-active="no"');
    // Saved tray renders below the deck
    expect(html).toContain("Saved in this session (1)");
    expect(html).toContain("Oxford Dress Shirt");
    expect(html).toContain('href="/wardrobe/uuid-shirt"');
  });

  it("omits multi-card deck header and navigation controls when only 1 piece is queued", () => {
    const single = [{ id: "only-1", title: "Solo Linen Shirt", previewUrl: "blob:solo" }];
    const html = renderToStaticMarkup(
      <SwipeReviewDeck
        items={single}
        activeIndex={0}
        onActiveIndexChange={() => {}}
        renderCard={(id) => <div>Single {id}</div>}
      />,
    );

    expect(html).toContain("Single only-1");
    expect(html).not.toContain("Piece 1 of 1");
    expect(html).not.toContain('aria-label="Previous garment"');
    expect(html).not.toContain('aria-label="Next garment"');
  });

  it("short-circuits runGarmentEnhancementService immediately without cascading to cloud segmentation when signal is aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    const result = await runGarmentEnhancementService({
      bytes: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]),
      mimeType: "image/jpeg",
      extension: "jpg",
      mode: "catalog-flatlay",
      category: "outerwear",
      signal: controller.signal,
    });

    expect(result.status).toBe("fallback");
    expect(result.provider).toBe("local-studio");
    expect(result.cutoutDataUrl).toBeNull();
  });
});

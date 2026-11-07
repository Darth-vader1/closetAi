import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OutfitBrowsingCard } from "@/components/outfits/outfit-browsing-card";
import { SwipeableOutfitDeck } from "@/components/outfits/swipeable-outfit-deck";
import {
  adaptChatProposedOutfit,
  adaptPackingOutfit,
  adaptSavedOutfit,
  adaptStudioSuggestion,
  adaptStylistOutfit,
  BOUNDARY_RESISTANCE,
  clampOutfitIndex,
  cleanList,
  cleanText,
  computeDragTransform,
  computeWindowedDots,
  createInitialDeckState,
  deckStateReducer,
  detectSwipeAxis,
  MAX_CARD_ROTATION_DEG,
  resolveKeyboardNavigation,
  resolveSwipeRelease,
  type SwipeableOutfitCardData,
} from "@/lib/outfits/swipe-deck-logic";
import type { OutfitSuggestion } from "@/lib/outfits/engine";
import type { OutfitWithItems } from "@/lib/outfits/queries";
import type { PackingItem, PlanOutfit } from "@/lib/packing/schemas";
import type { WardrobeItem } from "@/lib/wardrobe/queries";

function makeWardrobeItem(overrides: Partial<WardrobeItem> = {}): WardrobeItem {
  return {
    id: overrides.id ?? "item-1",
    name: overrides.name ?? "Linen Overshirt",
    category: overrides.category ?? "shirts",
    subcategory: overrides.subcategory ?? "overshirt",
    primaryColour: overrides.primaryColour === undefined ? "Beige" : overrides.primaryColour,
    secondaryColours: overrides.secondaryColours ?? ["White"],
    pattern: overrides.pattern ?? "solid",
    material: overrides.material === undefined ? "Linen" : overrides.material,
    style: overrides.style === undefined ? "Chic" : overrides.style,
    occasions: overrides.occasions ?? ["everyday", "work"],
    seasons: overrides.seasons ?? ["summer"],
    warmthLevel: overrides.warmthLevel ?? 2,
    imagePath: overrides.imagePath ?? "user/shirt.jpg",
    status: overrides.status ?? "CLEAN",
    careType: overrides.careType ?? "WASHABLE",
    isFavourite: overrides.isFavourite ?? false,
    aiAnalysed: overrides.aiAnalysed ?? true,
    wearCount: overrides.wearCount ?? 3,
    lastWornAt: overrides.lastWornAt ?? null,
    lastWashedAt: overrides.lastWashedAt ?? null,
    createdAt: overrides.createdAt ?? "2026-10-01T10:00:00Z",
  };
}

function makeCardData(overrides: Partial<SwipeableOutfitCardData> = {}): SwipeableOutfitCardData {
  return {
    id: overrides.id ?? "outfit-1",
    title: overrides.title ?? "Elevated Weekend Linen",
    shortDescription:
      overrides.shortDescription === undefined
        ? "Relaxed warm-weather layering with crisp tailoring."
        : overrides.shortDescription,
    occasion: overrides.occasion === undefined ? "Smart Casual" : overrides.occasion,
    aestheticBadge: overrides.aestheticBadge === undefined ? "Look 1" : overrides.aestheticBadge,
    styleTags: overrides.styleTags ?? ["Chic", "Minimalist"],
    items: overrides.items ?? [
      {
        id: "g-1",
        name: "Beige Linen Overshirt",
        category: "shirts",
        imageUrl: "https://example.com/shirt.jpg",
        primaryColour: "Beige",
        secondaryColours: ["Cream"],
        material: "Linen",
        style: "Chic",
      },
      {
        id: "g-2",
        name: "Tailored Navy Chinos",
        category: "trousers",
        imageUrl: "https://example.com/chinos.jpg",
        primaryColour: "Navy",
        material: "Cotton",
        style: "Minimalist",
      },
      {
        id: "g-3",
        name: "Suede Penny Loafers",
        category: "shoes",
        imageUrl: "https://example.com/loafers.jpg",
        primaryColour: "Brown",
      },
    ],
    explanation:
      overrides.explanation === undefined
        ? "Neutral beige balances deep navy while suede loafers anchor the silhouette."
        : overrides.explanation,
    stylingTip:
      overrides.stylingTip === undefined
        ? "Roll the cuffs once to keep proportions effortless."
        : overrides.stylingTip,
    missingPieces: overrides.missingPieces ?? [],
    isSaved: overrides.isSaved ?? false,
    isSaving: overrides.isSaving ?? false,
    isFavourite: overrides.isFavourite ?? false,
    photoUrl: overrides.photoUrl ?? null,
  };
}

describe("SwipeableOutfitDeck & OutfitBrowsingCard — Phase 9 Test Suite", () => {
  // 1. Swiping through multiple outfits
  describe("1. Swiping through multiple outfits", () => {
    it("commits LEFT swipe to advance to next outfit and RIGHT swipe to return to previous outfit", () => {
      const nextByDistance = resolveSwipeRelease({
        dx: -110,
        durationMs: 320,
        containerWidth: 400,
        currentIndex: 0,
        totalCount: 4,
      });
      expect(nextByDistance).toEqual({
        committed: true,
        nextIndex: 1,
        direction: "next",
      });

      const nextByFastFlick = resolveSwipeRelease({
        dx: -42,
        durationMs: 60,
        containerWidth: 400,
        currentIndex: 1,
        totalCount: 4,
      });
      expect(nextByFastFlick).toEqual({
        committed: true,
        nextIndex: 2,
        direction: "next",
      });

      const prevByDistance = resolveSwipeRelease({
        dx: 105,
        durationMs: 300,
        containerWidth: 400,
        currentIndex: 2,
        totalCount: 4,
      });
      expect(prevByDistance).toEqual({
        committed: true,
        nextIndex: 1,
        direction: "prev",
      });
    });

    it("snaps back without changing index on short slow drags or at deck boundaries", () => {
      const shortSlowDrag = resolveSwipeRelease({
        dx: -25,
        durationMs: 350,
        containerWidth: 400,
        currentIndex: 1,
        totalCount: 4,
      });
      expect(shortSlowDrag).toEqual({
        committed: false,
        nextIndex: 1,
        direction: null,
      });

      const pastStartBoundary = resolveSwipeRelease({
        dx: 140,
        durationMs: 200,
        containerWidth: 400,
        currentIndex: 0,
        totalCount: 4,
      });
      expect(pastStartBoundary.committed).toBe(false);
      expect(pastStartBoundary.nextIndex).toBe(0);

      const pastEndBoundary = resolveSwipeRelease({
        dx: -140,
        durationMs: 200,
        containerWidth: 400,
        currentIndex: 3,
        totalCount: 4,
      });
      expect(pastEndBoundary.committed).toBe(false);
      expect(pastEndBoundary.nextIndex).toBe(3);
    });
  });

  // 2. Navigating using previous and next buttons & keyboard
  describe("2. Navigating using previous/next buttons & keyboard", () => {
    it("renders position indicator (e.g. 2 of 3) and accessible Prev/Next buttons with boundary disabled states", () => {
      const outfits = [
        makeCardData({ id: "o-1", title: "Look Alpha" }),
        makeCardData({ id: "o-2", title: "Look Beta" }),
        makeCardData({ id: "o-3", title: "Look Gamma" }),
      ];

      const htmlFirst = renderToStaticMarkup(
        <SwipeableOutfitDeck outfits={outfits} activeIndex={0} />,
      );
      expect(htmlFirst).toContain("1");
      expect(htmlFirst).toContain("of 3");
      expect(htmlFirst).toContain('aria-label="Previous outfit"');
      expect(htmlFirst).toContain('aria-label="Next outfit"');
      expect(htmlFirst).toContain("Look Alpha");
      expect(htmlFirst).not.toContain("Look Beta");

      const htmlMiddle = renderToStaticMarkup(
        <SwipeableOutfitDeck outfits={outfits} activeIndex={1} />,
      );
      expect(htmlMiddle).toContain("Look Beta");
      expect(htmlMiddle).not.toContain("Look Alpha");
      expect(htmlMiddle).not.toContain("Look Gamma");
    });

    it("handles ArrowLeft and ArrowRight keyboard navigation accurately", () => {
      expect(resolveKeyboardNavigation("ArrowRight", 0, 3)).toEqual({
        nextIndex: 1,
        direction: "next",
      });
      expect(resolveKeyboardNavigation("ArrowLeft", 1, 3)).toEqual({
        nextIndex: 0,
        direction: "prev",
      });
      expect(resolveKeyboardNavigation("ArrowLeft", 0, 3)).toBeNull();
      expect(resolveKeyboardNavigation("ArrowRight", 2, 3)).toBeNull();
      expect(resolveKeyboardNavigation("Enter", 1, 3)).toBeNull();
    });
  });

  // 3. Expanding and collapsing details
  describe("3. Expanding and collapsing details", () => {
    it("keeps details collapsed and inert by default, showing Show More Details without immediately exposing the breakdown", () => {
      const card = makeCardData();
      const collapsedHtml = renderToStaticMarkup(
        <OutfitBrowsingCard
          outfit={card}
          isExpanded={false}
          onToggleExpand={() => {}}
        />,
      );

      expect(collapsedHtml).toContain("Show More Details");
      expect(collapsedHtml).toContain('aria-expanded="false"');
      expect(collapsedHtml).toContain('data-details-expanded="false"');
      expect(collapsedHtml).toContain('aria-hidden="true"');
      expect(collapsedHtml).toContain("inert");
      expect(collapsedHtml).toContain("grid-rows-[0fr]");
    });

    it("reveals garments, categories, colours, explanation, styling tip, and Collapse details when expanded", () => {
      const card = makeCardData();
      const expandedHtml = renderToStaticMarkup(
        <OutfitBrowsingCard
          outfit={card}
          isExpanded={true}
          onToggleExpand={() => {}}
          expandedActionsSlot={<button type="button">Custom Section Action</button>}
        />,
      );

      expect(expandedHtml).toContain("Hide Details");
      expect(expandedHtml).toContain('aria-expanded="true"');
      expect(expandedHtml).toContain('data-details-expanded="true"');
      expect(expandedHtml).toContain('aria-hidden="false"');
      expect(expandedHtml).toContain("grid-rows-[1fr]");
      expect(expandedHtml).toContain("Beige Linen Overshirt");
      expect(expandedHtml).toContain("Tailored Navy Chinos");
      expect(expandedHtml).toContain(">Beige</span>");
      expect(expandedHtml).toContain(">Cream</span>");
      expect(expandedHtml).toContain("Why This Works");
      expect(expandedHtml).toContain("Neutral beige balances deep navy");
      expect(expandedHtml).toContain("Stylist Tip");
      expect(expandedHtml).toContain("Roll the cuffs once");
      expect(expandedHtml).toContain("Custom Section Action");
      expect(expandedHtml).toContain("Collapse details");
    });
  });

  // 4. Swiping after expanding details
  describe("4. Swiping / navigating after expanding details", () => {
    it("automatically resets expanded details when navigating to the next or previous card", () => {
      let state = createInitialDeckState("stylist-wardrobe");
      state = deckStateReducer(state, {
        type: "TOGGLE_DETAILS",
        outfitId: "outfit-1",
      });
      expect(state.expandedOutfitId).toBe("outfit-1");

      state = deckStateReducer(state, {
        type: "NAVIGATE",
        nextIndex: 1,
        totalCount: 5,
      });
      expect(state.uncontrolledIndex).toBe(1);
      expect(state.expandedOutfitId).toBeNull();
    });
  });

  // 5. Saving and favouriting outfits
  describe("5. Saving and favouriting outfits", () => {
    it("renders Save, Saving, Saved, and Favourite states bound to the specific outfit", () => {
      const unsavedHtml = renderToStaticMarkup(
        <OutfitBrowsingCard
          outfit={makeCardData({ isSaved: false, isFavourite: false })}
          isExpanded={false}
          onToggleExpand={() => {}}
          onSave={() => {}}
          onToggleFavourite={() => {}}
        />,
      );
      expect(unsavedHtml).toContain("Save Outfit");
      expect(unsavedHtml).toContain('aria-pressed="false"');
      expect(unsavedHtml).toContain('aria-label="Favourite Elevated Weekend Linen"');

      const savedAndFavouritedHtml = renderToStaticMarkup(
        <OutfitBrowsingCard
          outfit={makeCardData({ isSaved: true, isFavourite: true })}
          isExpanded={false}
          onToggleExpand={() => {}}
          onSave={() => {}}
          onToggleFavourite={() => {}}
        />,
      );
      expect(savedAndFavouritedHtml).toContain("Saved");
      expect(savedAndFavouritedHtml).toContain('aria-pressed="true"');
      expect(savedAndFavouritedHtml).toContain(
        'aria-label="Remove Elevated Weekend Linen from favourites"',
      );
    });
  });

  // 6. Switching between recommendation sections
  describe("6. Switching between recommendation sections", () => {
    it("isolates deck index and expanded state when deckKey changes across tabs or sections", () => {
      let state = createInitialDeckState("studio-generator");
      state = deckStateReducer(state, {
        type: "NAVIGATE",
        nextIndex: 3,
        totalCount: 6,
      });
      state = deckStateReducer(state, {
        type: "TOGGLE_DETAILS",
        outfitId: "studio-suggestion-3",
      });
      expect(state.uncontrolledIndex).toBe(3);
      expect(state.expandedOutfitId).toBe("studio-suggestion-3");

      // Switching from Automatic Ideas to Saved Outfits resets deck state cleanly
      state = deckStateReducer(state, {
        type: "SYNC_DECK_KEY",
        deckKey: "studio-saved",
      });
      expect(state.deckKey).toBe("studio-saved");
      expect(state.uncontrolledIndex).toBe(0);
      expect(state.expandedOutfitId).toBeNull();
    });

    it("clamps active index safely if an outfit is deleted from Saved Outfits", () => {
      let state = createInitialDeckState("studio-saved");
      state = deckStateReducer(state, {
        type: "NAVIGATE",
        nextIndex: 2,
        totalCount: 3,
      });
      state = deckStateReducer(state, {
        type: "TOGGLE_DETAILS",
        outfitId: "deleted-id",
      });

      state = deckStateReducer(state, {
        type: "CLAMP_COUNT",
        totalCount: 2,
        validOutfitIds: new Set(["kept-1", "kept-2"]),
      });
      expect(state.uncontrolledIndex).toBe(1);
      expect(state.expandedOutfitId).toBeNull();
    });
  });

  // 7. Empty, loading, and error states
  describe("7. Empty, loading, and error states", () => {
    it("renders default and custom empty states cleanly when collection is empty", () => {
      const defaultEmptyHtml = renderToStaticMarkup(
        <SwipeableOutfitDeck
          outfits={[]}
          emptyTitle="No outfits yet"
          emptyDescription="Generate outfit ideas to start swiping."
        />,
      );
      expect(defaultEmptyHtml).toContain("No outfits yet");
      expect(defaultEmptyHtml).toContain("Generate outfit ideas to start swiping.");

      const customEmptyHtml = renderToStaticMarkup(
        <SwipeableOutfitDeck
          outfits={[]}
          emptyState={<div>Custom Section Empty Prompt</div>}
        />,
      );
      expect(customEmptyHtml).toContain("Custom Section Empty Prompt");
    });

    it("renders accessible loading and error states", () => {
      const loadingHtml = renderToStaticMarkup(
        <SwipeableOutfitDeck outfits={[]} loading loadingLabel="Curating looks…" />,
      );
      expect(loadingHtml).toContain("Curating looks…");
      expect(loadingHtml).toContain('aria-busy="true"');

      const errorHtml = renderToStaticMarkup(
        <SwipeableOutfitDeck
          outfits={[]}
          error="Could not fetch recommendations."
          onRetry={() => {}}
        />,
      );
      expect(errorHtml).toContain("Could not fetch recommendations.");
      expect(errorHtml).toContain("Try again");
    });
  });

  // 8. Single-outfit collections
  describe("8. Single-outfit collections", () => {
    it("displays 1 of 1 without redundant Prev/Next buttons or swipe commits", () => {
      const single = [makeCardData({ id: "only-one", title: "Solo Capsule Look" })];
      const html = renderToStaticMarkup(<SwipeableOutfitDeck outfits={single} />);

      expect(html).toContain("Solo Capsule Look");
      expect(html).toContain("of 1");
      expect(html).not.toContain('aria-label="Previous outfit"');
      expect(html).not.toContain('aria-label="Next outfit"');

      const release = resolveSwipeRelease({
        dx: -150,
        durationMs: 120,
        containerWidth: 380,
        currentIndex: 0,
        totalCount: 1,
      });
      expect(release).toEqual({
        committed: false,
        nextIndex: 0,
        direction: null,
      });
    });
  });

  // 9. Missing garment images
  describe("9. Missing garment images", () => {
    it("gracefully renders ItemImage fallback placeholders without crashing when garment URLs are null", () => {
      const noImagesCard = makeCardData({
        items: [
          { id: "missing-img-1", name: "Charcoal Wool Coat", category: "outerwear", imageUrl: null },
          { id: "missing-img-2", name: "Black Chelsea Boots", category: "shoes", imageUrl: undefined },
        ],
      });

      const html = renderToStaticMarkup(
        <OutfitBrowsingCard
          outfit={noImagesCard}
          isExpanded={true}
          onToggleExpand={() => {}}
        />,
      );
      expect(html).toContain("Charcoal Wool Coat (photo unavailable)");
      expect(html).toContain("Black Chelsea Boots (photo unavailable)");
    });
  });

  // 10. Missing outfit metadata
  describe("10. Missing outfit metadata", () => {
    it("omits empty/whitespace metadata and never outputs 'undefined' or 'null' strings", () => {
      expect(cleanText("   ")).toBeNull();
      expect(cleanText(undefined)).toBeNull();
      expect(cleanText(null)).toBeNull();
      expect(cleanList(["Chic", "  ", null, "chic", "Minimal"])).toEqual(["Chic", "Minimal"]);

      const sparseCard: SwipeableOutfitCardData = {
        id: "sparse-1",
        title: "Minimalist Look",
        shortDescription: null,
        occasion: null,
        aestheticBadge: null,
        styleTags: [],
        items: [
          {
            id: "sparse-item",
            name: "White Tee",
            category: "t_shirts",
            imageUrl: null,
            primaryColour: null,
            secondaryColours: [],
            material: null,
            style: null,
          },
        ],
        explanation: null,
        stylingTip: null,
        missingPieces: [],
      };

      const html = renderToStaticMarkup(
        <OutfitBrowsingCard
          outfit={sparseCard}
          isExpanded={true}
          onToggleExpand={() => {}}
        />,
      );

      expect(html).toContain("Minimalist Look");
      expect(html).toContain("1 coordinated piece from your wardrobe.");
      expect(html).not.toContain("Why This Works");
      expect(html).not.toContain("Styling Tip");
      expect(html).not.toContain("Colour:");
      expect(html).not.toContain("undefined");
      expect(html).not.toContain(">null<");
    });
  });

  // 11. Large recommendation collections (O(1) active-card rendering & windowed pagination)
  describe("11. Large recommendation collections", () => {
    it("renders only the active card in the DOM for 80 outfits and caps pagination dots", () => {
      const largeCollection = Array.from({ length: 80 }, (_, i) =>
        makeCardData({
          id: `large-${i}`,
          title: `Collection Outfit #${i + 1}`,
        }),
      );

      const html = renderToStaticMarkup(
        <SwipeableOutfitDeck outfits={largeCollection} activeIndex={42} />,
      );

      // Active outfit #43 (index 42) is rendered
      expect(html).toContain("Collection Outfit #43");
      // Neighbouring and distant outfits are NOT mounted in the DOM
      expect(html).not.toContain("Collection Outfit #1<");
      expect(html).not.toContain("Collection Outfit #42");
      expect(html).not.toContain("Collection Outfit #44");
      expect(html).not.toContain("Collection Outfit #80");

      const dots = computeWindowedDots(42, 80, 7);
      expect(dots).toHaveLength(7);
      expect(dots).toContain(42);
      expect(clampOutfitIndex(999, 80)).toBe(79);
    });
  });

  // 12. Mobile touch interactions & scroll-axis locking
  describe("12. Mobile touch interactions", () => {
    it("locks horizontal swipes while yielding vertical gestures to native page scroll", () => {
      expect(detectSwipeAxis(4, 3)).toBe("pending");
      expect(detectSwipeAxis(-28, 6)).toBe("horizontal");
      expect(detectSwipeAxis(6, 26)).toBe("vertical");
      expect(detectSwipeAxis(18, 18)).toBe("vertical");

      const deckHtml = renderToStaticMarkup(
        <SwipeableOutfitDeck outfits={[makeCardData(), makeCardData({ id: "o-2" })]} />,
      );
      expect(deckHtml).toContain("touch-pan-y");
    });
  });

  // 13. Desktop mouse drag physics & boundary resistance
  describe("13. Desktop mouse drag physics", () => {
    it("applies capped card rotation and rubber-band resistance at deck edges", () => {
      const normalDrag = computeDragTransform({
        dx: -120,
        dy: 10,
        hasPrev: true,
        hasNext: true,
        reducedMotion: false,
      });
      expect(normalDrag.effectiveDx).toBe(-120);
      expect(normalDrag.rotationDeg).toBeLessThan(0);
      expect(Math.abs(normalDrag.rotationDeg)).toBeLessThanOrEqual(MAX_CARD_ROTATION_DEG);
      expect(normalDrag.directionHint).toBe("next");

      const boundaryDrag = computeDragTransform({
        dx: 100,
        dy: 0,
        hasPrev: false,
        hasNext: true,
        reducedMotion: false,
      });
      expect(boundaryDrag.effectiveDx).toBeCloseTo(100 * BOUNDARY_RESISTANCE);
      expect(boundaryDrag.directionHint).toBeNull();
    });
  });

  // 14. Reduced-motion preferences
  describe("14. Reduced-motion preferences", () => {
    it("disables drag tilt/vertical lift and omits accordion motion classes when reducedMotion is true", () => {
      const reducedDrag = computeDragTransform({
        dx: -95,
        dy: 20,
        hasPrev: true,
        hasNext: true,
        reducedMotion: true,
      });
      expect(reducedDrag.rotationDeg).toBe(0);
      expect(reducedDrag.effectiveDy).toBe(0);

      const reducedCardHtml = renderToStaticMarkup(
        <OutfitBrowsingCard
          outfit={makeCardData()}
          isExpanded={false}
          onToggleExpand={() => {}}
          reducedMotion={true}
        />,
      );
      expect(reducedCardHtml).not.toContain("transition-[grid-template-rows,opacity,margin]");
    });
  });

  // 15. Existing outfit section adapters & preserved functionality
  describe("15. Data adapters across Stylist, Studio, Saved, Packing, and Chat", () => {
    const wardrobeItem = makeWardrobeItem();
    const imageMap = { "user/shirt.jpg": "https://cdn.closetai.test/shirt.jpg" };

    it("adapts AI Stylist outfits including Pinterest missingPieces and generated AI photoshoot URLs", () => {
      const adapted = adaptStylistOutfit(
        {
          name: "Gallery Opening Look",
          occasion: "Evening",
          styleDescription: "Sharp monochromatic contrast",
          explanation: "Linen softens structured tailoring.",
          stylingTip: "Add a silver cuff.",
          items: [wardrobeItem],
          missingPieces: [
            { name: "Silver Minimalist Cuff", category: "accessories", reason: "Elevates wristwear" },
          ],
        },
        0,
        imageMap,
        {
          isSaved: true,
          generatedPhotoUrl: "https://cdn.closetai.test/photoshoot.jpg",
          getPinterestUrl: (q) => `https://pinterest.com/search?q=${encodeURIComponent(q)}`,
        },
      );

      expect(adapted.title).toBe("Gallery Opening Look");
      expect(adapted.photoUrl).toBe("https://cdn.closetai.test/photoshoot.jpg");
      expect(adapted.isSaved).toBe(true);
      expect(adapted.items[0]?.imageUrl).toBe("https://cdn.closetai.test/shirt.jpg");
      expect(adapted.missingPieces?.[0]?.inspirationUrl).toContain("https://pinterest.com/search?q=");
    });

    it("adapts Outfit Studio automatic suggestions with scores and accessory gaps", () => {
      const suggestion: OutfitSuggestion = {
        name: "Smart Campus Layers",
        items: [wardrobeItem],
        occasion: "school",
        styleDescription: "Breathable all-day layering",
        stylingTip: "Unbutton top collar.",
        score: 91,
        accessoryGaps: [{ category: "Watch", reason: "Adds structure" }],
      };

      const adapted = adaptStudioSuggestion(suggestion, 2, imageMap, { isSaved: false });
      expect(adapted.aestheticBadge).toBe("91 pts");
      expect(adapted.missingPieces).toEqual([
        { name: "Watch", category: "Watch", reason: "Adds structure" },
      ]);
    });

    it("adapts Saved Outfits preserving source badge, OOTD photo, and favourite status", () => {
      const saved: OutfitWithItems = {
        id: "saved-uuid-1",
        userId: "user-1",
        name: "Friday Dinner",
        occasion: "date_night",
        styleDescription: "Warm neutral evening tones",
        explanation: "Balanced texture contrast.",
        stylingTip: "Tuck the front hem.",
        photoPath: "ootd/friday.jpg",
        source: "AI",
        isFavourite: true,
        createdAt: "2026-10-12T18:00:00Z",
        items: [wardrobeItem],
      };

      const adapted = adaptSavedOutfit(saved, imageMap, {
        "ootd/friday.jpg": "https://cdn.closetai.test/friday.jpg",
      });
      expect(adapted.id).toBe("saved-uuid-1");
      expect(adapted.occasion).toBe("date night");
      expect(adapted.aestheticBadge).toBe("AI Styled");
      expect(adapted.isFavourite).toBe(true);
      expect(adapted.photoUrl).toBe("https://cdn.closetai.test/friday.jpg");
    });

    it("adapts Trip Packing daily and rotation looks from capsule items", () => {
      const capsuleItems = new Map<string, PackingItem>([
        [
          "pack-1",
          {
            id: "pack-1",
            name: " Navy Chino",
            category: "trousers",
            primary_colour: "Navy",
            image_path: "user/chino.jpg",
          },
        ],
      ]);
      const plan: PlanOutfit = {
        day: 2,
        title: "Museum & Café Walk",
        item_ids: ["pack-1"],
        styling_tip: "Pair with comfortable sneakers.",
      };

      const adapted = adaptPackingOutfit(
        plan,
        capsuleItems,
        { "user/chino.jpg": "https://cdn.closetai.test/chino.jpg" },
        { isRotation: true, location: "Lisbon" },
      );
      expect(adapted.aestheticBadge).toBe("Rotation 2");
      expect(adapted.shortDescription).toBe("1 capsule piece for Lisbon");
      expect(adapted.items[0]?.name).toBe("Navy Chino");
      expect(adapted.stylingTip).toBe("Pair with comfortable sneakers.");
    });

    it("adapts Connect Stylist Chat proposed outfits with per-message save state", () => {
      const adapted = adaptChatProposedOutfit(
        {
          name: "Owambe Guest Statement",
          occasion: "Celebration",
          styleDescription: "Regal textured coordination",
          explanation: "Rich tones photograph crisply.",
          stylingTip: "Keep accessories tonal.",
          items: [
            {
              id: "shared-1",
              name: "Embroidered Senator Top",
              category: "traditional",
              subcategory: "senator",
              primaryColour: "Burgundy",
              secondaryColours: [],
              pattern: "embroidered",
              style: "Traditional",
              material: "Cashmere wool",
              occasions: ["traditional_event"],
              seasons: ["all_year"],
              imagePath: "user/senator.jpg",
              imageUrl: "https://cdn.closetai.test/senator.jpg",
            },
          ],
        },
        "msg-99",
        0,
        { isSaved: true },
      );

      expect(adapted.id).toBe("chat-msg-99-outfit-0");
      expect(adapted.aestheticBadge).toBe("Stylist Look");
      expect(adapted.isSaved).toBe(true);
      expect(adapted.items[0]?.primaryColour).toBe("Burgundy");
    });
  });
});

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { HelpCircle, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export type ContextualGuideSection = "wardrobe" | "studio" | "stylist";

interface GuideCardStep {
  badge: string;
  title: string;
  body: string;
}

interface GuideConfig {
  emoji: string;
  headline: string;
  subtitle: string;
  steps: GuideCardStep[];
  primaryCta?: {
    label: string;
    href: string;
  };
}

const GUIDE_CONFIGS: Record<ContextualGuideSection, GuideConfig> = {
  wardrobe: {
    emoji: "👕",
    headline: "How to build your Digital Wardrobe",
    subtitle:
      "Start by uploading a few everyday staples — tops, bottoms, and footwear. ClosetAI handles the organization automatically.",
    steps: [
      {
        badge: "1 · Snap or Upload",
        title: "Add a photo of your garment",
        body: "Click 'Add clothes' and upload a clear photo of a single piece on a hanger, flat-lay, or product shot.",
      },
      {
        badge: "2 · Automatic AI Tagging",
        title: "Let AI fill in the details",
        body: "ClosetAI's vision model inspects the image and suggests the garment name, category, colour, season, and style tags.",
      },
      {
        badge: "3 · Live Laundry Status",
        title: "Track what is clean & ready",
        body: "Every new item starts as Clean. As you wear outfits, ClosetAI tracks wears and moves items to Laundry when needed.",
      },
    ],
    primaryCta: {
      label: "Upload Your First Garment →",
      href: "/wardrobe/new",
    },
  },
  studio: {
    emoji: "✨",
    headline: "Welcome to Outfit Studio",
    subtitle:
      "Here is how Outfit Studio turns individual garments in your wardrobe into complete, wearable outfits.",
    steps: [
      {
        badge: "1 · Smart Suggestions",
        title: "Instant rule-based combinations",
        body: "Outfit Studio automatically pairs your clean tops, bottoms, and shoes based on colour harmony, season, and formality.",
      },
      {
        badge: "2 · Custom Mix & Match",
        title: "Build & save your own looks",
        body: "Select specific pieces from your closet, name the look, and save it to your personal outfit library.",
      },
      {
        badge: "3 · Log Wears & Generate Photos",
        title: "Wear today or visualize",
        body: "Tap 'Wear Today' to log the outfit and increment wear counts, or generate a studio lookbook photo of the combination.",
      },
    ],
  },
  stylist: {
    emoji: "🤖",
    headline: "How Your AI Stylist Works",
    subtitle:
      "Your AI Stylist combines live weather, occasion, and your clean wardrobe to curate personalized looks.",
    steps: [
      {
        badge: "1 · Set Context & Model Fit",
        title: "Choose occasion, skin tone & build",
        body: "Pick your occasion (Work, Date Night, Casual), weather, skin tone swatch, and body build at the top.",
      },
      {
        badge: "2 · AI-Curated Recommendations",
        title: "Styled strictly from your closet",
        body: "Ask for a look and the AI Stylist selects matching clean pieces from your wardrobe with a styling rationale and pro tip.",
      },
      {
        badge: "3 · 3D Mannequin & Studio Lookbook",
        title: "Preview in 3D or editorial photo",
        body: "Inspect the outfit on the interactive 3D mannequin or render a high-resolution studio lookbook photo.",
      },
    ],
  },
};

export function ContextualGuide({
  section,
  forceShowWhenEmpty = false,
}: {
  section: ContextualGuideSection;
  forceShowWhenEmpty?: boolean;
}) {
  const storageKey = `closetai_contextual_guide_${section}_v1`;
  const [visible, setVisible] = useState(false);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      try {
        const dismissed = window.localStorage.getItem(storageKey);
        if (!dismissed || forceShowWhenEmpty) {
          setVisible(true);
        }
      } catch {
        setVisible(true);
      } finally {
        setHydrated(true);
      }
    });
    return () => window.cancelAnimationFrame(frame);
  }, [storageKey, forceShowWhenEmpty]);

  function handleDismiss() {
    try {
      window.localStorage.setItem(storageKey, new Date().toISOString());
    } catch {
      // Ignore storage errors
    }
    setVisible(false);
  }

  if (!hydrated) return null;

  const config = GUIDE_CONFIGS[section];

  if (!visible) {
    return (
      <div className="mb-4 flex justify-end">
        <button
          type="button"
          onClick={() => setVisible(true)}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1.5 text-xs font-medium text-muted hover:border-border-strong hover:text-foreground transition-colors cursor-pointer"
        >
          <HelpCircle className="size-3.5 text-accent" aria-hidden />
          How this page works
        </button>
      </div>
    );
  }

  return (
    <section
      aria-label={config.headline}
      className="mb-8 rounded-2xl border border-accent/30 bg-surface p-5 sm:p-6 shadow-sm transition-all duration-300"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <span
            className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-2xl"
            aria-hidden="true"
          >
            {config.emoji}
          </span>
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-accent">
              <Sparkles className="size-3" aria-hidden />
              Contextual Guide
            </div>
            <h2 className="mt-1.5 font-serif text-xl sm:text-2xl font-normal text-foreground">
              {config.headline}
            </h2>
            <p className="mt-1 text-sm text-muted max-w-2xl">
              {config.subtitle}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={handleDismiss}
          className="grid size-8 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-muted hover:text-foreground cursor-pointer"
          aria-label="Dismiss guide"
        >
          <X className="size-4" aria-hidden />
        </button>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {config.steps.map((step) => (
          <div
            key={step.badge}
            className="rounded-xl border border-border bg-surface-muted/50 p-4"
          >
            <span className="inline-block text-[11px] font-semibold uppercase tracking-wider text-accent">
              {step.badge}
            </span>
            <h3 className="mt-1 text-sm font-semibold text-foreground">
              {step.title}
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-muted">
              {step.body}
            </p>
          </div>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-center justify-end gap-3 border-t border-border pt-4">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleDismiss}
        >
          Got it, dismiss
        </Button>
        {config.primaryCta ? (
          <Button asChild size="sm">
            <Link href={config.primaryCta.href}>{config.primaryCta.label}</Link>
          </Button>
        ) : null}
      </div>
    </section>
  );
}

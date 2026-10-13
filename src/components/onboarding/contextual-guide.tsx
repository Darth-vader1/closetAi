"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { HelpCircle, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export type ContextualGuideSection =
  | "wardrobe"
  | "studio"
  | "stylist"
  | "packing"
  | "calendar"
  | "laundry"
  | "settings";

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
  packing: {
    emoji: "🧳",
    headline: "How Travel Packing Capsule Works",
    subtitle:
      "Pack light without running out of outfits. The AI builds an interchangeable carry-on capsule from your clean clothes.",
    steps: [
      {
        badge: "1 · Destination & Duration",
        title: "Enter where & how long",
        body: "Type your destination city (or pick a quick destination), choose your trip length (3–10 days), and select your trip vibe.",
      },
      {
        badge: "2 · Live Destination Weather",
        title: "Weather-aware packing list",
        body: "ClosetAI checks the local climate for your destination and selects versatile tops, bottoms, outerwear, and shoes that mix and match.",
      },
      {
        badge: "3 · Day-by-Day Itinerary",
        title: "Interactive checklist & daily looks",
        body: "Check off each garment as you pack your bag and review the day-by-day outfit rotation planned for your trip.",
      },
    ],
  },
  calendar: {
    emoji: "📅",
    headline: "How Outfit Calendar Works",
    subtitle:
      "Plan your outfits for the week ahead and keep a visual diary of what you wore each day.",
    steps: [
      {
        badge: "1 · Schedule Ahead",
        title: "Assign outfits to upcoming days",
        body: "Pick any date on your calendar and assign a saved outfit so your morning routine is effortless.",
      },
      {
        badge: "2 · Confirm & Log Wear",
        title: "Mark planned outfits as worn",
        body: "When you wear a scheduled look, confirm it on the calendar to automatically update wear counts across all included garments.",
      },
      {
        badge: "3 · Avoid Outfit Repeats",
        title: "Smart rotation history",
        body: "ClosetAI uses your calendar history to avoid recommending the exact same outfit on consecutive days.",
      },
    ],
  },
  laundry: {
    emoji: "🧺",
    headline: "How the Laundry Tracker Works",
    subtitle:
      "Keep your outfit recommendations accurate by tracking which garments are clean, worn, or in the wash.",
    steps: [
      {
        badge: "1 · Automatic Wear Tracking",
        title: "Wears increment automatically",
        body: "Whenever you mark an outfit as worn, each garment's wear counter increases and moves from Clean to Worn or Dirty.",
      },
      {
        badge: "2 · Filtered Out When Dirty",
        title: "No dirty clothes in suggestions",
        body: "Anything marked Dirty, In Laundry, Washing, or Drying is automatically excluded from AI Stylist and Outfit Studio suggestions.",
      },
      {
        badge: "3 · One-Tap Bulk Wash",
        title: "Move loads back to Clean",
        body: "Advance items through Washing/Drying or tap 'Mark all as washed & clean' to reset wear counts back to zero.",
      },
    ],
  },
  settings: {
    emoji: "⚙️",
    headline: "Personalize Your Style & Morning Briefs",
    subtitle:
      "Configure your style persona, timezone, and automated Daily Outfit emails or WhatsApp briefings.",
    steps: [
      {
        badge: "1 · Style Persona & Location",
        title: "Tailor AI recommendations",
        body: "Set your preferred styles, occasions, gender presentation, and city so weather-aware styling matches your climate.",
      },
      {
        badge: "2 · Daily Morning Briefings",
        title: "Email & WhatsApp schedules",
        body: "Choose your preferred delivery time to receive a curated Daily Outfit and Weekly Laundry Digest automatically.",
      },
      {
        badge: "3 · Instant Test Previews",
        title: "Send a live test anytime",
        body: "Use the 'Send Test Email' or 'Send Test WhatsApp' buttons to preview your morning brief immediately.",
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

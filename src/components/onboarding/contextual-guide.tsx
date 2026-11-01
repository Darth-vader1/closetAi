"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { HelpCircle, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";

export type ContextualGuideSection =
  | "wardrobe"
  | "studio"
  | "flatlay"
  | "connect"
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

export const GUIDE_CONFIGS: Record<ContextualGuideSection, GuideConfig> = {
  wardrobe: {
    emoji: "👕",
    headline: "How to build your Digital Wardrobe",
    subtitle:
      "Upload photos, split multi-item outfits, import directly from online stores, and let Product Studio polish your shots.",
    steps: [
      {
        badge: "1 · Upload, Crop or Import",
        title: "Add photos or paste a store URL",
        body: "Snap a single piece, split a full-body outfit photo into separate items, or import straight from an online store link.",
      },
      {
        badge: "2 · AI Tagging & Studio Beautify",
        title: "Clean cutouts & automatic tags",
        body: "Vision AI fills in category, colour, season, and style, while Beautify removes cluttered backgrounds with studio lighting.",
      },
      {
        badge: "3 · Live Laundry Status",
        title: "Track what is clean & ready",
        body: "Every new item starts as Clean. As you wear outfits, ClosetAI tracks wears and moves items to Laundry when needed.",
      },
    ],
    primaryCta: {
      label: "Add or Import Garment →",
      href: "/wardrobe/new",
    },
  },
  studio: {
    emoji: "✨",
    headline: "Welcome to Outfit Studio",
    subtitle:
      "Turn individual pieces in your wardrobe into complete 3D looks, saved outfits, and magazine-worthy flatlay boards.",
    steps: [
      {
        badge: "1 · Smart Combinations",
        title: "Instant rule-based pairings",
        body: "Outfit Studio pairs your clean tops, bottoms, and footwear based on colour harmony, season, and formality.",
      },
      {
        badge: "2 · Flatlay Collage Studio",
        title: "Compose editorial boards",
        body: "Open Flatlay Studio to arrange garments on linen or limewash backdrops and export high-resolution PNG lookbooks.",
      },
      {
        badge: "3 · Log Wears & 3D Previews",
        title: "Wear today or visualize",
        body: "Tap 'Wear Today' to log the outfit and increment wear counts, or render a studio lookbook photo of the combination.",
      },
    ],
    primaryCta: {
      label: "Open Flatlay Studio →",
      href: "/studio/flatlay",
    },
  },
  flatlay: {
    emoji: "🎨",
    headline: "How Flatlay Studio Works",
    subtitle:
      "Compose editorial fashion collages from your actual wardrobe and export crisp lookbook boards.",
    steps: [
      {
        badge: "1 · Pick Pieces or Saved Outfits",
        title: "Load garments onto the canvas",
        body: "Import an entire saved outfit with one click or pick individual wardrobe items from the drawer (studio cutouts look sharpest!).",
      },
      {
        badge: "2 · Presets & Studio Backdrops",
        title: "Arrange layers & aspect ratios",
        body: "Apply smart collage presets, drag, rotate, resize, and switch between linen, limewash, editorial frame, or dark backdrops.",
      },
      {
        badge: "3 · Save & Export PNGs",
        title: "Shareable high-res boards",
        body: "Save editable boards to your library and export crisp PNGs in 1:1, 4:5, 9:16, or 16:9 for social sharing or Connect.",
      },
    ],
  },
  connect: {
    emoji: "💬",
    headline: "Welcome to ClosetAI Connect",
    subtitle:
      "Chat live with your personal AI stylist or collaborate on outfits with friends and stylists.",
    steps: [
      {
        badge: "1 · @ClosetAI Stylist Chat",
        title: "Conversational styling & cards",
        body: "Open your pinned @ClosetAI Stylist thread to ask what to wear and receive complete, saveable outfit cards from your clean closet.",
      },
      {
        badge: "2 · Share Your Closet ID",
        title: "Connect with friends & stylists",
        body: "Copy your unique Closet ID tag so friends can start a conversation, swap outfit ideas, and react in real time.",
      },
      {
        badge: "3 · Privacy-First Wardrobe Access",
        title: "Granular, revocable sharing",
        body: "Grant or revoke view access anytime under Wardrobe Access — private categories (intimates, underwear, swimwear) stay strictly hidden.",
      },
    ],
    primaryCta: {
      label: "Chat with @ClosetAI Stylist →",
      href: "/connect/stylist",
    },
  },
  stylist: {
    emoji: "🤖",
    headline: "How Your AI Stylist Works",
    subtitle:
      "Live weather, 9 body builds, modest coverage controls, and your clean wardrobe come together for tailored looks.",
    steps: [
      {
        badge: "1 · Occasion, Build & Coverage",
        title: "Choose fit, body shape & vibe",
        body: "Select your occasion, skin tone, body shape (Hourglass, Pear, Apple, Curvy, Athletic, Classic & more), or modest coverage cues.",
      },
      {
        badge: "2 · Proportion & Layering Engine",
        title: "Styled strictly from your closet",
        body: "Our engine balances silhouettes, supports smart layering (including slip-dress underlayers), and honours traditional Nigerian wear.",
      },
      {
        badge: "3 · 3D Stage & Studio Lookbook",
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

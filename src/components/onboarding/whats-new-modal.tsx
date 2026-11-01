"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Layers,
  Luggage,
  MessageCircle,
  Shirt,
  Sparkles,
  Users,
  Wand2,
  X,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export const WHATS_NEW_VERSION = "2026.11.1";
export const OPEN_WHATS_NEW_EVENT = "closetai:open-whats-new";

export function getWhatsNewStorageKey(userId: string) {
  return `closetai_whats_new_seen_${WHATS_NEW_VERSION}_${userId}`;
}

export function getProductTourStorageKey(userId: string) {
  return `closetai_product_tour_seen_${userId}`;
}

export function triggerWhatsNewModal() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(OPEN_WHATS_NEW_EVENT));
  }
}

export interface WhatsNewFeature {
  id: string;
  tag: string;
  title: string;
  description: string;
  href: string;
  ctaLabel: string;
  icon: LucideIcon;
}

export const WHATS_NEW_FEATURES: WhatsNewFeature[] = [
  {
    id: "stylist-chat",
    tag: "AI Chat",
    title: "Live @ClosetAI Stylist Chat",
    description:
      "Chat naturally with your personal AI stylist inside Connect to get complete, weather-smart, saveable outfit cards built from your clean closet.",
    href: "/connect/stylist",
    ctaLabel: "Chat with Stylist",
    icon: MessageCircle,
  },
  {
    id: "flatlay-studio",
    tag: "Creative",
    title: "Editorial Flatlay Studio",
    description:
      "Compose magazine-worthy fashion collages from your garments with 1-click presets, linen & limewash backdrops, and high-res PNG lookbook exports.",
    href: "/studio/flatlay",
    ctaLabel: "Open Flatlay Studio",
    icon: Layers,
  },
  {
    id: "inclusive-styling",
    tag: "Styling Engine",
    title: "9 Body Shapes, Layering & Modest Mode",
    description:
      "Proportion-aware recommendations across Hourglass, Pear, Apple, Curvy, Athletic & Classic builds — plus slip-dress underlayering and modest coverage.",
    href: "/stylist",
    ctaLabel: "Try AI Stylist",
    icon: Sparkles,
  },
  {
    id: "beautify-import",
    tag: "Wardrobe",
    title: "Product Studio Beautify & Store Import",
    description:
      "Turn casual snaps into clean studio cutouts, automatically split multi-item photos, or import pieces straight from online store URLs.",
    href: "/wardrobe/new",
    ctaLabel: "Add or Import Clothes",
    icon: Wand2,
  },
  {
    id: "connect-sharing",
    tag: "Social",
    title: "ClosetAI Connect & Closet ID",
    description:
      "Share your Closet ID with friends or personal stylists to collaborate on outfits with granular, privacy-safe wardrobe access controls.",
    href: "/connect",
    ctaLabel: "Explore Connect",
    icon: Users,
  },
  {
    id: "packing-whatsapp",
    tag: "Lifestyle",
    title: "30-Day Trip Capsules & WhatsApp Briefs",
    description:
      "Build weather-backed carry-on packing rotations up to 30 days, and opt into automated daily outfit & laundry check-ins via Email or WhatsApp.",
    href: "/packing",
    ctaLabel: "Plan a Trip",
    icon: Luggage,
  },
];

export function WhatsNewModal({
  userId,
  isReturningUser = false,
}: {
  userId: string;
  isReturningUser?: boolean;
}) {
  const storageKey = getWhatsNewStorageKey(userId);
  const tourKey = getProductTourStorageKey(userId);
  const [open, setOpen] = useState(false);

  const dismiss = useCallback(() => {
    try {
      window.localStorage.setItem(storageKey, new Date().toISOString());
    } catch {
      // Ignore storage errors
    }
    setOpen(false);
  }, [storageKey]);

  // Auto-open once per release version for returning users (or users who already saw the Product Tour)
  // so brand-new users aren't hit with two stacked modals simultaneously.
  useEffect(() => {
    try {
      const alreadySeenWhatsNew = window.localStorage.getItem(storageKey);
      if (alreadySeenWhatsNew) return;

      const hasSeenTour = Boolean(window.localStorage.getItem(tourKey));
      if (hasSeenTour || isReturningUser) {
        const timer = window.setTimeout(() => {
          // Double-check ProductTour didn't claim it first
          if (!window.localStorage.getItem(storageKey)) {
            setOpen(true);
          }
        }, 650);
        return () => window.clearTimeout(timer);
      }
    } catch {
      // Ignore storage errors
    }
  }, [storageKey, tourKey, isReturningUser]);

  // Always allow manual opening via Sidebar / Mobile Nav button
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener(OPEN_WHATS_NEW_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_WHATS_NEW_EVENT, onOpen);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, dismiss]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center p-4 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="whats-new-heading"
    >
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-foreground/60 backdrop-blur-[2px] animate-in fade-in duration-200"
        onClick={dismiss}
        aria-hidden="true"
      />

      {/* Modal Card */}
      <div className="relative z-[111] flex max-h-[88dvh] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border border-border bg-surface shadow-2xl animate-in zoom-in-95 fade-in duration-200">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-border bg-accent-soft/30 px-6 py-5 sm:px-7">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1 text-xs font-semibold text-accent">
              <Sparkles className="size-3.5" aria-hidden />
              What&apos;s New in ClosetAI · v{WHATS_NEW_VERSION}
            </div>
            <h2
              id="whats-new-heading"
              className="mt-2.5 font-serif text-2xl sm:text-3xl font-normal text-foreground"
            >
              Fresh features in your digital closet
            </h2>
            <p className="mt-1 text-sm text-muted">
              Explore everything we&apos;ve shipped to make styling, organizing, and sharing your wardrobe smarter.
            </p>
          </div>
          <button
            type="button"
            onClick={dismiss}
            className="grid size-9 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-muted hover:text-foreground transition-colors cursor-pointer"
            aria-label="Close What's New dialog"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>

        {/* Scrollable Feature Grid */}
        <div className="flex-1 overflow-y-auto px-6 py-5 sm:px-7">
          <div className="grid gap-3.5 sm:grid-cols-2">
            {WHATS_NEW_FEATURES.map((feature) => {
              const Icon = feature.icon || Shirt;
              return (
                <div
                  key={feature.id}
                  className="group flex flex-col justify-between rounded-2xl border border-border bg-surface-muted/40 p-4 transition-colors hover:border-accent/40 hover:bg-surface-muted/70"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="grid size-9 place-items-center rounded-xl bg-accent-soft text-accent">
                        <Icon className="size-4" aria-hidden />
                      </span>
                      <span className="rounded-full border border-border bg-surface px-2.5 py-0.5 text-[11px] font-medium text-muted">
                        {feature.tag}
                      </span>
                    </div>
                    <h3 className="mt-3 text-sm font-semibold text-foreground">
                      {feature.title}
                    </h3>
                    <p className="mt-1 text-xs leading-relaxed text-muted">
                      {feature.description}
                    </p>
                  </div>

                  <div className="mt-3.5 pt-2 border-t border-border/60">
                    <Link
                      href={feature.href}
                      onClick={dismiss}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-accent hover:underline"
                    >
                      {feature.ctaLabel}
                      <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-surface px-6 py-4 sm:px-7">
          <p className="text-xs text-muted">
            You can reopen <span className="font-medium text-foreground">What&apos;s New</span> anytime from the sidebar menu.
          </p>
          <Button type="button" onClick={dismiss} size="sm">
            Got it, let&apos;s style
          </Button>
        </div>
      </div>
    </div>
  );
}

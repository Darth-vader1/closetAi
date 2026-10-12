"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Luggage,
  Sparkles,
  Calendar,
  CheckCircle2,
  MapPin,
  Check,
  Loader2,
  Sun,
  ArrowRight,
  Shirt,
  Info,
  MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { humanise } from "@/lib/wardrobe/categories";

interface PackingItem {
  id: string;
  name: string;
  category: string;
  primary_colour: string;
  image_path: string;
}

interface DailyPlan {
  day: number;
  title: string;
  item_ids: string[];
  styling_tip: string;
}

interface PackingResponse {
  destination: string;
  days: number;
  weather?: {
    city: string;
    temperatureC: number;
    condition: string;
    isRainy: boolean;
  } | null;
  capsuleItems: PackingItem[];
  capsuleRationale: string;
  dailyItinerary: DailyPlan[];
  packingTips: string[];
  imageUrls: Record<string, string>;
}

const POPULAR_DESTINATIONS = [
  { name: "Paris, France", vibe: "City Break & Culture" },
  { name: "London, UK", vibe: "Sightseeing & Dinners" },
  { name: "Abuja, Nigeria", vibe: "Business & Events" },
  { name: "Accra, Ghana", vibe: "Weekend Beach & Chill" },
  { name: "New York, USA", vibe: "Urban Street Style" },
  { name: "Dubai, UAE", vibe: "Warm Luxury Resort" },
];

export function PackingClient({ initialCleanCount }: { initialCleanCount: number }) {
  const [destination, setDestination] = useState("Paris");
  const [days, setDays] = useState(4);
  const [tripType, setTripType] = useState("City Break & Sightseeing");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PackingResponse | null>(null);
  const [packedIds, setPackedIds] = useState<Record<string, boolean>>({});

  const handleGenerate = async () => {
    if (!destination.trim() || loading) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/ai/packing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ destination, days, tripType }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Could not generate travel packing capsule.");
      }

      setResult(data);
      setPackedIds({});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const togglePacked = (id: string) => {
    setPackedIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  return (
    <div className="space-y-8">
      {/* Trip Config Card */}
      <Card className="p-6 md:p-8 border-border bg-surface shadow-xs space-y-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-accent font-semibold text-xs tracking-wider uppercase">
            <Luggage className="h-4 w-4" />
            <span>Travel Capsule Generator · Carry-On Efficiency</span>
          </div>
          <h2 className="font-serif text-2xl md:text-3xl font-medium tracking-tight text-foreground">
            Where are you traveling to?
          </h2>
          <p className="text-xs text-muted">
            The AI will check destination weather and pack an interchangeable mini-capsule from your clean clothes.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Destination */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Destination City</label>
            <div className="relative">
              <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted" />
              <input
                type="text"
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                placeholder="e.g. Paris, Abuja, Tokyo..."
                className="w-full rounded-xl border border-input bg-background pl-9 pr-4 py-2.5 text-sm focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
          </div>

          {/* Trip Duration */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Trip Duration</label>
            <div className="flex items-center gap-1.5">
              {[3, 4, 5, 7, 10].map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDays(d)}
                  className={`flex-1 rounded-xl py-2.5 text-xs font-semibold border transition-colors ${
                    days === d
                      ? "border-accent bg-accent-soft text-accent shadow-2xs"
                      : "border-border hover:bg-surface-muted text-muted"
                  }`}
                >
                  {d} Days
                </button>
              ))}
            </div>
          </div>

          {/* Trip Vibe */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-foreground">Trip Occasion / Vibe</label>
            <select
              value={tripType}
              onChange={(e) => setTripType(e.target.value)}
              className="w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="City Break & Sightseeing">City Break & Sightseeing</option>
              <option value="Business & Meetings">Business & Client Meetings</option>
              <option value="Beach & Warm Resort">Beach & Warm Resort</option>
              <option value="Wedding & Owambe Event">Wedding, Owambe & Event</option>
              <option value="Active & Outdoor Walking">Active & Outdoor Exploration</option>
            </select>
          </div>
        </div>

        {/* Quick Destinations */}
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-border/60">
          <span className="text-[11px] text-muted font-medium">Quick Picks:</span>
          {POPULAR_DESTINATIONS.map((dest) => (
            <button
              key={dest.name}
              type="button"
              onClick={() => {
                setDestination(dest.name);
                setTripType(dest.vibe);
              }}
              className="rounded-lg border border-border/80 bg-surface-muted/50 hover:bg-surface-muted px-2.5 py-1 text-xs text-foreground transition-colors"
            >
              {dest.name}
            </button>
          ))}
        </div>

        <div className="pt-2">
          <Button
            onClick={handleGenerate}
            disabled={loading || !destination.trim()}
            variant="primary"
            className="w-full sm:w-auto gap-2 rounded-xl h-11 px-8 text-sm"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Crafting Travel Capsule...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Generate Travel Capsule ({days} Days)
              </>
            )}
          </Button>
        </div>
      </Card>

      {/* Error state */}
      {error && (
        <div className="rounded-xl border border-danger/20 bg-danger-soft p-4 text-xs text-danger">
          {error}
        </div>
      )}

      {/* Results View */}
      {result && (
        <div className="space-y-8 animate-in fade-in-50 duration-300">
          {/* Destination Brief */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-accent/20 bg-accent-soft/40 p-5">
            <div className="space-y-1">
              <div className="flex items-center gap-2 font-serif text-xl font-medium text-foreground">
                <MapPin className="h-5 w-5 text-accent" />
                <span>{result.destination} · {result.days}-Day Capsule</span>
              </div>
              <p className="text-xs text-muted max-w-xl">{result.capsuleRationale}</p>
            </div>

            {result.weather && (
              <div className="rounded-xl border border-border bg-surface px-4 py-2.5 text-xs text-foreground shrink-0 shadow-2xs">
                <div className="font-semibold flex items-center gap-1.5">
                  <Sun className="h-3.5 w-3.5 text-amber-500" />
                  <span>Destination Weather</span>
                </div>
                <div className="text-muted mt-0.5">
                  {result.weather.temperatureC}°C · {result.weather.condition}
                </div>
              </div>
            )}
          </div>

          {/* 1. Luggage Checklist / Packed Capsule Items */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-serif text-xl font-medium text-foreground">
                  Your Carry-On Capsule ({result.capsuleItems.length} Pieces)
                </h3>
                <p className="text-xs text-muted">
                  Check off items as you pack them into your suitcase.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={`https://wa.me/?text=${encodeURIComponent(
                    `🧳 *My ${result.days}-Day Travel Capsule for ${result.destination}*\n\n` +
                    `📦 Packed Pieces (${result.capsuleItems.length} items):\n` +
                    result.capsuleItems.map((i) => `• ${i.name} (${i.primary_colour})`).join("\n") +
                    `\n\nGenerated with ClosetAI: https://closetai.app/packing`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400 transition-colors"
                >
                  <MessageSquare className="h-3.5 w-3.5" />
                  <span>Share Capsule</span>
                </a>
                <span className="text-xs bg-surface-muted border border-border px-3 py-1 rounded-full font-semibold text-foreground">
                  {Object.values(packedIds).filter(Boolean).length} of {result.capsuleItems.length} Packed
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {result.capsuleItems.map((item) => {
                const img = result.imageUrls[item.image_path];
                const isPacked = packedIds[item.id];
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => togglePacked(item.id)}
                    className={`relative rounded-xl border p-2 text-left transition-all group overflow-hidden ${
                      isPacked
                        ? "border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20 shadow-xs"
                        : "border-border bg-surface hover:border-accent/40"
                    }`}
                  >
                    <div className="relative aspect-square w-full rounded-lg overflow-hidden bg-surface-muted mb-2">
                      {img ? (
                        <Image src={img} alt={item.name} fill sizes="120px" className="object-contain" />
                      ) : (
                        <Shirt className="m-auto size-6 text-muted" />
                      )}
                      <div className="absolute top-1.5 right-1.5">
                        <div
                          className={`size-5 rounded-full flex items-center justify-center border transition-colors ${
                            isPacked
                              ? "bg-emerald-600 border-emerald-600 text-white"
                              : "border-border bg-surface/80 text-transparent group-hover:text-muted"
                          }`}
                        >
                          <Check className="h-3 w-3 stroke-[3]" />
                        </div>
                      </div>
                    </div>
                    <div className="text-xs font-semibold text-foreground truncate">{item.name}</div>
                    <div className="text-[10px] text-muted capitalize truncate">{humanise(item.category)}</div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. Day-by-Day Outfit Plan */}
          <div className="space-y-4">
            <div>
              <h3 className="font-serif text-xl font-medium text-foreground">
                Day-by-Day Outfit Combinations
              </h3>
              <p className="text-xs text-muted">
                How to remix your packed capsule for each day of the trip:
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {result.dailyItinerary.map((plan) => {
                const dayItems = plan.item_ids
                  .map((id) => result.capsuleItems.find((i) => i.id === id))
                  .filter(Boolean) as PackingItem[];

                return (
                  <Card key={plan.day} className="p-5 border-border bg-surface space-y-3 shadow-2xs">
                    <div className="flex items-center justify-between border-b border-border/60 pb-2">
                      <div className="font-medium text-sm text-foreground flex items-center gap-2">
                        <span className="flex size-6 items-center justify-center rounded-lg bg-accent text-accent-contrast font-bold text-xs">
                          {plan.day}
                        </span>
                        <span>{plan.title}</span>
                      </div>
                    </div>

                    {/* Outfit Pieces thumbnails */}
                    <div className="flex items-center gap-2 overflow-x-auto py-1">
                      {dayItems.map((item) => {
                        const img = result.imageUrls[item.image_path];
                        return (
                          <div
                            key={item.id}
                            className="relative size-14 shrink-0 rounded-lg border border-border bg-surface-muted overflow-hidden"
                            title={item.name}
                          >
                            {img ? (
                              <Image src={img} alt={item.name} fill sizes="56px" className="object-cover" />
                            ) : (
                              <Shirt className="m-auto size-4 text-muted" />
                            )}
                          </div>
                        );
                      })}
                    </div>

                    <p className="text-xs text-muted italic">💡 {plan.styling_tip}</p>
                  </Card>
                );
              })}
            </div>
          </div>

          {/* 3. Packing Tips */}
          {result.packingTips.length > 0 && (
            <Card className="p-6 border-border bg-surface-muted/50 space-y-3 shadow-2xs">
              <div className="flex items-center gap-2 font-serif text-lg font-medium text-foreground">
                <Luggage className="h-4 w-4 text-accent" />
                <span>Travel Packing Pro Tips</span>
              </div>
              <ul className="space-y-1.5 text-xs text-muted">
                {result.packingTips.map((tip, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span className="text-accent">•</span>
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

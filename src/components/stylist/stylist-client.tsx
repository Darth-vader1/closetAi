"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Sparkles,
  Layers,
  LayoutGrid,
  Calendar,
  Check,
  BookmarkCheck,
  CheckCircle2,
  AlertCircle,
  Loader2,
  RefreshCw,
  Sun,
  CloudRain,
  Snowflake,
  Flame,
  ArrowRight,
  Shirt,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { OutfitStage3D } from "@/components/studio/outfit-stage-3d";
import { saveStylistOutfitAction, planOutfitAction, wearOutfitTodayAction } from "@/app/(app)/stylist/actions";
import type { WardrobeItem } from "@/lib/wardrobe/queries";
import { humanise } from "@/lib/wardrobe/categories";

interface StylistOutfitItem {
  name: string;
  occasion: string;
  styleDescription: string;
  explanation: string;
  stylingTip: string;
  items: WardrobeItem[];
}

interface StylistClientProps {
  initialCleanCount: number;
  userStylePreferences?: string[];
}

const QUICK_PROMPTS = [
  { label: "💼 Work & Office", prompt: "Smart, professional look for a workday or meetings" },
  { label: "☕ Weekend Casual", prompt: "Relaxed and stylish outfit for a weekend coffee run or walking around" },
  { label: "🍷 Dinner Date", prompt: "Chic, elevated look for an evening dinner date" },
  { label: "🌧️ Chilly / Rainy Day", prompt: "Warm, comfortable layered outfit for cool, wet weather" },
  { label: "✨ Semi-Formal Event", prompt: "Polished and refined outfit for an evening gathering or party" },
  { label: "👟 Sporty Casual", prompt: "Comfortable, athletic-inspired everyday streetwear" },
];

const WEATHER_PRESETS = [
  { label: "Any", icon: Sparkles, value: "" },
  { label: "Warm (22°C+)", icon: Flame, value: "Warm sunny weather (around 24°C)" },
  { label: "Mild (16-21°C)", icon: Sun, value: "Mild, comfortable weather (around 18°C)" },
  { label: "Cool / Rainy", icon: CloudRain, value: "Cool, rainy weather, need light layering (around 14°C)" },
  { label: "Cold (<12°C)", icon: Snowflake, value: "Cold winter weather, warm layers essential (around 8°C)" },
];

export function StylistClient({ initialCleanCount, userStylePreferences = [] }: StylistClientProps) {
  const [prompt, setPrompt] = useState("");
  const [selectedWeather, setSelectedWeather] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Results state
  const [outfits, setOutfits] = useState<StylistOutfitItem[]>([]);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [overallAdvice, setOverallAdvice] = useState<string | null>(null);
  const [activeOutfitIndex, setActiveOutfitIndex] = useState(0);
  const [viewMode, setViewMode] = useState<"3d" | "grid">("3d");

  // Interaction feedback states
  const [savedOutfits, setSavedOutfits] = useState<Record<number, string>>({}); // outfitIndex -> savedId
  const [savingIndex, setSavingIndex] = useState<number | null>(null);
  const [wornIndex, setWornIndex] = useState<number | null>(null);
  const [plannedIndex, setPlannedIndex] = useState<number | null>(null);

  const handleAskStylist = async (userQuery?: string) => {
    const q = (userQuery || prompt).trim();
    if (!q) return;

    setLoading(true);
    setError(null);
    setSavedOutfits({});
    setWornIndex(null);
    setPlannedIndex(null);

    try {
      const res = await fetch("/api/ai/stylist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: q,
          weather: selectedWeather || undefined,
        }),
      });

      const data = await res.json();
      if (!res.ok || data.status === "failed" || data.error) {
        throw new Error(data.error || data.message || "The stylist couldn't generate an outfit.");
      }

      setOutfits(data.outfits || []);
      setImageUrls(data.imageUrls || {});
      setOverallAdvice(data.overallAdvice || null);
      setActiveOutfitIndex(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSaveOutfit = async (index: number) => {
    const outfit = outfits[index];
    if (!outfit || savingIndex !== null || savedOutfits[index]) return;

    setSavingIndex(index);
    try {
      const res = await saveStylistOutfitAction({
        name: outfit.name,
        occasion: outfit.occasion,
        itemIds: outfit.items.map((i) => i.id),
        styleDescription: outfit.styleDescription,
        explanation: outfit.explanation,
        stylingTip: outfit.stylingTip,
      });

      if (res.ok) {
        setSavedOutfits((prev) => ({ ...prev, [index]: res.id }));
      } else {
        alert(res.error || "Could not save outfit.");
      }
    } finally {
      setSavingIndex(null);
    }
  };

  const handleWearToday = async (index: number) => {
    const outfit = outfits[index];
    if (!outfit) return;

    // Ensure outfit is saved first
    let outfitId = savedOutfits[index];
    if (!outfitId) {
      const saveRes = await saveStylistOutfitAction({
        name: outfit.name,
        occasion: outfit.occasion,
        itemIds: outfit.items.map((i) => i.id),
        styleDescription: outfit.styleDescription,
        explanation: outfit.explanation,
        stylingTip: outfit.stylingTip,
      });
      if (saveRes.ok) {
        outfitId = saveRes.id;
        setSavedOutfits((prev) => ({ ...prev, [index]: outfitId }));
      } else {
        alert("Could not record outfit.");
        return;
      }
    }

    const wearRes = await wearOutfitTodayAction({
      outfitId,
      itemIds: outfit.items.map((i) => i.id),
    });

    if (wearRes.ok) {
      setWornIndex(index);
    } else {
      alert("Could not mark as worn.");
    }
  };

  const handlePlanForTomorrow = async (index: number) => {
    const outfit = outfits[index];
    if (!outfit) return;

    let outfitId = savedOutfits[index];
    if (!outfitId) {
      const saveRes = await saveStylistOutfitAction({
        name: outfit.name,
        occasion: outfit.occasion,
        itemIds: outfit.items.map((i) => i.id),
        styleDescription: outfit.styleDescription,
        explanation: outfit.explanation,
        stylingTip: outfit.stylingTip,
      });
      if (saveRes.ok) {
        outfitId = saveRes.id;
        setSavedOutfits((prev) => ({ ...prev, [index]: outfitId }));
      } else {
        alert("Could not schedule outfit.");
        return;
      }
    }

    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const dateStr = tomorrow.toISOString().split("T")[0];

    const planRes = await planOutfitAction({
      outfitId,
      date: dateStr,
    });

    if (planRes.ok) {
      setPlannedIndex(index);
    } else {
      alert("Could not schedule outfit.");
    }
  };

  const activeOutfit = outfits[activeOutfitIndex];

  return (
    <div className="space-y-8">
      {/* Search & Prompt Station */}
      <Card className="p-6 md:p-8 border-border/70 shadow-sm bg-card/60 backdrop-blur-sm">
        <div className="max-w-3xl space-y-4">
          <div className="flex items-center gap-2 text-primary font-medium text-sm">
            <Sparkles className="h-4 w-4" />
            <span>AI Wardrobe Consultant · Grounded in your clean clothes</span>
          </div>

          <h2 className="font-serif text-2xl md:text-3xl font-medium tracking-tight">
            What are we styling you for today?
          </h2>

          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <input
                type="text"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleAskStylist();
                  }
                }}
                placeholder="e.g. Smart casual for a dinner date with friends..."
                className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </div>
            <Button
              onClick={() => handleAskStylist()}
              disabled={loading || !prompt.trim()}
              className="gap-2 h-12 px-6 rounded-xl shrink-0"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Styling Look...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4" />
                  Ask Stylist
                </>
              )}
            </Button>
          </div>

          {/* Weather Selector */}
          <div className="flex flex-wrap items-center gap-2 pt-2">
            <span className="text-xs text-muted-foreground mr-1">Weather Context:</span>
            {WEATHER_PRESETS.map((preset) => {
              const Icon = preset.icon;
              const active = selectedWeather === preset.value;
              return (
                <button
                  key={preset.label}
                  type="button"
                  onClick={() => setSelectedWeather(active ? "" : preset.value)}
                  className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors border ${
                    active
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border/60 hover:bg-muted text-muted-foreground"
                  }`}
                >
                  <Icon className="h-3 w-3" />
                  <span>{preset.label}</span>
                </button>
              );
            })}
          </div>

          {/* Quick Prompts */}
          <div className="pt-2">
            <div className="text-xs font-medium text-muted-foreground mb-2">Or pick an occasion vibe:</div>
            <div className="flex flex-wrap gap-2">
              {QUICK_PROMPTS.map((qp) => (
                <button
                  key={qp.label}
                  type="button"
                  onClick={() => {
                    setPrompt(qp.prompt);
                    handleAskStylist(qp.prompt);
                  }}
                  className="rounded-lg border border-border/60 bg-background/50 hover:bg-muted px-3 py-1.5 text-xs text-foreground transition-colors hover:border-foreground/20"
                >
                  {qp.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* Error Notice */}
      {error && (
        <div className="flex items-center gap-3 rounded-xl border border-destructive/20 bg-destructive/10 p-4 text-sm text-destructive">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Clean items inventory notice */}
      {initialCleanCount < 2 && outfits.length === 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 dark:border-amber-950 dark:bg-amber-950/40 p-5 text-sm text-amber-900 dark:text-amber-200">
          <div className="flex items-center gap-2 font-medium mb-1">
            <Shirt className="h-4 w-4" />
            <span>Wardrobe Notice</span>
          </div>
          <p>
            You have {initialCleanCount} clean items in your wardrobe. The stylist works best when you have at least a few tops, bottoms, and shoes added and marked clean.
          </p>
          <div className="mt-3">
            <Button asChild size="sm" variant="outline">
              <Link href="/wardrobe/new">Add More Garments</Link>
            </Button>
          </div>
        </div>
      )}

      {/* Recommendations Showcase */}
      {outfits.length > 0 && activeOutfit && (
        <div className="space-y-6">
          {/* Header tabs for multiple looks */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/60 pb-4">
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {outfits.map((look, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setActiveOutfitIndex(idx)}
                  className={`rounded-xl px-4 py-2 text-sm font-medium transition-all shrink-0 border ${
                    activeOutfitIndex === idx
                      ? "border-primary bg-primary text-primary-foreground shadow-sm"
                      : "border-border/60 hover:bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Look {idx + 1}: {look.name}
                </button>
              ))}
            </div>

            {/* View Mode Toggle: 3D vs Grid */}
            <div className="flex items-center rounded-lg border border-border/60 bg-muted/40 p-1 self-start sm:self-auto">
              <button
                type="button"
                onClick={() => setViewMode("3d")}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  viewMode === "3d" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Layers className="h-3.5 w-3.5" />
                <span>3D Stage</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  viewMode === "grid" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                <span>Grid View</span>
              </button>
            </div>
          </div>

          {/* Main Visual Stage & Details Panel */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Visual Stage (3D or Grid) */}
            <div className="lg:col-span-7">
              {viewMode === "3d" ? (
                <OutfitStage3D
                  items={activeOutfit.items}
                  imageUrls={imageUrls}
                  className="w-full shadow-md"
                />
              ) : (
                <Card className="p-6 border-border/70">
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {activeOutfit.items.map((item) => {
                      const url = imageUrls[item.imagePath];
                      return (
                        <div key={item.id} className="group relative rounded-xl border border-border/50 bg-background/50 p-2 overflow-hidden">
                          <div className="relative aspect-square w-full rounded-lg overflow-hidden bg-muted/40 mb-2">
                            {url ? (
                              <Image src={url} alt={item.name} fill className="object-contain" />
                            ) : (
                              <div className="flex h-full items-center justify-center text-xs text-muted-foreground">Photo</div>
                            )}
                          </div>
                          <div className="text-xs font-medium truncate">{item.name}</div>
                          <div className="text-[11px] text-muted-foreground capitalize">{humanise(item.category)}</div>
                        </div>
                      );
                    })}
                  </div>
                </Card>
              )}
            </div>

            {/* Look Details & Stylist Rationale */}
            <div className="lg:col-span-5 space-y-6">
              <div className="space-y-2">
                <div className="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
                  {activeOutfit.occasion || "Recommended Look"}
                </div>
                <h3 className="font-serif text-2xl font-medium tracking-tight text-foreground">
                  {activeOutfit.name}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {activeOutfit.styleDescription}
                </p>
              </div>

              {/* Garments in this Look */}
              <div className="space-y-2.5">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Assembled Pieces ({activeOutfit.items.length})
                </h4>
                <div className="divide-y divide-border/60 rounded-xl border border-border/60 bg-card/60 backdrop-blur-sm overflow-hidden">
                  {activeOutfit.items.map((item) => (
                    <div key={item.id} className="flex items-center justify-between p-3 text-xs">
                      <div className="flex items-center gap-3">
                        <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-lg bg-muted border border-border/40">
                          {imageUrls[item.imagePath] && (
                            <Image src={imageUrls[item.imagePath]} alt={item.name} fill className="object-cover" />
                          )}
                        </div>
                        <div>
                          <div className="font-medium text-foreground">{item.name}</div>
                          <div className="text-[11px] text-muted-foreground capitalize">
                            {humanise(item.category)} {item.material ? `· ${item.material}` : ""}
                          </div>
                        </div>
                      </div>
                      {item.primaryColour && (
                        <span className="capitalize text-[11px] text-muted-foreground bg-muted/60 px-2 py-0.5 rounded-md">
                          {item.primaryColour}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Stylist Notes / Explanation */}
              <div className="rounded-xl border border-border/70 bg-muted/30 p-4 space-y-2">
                <div className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  <span>Why This Works</span>
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {activeOutfit.explanation}
                </p>
              </div>

              {/* Actionable Styling Tip */}
              <div className="rounded-xl border border-amber-200/60 bg-amber-50/50 dark:border-amber-950/60 dark:bg-amber-950/20 p-4 space-y-1.5">
                <div className="text-xs font-medium text-amber-900 dark:text-amber-300">
                  💡 Stylist Pro Tip
                </div>
                <p className="text-xs text-amber-800/90 dark:text-amber-200/80 leading-relaxed">
                  {activeOutfit.stylingTip}
                </p>
              </div>

              {/* Primary Actions */}
              <div className="pt-2 flex flex-col sm:flex-row gap-3">
                <Button
                  onClick={() => handleSaveOutfit(activeOutfitIndex)}
                  disabled={Boolean(savedOutfits[activeOutfitIndex]) || savingIndex === activeOutfitIndex}
                  variant={savedOutfits[activeOutfitIndex] ? "outline" : "default"}
                  className="flex-1 gap-2 rounded-xl"
                >
                  {savedOutfits[activeOutfitIndex] ? (
                    <>
                      <BookmarkCheck className="h-4 w-4 text-emerald-600" />
                      Saved to Outfits
                    </>
                  ) : savingIndex === activeOutfitIndex ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <BookmarkCheck className="h-4 w-4" />
                      Save Outfit
                    </>
                  )}
                </Button>

                <Button
                  onClick={() => handlePlanForTomorrow(activeOutfitIndex)}
                  disabled={plannedIndex === activeOutfitIndex}
                  variant="outline"
                  className="gap-2 rounded-xl"
                >
                  {plannedIndex === activeOutfitIndex ? (
                    <>
                      <Check className="h-4 w-4 text-emerald-600" />
                      Scheduled
                    </>
                  ) : (
                    <>
                      <Calendar className="h-4 w-4" />
                      Plan Tomorrow
                    </>
                  )}
                </Button>

                <Button
                  onClick={() => handleWearToday(activeOutfitIndex)}
                  disabled={wornIndex === activeOutfitIndex}
                  variant="outline"
                  className="gap-2 rounded-xl"
                >
                  {wornIndex === activeOutfitIndex ? (
                    <>
                      <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                      Worn Today
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4" />
                      Wear Today
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

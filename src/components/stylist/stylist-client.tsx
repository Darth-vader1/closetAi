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
  Sun,
  CloudRain,
  Snowflake,
  Flame,
  Shirt,
  Camera,
  ExternalLink,
  Star,
  MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { OutfitStage3D } from "@/components/studio/outfit-stage-3d";
import { EditorialFlatlayCanvas } from "@/components/studio/editorial-flatlay-canvas";
import {
  saveStylistOutfitAction,
  planOutfitAction,
  wearOutfitTodayAction,
  rateOutfitAction,
} from "@/app/(app)/stylist/actions";
import type { WardrobeItem } from "@/lib/wardrobe/queries";
import { humanise } from "@/lib/wardrobe/categories";
import type { WeatherForecast } from "@/lib/weather/service";

function PinterestIcon({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0C5.373 0 0 5.372 0 12c0 5.084 3.163 9.426 7.627 11.174-.105-.949-.2-2.405.042-3.441.218-.937 1.407-5.965 1.407-5.965s-.359-.719-.359-1.782c0-1.668.967-2.914 2.171-2.914 1.023 0 1.518.769 1.518 1.69 0 1.029-.655 2.568-.994 3.995-.283 1.194.599 2.169 1.777 2.169 2.133 0 3.772-2.249 3.772-5.495 0-2.873-2.064-4.882-5.012-4.882-3.414 0-5.418 2.561-5.418 5.207 0 1.031.397 2.138.893 2.738.098.119.112.224.083.345-.09.375-.291 1.199-.334 1.373-.056.23-.182.28-.419.169-1.565-.728-2.543-3.014-2.543-4.851 0-3.955 2.874-7.587 8.286-7.587 4.349 0 7.73 3.1 7.73 7.243 0 4.322-2.724 7.801-6.505 7.801-1.27 0-2.464-.66-2.873-1.44l-.782 2.981c-.283 1.083-1.049 2.441-1.562 3.279C9.773 23.805 10.865 24 12 24c6.627 0 12-5.373 12-12 0-6.628-5.373-12-12-12z" />
    </svg>
  );
}

function getPinterestSearchUrl(query: string) {
  return `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(query)}`;
}

interface StylistOutfitItem {
  name: string;
  occasion: string;
  styleDescription: string;
  explanation: string;
  stylingTip: string;
  items: WardrobeItem[];
  missingPieces?: Array<{ name: string; category: string; reason: string }>;
}

interface StylistClientProps {
  initialCleanCount: number;
  userStylePreferences?: string[];
  initialGender?: "male" | "female" | "unisex";
  initialWeather?: WeatherForecast | null;
}

const PINTEREST_AESTHETICS = [
  { label: "Old Money / Quiet Luxury", query: "Old Money aesthetic quiet luxury linen blazer tailoring loafers outfit" },
  { label: "Clean Girl Minimalist", query: "Clean girl aesthetic minimalist neutral capsule wardrobe street style outfit" },
  { label: "French Parisian Chic", query: "French Parisian chic effortless trench coat striped knit loafers outfit" },
  { label: "Scandinavian Streetwear", query: "Scandinavian style oversized tailored trousers minimalist knitwear sneakers outfit" },
  { label: "Dark Academia", query: "Dark academia aesthetic layered wool sweater pleated trousers trench outfit" },
  { label: "Y2K Streetwear", query: "Y2K streetwear relaxed cargo denim graphic tee casual outfit" },
];

const QUICK_PROMPTS = [
  { label: "💼 Work & Office", prompt: "Smart, professional look for a workday or meetings" },
  { label: "🎉 Owambe / Aso-Ebi", prompt: "Owambe party / wedding look coordinating Aso-Ebi, Ankara, Agbada, Lace, or Senator wear with matching traditional accessories" },
  { label: "☕ Weekend Casual", prompt: "Relaxed and stylish outfit for a weekend coffee run or walking around" },
  { label: "🍷 Dinner Date", prompt: "Chic, elevated look for an evening dinner date" },
  { label: "👑 Sunday Best / Church", prompt: "Elevated, elegant thanksgiving or church celebration outfit with refined tailoring or traditional touches" },
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

export function StylistClient({
  initialCleanCount,
  userStylePreferences = [],
  initialGender = "unisex",
  initialWeather,
}: StylistClientProps) {
  void userStylePreferences;
  const [prompt, setPrompt] = useState("");
  const [selectedWeather, setSelectedWeather] = useState(initialWeather?.summary || "");
  const [selectedGender, setSelectedGender] = useState<"male" | "female" | "unisex">(initialGender);
  const [stylistMode, setStylistMode] = useState<"prompt" | "pinterest">("prompt");
  const [pinterestInput, setPinterestInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Results state
  const [outfits, setOutfits] = useState<StylistOutfitItem[]>([]);
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const [overallAdvice, setOverallAdvice] = useState<string | null>(null);
  void overallAdvice;
  const [wardrobeGaps, setWardrobeGaps] = useState<Array<{ name: string; category: string; why_it_helps: string; pairs_with: string }>>([]);
  const [activeOutfitIndex, setActiveOutfitIndex] = useState(0);
  const [viewMode, setViewMode] = useState<"3d" | "grid" | "photo" | "flatlay">("3d");

  // Interaction feedback states
  const [savedOutfits, setSavedOutfits] = useState<Record<number, string>>({}); // outfitIndex -> savedId
  const [savingIndex, setSavingIndex] = useState<number | null>(null);
  const [wornIndex, setWornIndex] = useState<number | null>(null);
  const [plannedIndex, setPlannedIndex] = useState<number | null>(null);

  // AI Photoshoot generation state: outfitIndex -> signedUrl
  const [generatedPhotos, setGeneratedPhotos] = useState<Record<number, string>>({});
  const [generatingPhotoIndex, setGeneratingPhotoIndex] = useState<number | null>(null);

  const handleGeneratePhotoshoot = async (index: number) => {
    const outfit = outfits[index];
    if (!outfit || generatingPhotoIndex !== null) return;

    setGeneratingPhotoIndex(index);
    try {
      // Generate purely on server using backend API token (never pops up Puter login to users)
      const res = await fetch("/api/outfits/generate-photo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outfitName: outfit.name,
          styleDescription: outfit.styleDescription,
          outfitId: savedOutfits[index],
          gender: selectedGender,
          items: outfit.items.map((i) => ({
            name: i.name,
            category: i.category,
            primaryColour: i.primaryColour,
            material: i.material,
          })),
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Could not generate photoshoot image.");
      }

      setGeneratedPhotos((prev) => ({ ...prev, [index]: data.signedUrl }));
      setViewMode("photo");
    } catch (err) {
      alert(err instanceof Error ? err.message : "Photoshoot generation failed.");
    } finally {
      setGeneratingPhotoIndex(null);
    }
  };

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
      setWardrobeGaps(data.wardrobeGaps || []);
      setActiveOutfitIndex(0);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleRecreatePinterestLook = async (inputVal?: string) => {
    const raw = (inputVal || pinterestInput).trim();
    if (!raw) return;

    let constructedPrompt = "";
    if (raw.includes("pinterest.com") || raw.includes("pin.it")) {
      constructedPrompt = `Recreate the fashion aesthetic from this Pinterest inspiration link: ${raw}. Replicate the silhouette, color coordination, and styling energy using the closest items from my clean wardrobe.`;
    } else {
      constructedPrompt = `Recreate this Pinterest aesthetic: "${raw}". Assemble an outfit from my clean wardrobe that captures this exact silhouette, color palette, and vibe.`;
    }

    setPrompt(constructedPrompt);
    await handleAskStylist(constructedPrompt);
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

  const [ratings, setRatings] = useState<Record<number, number>>({});

  const handleRateOutfit = async (index: number, star: number) => {
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
        alert("Could not save outfit to record rating.");
        return;
      }
    }

    setRatings((prev) => ({ ...prev, [index]: star }));
    await rateOutfitAction({ outfitId, rating: star });
  };

  const activeOutfit = outfits[activeOutfitIndex];

  return (
    <div className="space-y-8">
      {/* Search & Prompt Station */}
      <Card className="p-6 md:p-8 border-border/70 shadow-sm bg-card/60 backdrop-blur-sm">
        <div className="max-w-3xl space-y-4">
          {/* Mode Switcher Tabs */}
          <div className="flex items-center gap-2 border-b border-border/60 pb-3">
            <button
              type="button"
              onClick={() => setStylistMode("prompt")}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                stylistMode === "prompt"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>Wardrobe Stylist</span>
            </button>
            <button
              type="button"
              onClick={() => setStylistMode("pinterest")}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                stylistMode === "pinterest"
                  ? "bg-red-600 text-white shadow-xs"
                  : "text-muted-foreground hover:text-red-600 hover:bg-red-500/10"
              }`}
            >
              <PinterestIcon className="h-3.5 w-3.5" />
              <span>Recreate from Pinterest</span>
            </button>
          </div>

          {stylistMode === "prompt" ? (
            <>
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

              {/* Model Gender & Weather Selectors */}
              <div className="flex flex-wrap items-center gap-4 pt-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted mr-1 font-medium">Model / Fit:</span>
                  <button
                    type="button"
                    onClick={() => setSelectedGender("male")}
                    className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-colors border ${
                      selectedGender === "male"
                        ? "border-accent bg-accent-soft text-accent shadow-2xs"
                        : "border-border hover:bg-surface-muted text-muted"
                    }`}
                  >
                    <span>👔 Menswear</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedGender("female")}
                    className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-colors border ${
                      selectedGender === "female"
                        ? "border-accent bg-accent-soft text-accent shadow-2xs"
                        : "border-border hover:bg-surface-muted text-muted"
                    }`}
                  >
                    <span>👗 Womenswear</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedGender("unisex")}
                    className={`flex items-center gap-1 rounded-full px-3 py-1 text-xs font-medium transition-colors border ${
                      selectedGender === "unisex"
                        ? "border-accent bg-accent-soft text-accent shadow-2xs"
                        : "border-border hover:bg-surface-muted text-muted"
                    }`}
                  >
                    <span>✨ Unisex</span>
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-xs text-muted mr-1 font-medium">Weather:</span>
                  {initialWeather && (
                    <button
                      type="button"
                      onClick={() => setSelectedWeather(selectedWeather === initialWeather.summary ? "" : initialWeather.summary)}
                      className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors border ${
                        selectedWeather === initialWeather.summary
                          ? "border-sky-500 bg-sky-500/15 text-sky-700 dark:text-sky-300 shadow-2xs font-semibold"
                          : "border-sky-500/30 bg-sky-500/5 hover:bg-sky-500/10 text-sky-700 dark:text-sky-400"
                      }`}
                    >
                      <span className="text-xs">📍</span>
                      <span>{initialWeather.city} Live ({initialWeather.temperatureC}°C, {initialWeather.condition})</span>
                    </button>
                  )}
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
                            ? "border-accent bg-accent-soft text-accent shadow-2xs"
                            : "border-border hover:bg-surface-muted text-muted"
                        }`}
                      >
                        <Icon className="h-3 w-3" />
                        <span>{preset.label}</span>
                      </button>
                    );
                  })}
                </div>
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
            </>
          ) : (
            /* Pinterest Aesthetic Recreator Mode */
            <>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-red-600 dark:text-red-400 font-medium text-sm">
                  <PinterestIcon className="h-4 w-4" />
                  <span>Pinterest Aesthetic Engine · Reverse-Engineer from Your Clothes</span>
                </div>
                <a
                  href="https://www.pinterest.com/search/pins/?q=capsule+wardrobe+aesthetic+outfits"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hidden sm:inline-flex items-center gap-1 text-xs text-red-600 dark:text-red-400 hover:underline"
                >
                  <span>Browse Pinterest Lookbooks</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>

              <h2 className="font-serif text-2xl md:text-3xl font-medium tracking-tight">
                Recreate a Pinterest Look from Your Closet
              </h2>
              <p className="text-sm text-muted-foreground">
                Paste a Pinterest Pin URL or enter an aesthetic vibe. ClosetAI will scan your digital wardrobe and build the closest matching outfit!
              </p>

              <div className="flex flex-col sm:flex-row gap-3">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={pinterestInput}
                    onChange={(e) => setPinterestInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleRecreatePinterestLook();
                      }
                    }}
                    placeholder="Paste Pinterest link or type aesthetic (e.g. 'Old money quiet luxury', 'Parisian autumn trench')..."
                    className="w-full rounded-xl border border-input bg-background px-4 py-3 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  />
                </div>
                <Button
                  onClick={() => handleRecreatePinterestLook()}
                  disabled={loading || !pinterestInput.trim()}
                  className="gap-2 h-12 px-6 rounded-xl shrink-0 bg-red-600 hover:bg-red-700 text-white"
                >
                  {loading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Recreating Look...
                    </>
                  ) : (
                    <>
                      <PinterestIcon className="h-4 w-4" />
                      Recreate Look
                    </>
                  )}
                </Button>
              </div>

              {/* Curated Pinterest Aesthetic Moodboards */}
              <div className="pt-2">
                <div className="text-xs font-medium text-muted-foreground mb-2">Or select a trending Pinterest aesthetic:</div>
                <div className="flex flex-wrap gap-2">
                  {PINTEREST_AESTHETICS.map((pa) => (
                    <button
                      key={pa.label}
                      type="button"
                      onClick={() => {
                        setPinterestInput(pa.label);
                        handleRecreatePinterestLook(pa.label);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-border/70 bg-background/50 hover:bg-red-500/10 hover:border-red-500/40 px-3 py-1.5 text-xs text-foreground transition-colors"
                    >
                      <PinterestIcon className="h-3 w-3 text-red-600 dark:text-red-400" />
                      <span>{pa.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}
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
                onClick={() => setViewMode("flatlay")}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  viewMode === "flatlay" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <Sparkles className="h-3.5 w-3.5 text-accent" />
                <span>Flatlay Studio</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode("grid")}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  viewMode === "grid" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                }`}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                <span>Grid</span>
              </button>
              {generatedPhotos[activeOutfitIndex] && (
                <button
                  type="button"
                  onClick={() => setViewMode("photo")}
                  className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                    viewMode === "photo" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <Camera className="h-3.5 w-3.5 text-accent" />
                  <span>On-Model Photo</span>
                </button>
              )}
            </div>
          </div>

          {/* Main Visual Stage & Details Panel */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Visual Stage (3D, Grid, or AI Model Photoshoot) */}
            <div className="lg:col-span-7">
              {viewMode === "photo" && generatedPhotos[activeOutfitIndex] ? (
                <Card className="relative overflow-hidden rounded-2xl border-border bg-black/95 shadow-md">
                  <div className="relative aspect-[3/4] w-full max-h-[580px]">
                    <Image
                      src={generatedPhotos[activeOutfitIndex]}
                      alt={`Editorial model wearing ${activeOutfit.name}`}
                      fill
                      sizes="(max-width: 1024px) 100vw, 60vw"
                      className="object-contain"
                    />
                  </div>
                  <div className="absolute bottom-3 left-3 flex items-center gap-2 rounded-full bg-background/80 px-3 py-1 text-xs font-medium backdrop-blur-md">
                    <Sparkles className="h-3.5 w-3.5 text-accent" />
                    <span>AI Editorial Photoshoot · On-Model Look</span>
                  </div>
                </Card>
              ) : viewMode === "flatlay" ? (
                <EditorialFlatlayCanvas
                  items={activeOutfit.items}
                  imageUrls={imageUrls}
                  outfitName={activeOutfit.name}
                />
              ) : viewMode === "3d" ? (
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
                              <Image src={url} alt={item.name} fill sizes="(max-width: 640px) 50vw, 33vw" className="object-contain" />
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
                            <Image src={imageUrls[item.imagePath]} alt={item.name} fill sizes="40px" className="object-cover" />
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

              {/* Actionable Styling Tip (Using ClosetAI Warning Tokens for Razor Sharp Contrast) */}
              <div className="rounded-xl border border-warning/40 bg-warning-soft/80 p-4 space-y-1.5 shadow-2xs">
                <div className="flex items-center gap-1.5 text-xs font-bold text-warning">
                  <span>💡 Stylist Pro Tip</span>
                </div>
                <p className="text-xs font-medium text-foreground leading-relaxed">
                  {activeOutfit.stylingTip}
                </p>
              </div>

              {/* Missing Pieces / Items not in your wardrobe */}
              {activeOutfit.missingPieces && activeOutfit.missingPieces.length > 0 && (
                <div className="rounded-xl border border-border-strong bg-surface-muted/70 p-4 space-y-2.5 shadow-2xs">
                  <div className="flex items-center justify-between text-xs font-bold text-foreground">
                    <span>🛍️ Complete the Look (Items Not in Your Closet)</span>
                    <span className="text-[10px] bg-accent-soft text-accent px-2 py-0.5 rounded-full font-semibold">
                      Wishlist Ideas
                    </span>
                  </div>
                  <p className="text-xs text-muted">
                    The stylist suggests adding these pieces to elevate this outfit:
                  </p>
                  <div className="space-y-2 pt-0.5">
                    {activeOutfit.missingPieces.map((mp, idx) => (
                      <div
                        key={idx}
                        className="rounded-lg bg-surface border border-border p-3 text-xs space-y-1.5 shadow-2xs"
                      >
                        <div className="flex items-center justify-between font-semibold text-foreground">
                          <span>{mp.name}</span>
                          <span className="text-[10px] uppercase tracking-wider text-muted bg-surface-muted px-1.5 py-0.5 rounded">
                            {mp.category}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2">
                          <p className="text-[11px] text-muted leading-normal">{mp.reason}</p>
                          <a
                            href={getPinterestSearchUrl(`${mp.name} ${mp.category} outfit aesthetic styling`)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] font-medium text-red-600 dark:text-red-400 hover:underline shrink-0"
                          >
                            <PinterestIcon className="h-3 w-3" />
                            <span>Inspo</span>
                            <ExternalLink className="h-2.5 w-2.5 opacity-60" />
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Primary Actions */}
              <div className="pt-2 flex flex-col sm:flex-row flex-wrap gap-3">
                <Button
                  onClick={() => handleSaveOutfit(activeOutfitIndex)}
                  disabled={Boolean(savedOutfits[activeOutfitIndex]) || savingIndex === activeOutfitIndex}
                  variant={savedOutfits[activeOutfitIndex] ? "outline" : "primary"}
                  className="flex-1 gap-2 rounded-xl min-w-[130px]"
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
                  onClick={() => handleGeneratePhotoshoot(activeOutfitIndex)}
                  disabled={generatingPhotoIndex === activeOutfitIndex}
                  variant="outline"
                  className="gap-2 rounded-xl border-accent/40 bg-accent-soft/40 hover:bg-accent-soft text-accent"
                >
                  {generatingPhotoIndex === activeOutfitIndex ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Generating Shoot...
                    </>
                  ) : generatedPhotos[activeOutfitIndex] ? (
                    <>
                      <Camera className="h-4 w-4" />
                      View Model Photo
                    </>
                  ) : (
                    <>
                      <Camera className="h-4 w-4" />
                      Generate AI Photo
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

                <a
                  href={`https://wa.me/?text=${encodeURIComponent(
                    `✨ Check out this outfit I styled on ClosetAI!\n\n👗 *${activeOutfit.name}*\n${activeOutfit.styleDescription}\n\n• Items: ${activeOutfit.items.map((i) => i.name).join(", ")}\n💡 Tip: ${activeOutfit.stylingTip}\n\nWhat do you think?`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-emerald-500/25 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 px-4 py-2 text-sm font-medium transition-colors"
                >
                  <MessageSquare className="h-4 w-4" />
                  <span>Share on WhatsApp</span>
                  <ExternalLink className="h-3 w-3 opacity-60" />
                </a>

                <a
                  href={getPinterestSearchUrl(`${activeOutfit.name} ${activeOutfit.items.map((i) => i.name).join(" ")} aesthetic outfit`)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-red-500/25 bg-red-500/10 hover:bg-red-500/20 text-red-600 dark:text-red-400 px-4 py-2 text-sm font-medium transition-colors"
                >
                  <PinterestIcon className="h-4 w-4" />
                  <span>Pinterest Moodboard</span>
                  <ExternalLink className="h-3 w-3 opacity-60" />
                </a>
              </div>

              {/* 1-5 Star Rating & Learning Feedback */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 rounded-xl border border-border/70 bg-surface-muted/50 p-3 text-xs">
                <div className="text-muted">
                  <span>Rate look to fine-tune AI recommendations:</span>
                </div>
                <div className="flex items-center gap-1.5 self-end sm:self-auto">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      onClick={() => handleRateOutfit(activeOutfitIndex, star)}
                      className="p-1 transition-transform hover:scale-125 focus:outline-hidden"
                      title={`Rate ${star} star${star > 1 ? "s" : ""}`}
                    >
                      <Star
                        className={`h-4 w-4 ${
                          (ratings[activeOutfitIndex] ?? 0) >= star
                            ? "fill-amber-400 text-amber-500"
                            : "text-muted hover:text-amber-400"
                        }`}
                      />
                    </button>
                  ))}
                  {ratings[activeOutfitIndex] && (
                    <span className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold ml-1">
                      {ratings[activeOutfitIndex]}★ Saved!
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Wardrobe Investment Gaps / Recommended Additions to Expand Closet */}
          {wardrobeGaps.length > 0 && (
            <Card className="p-6 md:p-8 border-border bg-surface-muted/50 shadow-sm space-y-4">
              <div className="flex items-center gap-2.5">
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-accent-soft text-accent">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-serif text-xl font-medium tracking-tight text-foreground">
                    Smart Wardrobe Additions (Gap Analysis)
                  </h3>
                  <p className="text-xs text-muted">
                    Pieces you don&apos;t own yet that would unlock multiple new outfits with your current clothes:
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
                {wardrobeGaps.map((gap, idx) => (
                  <div
                    key={idx}
                    className="flex flex-col justify-between rounded-xl border border-border bg-surface p-4 shadow-2xs space-y-3"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-medium text-sm text-foreground">{gap.name}</span>
                        <span className="rounded-full bg-accent-soft px-2 py-0.5 text-[10px] font-semibold text-accent uppercase">
                          {gap.category}
                        </span>
                      </div>
                      <p className="text-xs text-muted leading-relaxed">{gap.why_it_helps}</p>
                    </div>

                    <div className="border-t border-border pt-2 flex items-center justify-between text-[11px]">
                      <div>
                        <span className="font-medium text-accent">Pairs with: </span>
                        <span className="text-muted">{gap.pairs_with}</span>
                      </div>
                      <a
                        href={getPinterestSearchUrl(`${gap.name} ${gap.category} street style aesthetic`)}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 font-medium text-red-600 dark:text-red-400 hover:underline shrink-0 ml-2"
                      >
                        <PinterestIcon className="h-3 w-3" />
                        <span>Ideas</span>
                        <ExternalLink className="h-2.5 w-2.5 opacity-60" />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

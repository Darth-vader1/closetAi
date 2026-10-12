"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  Check,
  CheckCircle2,
  Clock,
  Plus,
  Shirt,
  Layers,
  Camera,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { wearOutfitTodayAction, planOutfitAction } from "@/app/(app)/stylist/actions";
import type { OutfitWithItems, PlannedOutfitRow } from "@/lib/outfits/queries";
import { humanise } from "@/lib/wardrobe/categories";

interface CalendarClientProps {
  initialPlans: PlannedOutfitRow[];
  savedOutfits: OutfitWithItems[];
  imageUrls: Record<string, string>;
}

export function CalendarClient({ initialPlans, savedOutfits, imageUrls }: CalendarClientProps) {
  const [plans, setPlans] = useState<PlannedOutfitRow[]>(initialPlans);
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    return new Date().toISOString().split("T")[0];
  });
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() => {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
    const monday = new Date(d.setDate(diff));
    monday.setHours(0, 0, 0, 0);
    return monday;
  });

  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [wornDates, setWornDates] = useState<Record<string, boolean>>(() => {
    const map: Record<string, boolean> = {};
    for (const p of initialPlans) {
      if (p.status === "WORN") {
        map[p.plannedFor] = true;
      }
    }
    return map;
  });
  const [isWearing, setIsWearing] = useState(false);

  // Generate 7 days of the week starting from currentWeekStart
  const weekDays = Array.from({ length: 7 }, (_, i) => {
    const day = new Date(currentWeekStart);
    day.setDate(day.getDate() + i);
    const dateStr = day.toISOString().split("T")[0];
    const isToday = dateStr === new Date().toISOString().split("T")[0];
    const isSelected = dateStr === selectedDate;
    const plan = plans.find((p) => p.plannedFor === dateStr);
    return { date: day, dateStr, isToday, isSelected, plan };
  });

  const nextWeek = () => {
    setCurrentWeekStart((prev) => {
      const next = new Date(prev);
      next.setDate(next.getDate() + 7);
      return next;
    });
  };

  const prevWeek = () => {
    setCurrentWeekStart((prev) => {
      const p = new Date(prev);
      p.setDate(p.getDate() - 7);
      return p;
    });
  };

  const selectedDayInfo = weekDays.find((d) => d.dateStr === selectedDate) || {
    dateStr: selectedDate,
    plan: plans.find((p) => p.plannedFor === selectedDate),
  };

  const activePlan = selectedDayInfo.plan;
  const activeOutfit = activePlan?.outfit;

  const handleWearPlan = async (plan: PlannedOutfitRow) => {
    setIsWearing(true);
    try {
      const res = await wearOutfitTodayAction({
        outfitId: plan.outfit.id,
        itemIds: plan.outfit.items.map((i) => i.id),
        planId: plan.id,
        date: plan.plannedFor,
      });
      if (res.ok) {
        setWornDates((prev) => ({ ...prev, [plan.plannedFor]: true }));
        setPlans((prev) =>
          prev.map((p) => (p.id === plan.id ? { ...p, status: "WORN" } : p)),
        );
      } else {
        alert("Could not mark as worn. Please try again.");
      }
    } catch {
      alert("Error marking outfit as worn.");
    } finally {
      setIsWearing(false);
    }
  };

  const handleAssignOutfit = async (outfitId: string) => {
    const outfit = savedOutfits.find((o) => o.id === outfitId);
    if (!outfit) return;

    const res = await planOutfitAction({
      outfitId,
      date: selectedDate,
    });

    if (res.ok) {
      const newPlan: PlannedOutfitRow = {
        id: res.planId,
        userId: outfit.userId,
        outfitId: outfit.id,
        plannedFor: selectedDate,
        status: "PLANNED",
        outfit,
      };
      setPlans((prev) => [...prev.filter((p) => p.plannedFor !== selectedDate), newPlan]);
      setAssignModalOpen(false);
    } else {
      alert("Could not assign outfit to date.");
    }
  };

  return (
    <div className="space-y-8">
      {/* Week Navigator */}
      <Card className="p-6 border-border bg-surface-muted/40 backdrop-blur-sm">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent">
              <CalendarIcon className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-serif text-xl font-medium tracking-tight text-foreground">
                Outfit Schedule
              </h2>
              <p className="text-xs text-muted">
                Plan and track your outfits for each day of the week.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 rounded-lg border border-border bg-surface p-1">
            <button
              type="button"
              onClick={prevWeek}
              className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-surface-muted text-muted hover:text-foreground transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                const today = new Date();
                const day = today.getDay();
                const diff = today.getDate() - day + (day === 0 ? -6 : 1);
                const monday = new Date(today.setDate(diff));
                monday.setHours(0, 0, 0, 0);
                setCurrentWeekStart(monday);
                setSelectedDate(new Date().toISOString().split("T")[0]);
              }}
              className="px-3 py-1 text-xs font-medium text-foreground hover:bg-surface-muted rounded-md transition-colors"
            >
              Today
            </button>
            <button
              type="button"
              onClick={nextWeek}
              className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-surface-muted text-muted hover:text-foreground transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* 7-Day Week Strip */}
        <div className="grid grid-cols-2 sm:grid-cols-7 gap-2.5">
          {weekDays.map((d) => {
            const dayName = d.date.toLocaleDateString("en-US", { weekday: "short" });
            const dayNum = d.date.getDate();
            const hasPlan = Boolean(d.plan);
            const coverImage = d.plan?.outfit.photoPath
              ? imageUrls[d.plan.outfit.photoPath]
              : d.plan?.outfit.items[0]?.imagePath
                ? imageUrls[d.plan.outfit.items[0].imagePath]
                : null;

            return (
              <button
                key={d.dateStr}
                type="button"
                onClick={() => setSelectedDate(d.dateStr)}
                className={`relative flex flex-col justify-between rounded-xl p-3 text-left transition-all border ${
                  d.isSelected
                    ? "border-accent bg-surface ring-2 ring-accent/20 shadow-sm"
                    : "border-border bg-surface/70 hover:bg-surface hover:border-border-strong"
                }`}
              >
                <div className="flex items-center justify-between w-full mb-2">
                  <span className="text-xs font-semibold text-muted uppercase tracking-wider">{dayName}</span>
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                      d.isToday ? "bg-accent text-accent-foreground" : "text-foreground"
                    }`}
                  >
                    {dayNum}
                  </span>
                </div>

                {hasPlan ? (
                  <div className="space-y-1.5 w-full">
                    {coverImage && (
                      <div className="relative aspect-[4/3] w-full rounded-lg overflow-hidden bg-surface-muted border border-border/50">
                        <Image src={coverImage} alt="" fill sizes="100px" className="object-cover" />
                      </div>
                    )}
                    <div className="text-[11px] font-medium text-foreground truncate">
                      {d.plan?.outfit.name}
                    </div>
                  </div>
                ) : (
                  <div className="flex h-12 items-center justify-center rounded-lg border border-dashed border-border/70 text-[11px] text-muted">
                    No plan
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </Card>

      {/* Selected Day View */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-8">
          {activeOutfit ? (
            <Card className="p-6 md:p-8 border-border bg-surface space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border pb-4">
                <div>
                  <div className="inline-flex items-center gap-1.5 rounded-full bg-accent-soft px-3 py-1 text-xs font-medium text-accent mb-2">
                    <Clock className="h-3 w-3" />
                    <span>Scheduled for {new Date(selectedDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}</span>
                  </div>
                  <h3 className="font-serif text-2xl font-medium tracking-tight text-foreground">
                    {activeOutfit.name}
                  </h3>
                  <p className="text-xs text-muted">{activeOutfit.styleDescription}</p>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    onClick={() => handleWearPlan(activePlan!)}
                    disabled={Boolean(wornDates[selectedDate]) || isWearing}
                    loading={isWearing}
                    variant={wornDates[selectedDate] ? "outline" : "primary"}
                    className="gap-2 rounded-xl"
                  >
                    {wornDates[selectedDate] ? (
                      <>
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        Marked as Worn
                      </>
                    ) : (
                      <>
                        <Check className="h-4 w-4" />
                        Confirm Worn
                      </>
                    )}
                  </Button>
                  <Button
                    onClick={() => setAssignModalOpen(true)}
                    variant="outline"
                    className="rounded-xl text-xs"
                  >
                    Change Look
                  </Button>
                </div>
              </div>

              {/* Garment Grid for Scheduled Look */}
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted mb-3">
                  Garments in this Look ({activeOutfit.items.length})
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {activeOutfit.items.map((item) => {
                    const url = imageUrls[item.imagePath];
                    return (
                      <div key={item.id} className="rounded-xl border border-border bg-surface-muted/40 p-2.5 space-y-2">
                        <div className="relative aspect-square w-full rounded-lg overflow-hidden bg-surface-muted border border-border/50">
                          {url ? (
                            <Image src={url} alt={item.name} fill sizes="160px" className="object-contain" />
                          ) : (
                            <div className="flex h-full items-center justify-center text-xs text-muted">Photo</div>
                          )}
                        </div>
                        <div>
                          <div className="text-xs font-medium text-foreground truncate">{item.name}</div>
                          <div className="text-[11px] text-muted capitalize">{humanise(item.category)}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Styling Tip if present */}
              {activeOutfit.stylingTip && (
                <div className="rounded-xl border border-warning/40 bg-warning-soft/80 p-4 space-y-1">
                  <div className="text-xs font-bold text-warning">💡 Styling Tip</div>
                  <p className="text-xs font-medium text-foreground leading-relaxed">{activeOutfit.stylingTip}</p>
                </div>
              )}
            </Card>
          ) : (
            <Card className="flex flex-col items-center justify-center p-12 text-center border-dashed border-border bg-surface-muted/30 rounded-2xl space-y-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface border border-border text-muted">
                <Shirt className="h-6 w-6" />
              </div>
              <div className="space-y-1 max-w-sm">
                <h3 className="font-serif text-lg font-medium text-foreground">
                  No Outfit Planned for this Day
                </h3>
                <p className="text-xs text-muted leading-relaxed">
                  Assign one of your saved outfits or ask the AI Stylist to generate a look for this date.
                </p>
              </div>
              <div className="flex items-center gap-3 pt-2">
                <Button onClick={() => setAssignModalOpen(true)} className="gap-2 rounded-xl text-xs">
                  <Plus className="h-4 w-4" />
                  Assign Saved Outfit
                </Button>
                <Button asChild variant="outline" className="rounded-xl text-xs">
                  <Link href="/stylist">
                    <Sparkles className="h-4 w-4 mr-1.5" />
                    Ask Stylist
                  </Link>
                </Button>
              </div>
            </Card>
          )}
        </div>

        {/* Quick Assign Panel (Saved Outfits Library) */}
        <div className="lg:col-span-4 space-y-4">
          <Card className="p-5 border-border bg-surface space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-serif text-base font-medium text-foreground">Saved Outfits</h3>
              <span className="text-xs text-muted">{savedOutfits.length} looks</span>
            </div>

            {savedOutfits.length === 0 ? (
              <div className="text-center py-6 text-xs text-muted">
                You haven&apos;t saved any outfits yet. Head to the Stylist or Studio to save some looks!
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[480px] overflow-y-auto pr-1">
                {savedOutfits.map((outfit) => {
                  const coverImage = outfit.photoPath
                    ? imageUrls[outfit.photoPath]
                    : outfit.items[0]?.imagePath
                      ? imageUrls[outfit.items[0].imagePath]
                      : null;

                  return (
                    <div
                      key={outfit.id}
                      className="flex items-center justify-between p-2.5 rounded-xl border border-border hover:border-border-strong bg-surface transition-all"
                    >
                      <div className="flex items-center gap-3">
                        <div className="relative h-12 w-12 rounded-lg overflow-hidden bg-surface-muted border border-border/50 shrink-0">
                          {coverImage && (
                            <Image src={coverImage} alt="" fill sizes="48px" className="object-cover" />
                          )}
                        </div>
                        <div>
                          <div className="text-xs font-medium text-foreground">{outfit.name}</div>
                          <div className="text-[11px] text-muted">{outfit.items.length} garments</div>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => handleAssignOutfit(outfit.id)}
                        className="h-8 px-2 text-xs text-accent hover:bg-accent-soft rounded-lg"
                      >
                        Plan Look
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Modal / Sheet for Picking Outfit */}
      {assignModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <Card className="w-full max-w-lg p-6 bg-surface border-border space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="font-serif text-lg font-medium text-foreground">
                Assign Outfit for {selectedDate}
              </h3>
              <button
                type="button"
                onClick={() => setAssignModalOpen(false)}
                className="text-xs text-muted hover:text-foreground"
              >
                Cancel
              </button>
            </div>
            <div className="space-y-2 max-h-[360px] overflow-y-auto pr-1">
              {savedOutfits.map((outfit) => (
                <div
                  key={outfit.id}
                  onClick={() => handleAssignOutfit(outfit.id)}
                  className="flex items-center justify-between p-3 rounded-xl border border-border hover:border-accent hover:bg-surface-muted cursor-pointer transition-colors"
                >
                  <div className="space-y-0.5">
                    <div className="text-xs font-medium text-foreground">{outfit.name}</div>
                    <div className="text-[11px] text-muted">
                      {outfit.items.map((i) => i.name).join(", ")}
                    </div>
                  </div>
                  <Button size="sm" variant="outline" className="text-xs rounded-lg">
                    Select
                  </Button>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}

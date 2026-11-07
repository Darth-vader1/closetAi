"use client";

import { useMemo, useState } from "react";
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
  Sunrise,
  Sun,
  Moon,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  wearOutfitTodayAction,
  planOutfitAction,
  logCustomOutfitOnCalendarAction,
  removeOutfitPlanAction,
} from "@/app/(app)/stylist/actions";
import type { OutfitWithItems, PlannedOutfitRow } from "@/lib/outfits/queries";
import {
  OUTFIT_TIME_OF_DAY_SLOTS,
  TIME_OF_DAY_META,
  getDayPlansBySlot,
  upsertCalendarSlotPlan,
  type OutfitTimeOfDay,
} from "@/lib/outfits/calendar-slots";
import type { WardrobeItem } from "@/lib/wardrobe/queries";
import { humanise } from "@/lib/wardrobe/categories";
import { formatLocalDate } from "@/lib/utils/format";

interface CalendarClientProps {
  initialPlans: PlannedOutfitRow[];
  savedOutfits: OutfitWithItems[];
  wardrobeItems?: WardrobeItem[];
  imageUrls: Record<string, string>;
  initialDate?: string;
}

function SlotIcon({ slot, className = "h-3.5 w-3.5" }: { slot: OutfitTimeOfDay; className?: string }) {
  if (slot === "MORNING") return <Sunrise className={className} />;
  if (slot === "AFTERNOON") return <Sun className={className} />;
  return <Moon className={className} />;
}

export function CalendarClient({
  initialPlans,
  savedOutfits: initialSavedOutfits,
  wardrobeItems = [],
  imageUrls,
  initialDate,
}: CalendarClientProps) {
  const [plans, setPlans] = useState<PlannedOutfitRow[]>(initialPlans);
  const [savedOutfits, setSavedOutfits] = useState<OutfitWithItems[]>(initialSavedOutfits);
  const [selectedDate, setSelectedDate] = useState<string>(() => {
    return initialDate && /^\d{4}-\d{2}-\d{2}$/.test(initialDate)
      ? initialDate
      : formatLocalDate(new Date());
  });
  const [selectedSlot, setSelectedSlot] = useState<OutfitTimeOfDay>(() => {
    const startDate =
      initialDate && /^\d{4}-\d{2}-\d{2}$/.test(initialDate)
        ? initialDate
        : formatLocalDate(new Date());
    const initialSlots = getDayPlansBySlot(initialPlans, startDate);
    return initialSlots.ordered[0]?.timeOfDay ?? "MORNING";
  });
  const [currentWeekStart, setCurrentWeekStart] = useState<Date>(() => {
    const d =
      initialDate && /^\d{4}-\d{2}-\d{2}$/.test(initialDate)
        ? new Date(`${initialDate}T12:00:00`)
        : new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
    return new Date(d.getFullYear(), d.getMonth(), diff, 12, 0, 0);
  });

  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [modalIntent, setModalIntent] = useState<"WORN" | "PLANNED">("WORN");
  const [modalTab, setModalTab] = useState<"saved" | "wardrobe">("saved");
  const [customOutfitName, setCustomOutfitName] = useState("");
  const [customItemIds, setCustomItemIds] = useState<string[]>([]);
  const [categoryFilter, setCategoryFilter] = useState<string>("ALL");

  const [busySlotAction, setBusySlotAction] = useState<string | null>(null);
  const [feedbackBanner, setFeedbackBanner] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const todayStr = formatLocalDate(new Date());

  const showNotice = (type: "success" | "error", message: string) => {
    setFeedbackBanner({ type, message });
    setTimeout(() => {
      setFeedbackBanner((prev) => (prev?.message === message ? null : prev));
    }, 4000);
  };

  // Generate 7 days of the week starting from currentWeekStart (noon-anchored to prevent timezone shifts)
  const weekDays = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const day = new Date(
        currentWeekStart.getFullYear(),
        currentWeekStart.getMonth(),
        currentWeekStart.getDate() + i,
        12,
        0,
        0,
      );
      const dateStr = formatLocalDate(day);
      const isToday = dateStr === todayStr;
      const isSelected = dateStr === selectedDate;
      const daySlots = getDayPlansBySlot(plans, dateStr);
      return { date: day, dateStr, isToday, isSelected, daySlots };
    });
  }, [currentWeekStart, plans, selectedDate, todayStr]);

  const nextWeek = () => {
    setCurrentWeekStart((prev) => {
      return new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() + 7, 12, 0, 0);
    });
  };

  const prevWeek = () => {
    setCurrentWeekStart((prev) => {
      return new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() - 7, 12, 0, 0);
    });
  };

  const selectedDaySlots = useMemo(
    () => getDayPlansBySlot(plans, selectedDate),
    [plans, selectedDate],
  );

  const activePlan = selectedDaySlots[selectedSlot];
  const activeOutfit = activePlan?.outfit;
  const activeSlotMeta = TIME_OF_DAY_META[selectedSlot];

  const availableCategories = useMemo(() => {
    const cats = new Set<string>();
    for (const item of wardrobeItems) {
      if (item.category) cats.add(item.category);
    }
    return ["ALL", ...Array.from(cats)];
  }, [wardrobeItems]);

  const filteredWardrobeItems = useMemo(() => {
    if (categoryFilter === "ALL") return wardrobeItems;
    return wardrobeItems.filter((i) => i.category === categoryFilter);
  }, [wardrobeItems, categoryFilter]);

  const handleSelectDate = (dateStr: string) => {
    setSelectedDate(dateStr);
    const daySlots = getDayPlansBySlot(plans, dateStr);
    // Keep current slot if occupied, otherwise focus the first occupied slot or MORNING
    if (!daySlots[selectedSlot] && daySlots.ordered.length > 0) {
      setSelectedSlot(daySlots.ordered[0].timeOfDay);
    }
  };

  const openModalForSlot = (
    slot: OutfitTimeOfDay,
    intent: "WORN" | "PLANNED",
    defaultTab?: "saved" | "wardrobe",
  ) => {
    setSelectedSlot(slot);
    setModalIntent(intent);
    setModalTab(
      defaultTab ?? (savedOutfits.length > 0 ? "saved" : "wardrobe"),
    );
    setCustomOutfitName("");
    setCustomItemIds([]);
    setAssignModalOpen(true);
  };

  const handleConfirmWearPlan = async (plan: PlannedOutfitRow) => {
    const key = `wear-${plan.plannedFor}-${plan.timeOfDay}`;
    setBusySlotAction(key);
    try {
      const res = await wearOutfitTodayAction({
        outfitId: plan.outfit.id,
        itemIds: plan.outfit.items.map((i) => i.id),
        planId: plan.id,
        date: plan.plannedFor,
        timeOfDay: plan.timeOfDay,
      });
      if (res.ok) {
        const updatedPlan: PlannedOutfitRow = {
          ...plan,
          id: res.planId ?? plan.id,
          status: "WORN",
          wornAt: new Date().toISOString(),
        };
        setPlans((prev) => upsertCalendarSlotPlan(prev, updatedPlan));
        showNotice(
          "success",
          `Marked "${plan.outfit.name}" as worn for ${TIME_OF_DAY_META[plan.timeOfDay].label}.`,
        );
      } else {
        showNotice("error", res.error || "Could not mark outfit as worn.");
      }
    } catch {
      showNotice("error", "Error marking outfit as worn.");
    } finally {
      setBusySlotAction(null);
    }
  };

  const handleAssignSavedOutfit = async (
    outfitId: string,
    intent: "WORN" | "PLANNED" = modalIntent,
    targetSlot: OutfitTimeOfDay = selectedSlot,
  ) => {
    const outfit = savedOutfits.find((o) => o.id === outfitId);
    if (!outfit) return;

    const key = `${intent}-${outfitId}-${targetSlot}`;
    setBusySlotAction(key);

    try {
      if (intent === "WORN") {
        const existingSlotPlan = selectedDaySlots[targetSlot];
        const res = await wearOutfitTodayAction({
          outfitId,
          itemIds: outfit.items.map((i) => i.id),
          planId: existingSlotPlan?.id,
          date: selectedDate,
          timeOfDay: targetSlot,
        });

        if (res.ok) {
          const newPlan: PlannedOutfitRow = {
            id: res.planId ?? `worn-${outfit.id}-${selectedDate}-${targetSlot}`,
            userId: outfit.userId,
            outfitId: outfit.id,
            plannedFor: selectedDate,
            timeOfDay: targetSlot,
            status: "WORN",
            wornAt: new Date().toISOString(),
            outfit,
          };
          setPlans((prev) => upsertCalendarSlotPlan(prev, newPlan));
          setSelectedSlot(targetSlot);
          setAssignModalOpen(false);
          showNotice(
            "success",
            `Logged "${outfit.name}" as worn for ${TIME_OF_DAY_META[targetSlot].label} (${selectedDate}).`,
          );
        } else {
          showNotice("error", res.error || "Could not log outfit as worn.");
        }
      } else {
        const res = await planOutfitAction({
          outfitId,
          date: selectedDate,
          timeOfDay: targetSlot,
        });

        if (res.ok) {
          const newPlan: PlannedOutfitRow = {
            id: res.planId,
            userId: outfit.userId,
            outfitId: outfit.id,
            plannedFor: selectedDate,
            timeOfDay: targetSlot,
            status: "PLANNED",
            outfit,
          };
          setPlans((prev) => upsertCalendarSlotPlan(prev, newPlan));
          setSelectedSlot(targetSlot);
          setAssignModalOpen(false);
          showNotice(
            "success",
            `Planned "${outfit.name}" for ${TIME_OF_DAY_META[targetSlot].label} (${selectedDate}).`,
          );
        } else {
          showNotice("error", res.error || "Could not schedule outfit.");
        }
      }
    } catch {
      showNotice("error", "Something went wrong while updating your calendar.");
    } finally {
      setBusySlotAction(null);
    }
  };

  const handleLogCustomWardrobeOutfit = async (intent: "WORN" | "PLANNED" = modalIntent) => {
    if (customItemIds.length === 0) {
      showNotice("error", "Select at least 1 garment from your wardrobe.");
      return;
    }

    const key = `custom-${intent}-${selectedSlot}`;
    setBusySlotAction(key);
    try {
      const res = await logCustomOutfitOnCalendarAction({
        name: customOutfitName.trim() || undefined,
        itemIds: customItemIds,
        occasion: TIME_OF_DAY_META[selectedSlot].label,
        date: selectedDate,
        timeOfDay: selectedSlot,
        intent,
      });

      if (res.ok) {
        setPlans((prev) => upsertCalendarSlotPlan(prev, res.plan));
        setSavedOutfits((prev) => [res.plan.outfit, ...prev]);
        setCustomOutfitName("");
        setCustomItemIds([]);
        setAssignModalOpen(false);
        showNotice(
          "success",
          intent === "WORN"
            ? `Logged "${res.plan.outfit.name}" as worn for ${TIME_OF_DAY_META[selectedSlot].label}.`
            : `Planned "${res.plan.outfit.name}" for ${TIME_OF_DAY_META[selectedSlot].label}.`,
        );
      } else {
        showNotice("error", res.error || "Could not save custom outfit.");
      }
    } catch {
      showNotice("error", "Error saving custom outfit.");
    } finally {
      setBusySlotAction(null);
    }
  };

  const handleRemovePlan = async (plan: PlannedOutfitRow) => {
    const key = `remove-${plan.id}`;
    setBusySlotAction(key);
    try {
      const res = await removeOutfitPlanAction({ planId: plan.id });
      if (res.ok) {
        setPlans((prev) =>
          prev.filter(
            (p) =>
              p.id !== plan.id &&
              !(p.plannedFor === plan.plannedFor && p.timeOfDay === plan.timeOfDay),
          ),
        );
        showNotice(
          "success",
          `Cleared ${TIME_OF_DAY_META[plan.timeOfDay].label} slot on ${plan.plannedFor}.`,
        );
      } else {
        showNotice("error", res.error || "Could not remove outfit from slot.");
      }
    } catch {
      showNotice("error", "Could not remove outfit from slot.");
    } finally {
      setBusySlotAction(null);
    }
  };

  const toggleCustomItem = (itemId: string) => {
    setCustomItemIds((prev) =>
      prev.includes(itemId)
        ? prev.filter((id) => id !== itemId)
        : prev.length < 10
          ? [...prev, itemId]
          : prev,
    );
  };

  const formattedSelectedDate = new Date(`${selectedDate}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  return (
    <div className="space-y-8">
      {/* Feedback Toast Banner */}
      {feedbackBanner && (
        <div
          role="status"
          className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-xs font-medium transition-all ${
            feedbackBanner.type === "success"
              ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
              : "border-danger/30 bg-danger/10 text-danger"
          }`}
        >
          <div className="flex items-center gap-2">
            {feedbackBanner.type === "success" ? (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            ) : (
              <Clock className="h-4 w-4 shrink-0" />
            )}
            <span>{feedbackBanner.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedbackBanner(null)}
            className="text-current/70 hover:text-current"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Week Navigator */}
      <Card className="p-6 border-border bg-surface-muted/40 backdrop-blur-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent-soft text-accent">
              <CalendarIcon className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-serif text-xl font-medium tracking-tight text-foreground">
                Outfit Schedule & Wear Log
              </h2>
              <p className="text-xs text-muted">
                Plan ahead or log what you wore across Morning, Afternoon, and Evening slots.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 rounded-lg border border-border bg-surface p-1 self-start sm:self-auto">
            <button
              type="button"
              onClick={prevWeek}
              aria-label="Previous week"
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
                const monday = new Date(today.getFullYear(), today.getMonth(), diff, 12, 0, 0);
                setCurrentWeekStart(monday);
                handleSelectDate(formatLocalDate(today));
              }}
              className="px-3 py-1 text-xs font-medium text-foreground hover:bg-surface-muted rounded-md transition-colors"
            >
              Today
            </button>
            <button
              type="button"
              onClick={nextWeek}
              aria-label="Next week"
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
            const primaryPlan =
              d.daySlots[selectedSlot] ?? d.daySlots.ordered[0] ?? null;
            const coverImage = primaryPlan?.outfit.photoPath
              ? imageUrls[primaryPlan.outfit.photoPath]
              : primaryPlan?.outfit.items[0]?.imagePath
                ? imageUrls[primaryPlan.outfit.items[0].imagePath]
                : null;

            return (
              <button
                key={d.dateStr}
                type="button"
                onClick={() => handleSelectDate(d.dateStr)}
                className={`relative flex flex-col justify-between rounded-xl p-3 text-left transition-all border ${
                  d.isSelected
                    ? "border-accent bg-surface ring-2 ring-accent/20 shadow-sm"
                    : "border-border bg-surface/70 hover:bg-surface hover:border-border-strong"
                }`}
              >
                <div className="flex items-center justify-between w-full mb-2">
                  <span className="text-xs font-semibold text-muted uppercase tracking-wider">
                    {dayName}
                  </span>
                  <span
                    className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                      d.isToday ? "bg-accent text-accent-foreground" : "text-foreground"
                    }`}
                  >
                    {dayNum}
                  </span>
                </div>

                {primaryPlan ? (
                  <div className="space-y-1.5 w-full">
                    {coverImage && (
                      <div className="relative aspect-[4/3] w-full rounded-lg overflow-hidden bg-surface-muted border border-border/50">
                        <Image
                          src={coverImage}
                          alt=""
                          fill
                          sizes="100px"
                          unoptimized
                          className="object-cover"
                        />
                        {d.daySlots.wornCount > 0 && (
                          <span className="absolute top-1 right-1 flex h-4 w-4 items-center justify-center rounded-full bg-emerald-600 text-white shadow-xs">
                            <Check className="h-2.5 w-2.5" />
                          </span>
                        )}
                      </div>
                    )}
                    <div className="text-[11px] font-medium text-foreground truncate">
                      {primaryPlan.outfit.name}
                    </div>
                  </div>
                ) : (
                  <div className="flex h-12 items-center justify-center rounded-lg border border-dashed border-border/70 text-[11px] text-muted">
                    No looks
                  </div>
                )}

                {/* 3 Time-of-Day Slot Indicators (AM / PM / Eve) */}
                <div className="mt-2 grid grid-cols-3 gap-1 w-full pt-1.5 border-t border-border/60">
                  {OUTFIT_TIME_OF_DAY_SLOTS.map((slot) => {
                    const slotPlan = d.daySlots[slot];
                    const meta = TIME_OF_DAY_META[slot];
                    const isWorn = slotPlan?.status === "WORN";
                    const isPlanned = Boolean(slotPlan && slotPlan.status !== "WORN");
                    return (
                      <span
                        key={slot}
                        title={`${meta.label}: ${
                          isWorn
                            ? `Worn (${slotPlan?.outfit.name})`
                            : isPlanned
                              ? `Planned (${slotPlan?.outfit.name})`
                              : "Empty"
                        }`}
                        className={`flex items-center justify-center gap-0.5 rounded px-1 py-0.5 text-[9px] font-semibold tracking-tight ${
                          isWorn
                            ? "border border-emerald-600/25 bg-emerald-600/10 text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-500/15 dark:text-emerald-300"
                            : isPlanned
                              ? "bg-accent-soft text-accent border border-accent/25"
                              : "bg-surface-muted/60 text-muted/60"
                        }`}
                      >
                        {meta.shortLabel}
                        {isWorn && <Check className="h-2 w-2 shrink-0" />}
                      </span>
                    );
                  })}
                </div>
              </button>
            );
          })}
        </div>
      </Card>

      {/* Selected Day View + Quick Assign Sidebar */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        <div className="lg:col-span-8 space-y-4">
          {/* 3-Slot Selector Bar (Morning / Afternoon / Evening) */}
          <Card className="p-3 border-border bg-surface">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 mb-2.5 border-b border-border/60 px-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted">
                  {formattedSelectedDate}
                </span>
                <span className="text-[11px] text-muted">
                  · {selectedDaySlots.plannedCount}/3 slots filled
                  {selectedDaySlots.wornCount > 0
                    ? ` (${selectedDaySlots.wornCount} worn)`
                    : ""}
                </span>
              </div>
              <span className="text-[11px] text-muted">
                Select a time of day to plan or log what you wore
              </span>
            </div>

            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              {OUTFIT_TIME_OF_DAY_SLOTS.map((slot) => {
                const meta = TIME_OF_DAY_META[slot];
                const slotPlan = selectedDaySlots[slot];
                const isActive = selectedSlot === slot;
                const isWorn = slotPlan?.status === "WORN";

                return (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => setSelectedSlot(slot)}
                    className={`min-w-0 overflow-hidden flex flex-col items-start justify-between rounded-xl p-2.5 sm:p-3.5 text-left transition-all border ${
                      isActive
                        ? "border-accent bg-accent-soft/35 ring-2 ring-accent/20 shadow-2xs"
                        : "border-border bg-surface-muted/30 hover:bg-surface-muted/70"
                    }`}
                  >
                    <div className="flex items-center justify-between w-full gap-1.5">
                      <span
                        className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-lg border ${
                          isActive
                            ? "border-accent/30 bg-surface text-accent"
                            : "border-border/70 bg-surface/80 text-muted"
                        }`}
                      >
                        <SlotIcon slot={slot} className="h-3.5 w-3.5" />
                      </span>
                      {slotPlan ? (
                        <span
                          className={`inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 sm:px-2 py-0.5 text-[9.5px] sm:text-[10px] font-semibold tracking-tight border ${
                            isWorn
                              ? "border-emerald-600/25 bg-emerald-600/10 text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-500/15 dark:text-emerald-300"
                              : "border-accent/25 bg-accent-soft text-accent"
                          }`}
                        >
                          {isWorn ? (
                            <>
                              <Check className="h-2.5 w-2.5 stroke-[2.5]" />
                              <span>Worn</span>
                            </>
                          ) : (
                            <span>Planned</span>
                          )}
                        </span>
                      ) : (
                        <span className="shrink-0 rounded-full bg-surface-muted/80 px-1.5 sm:px-2 py-0.5 text-[9.5px] sm:text-[10px] font-medium text-muted">
                          Open
                        </span>
                      )}
                    </div>
                    <div className="mt-2 w-full">
                      <div className="truncate text-xs sm:text-[13px] font-semibold text-foreground">
                        {meta.label}
                      </div>
                      <div className="mt-0.5 w-full truncate text-[11px] text-muted">
                        {slotPlan ? slotPlan.outfit.name : meta.timeHint}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </Card>

          {/* Active Slot Detail Card */}
          {activeOutfit && activePlan ? (
            <Card className="p-5 sm:p-6 md:p-8 border-border bg-surface space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 border-b border-border pb-4">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 mb-2.5">
                    <div className="inline-flex items-center gap-1.5 rounded-full border border-accent/20 bg-accent-soft/70 px-3 py-1 text-[11px] font-semibold text-accent">
                      <SlotIcon slot={selectedSlot} className="h-3.5 w-3.5 shrink-0" />
                      <span>
                        {activeSlotMeta.label} · {formattedSelectedDate}
                      </span>
                    </div>
                    {activePlan.status === "WORN" ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-600/25 bg-emerald-600/10 px-2.5 py-1 text-[11px] font-semibold text-emerald-800 dark:border-emerald-400/30 dark:bg-emerald-500/15 dark:text-emerald-300">
                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />
                        <span>Logged as Worn</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-muted border border-border px-2.5 py-1 text-[11px] font-medium text-muted">
                        <Clock className="h-3 w-3 shrink-0" />
                        <span>Planned</span>
                      </span>
                    )}
                  </div>
                  <h3 className="font-serif text-xl sm:text-2xl font-medium tracking-tight text-foreground">
                    {activeOutfit.name}
                  </h3>
                  {activeOutfit.styleDescription && (
                    <p className="text-xs text-muted mt-1">{activeOutfit.styleDescription}</p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {activePlan.status !== "WORN" && (
                    <Button
                      onClick={() => handleConfirmWearPlan(activePlan)}
                      disabled={busySlotAction !== null}
                      loading={
                        busySlotAction === `wear-${activePlan.plannedFor}-${activePlan.timeOfDay}`
                      }
                      variant="primary"
                      className="gap-2 rounded-xl text-xs"
                    >
                      <Check className="h-4 w-4" />
                      Confirm Worn
                    </Button>
                  )}
                  <Button
                    onClick={() =>
                      openModalForSlot(
                        selectedSlot,
                        activePlan.status === "WORN" ? "WORN" : "PLANNED",
                      )
                    }
                    variant="outline"
                    className="rounded-xl text-xs"
                  >
                    Change {activeSlotMeta.label} Look
                  </Button>
                  <Button
                    onClick={() => handleRemovePlan(activePlan)}
                    disabled={busySlotAction !== null}
                    variant="outline"
                    aria-label="Remove outfit from slot"
                    title="Remove outfit from slot"
                    className="rounded-xl px-2.5 text-xs text-muted hover:border-danger/40 hover:bg-danger/10 hover:text-danger"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Garment Grid for Scheduled/Worn Look */}
              <div>
                <h4 className="text-xs font-semibold uppercase tracking-wider text-muted mb-3">
                  Garments in this {activeSlotMeta.label} Look ({activeOutfit.items.length})
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  {activeOutfit.items.map((item) => {
                    const url = imageUrls[item.imagePath];
                    return (
                      <div
                        key={item.id}
                        className="rounded-xl border border-border bg-surface-muted/40 p-2.5 space-y-2"
                      >
                        <div className="relative aspect-square w-full rounded-lg overflow-hidden bg-surface-muted border border-border/50">
                          {url ? (
                            <Image
                              src={url}
                              alt={item.name}
                              fill
                              sizes="160px"
                              unoptimized
                              className="object-contain"
                            />
                          ) : (
                            <div className="flex h-full items-center justify-center text-xs text-muted">
                              Photo
                            </div>
                          )}
                        </div>
                        <div>
                          <div className="text-xs font-medium text-foreground truncate">
                            {item.name}
                          </div>
                          <div className="text-[11px] text-muted capitalize">
                            {humanise(item.category)}
                          </div>
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
                  <p className="text-xs font-medium text-foreground leading-relaxed">
                    {activeOutfit.stylingTip}
                  </p>
                </div>
              )}
            </Card>
          ) : (
            <Card className="flex flex-col items-center justify-center p-10 md:p-12 text-center border-dashed border-border bg-surface-muted/30 rounded-2xl space-y-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-surface border border-border text-accent">
                <SlotIcon slot={selectedSlot} className="h-6 w-6" />
              </div>
              <div className="space-y-1 max-w-md">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-accent">
                  {activeSlotMeta.label} Slot ({activeSlotMeta.timeHint}) · {formattedSelectedDate}
                </div>
                <h3 className="font-serif text-lg font-medium text-foreground">
                  No Outfit Logged for {activeSlotMeta.label}
                </h3>
                <p className="text-xs text-muted leading-relaxed">
                  Directly log an outfit you wore this {activeSlotMeta.label.toLowerCase()}, schedule a
                  saved look ahead of time, or build a custom outfit from your wardrobe items.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2.5 pt-2">
                <Button
                  onClick={() => openModalForSlot(selectedSlot, "WORN")}
                  className="gap-2 rounded-xl text-xs"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  Log Worn ({activeSlotMeta.label})
                </Button>
                <Button
                  onClick={() => openModalForSlot(selectedSlot, "PLANNED")}
                  variant="outline"
                  className="gap-2 rounded-xl text-xs"
                >
                  <Plus className="h-4 w-4" />
                  Plan {activeSlotMeta.label} Outfit
                </Button>
                <Button asChild variant="ghost" className="rounded-xl text-xs">
                  <Link href="/stylist">
                    <Sparkles className="h-4 w-4 mr-1.5" />
                    Ask Stylist
                  </Link>
                </Button>
              </div>
            </Card>
          )}
        </div>

        {/* Quick Assign Panel (Saved Outfits Library + Build Custom) */}
        <div className="lg:col-span-4 space-y-4">
          <Card className="p-5 border-border bg-surface space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-serif text-base font-medium text-foreground">Saved Outfits</h3>
                <p className="text-[11px] text-muted">
                  Target:{" "}
                  <span className="font-semibold text-foreground">{activeSlotMeta.label}</span> on{" "}
                  {new Date(`${selectedDate}T12:00:00`).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                  })}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => openModalForSlot(selectedSlot, "WORN", "wardrobe")}
                className="h-8 px-2.5 text-xs rounded-lg gap-1"
              >
                <Shirt className="h-3.5 w-3.5" />
                Build Look
              </Button>
            </div>

            {/* Compact Slot Pill Switcher inside Sidebar */}
            <div className="grid grid-cols-3 gap-1.5 rounded-xl bg-surface-muted/60 p-1 border border-border/60">
              {OUTFIT_TIME_OF_DAY_SLOTS.map((slot) => {
                const meta = TIME_OF_DAY_META[slot];
                const isSelected = selectedSlot === slot;
                return (
                  <button
                    key={slot}
                    type="button"
                    onClick={() => setSelectedSlot(slot)}
                    className={`flex items-center justify-center gap-1 rounded-lg py-1.5 text-[11px] font-medium transition-all ${
                      isSelected
                        ? "bg-surface text-foreground shadow-xs border border-border"
                        : "text-muted hover:text-foreground"
                    }`}
                  >
                    <SlotIcon slot={slot} className="h-3 w-3" />
                    {meta.label}
                  </button>
                );
              })}
            </div>

            {savedOutfits.length === 0 ? (
              <div className="text-center py-6 space-y-3">
                <p className="text-xs text-muted">
                  You haven&apos;t saved any outfits yet. Build a look directly from your wardrobe
                  items or visit the AI Stylist!
                </p>
                <Button
                  size="sm"
                  onClick={() => openModalForSlot(selectedSlot, "WORN", "wardrobe")}
                  className="rounded-xl text-xs gap-1.5"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Log from Wardrobe Items
                </Button>
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
                      className="flex items-center justify-between gap-2 p-2.5 rounded-xl border border-border hover:border-border-strong bg-surface transition-all"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="relative h-12 w-12 rounded-lg overflow-hidden bg-surface-muted border border-border/50 shrink-0">
                          {coverImage && (
                            <Image
                              src={coverImage}
                              alt=""
                              fill
                              sizes="48px"
                              unoptimized
                              className="object-cover"
                            />
                          )}
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-foreground truncate">
                            {outfit.name}
                          </div>
                          <div className="text-[11px] text-muted">
                            {outfit.items.length} garments
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busySlotAction !== null}
                          onClick={() => handleAssignSavedOutfit(outfit.id, "WORN", selectedSlot)}
                          title={`Directly log "${outfit.name}" as worn for ${activeSlotMeta.label}`}
                          className="h-7 px-2 text-[11px] rounded-lg gap-1"
                        >
                          <Check className="h-3 w-3 text-emerald-600" />
                          Wear
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busySlotAction !== null}
                          onClick={() =>
                            handleAssignSavedOutfit(outfit.id, "PLANNED", selectedSlot)
                          }
                          title={`Plan "${outfit.name}" for ${activeSlotMeta.label}`}
                          className="h-7 px-2 text-[11px] text-accent hover:bg-accent-soft rounded-lg"
                        >
                          Plan
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </Card>
        </div>
      </div>

      {/* Modal / Sheet for Logging or Planning an Outfit */}
      {assignModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <Card className="w-full max-w-2xl p-6 bg-surface border-border space-y-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h3 className="font-serif text-lg font-medium text-foreground">
                  {modalIntent === "WORN" ? "Log Worn Outfit" : "Plan Outfit"} ·{" "}
                  {formattedSelectedDate}
                </h3>
                <p className="text-xs text-muted">
                  Choose a time of day and select a saved look or build one from your closet.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setAssignModalOpen(false)}
                className="text-xs text-muted hover:text-foreground"
              >
                Cancel
              </button>
            </div>

            {/* Slot + Intent Controls */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              {/* Time-of-Day Selector */}
              <div className="grid grid-cols-3 gap-1.5 rounded-xl bg-surface-muted p-1 border border-border flex-1">
                {OUTFIT_TIME_OF_DAY_SLOTS.map((slot) => {
                  const meta = TIME_OF_DAY_META[slot];
                  const active = selectedSlot === slot;
                  return (
                    <button
                      key={slot}
                      type="button"
                      onClick={() => setSelectedSlot(slot)}
                      className={`flex items-center justify-center gap-1.5 rounded-lg py-1.5 px-2 text-xs font-medium transition-all ${
                        active
                          ? "bg-surface text-foreground shadow-xs border border-border"
                          : "text-muted hover:text-foreground"
                      }`}
                    >
                      <SlotIcon slot={slot} className="h-3.5 w-3.5 text-accent" />
                      {meta.label}
                    </button>
                  );
                })}
              </div>

              {/* Intent Toggle (Log Worn vs Plan) */}
              <div className="grid grid-cols-2 gap-1 rounded-xl bg-surface-muted p-1 border border-border">
                <button
                  type="button"
                  onClick={() => setModalIntent("WORN")}
                  className={`flex items-center justify-center gap-1 rounded-lg py-1.5 px-3 text-xs font-medium transition-all ${
                    modalIntent === "WORN"
                      ? "bg-emerald-600 text-white shadow-xs"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  <Check className="h-3.5 w-3.5" />
                  Log Worn
                </button>
                <button
                  type="button"
                  onClick={() => setModalIntent("PLANNED")}
                  className={`flex items-center justify-center gap-1 rounded-lg py-1.5 px-3 text-xs font-medium transition-all ${
                    modalIntent === "PLANNED"
                      ? "bg-accent text-accent-foreground shadow-xs"
                      : "text-muted hover:text-foreground"
                  }`}
                >
                  <Clock className="h-3.5 w-3.5" />
                  Plan Ahead
                </button>
              </div>
            </div>

            {/* Source Tabs: Saved Outfits vs Build from Wardrobe */}
            <div className="flex items-center gap-2 border-b border-border">
              <button
                type="button"
                onClick={() => setModalTab("saved")}
                className={`pb-2.5 px-1 text-xs font-semibold border-b-2 transition-colors ${
                  modalTab === "saved"
                    ? "border-accent text-foreground"
                    : "border-transparent text-muted hover:text-foreground"
                }`}
              >
                Saved Outfits ({savedOutfits.length})
              </button>
              <button
                type="button"
                onClick={() => setModalTab("wardrobe")}
                className={`pb-2.5 px-1 text-xs font-semibold border-b-2 transition-colors ${
                  modalTab === "wardrobe"
                    ? "border-accent text-foreground"
                    : "border-transparent text-muted hover:text-foreground"
                }`}
              >
                Build from Wardrobe ({wardrobeItems.length})
              </button>
            </div>

            {/* Tab Content */}
            {modalTab === "saved" ? (
              <div className="space-y-2 overflow-y-auto pr-1 flex-1 min-h-[240px] max-h-[380px]">
                {savedOutfits.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-center space-y-3">
                    <p className="text-xs text-muted">
                      No saved outfits yet. Switch to &ldquo;Build from Wardrobe&rdquo; to pick
                      individual garments you wore!
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setModalTab("wardrobe")}
                      className="rounded-xl text-xs"
                    >
                      Build from Wardrobe
                    </Button>
                  </div>
                ) : (
                  savedOutfits.map((outfit) => {
                    const coverImage = outfit.photoPath
                      ? imageUrls[outfit.photoPath]
                      : outfit.items[0]?.imagePath
                        ? imageUrls[outfit.items[0].imagePath]
                        : null;

                    return (
                      <div
                        key={outfit.id}
                        className="flex items-center justify-between gap-3 p-3 rounded-xl border border-border hover:border-accent/60 hover:bg-surface-muted/50 transition-colors"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="relative h-12 w-12 rounded-lg overflow-hidden bg-surface-muted border border-border/50 shrink-0">
                            {coverImage && (
                              <Image
                                src={coverImage}
                                alt=""
                                fill
                                sizes="48px"
                                className="object-cover"
                              />
                            )}
                          </div>
                          <div className="space-y-0.5 min-w-0">
                            <div className="text-xs font-medium text-foreground truncate">
                              {outfit.name}
                            </div>
                            <div className="text-[11px] text-muted truncate">
                              {outfit.items.map((i) => i.name).join(", ")}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Button
                            size="sm"
                            variant={modalIntent === "WORN" ? "primary" : "outline"}
                            disabled={busySlotAction !== null}
                            onClick={() =>
                              handleAssignSavedOutfit(outfit.id, modalIntent, selectedSlot)
                            }
                            className="text-xs rounded-lg gap-1"
                          >
                            {modalIntent === "WORN" ? (
                              <>
                                <Check className="h-3.5 w-3.5" />
                                Log Worn
                              </>
                            ) : (
                              <>
                                <Plus className="h-3.5 w-3.5" />
                                Plan
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            ) : (
              <div className="space-y-3 overflow-y-auto pr-1 flex-1 min-h-[260px] max-h-[420px]">
                <div className="flex flex-col sm:flex-row gap-2">
                  <input
                    type="text"
                    value={customOutfitName}
                    onChange={(e) => setCustomOutfitName(e.target.value)}
                    placeholder={`Optional name (e.g., ${activeSlotMeta.label} Office Look)`}
                    className="flex-1 rounded-xl border border-border bg-surface-muted/40 px-3 py-2 text-xs text-foreground placeholder:text-muted focus:border-accent focus:outline-none"
                  />
                  <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
                    {availableCategories.map((cat) => (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => setCategoryFilter(cat)}
                        className={`rounded-lg px-2.5 py-1.5 text-[11px] font-medium whitespace-nowrap transition-colors ${
                          categoryFilter === cat
                            ? "bg-accent text-accent-foreground"
                            : "bg-surface-muted text-muted hover:text-foreground"
                        }`}
                      >
                        {cat === "ALL" ? "All" : humanise(cat)}
                      </button>
                    ))}
                  </div>
                </div>

                {wardrobeItems.length === 0 ? (
                  <div className="py-10 text-center text-xs text-muted">
                    Your wardrobe is empty. Add garments in the Wardrobe tab first!
                  </div>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5">
                    {filteredWardrobeItems.map((item) => {
                      const isSelected = customItemIds.includes(item.id);
                      const url = imageUrls[item.imagePath];
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => toggleCustomItem(item.id)}
                          className={`group relative flex flex-col rounded-xl border p-2 text-left transition-all ${
                            isSelected
                              ? "border-accent bg-accent-soft/30 ring-2 ring-accent/20"
                              : "border-border bg-surface hover:border-border-strong"
                          }`}
                        >
                          <div className="relative aspect-square w-full rounded-lg overflow-hidden bg-surface-muted mb-1.5">
                            {url ? (
                              <Image
                                src={url}
                                alt={item.name}
                                fill
                                sizes="120px"
                                unoptimized
                                className="object-contain"
                              />
                            ) : (
                              <div className="flex h-full items-center justify-center text-[10px] text-muted">
                                No photo
                              </div>
                            )}
                            {isSelected && (
                              <span className="absolute top-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-accent text-accent-foreground shadow-xs">
                                <Check className="h-3 w-3" />
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] font-medium text-foreground truncate w-full">
                            {item.name}
                          </div>
                          <div className="text-[10px] text-muted capitalize truncate w-full">
                            {humanise(item.category)}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="flex items-center justify-between border-t border-border pt-3 sticky bottom-0 bg-surface">
                  <span className="text-xs text-muted">
                    {customItemIds.length} garment{customItemIds.length === 1 ? "" : "s"} selected
                  </span>
                  <div className="flex items-center gap-2">
                    <Button
                      size="sm"
                      variant={modalIntent === "WORN" ? "primary" : "outline"}
                      disabled={customItemIds.length === 0 || busySlotAction !== null}
                      loading={busySlotAction === `custom-${modalIntent}-${selectedSlot}`}
                      onClick={() => handleLogCustomWardrobeOutfit(modalIntent)}
                      className="rounded-xl text-xs gap-1.5"
                    >
                      {modalIntent === "WORN" ? (
                        <>
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Log {activeSlotMeta.label} Look as Worn
                        </>
                      ) : (
                        <>
                          <Plus className="h-3.5 w-3.5" />
                          Plan {activeSlotMeta.label} Look
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </Card>
        </div>
      )}
    </div>
  );
}

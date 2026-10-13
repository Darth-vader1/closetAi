"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import {
  CalendarDays,
  Check,
  CloudSun,
  GraduationCap,
  Briefcase,
  Home,
  Info,
  Loader2,
  Luggage,
  MapPin,
  MessageSquare,
  PartyPopper,
  Repeat,
  Shirt,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { humanise } from "@/lib/wardrobe/categories";
import {
  DAILY_PLAN_MAX_DAYS,
  DRESS_CODE_LABELS,
  MAX_DAYS,
  MAX_EVENTS,
  PURPOSE_LABELS,
  SEMESTER_DAYS,
  SUGGESTION_CATEGORIES,
  SUGGESTION_CATEGORY_LABELS,
  type DressCode,
  type Formality,
  type LaundryOption,
  type PackPurpose,
  type PackingPlanResponse,
  type PackingItem,
} from "@/lib/packing/schemas";

const PURPOSE_ICONS: Record<PackPurpose, LucideIcon> = {
  trip: Luggage,
  school: GraduationCap,
  work: Briefcase,
  event: PartyPopper,
  relocation: Home,
};

const PURPOSE_COPY: Record<PackPurpose, { heading: string; locationLabel: string; placeholder: string; button: string }> = {
  trip: { heading: "Where are you travelling to?", locationLabel: "Destination city", placeholder: "e.g. Paris, Abuja, Tokyo", button: "Build trip capsule" },
  school: { heading: "Packing for school or campus?", locationLabel: "Campus / School location", placeholder: "e.g. University of Ibadan, Ile-Ife", button: "Build school capsule" },
  work: { heading: "Starting work or an internship?", locationLabel: "Work city", placeholder: "e.g. Lagos, London", button: "Build work capsule" },
  event: { heading: "What's the occasion?", locationLabel: "Event city / venue town", placeholder: "e.g. Ibadan, Accra", button: "Build event capsule" },
  relocation: { heading: "Moving or staying a while?", locationLabel: "New city or town", placeholder: "e.g. Manchester, Abuja", button: "Build long-stay capsule" },
};

const DRESS_CODE_OPTIONS: Record<"school" | "work", DressCode[]> = {
  school: ["casual", "uniform_days", "formal_days", "mixed"],
  work: ["casual", "smart_casual", "business", "mixed"],
};

const TRIP_VIBES = [
  "City Break & Sightseeing",
  "Business & Meetings",
  "Beach & Warm Resort",
  "Active & Outdoor Walking",
  "Visiting Family",
];

type QuickPick = { label: string; location: string; days?: number; apply?: Partial<FormState> };

const QUICK_PICKS: Record<PackPurpose, QuickPick[]> = {
  trip: [
    { label: "Paris, France", location: "Paris, France", apply: { tripType: "City Break & Sightseeing" } },
    { label: "London, UK", location: "London, UK", apply: { tripType: "City Break & Sightseeing" } },
    { label: "Abuja, Nigeria", location: "Abuja, Nigeria", apply: { tripType: "Business & Meetings" } },
    { label: "Accra, Ghana", location: "Accra, Ghana", apply: { tripType: "Beach & Warm Resort" } },
    { label: "New York, USA", location: "New York, USA", apply: { tripType: "City Break & Sightseeing" } },
    { label: "Dubai, UAE", location: "Dubai, UAE", apply: { tripType: "Beach & Warm Resort" } },
  ],
  school: [
    { label: "UNILAG · 1 semester", location: "University of Lagos", days: SEMESTER_DAYS, apply: { dressCode: "casual", laundry: "weekly" } },
    { label: "OAU Ile-Ife · 1 semester", location: "Ile-Ife, Nigeria", days: SEMESTER_DAYS, apply: { dressCode: "mixed", laundry: "weekly" } },
    { label: "UI Ibadan · 1 semester", location: "Ibadan, Nigeria", days: SEMESTER_DAYS, apply: { dressCode: "formal_days", laundry: "weekly" } },
    { label: "Thomas Adewumi University · 1 semester", location: "Oko, Kwara State, Nigeria", days: SEMESTER_DAYS, apply: { dressCode: "mixed", laundry: "weekly" } },
  ],
  work: [
    { label: "Lagos internship · 30 days", location: "Lagos, Nigeria", days: 30, apply: { dressCode: "smart_casual" } },
    { label: "London placement · 14 days", location: "London, UK", days: 14, apply: { dressCode: "business" } },
  ],
  event: [
    { label: "Owambe weekend", location: "Ibadan, Nigeria", days: 3, apply: { eventName: "Owambe party", formality: "traditional", eventCount: 1, photoDay: true } },
    { label: "Wedding (trad + white)", location: "Lagos, Nigeria", days: 3, apply: { eventName: "Wedding (traditional and white)", formality: "traditional", eventCount: 2, photoDay: true } },
    { label: "Graduation", location: "Ile-Ife, Nigeria", days: 2, apply: { eventName: "Graduation ceremony", formality: "formal", eventCount: 1, photoDay: true } },
    { label: "Conference", location: "Abuja, Nigeria", days: 3, apply: { eventName: "Conference", formality: "smart_casual", eventCount: 3, photoDay: false } },
  ],
  relocation: [
    { label: "Moving to Manchester · 30 days", location: "Manchester, UK", days: 30 },
    { label: "NYSC camp · 21 days", location: "Kubwa, Abuja", days: 21, apply: { laundry: "twice_weekly", notes: "NYSC orientation camp; white kits provided" } },
  ],
};

const DURATION_PRESETS: Array<{ label: string; days: number }> = [
  { label: "3 days", days: 3 },
  { label: "5 days", days: 5 },
  { label: "7 days", days: 7 },
  { label: "14 days", days: 14 },
  { label: "30 days", days: 30 },
  { label: "1 semester", days: SEMESTER_DAYS },
];

interface FormState {
  purpose: PackPurpose;
  location: string;
  days: number;
  startDate: string;
  laundry: LaundryOption;
  tripType: string;
  dressCode: DressCode;
  eventName: string;
  eventCount: number;
  eventDates: string[];
  formality: Formality;
  photoDay: boolean;
  notes: string;
}

function todayIso(): string {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

const inputClass =
  "w-full rounded-xl border border-input bg-background px-3 py-2.5 text-sm focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring";

export function PackingClient({ initialCleanCount }: { initialCleanCount: number }) {
  const [form, setForm] = useState<FormState>(() => ({
    purpose: "trip",
    location: "Paris, France",
    days: 5,
    startDate: todayIso(),
    laundry: "weekly",
    tripType: TRIP_VIBES[0],
    dressCode: "casual",
    eventName: "",
    eventCount: 1,
    eventDates: [],
    formality: "smart_casual",
    photoDay: false,
    notes: "",
  }));
  const [customDays, setCustomDays] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PackingPlanResponse | null>(null);
  const [packedIds, setPackedIds] = useState<Record<string, boolean>>({});
  const [checkedSuggestions, setCheckedSuggestions] = useState<Record<string, boolean>>({});

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm((f) => ({ ...f, [key]: value }));
  const copy = PURPOSE_COPY[form.purpose];
  const isRotation = form.days > DAILY_PLAN_MAX_DAYS;

  const selectPurpose = (purpose: PackPurpose) => {
    setForm((f) => ({
      ...f,
      purpose,
      location: QUICK_PICKS[purpose][0]?.location ?? f.location,
      days: purpose === "school" ? SEMESTER_DAYS : purpose === "event" ? 3 : purpose === "relocation" ? 30 : purpose === "work" ? 30 : 5,
      dressCode: purpose === "work" ? "smart_casual" : "casual",
    }));
    setCustomDays("");
  };

  const applyQuickPick = (pick: QuickPick) => {
    setForm((f) => ({ ...f, location: pick.location, ...(pick.days ? { days: pick.days } : {}), ...(pick.apply ?? {}) }));
    setCustomDays("");
  };

  const setCustom = (raw: string) => {
    setCustomDays(raw);
    const n = Number.parseInt(raw, 10);
    if (Number.isFinite(n)) update("days", Math.min(MAX_DAYS, Math.max(1, n)));
  };

  const handleGenerate = async () => {
    if (!form.location.trim() || loading) return;
    if (form.purpose === "event" && !form.eventName.trim()) {
      setError("Tell us what the event is (e.g. wedding, graduation).");
      return;
    }
    setLoading(true);
    setError(null);

    const payload: Record<string, unknown> = {
      purpose: form.purpose,
      location: form.location.trim(),
      days: form.days,
      startDate: form.startDate || undefined,
      laundry: form.laundry,
      notes: form.notes.trim() || undefined,
    };
    if (form.purpose === "trip") payload.tripType = form.tripType;
    if (form.purpose === "school" || form.purpose === "work") payload.dressCode = form.dressCode;
    if (form.purpose === "event") {
      payload.eventName = form.eventName.trim();
      payload.eventCount = form.eventCount;
      payload.eventDates = form.eventDates.filter(Boolean).slice(0, form.eventCount);
      payload.formality = form.formality;
      payload.photoDay = form.photoDay;
    }

    try {
      const res = await fetch("/api/ai/packing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not build your packing plan.");
      setResult(data as PackingPlanResponse);
      setPackedIds({});
      setCheckedSuggestions({});
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-8">
      <Card className="p-6 md:p-8 border-border bg-surface shadow-xs space-y-6">
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-accent font-semibold text-xs tracking-wider uppercase">
            <Luggage className="h-4 w-4" />
            <span>Pack for… · Capsule planner</span>
          </div>
          <h2 className="font-serif text-2xl md:text-3xl font-medium tracking-tight text-foreground">{copy.heading}</h2>
          <p className="text-xs text-muted">
            ClosetAI checks the weather, then packs an interchangeable capsule from your {initialCleanCount} clean pieces plus a “Don&apos;t forget” checklist.
          </p>
        </div>

        {/* 1. Purpose selector */}
        <div className="space-y-1.5">
          <span className="text-xs font-medium text-foreground">What are you packing for?</span>
          <div role="radiogroup" aria-label="Packing purpose" className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2">
            {(Object.keys(PURPOSE_LABELS) as PackPurpose[]).map((p) => {
              const Icon = PURPOSE_ICONS[p];
              const active = form.purpose === p;
              return (
                <button
                  key={p}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => selectPurpose(p)}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-xs font-semibold transition-colors ${
                    active ? "border-accent bg-accent-soft text-accent shadow-2xs" : "border-border text-muted hover:bg-surface-muted"
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{PURPOSE_LABELS[p]}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Location */}
          <div className="space-y-1.5">
            <label htmlFor="pack-location" className="text-xs font-medium text-foreground">{copy.locationLabel}</label>
            <div className="relative">
              <MapPin className="absolute left-3 top-3 h-4 w-4 text-muted" />
              <input
                id="pack-location"
                type="text"
                maxLength={80}
                value={form.location}
                onChange={(e) => update("location", e.target.value)}
                placeholder={copy.placeholder}
                className={`${inputClass} pl-9`}
              />
            </div>
            <p className="text-[11px] text-muted">Just the place name. It&apos;s used for the weather lookup.</p>
          </div>

          {/* Start date */}
          <div className="space-y-1.5">
            <label htmlFor="pack-start" className="text-xs font-medium text-foreground">
              {form.purpose === "school" ? "Resumption / term start" : "Start date"}
            </label>
            <div className="relative">
              <CalendarDays className="absolute left-3 top-3 h-4 w-4 text-muted" />
              <input
                id="pack-start"
                type="date"
                min={todayIso()}
                value={form.startDate}
                onChange={(e) => update("startDate", e.target.value)}
                className={`${inputClass} pl-9`}
              />
            </div>
          </div>
        </div>

        {/* 2. Duration */}
        <div className="space-y-1.5">
          <span className="text-xs font-medium text-foreground">
            {form.purpose === "school" ? "Term / semester length" : "How long?"}
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            {DURATION_PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => {
                  update("days", p.days);
                  setCustomDays("");
                }}
                className={`rounded-xl px-3.5 py-2 text-xs font-semibold border transition-colors ${
                  form.days === p.days && !customDays
                    ? "border-accent bg-accent-soft text-accent shadow-2xs"
                    : "border-border hover:bg-surface-muted text-muted"
                }`}
              >
                {p.label}
              </button>
            ))}
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={MAX_DAYS}
                value={customDays}
                onChange={(e) => setCustom(e.target.value)}
                placeholder="Custom"
                aria-label={`Custom number of days (1 to ${MAX_DAYS})`}
                className="w-24 rounded-xl border border-input bg-background px-3 py-2 text-xs focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-ring"
              />
              <span className="text-xs text-muted">days</span>
            </div>
          </div>
          <p className="text-[11px] text-muted">
            {form.days} day{form.days === 1 ? "" : "s"} selected (max {MAX_DAYS}).
            {isRotation ? " Longer than 14 days, so you'll get a repeating laundry-cycle rotation instead of one outfit per day." : ""}
          </p>
        </div>

        {/* Purpose-specific fields */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="pack-laundry" className="text-xs font-medium text-foreground">
              {form.purpose === "school" ? "Hostel laundry access" : "Laundry access"}
            </label>
            <select id="pack-laundry" value={form.laundry} onChange={(e) => update("laundry", e.target.value as LaundryOption)} className={inputClass}>
              <option value="weekly">{form.purpose === "school" ? "Yes, I can wash weekly" : "Weekly laundry"}</option>
              <option value="twice_weekly">{form.purpose === "school" ? "Yes, twice a week or more" : "Twice a week"}</option>
              <option value="none">{form.purpose === "school" ? "No hostel laundry (hand-wash)" : "No laundry access"}</option>
            </select>
          </div>

          {form.purpose === "trip" && (
            <div className="space-y-1.5">
              <label htmlFor="pack-vibe" className="text-xs font-medium text-foreground">Trip occasion / vibe</label>
              <select id="pack-vibe" value={form.tripType} onChange={(e) => update("tripType", e.target.value)} className={inputClass}>
                {TRIP_VIBES.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
            </div>
          )}

          {(form.purpose === "school" || form.purpose === "work") && (
            <div className="space-y-1.5">
              <label htmlFor="pack-dress" className="text-xs font-medium text-foreground">Dress code</label>
              <select id="pack-dress" value={form.dressCode} onChange={(e) => update("dressCode", e.target.value as DressCode)} className={inputClass}>
                {DRESS_CODE_OPTIONS[form.purpose].map((d) => (
                  <option key={d} value={d}>{DRESS_CODE_LABELS[d]}</option>
                ))}
              </select>
            </div>
          )}

          {form.purpose === "event" && (
            <>
              <div className="space-y-1.5">
                <label htmlFor="pack-event" className="text-xs font-medium text-foreground">Event name / type</label>
                <input
                  id="pack-event"
                  type="text"
                  maxLength={80}
                  value={form.eventName}
                  onChange={(e) => update("eventName", e.target.value)}
                  placeholder="e.g. Wedding, owambe, graduation, conference"
                  className={inputClass}
                />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="pack-formality" className="text-xs font-medium text-foreground">Formality</label>
                <select id="pack-formality" value={form.formality} onChange={(e) => update("formality", e.target.value as Formality)} className={inputClass}>
                  <option value="casual">Casual</option>
                  <option value="smart_casual">Smart casual</option>
                  <option value="formal">Formal</option>
                  <option value="traditional">Traditional / native attire</option>
                </select>
              </div>
              <div className="space-y-1.5">
                <label htmlFor="pack-event-count" className="text-xs font-medium text-foreground">Number of events</label>
                <input
                  id="pack-event-count"
                  type="number"
                  min={1}
                  max={MAX_EVENTS}
                  value={form.eventCount}
                  onChange={(e) => update("eventCount", Math.min(MAX_EVENTS, Math.max(1, Number.parseInt(e.target.value, 10) || 1)))}
                  className={inputClass}
                />
              </div>
              <div className="space-y-1.5">
                <span className="text-xs font-medium text-foreground">Event dates (optional)</span>
                <div className="flex flex-wrap gap-1.5">
                  {Array.from({ length: form.eventCount }, (_, i) => (
                    <input
                      key={i}
                      type="date"
                      aria-label={`Date of event ${i + 1}`}
                      min={form.startDate}
                      value={form.eventDates[i] ?? ""}
                      onChange={(e) => {
                        const next = [...form.eventDates];
                        next[i] = e.target.value;
                        update("eventDates", next);
                      }}
                      className="rounded-xl border border-input bg-background px-2.5 py-2 text-xs"
                    />
                  ))}
                </div>
              </div>
              <label className="md:col-span-2 inline-flex items-center gap-2 text-xs text-foreground cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.photoDay}
                  onChange={(e) => update("photoDay", e.target.checked)}
                  className="h-4 w-4 rounded border-border-strong accent-accent"
                />
                <span>Must look good on photos (photo day)</span>
              </label>
            </>
          )}

          <div className="space-y-1.5 md:col-span-2">
            <label htmlFor="pack-notes" className="text-xs font-medium text-foreground">Anything else? (optional)</label>
            <input
              id="pack-notes"
              type="text"
              maxLength={200}
              value={form.notes}
              onChange={(e) => update("notes", e.target.value)}
              placeholder="e.g. lots of walking, church on Sunday, carry-on only"
              className={inputClass}
            />
          </div>
        </div>

        {/* Quick picks */}
        <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-border/60">
          <span className="text-[11px] text-muted font-medium">Quick picks:</span>
          {QUICK_PICKS[form.purpose].map((pick) => (
            <button
              key={pick.label}
              type="button"
              onClick={() => applyQuickPick(pick)}
              className="rounded-lg border border-border/80 bg-surface-muted/50 hover:bg-surface-muted px-2.5 py-1 text-xs text-foreground transition-colors"
            >
              {pick.label}
            </button>
          ))}
        </div>

        <div className="pt-2">
          <Button
            onClick={handleGenerate}
            disabled={loading || !form.location.trim()}
            variant="primary"
            className="w-full sm:w-auto gap-2 rounded-xl h-11 px-8 text-sm"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Planning your capsule…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                {copy.button} ({form.days} day{form.days === 1 ? "" : "s"})
              </>
            )}
          </Button>
        </div>
      </Card>

      {error && (
        <div role="alert" className="rounded-xl border border-danger/20 bg-danger-soft p-4 text-xs text-danger">
          {error}
        </div>
      )}

      {result && (
        <PlanResult
          result={result}
          packedIds={packedIds}
          onTogglePacked={(id) => setPackedIds((p) => ({ ...p, [id]: !p[id] }))}
          checkedSuggestions={checkedSuggestions}
          onToggleSuggestion={(key) => setCheckedSuggestions((p) => ({ ...p, [key]: !p[key] }))}
        />
      )}
    </div>
  );
}

function PlanResult({
  result,
  packedIds,
  onTogglePacked,
  checkedSuggestions,
  onToggleSuggestion,
}: {
  result: PackingPlanResponse;
  packedIds: Record<string, boolean>;
  onTogglePacked: (id: string) => void;
  checkedSuggestions: Record<string, boolean>;
  onToggleSuggestion: (key: string) => void;
}) {
  const itemsById = useMemo(() => new Map(result.capsuleItems.map((i) => [i.id, i])), [result.capsuleItems]);
  const groupedSuggestions = useMemo(
    () =>
      SUGGESTION_CATEGORIES.map((cat) => ({ cat, items: result.suggestedItems.filter((s) => s.category === cat) })).filter(
        (g) => g.items.length > 0,
      ),
    [result.suggestedItems],
  );
  const { weather } = result;
  const packedCount = result.capsuleItems.filter((i) => packedIds[i.id]).length;
  const rotation = result.mode === "rotation";

  return (
    <div className="space-y-8 animate-in fade-in-50 duration-300">
      {/* Brief */}
      <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 rounded-2xl border border-accent/20 bg-accent-soft/40 p-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2 font-serif text-xl font-medium text-foreground">
            <MapPin className="h-5 w-5 text-accent" />
            <span>
              {weather.resolvedName ?? result.location} · {result.days}-day {PURPOSE_LABELS[result.purpose].toLowerCase()} plan
            </span>
          </div>
          <p className="text-xs text-muted max-w-xl">{result.capsuleRationale}</p>
          {result.notice && <p className="text-[11px] text-muted italic">{result.notice}</p>}
        </div>

        <div className="rounded-xl border border-border bg-surface px-4 py-3 text-xs text-foreground shrink-0 shadow-2xs space-y-2 lg:max-w-sm">
          <div className="font-semibold flex items-center gap-1.5">
            <CloudSun className="h-3.5 w-3.5 text-amber-500" />
            <span>Weather</span>
          </div>
          {weather.forecast.length > 0 && (
            <div>
              <div className="text-[11px] text-muted mb-1">Forecast ({weather.forecast.length} day{weather.forecast.length === 1 ? "" : "s"})</div>
              <div className="flex gap-1.5 overflow-x-auto pb-1">
                {weather.forecast.map((f) => (
                  <div key={f.date} className="shrink-0 rounded-lg border border-border px-2 py-1 text-center">
                    <div className="text-[10px] text-muted">
                      {new Date(`${f.date}T00:00:00Z`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", timeZone: "UTC" })}
                    </div>
                    <div className="text-[11px] font-semibold">{f.minC}–{f.maxC}°</div>
                    <div className="text-[10px] text-muted">{f.condition}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
          {weather.seasonal && (
            <div className="text-[11px] text-muted">
              <span className="font-medium text-foreground">Seasonal norms · {weather.seasonal.monthLabel}</span>
              {weather.seasonal.avgMaxC !== null ? (
                <>
                  {": "}~{weather.seasonal.avgMinC}–{weather.seasonal.avgMaxC}°C
                  {weather.seasonal.rainyDayShare !== null ? `, rain on ~${Math.round(weather.seasonal.rainyDayShare * 100)}% of days` : ""}
                  {" (based on last year's observations, not a forecast)"}
                </>
              ) : (
                " (typical climate for the region, not a forecast)"
              )}
            </div>
          )}
          {weather.notice && (
            <div className="flex items-start gap-1.5 text-[11px] text-amber-700 dark:text-amber-400">
              <Info className="h-3.5 w-3.5 shrink-0 mt-px" />
              <span>{weather.notice}</span>
            </div>
          )}
        </div>
      </div>

      {/* Capsule */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="font-serif text-xl font-medium text-foreground">Your capsule ({result.capsuleItems.length} pieces)</h3>
            <p className="text-xs text-muted">
              Tap items as you pack them. {rotation ? "Wear counts cover the whole stay." : "Wear counts show how often each piece is used."}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <a
              href={`https://wa.me/?text=${encodeURIComponent(
                `🧳 *My ${result.days}-day packing plan for ${weather.resolvedName ?? result.location}*\n\n` +
                  `📦 Capsule (${result.capsuleItems.length} items):\n` +
                  result.capsuleItems.map((i) => `• ${i.name}${result.wearsPerItem[i.id] ? ` ×${result.wearsPerItem[i.id]}` : ""}`).join("\n") +
                  (result.suggestedItems.length
                    ? `\n\n📝 Don't forget:\n${result.suggestedItems.filter((s) => s.priority === "essential").map((s) => `• ${s.name}`).join("\n")}`
                    : "") +
                  `\n\nPlanned with ClosetAI`,
              )}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400 transition-colors"
            >
              <MessageSquare className="h-3.5 w-3.5" />
              <span>Share</span>
            </a>
            <span className="text-xs bg-surface-muted border border-border px-3 py-1 rounded-full font-semibold text-foreground">
              {packedCount} of {result.capsuleItems.length} packed
            </span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {result.capsuleItems.map((item) => {
            const img = result.imageUrls[item.image_path];
            const isPacked = packedIds[item.id];
            const wears = result.wearsPerItem[item.id] ?? 0;
            return (
              <button
                key={item.id}
                type="button"
                aria-pressed={Boolean(isPacked)}
                onClick={() => onTogglePacked(item.id)}
                className={`relative rounded-xl border p-2 text-left transition-all group overflow-hidden ${
                  isPacked ? "border-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/20 shadow-xs" : "border-border bg-surface hover:border-accent/40"
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
                        isPacked ? "bg-emerald-600 border-emerald-600 text-white" : "border-border bg-surface/80 text-transparent group-hover:text-muted"
                      }`}
                    >
                      <Check className="h-3 w-3 stroke-[3]" />
                    </div>
                  </div>
                  {wears > 0 && (
                    <span className="absolute bottom-1.5 left-1.5 rounded-full bg-foreground/80 px-1.5 py-0.5 text-[10px] font-semibold text-background">
                      ×{wears} wear{wears === 1 ? "" : "s"}
                    </span>
                  )}
                </div>
                <div className="text-xs font-semibold text-foreground truncate">{item.name}</div>
                <div className="text-[10px] text-muted capitalize truncate">{humanise(item.category)}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Outfits */}
      <div className="space-y-4">
        <div>
          <h3 className="font-serif text-xl font-medium text-foreground flex items-center gap-2">
            {rotation && <Repeat className="h-5 w-5 text-accent" />}
            {rotation ? `Your ${result.cycleDays}-day rotation template` : "Day-by-day outfits"}
          </h3>
          <p className="text-xs text-muted">
            {rotation
              ? `Wear these ${result.outfits.length} looks, do laundry, then repeat — about ${result.repeats}× over your ${result.days}-day stay.`
              : "How to remix your capsule for each day."}
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {result.outfits.map((plan) => {
            const dayItems = plan.item_ids.map((id) => itemsById.get(id)).filter(Boolean) as PackingItem[];
            return (
              <Card key={plan.day} className="p-5 border-border bg-surface space-y-3 shadow-2xs">
                <div className="flex items-center gap-2 border-b border-border/60 pb-2 font-medium text-sm text-foreground">
                  <span className="flex size-6 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-contrast font-bold text-xs">{plan.day}</span>
                  <span>{plan.title}</span>
                </div>
                <div className="flex items-center gap-2 overflow-x-auto py-1">
                  {dayItems.map((item) => {
                    const img = result.imageUrls[item.image_path];
                    return (
                      <div key={item.id} className="relative size-14 shrink-0 rounded-lg border border-border bg-surface-muted overflow-hidden" title={item.name}>
                        {img ? <Image src={img} alt={item.name} fill sizes="56px" className="object-cover" /> : <Shirt className="m-auto size-4 text-muted" />}
                      </div>
                    );
                  })}
                </div>
                {plan.styling_tip && <p className="text-xs text-muted italic">💡 {plan.styling_tip}</p>}
              </Card>
            );
          })}
        </div>
      </div>

      {/* Don't forget */}
      {groupedSuggestions.length > 0 && (
        <Card className="p-6 border-border bg-surface space-y-4 shadow-2xs">
          <div>
            <h3 className="font-serif text-xl font-medium text-foreground">Don&apos;t forget</h3>
            <p className="text-xs text-muted">Things you might need that aren&apos;t in your wardrobe. Tick them off as you pack.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {groupedSuggestions.map(({ cat, items }) => (
              <div key={cat} className="space-y-2">
                <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted">{SUGGESTION_CATEGORY_LABELS[cat]}</h4>
                <ul className="space-y-1.5">
                  {items.map((s) => {
                    const key = `${cat}:${s.name}`;
                    const checked = Boolean(checkedSuggestions[key]);
                    return (
                      <li key={key}>
                        <label className="flex items-start gap-2.5 cursor-pointer rounded-lg px-2 py-1.5 hover:bg-surface-muted/60">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => onToggleSuggestion(key)}
                            className="mt-0.5 h-4 w-4 rounded border-border-strong accent-accent"
                          />
                          <span className="min-w-0">
                            <span className={`flex flex-wrap items-center gap-1.5 text-xs font-medium ${checked ? "line-through text-muted" : "text-foreground"}`}>
                              {s.name}
                              <span
                                className={`rounded-full px-1.5 py-px text-[10px] font-semibold ${
                                  s.priority === "essential"
                                    ? "bg-danger-soft text-danger"
                                    : s.priority === "recommended"
                                      ? "bg-accent-soft text-accent"
                                      : "bg-surface-muted text-muted"
                                }`}
                              >
                                {s.priority}
                              </span>
                              {s.alreadyOwned && (
                                <span className="rounded-full bg-emerald-500/10 px-1.5 py-px text-[10px] font-semibold text-emerald-700 dark:text-emerald-400">
                                  You own this
                                </span>
                              )}
                            </span>
                            {s.reason && <span className="block text-[11px] text-muted">{s.reason}</span>}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </Card>
      )}

      {result.packingTips.length > 0 && (
        <Card className="p-6 border-border bg-surface-muted/50 space-y-3 shadow-2xs">
          <div className="flex items-center gap-2 font-serif text-lg font-medium text-foreground">
            <Luggage className="h-4 w-4 text-accent" />
            <span>Packing tips</span>
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
  );
}

"use client";

import { useState, useMemo } from "react";
import { Search, X, AlertCircle, CheckCircle2, Shield } from "lucide-react";
import { Card } from "@/components/ui/card";
import type {
  AdminAiRecentEvent,
  AdminAiUserUsageRow,
} from "@/lib/admin/system-and-usage";
import {
  AI_METHOD_META,
  VISION_METHOD_KEYS,
  type AnyAiMethodKey,
  type VisionMethodKey,
} from "@/lib/ai/rate-limit";

interface AdminAiUsageClientProps {
  rows: AdminAiUserUsageRow[];
  recentEvents?: AdminAiRecentEvent[];
}

type FilterTab = "all" | "free" | "pro" | "exhausted";
type StreamFilter =
  | "all"
  | "single_scan"
  | "multi_detect"
  | "studio_beautify"
  | "stylist_chat";

const VISION_PILL_CLASSES: Record<VisionMethodKey, string> = {
  SINGLE_GARMENT_SCAN: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
  OOTD_EXTRACT: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-400",
  SCREENSHOT_DETECT: "bg-cyan-500/10 text-cyan-700 dark:text-cyan-400",
  FLATLAY_DETECT: "bg-teal-500/10 text-teal-700 dark:text-teal-400",
  BEAUTIFY_FLATLAY: "bg-rose-500/10 text-rose-700 dark:text-rose-400",
  BEAUTIFY_CUTOUT: "bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-400",
  BEAUTIFY_ENHANCE: "bg-violet-500/10 text-violet-700 dark:text-violet-400",
  VISION_LEGACY: "bg-slate-500/10 text-slate-700 dark:text-slate-300",
};

function getEventBadgeClass(methodKey: AnyAiMethodKey): string {
  if (methodKey in VISION_PILL_CLASSES) {
    return VISION_PILL_CLASSES[methodKey as VisionMethodKey];
  }
  const cat = AI_METHOD_META[methodKey]?.category;
  if (cat === "stylist") {
    return "bg-purple-500/10 text-purple-700 dark:text-purple-400";
  }
  if (cat === "photo") {
    return "bg-amber-500/10 text-amber-700 dark:text-amber-400";
  }
  return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
}

export function AdminAiUsageClient({
  rows,
  recentEvents = [],
}: AdminAiUsageClientProps) {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<FilterTab>("all");
  const [streamFilter, setStreamFilter] = useState<StreamFilter>("all");

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (tab === "free" && (r.isSubscribed || r.role !== "user")) return false;
      if (tab === "pro" && !r.isSubscribed) return false;
      if (tab === "exhausted" && !r.isQuotaExhausted) return false;

      if (!q) return true;
      return (
        (r.displayName && r.displayName.toLowerCase().includes(q)) ||
        (r.email && r.email.toLowerCase().includes(q)) ||
        r.planLabel.toLowerCase().includes(q)
      );
    });
  }, [rows, query, tab]);

  const streamCounts = useMemo(() => {
    let singleScan = 0;
    let multiDetect = 0;
    let studioBeautify = 0;
    let stylistChat = 0;
    for (const ev of recentEvents) {
      const cat = AI_METHOD_META[ev.methodKey]?.category;
      if (cat === "single_scan") singleScan++;
      else if (cat === "multi_detect") multiDetect++;
      else if (cat === "studio_beautify") studioBeautify++;
      else if (cat === "stylist" || cat === "chat" || cat === "photo") stylistChat++;
    }
    return {
      all: recentEvents.length,
      single_scan: singleScan,
      multi_detect: multiDetect,
      studio_beautify: studioBeautify,
      stylist_chat: stylistChat,
    };
  }, [recentEvents]);

  const filteredEvents = useMemo(() => {
    const matched =
      streamFilter === "all"
        ? recentEvents
        : recentEvents.filter((ev) => {
            const cat = AI_METHOD_META[ev.methodKey]?.category;
            if (streamFilter === "single_scan") return cat === "single_scan";
            if (streamFilter === "multi_detect") return cat === "multi_detect";
            if (streamFilter === "studio_beautify") return cat === "studio_beautify";
            return cat === "stylist" || cat === "chat" || cat === "photo";
          });
    return matched.slice(0, 25);
  }, [recentEvents, streamFilter]);

  const exhaustedCount = useMemo(
    () => rows.filter((r) => r.isQuotaExhausted).length,
    [rows],
  );

  return (
    <div className="space-y-6">
      <Card className="overflow-hidden border-border bg-surface">
        {/* Toolbar */}
        <div className="p-4 border-b border-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="font-serif text-base font-medium text-foreground">
              Per-User AI Consumption &amp; Quota Meters
            </h2>
            <p className="text-[11px] text-muted mt-0.5">
              30-day breakdown by exact image analysis method, Stylist, Chat &amp; Photo Gen plus live plan quotas.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                { id: "all", label: `All (${rows.length})` },
                { id: "free", label: "Free Tier" },
                { id: "pro", label: "Pro Members" },
                { id: "exhausted", label: `At Quota (${exhaustedCount})` },
              ] as const
            ).map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`rounded-xl px-3 py-1.5 text-xs font-medium transition-colors ${
                  tab === item.id
                    ? "bg-accent text-accent-contrast font-semibold"
                    : "bg-surface-muted/70 text-muted hover:text-foreground"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        {/* Search Input */}
        <div className="px-4 py-3 border-b border-border/60 bg-background/40">
          <div className="relative max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search member by name, email, or plan..."
              className="w-full rounded-xl border border-border bg-surface pl-8 pr-8 py-1.5 text-xs text-foreground placeholder:text-muted focus:border-accent focus:outline-hidden"
            />
            {query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted hover:text-foreground"
                title="Clear search"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="border-b border-border bg-surface-muted/40 text-muted uppercase text-[10px] tracking-wider font-semibold">
                <th className="py-3 px-4">Member</th>
                <th className="py-3 px-4">Plan</th>
                <th className="py-3 px-4">Volume (24h / 7d / 30d)</th>
                <th className="py-3 px-4">30d Breakdown by Method</th>
                <th className="py-3 px-4">Active Plan Quotas</th>
                <th className="py-3 px-4 text-right">Last AI Request</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {filteredRows.map((u) => {
                const isStaff = u.role === "admin" || u.role === "superadmin";
                const activeVisionMethods = VISION_METHOD_KEYS.filter(
                  (k) => (u.imageBreakdown30d?.[k] ?? 0) > 0,
                );
                return (
                  <tr key={u.userId} className="hover:bg-surface-muted/30 transition-colors">
                    {/* Member */}
                    <td className="py-3.5 px-4">
                      <div className="flex items-center gap-2.5">
                        <div className="size-8 rounded-full bg-accent-soft text-accent grid place-items-center font-serif text-xs font-semibold shrink-0">
                          {(u.displayName || u.email || "U")[0]?.toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="font-medium text-foreground truncate max-w-[180px]">
                            {u.displayName || "Member"}
                          </p>
                          <p
                            className="text-[11px] text-muted truncate max-w-[200px]"
                            title={u.email || u.userId}
                          >
                            {u.email || `${u.userId.slice(0, 8)}…`}
                          </p>
                        </div>
                      </div>
                    </td>

                    {/* Plan */}
                    <td className="py-3.5 px-4">
                      {isStaff ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-accent-soft text-accent px-2 py-0.5 text-[10px] font-semibold">
                          <Shield className="size-2.5" />
                          <span>Staff</span>
                        </span>
                      ) : u.isSubscribed ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 text-emerald-600 px-2 py-0.5 text-[10px] font-semibold">
                          <CheckCircle2 className="size-2.5" />
                          <span>{u.planLabel}</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-full bg-surface-muted text-muted px-2 py-0.5 text-[10px] font-medium">
                          Free
                        </span>
                      )}
                    </td>

                    {/* Volume */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <span className="font-semibold text-foreground">{u.calls24h}</span>
                      <span className="text-muted"> / </span>
                      <span className="font-medium text-foreground">{u.calls7d}</span>
                      <span className="text-muted"> / </span>
                      <span className="font-semibold text-accent">{u.calls30d}</span>
                    </td>

                    {/* Breakdown */}
                    <td className="py-3.5 px-4 max-w-md">
                      <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                        {activeVisionMethods.length > 0 ? (
                          activeVisionMethods.map((methodKey) => (
                            <span
                              key={methodKey}
                              title={`${AI_METHOD_META[methodKey].label} (${AI_METHOD_META[methodKey].route})`}
                              className={`rounded-md px-1.5 py-0.5 font-medium ${VISION_PILL_CLASSES[methodKey]}`}
                            >
                              {AI_METHOD_META[methodKey].shortLabel}:{" "}
                              {u.imageBreakdown30d[methodKey]}
                            </span>
                          ))
                        ) : (
                          <span className="rounded-md bg-surface-muted text-muted px-1.5 py-0.5 font-medium">
                            Images: 0
                          </span>
                        )}
                        {u.styleOutfits30d > 0 && (
                          <span className="rounded-md bg-purple-500/10 text-purple-700 dark:text-purple-400 px-1.5 py-0.5 font-medium">
                            Stylist: {u.styleOutfits30d}
                          </span>
                        )}
                        {u.chat30d > 0 && (
                          <span className="rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 px-1.5 py-0.5 font-medium">
                            Chat: {u.chat30d}
                          </span>
                        )}
                        {u.generatePhoto30d > 0 && (
                          <span className="rounded-md bg-amber-500/10 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 font-medium">
                            Photo: {u.generatePhoto30d}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Active Plan Quotas */}
                    <td className="py-3.5 px-4">
                      {isStaff ? (
                        <span className="text-[11px] text-muted">Unlimited (Admin bypass)</span>
                      ) : (
                        <div className="space-y-1 text-[11px]">
                          <div className="flex items-center gap-1.5">
                            <span className="text-muted">Outfits:</span>
                            <span
                              className={`font-medium ${
                                u.outfitQuotaLimit !== null && u.outfitQuotaUsed >= u.outfitQuotaLimit
                                  ? "text-amber-600 font-semibold"
                                  : "text-foreground"
                              }`}
                            >
                              {u.outfitQuotaUsed}
                              {u.outfitQuotaLimit !== null
                                ? ` / ${u.outfitQuotaLimit} (${u.outfitQuotaWindow === "week" ? "wk" : "mo"})`
                                : " (∞)"}
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-muted">Beautify:</span>
                            <span
                              className={`font-medium ${
                                u.beautifyQuotaLimit !== null && u.beautifyQuotaUsed >= u.beautifyQuotaLimit
                                  ? "text-amber-600 font-semibold"
                                  : "text-foreground"
                              }`}
                            >
                              {u.beautifyQuotaUsed}
                              {u.beautifyQuotaLimit !== null ? ` / ${u.beautifyQuotaLimit} (mo)` : " (∞)"}
                            </span>
                          </div>
                          {u.isQuotaExhausted && (
                            <span className="inline-flex items-center gap-1 text-[10px] text-amber-600 font-semibold">
                              <AlertCircle className="size-2.5" />
                              <span>Quota cap reached</span>
                            </span>
                          )}
                        </div>
                      )}
                    </td>

                    {/* Last AI Request */}
                    <td className="py-3.5 px-4 text-right text-[11px] text-muted whitespace-nowrap">
                      {u.lastAiAt
                        ? new Date(u.lastAiAt).toLocaleString(undefined, {
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filteredRows.length === 0 && (
          <div className="py-12 px-4 text-center text-xs text-muted">
            No member AI activity matched the current filter.
          </div>
        )}
      </Card>

      {/* Live Recent AI Stream with Granular Method Filters */}
      <Card className="p-5 bg-surface border-border space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="font-serif text-base font-medium text-foreground">
              Recent Live AI Activity Stream
            </h2>
            <p className="text-[11px] text-muted mt-0.5">
              Latest AI invocations showing the exact image analysis mode, route, and provider used.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: "all", label: `All Activity (${Math.min(25, streamCounts.all)})` },
                { id: "single_scan", label: `Single Photo (${streamCounts.single_scan})` },
                { id: "multi_detect", label: `OOTD & Multi-Detect (${streamCounts.multi_detect})` },
                { id: "studio_beautify", label: `Studio Beautify (${streamCounts.studio_beautify})` },
                { id: "stylist_chat", label: `Stylist & Chat (${streamCounts.stylist_chat})` },
              ] as const
            ).map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setStreamFilter(f.id)}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-medium transition-colors ${
                  streamFilter === f.id
                    ? "bg-accent text-accent-contrast font-semibold"
                    : "bg-surface-muted/70 text-muted hover:text-foreground"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="divide-y divide-border/60">
          {filteredEvents.map((ev) => {
            const badgeCls = getEventBadgeClass(ev.methodKey);
            const providerDisplay =
              ev.provider && ev.model
                ? `${ev.provider} · ${ev.model}`
                : ev.provider || ev.model || null;

            return (
              <div
                key={ev.id}
                className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
              >
                <div className="flex flex-wrap items-center gap-2 min-w-0">
                  <span
                    className={`rounded-md px-2 py-0.5 text-[10px] font-semibold shrink-0 ${badgeCls}`}
                    title={ev.routeLabel}
                  >
                    {ev.methodLabel}
                  </span>

                  <code className="rounded bg-surface-muted px-1.5 py-0.5 text-[10px] text-muted shrink-0">
                    {ev.routeLabel}
                  </code>

                  {providerDisplay && (
                    <span className="rounded bg-accent-soft/70 text-accent px-1.5 py-0.5 text-[10px] font-medium shrink-0">
                      {providerDisplay}
                    </span>
                  )}

                  {ev.detailLabel && (
                    <span className="rounded border border-border px-1.5 py-0.5 text-[10px] text-foreground/80 shrink-0">
                      {ev.detailLabel}
                    </span>
                  )}

                  <span className="font-medium text-foreground truncate">
                    {ev.userName || ev.userEmail || `${ev.userId.slice(0, 8)}…`}
                  </span>
                  {ev.userName && ev.userEmail && (
                    <span className="text-[11px] text-muted truncate hidden md:inline">
                      ({ev.userEmail})
                    </span>
                  )}
                </div>

                <span className="text-[11px] text-muted shrink-0">
                  {new Date(ev.createdAt).toLocaleString()}
                </span>
              </div>
            );
          })}

          {filteredEvents.length === 0 && (
            <div className="py-8 text-center text-xs text-muted">
              No AI activity events matched the selected method filter.
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

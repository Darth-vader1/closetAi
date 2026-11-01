import Link from "next/link";
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  Camera,
  Cpu,
  Image as ImageIcon,
  Layers,
  MessageSquare,
  ScanLine,
  Scissors,
  Sparkles,
  UserCheck,
  Users,
  Wand2,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { getAdminAiUsageAnalytics } from "@/lib/admin/system-and-usage";
import {
  AI_HOURLY_LIMITS,
  AI_METHOD_META,
  IMAGE_ANALYSIS_METHODS,
  type AiOperation,
  type ImageAnalysisMethod,
} from "@/lib/ai/rate-limit";
import { AdminAiUsageClient } from "@/components/admin/admin-ai-usage-client";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "AI Usage & Quotas · ClosetAI Admin",
};

const OPERATION_META: Record<
  AiOperation,
  {
    label: string;
    routes: string;
    badgeCls: string;
    barCls: string;
    Icon: typeof Sparkles;
  }
> = {
  ANALYSE_IMAGE: {
    label: "Vision, Multi-Detect & Beautify",
    routes: "/api/ai/analyse · /api/ai/detect-items · /api/ai/beautify",
    badgeCls: "bg-sky-500/10 text-sky-700 dark:text-sky-400",
    barCls: "bg-sky-500",
    Icon: Camera,
  },
  STYLE_OUTFITS: {
    label: "AI Stylist & Trip Packing",
    routes: "/api/ai/stylist · /api/ai/packing",
    badgeCls: "bg-purple-500/10 text-purple-700 dark:text-purple-400",
    barCls: "bg-purple-500",
    Icon: Sparkles,
  },
  CHAT: {
    label: "@ClosetAI Stylist Chat & Briefs",
    routes: "/api/ai/stylist/chat · Daily/WhatsApp test briefs",
    badgeCls: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
    barCls: "bg-emerald-500",
    Icon: MessageSquare,
  },
  GENERATE_PHOTO: {
    label: "Outfit Lookbook Photo Gen",
    routes: "/api/outfits/generate-photo",
    badgeCls: "bg-amber-500/10 text-amber-700 dark:text-amber-400",
    barCls: "bg-amber-500",
    Icon: ImageIcon,
  },
};

const IMAGE_METHOD_VISUALS: Record<
  ImageAnalysisMethod,
  {
    barCls: string;
    iconCls: string;
    Icon: typeof Camera;
  }
> = {
  SINGLE_GARMENT_SCAN: {
    barCls: "bg-sky-500",
    iconCls: "text-sky-600 dark:text-sky-400",
    Icon: Camera,
  },
  OOTD_EXTRACT: {
    barCls: "bg-indigo-500",
    iconCls: "text-indigo-600 dark:text-indigo-400",
    Icon: UserCheck,
  },
  SCREENSHOT_DETECT: {
    barCls: "bg-cyan-500",
    iconCls: "text-cyan-600 dark:text-cyan-400",
    Icon: ScanLine,
  },
  FLATLAY_DETECT: {
    barCls: "bg-teal-500",
    iconCls: "text-teal-600 dark:text-teal-400",
    Icon: Layers,
  },
  BEAUTIFY_FLATLAY: {
    barCls: "bg-rose-500",
    iconCls: "text-rose-600 dark:text-rose-400",
    Icon: Wand2,
  },
  BEAUTIFY_CUTOUT: {
    barCls: "bg-fuchsia-500",
    iconCls: "text-fuchsia-600 dark:text-fuchsia-400",
    Icon: Scissors,
  },
  BEAUTIFY_ENHANCE: {
    barCls: "bg-violet-500",
    iconCls: "text-violet-600 dark:text-violet-400",
    Icon: Sparkles,
  },
};

export default async function AdminAiUsagePage() {
  const report = await getAdminAiUsageAnalytics();
  const maxDaily = Math.max(1, ...report.dailyTrend14d.map((d) => d.total));
  const total30dForShare = Math.max(
    1,
    Object.values(report.byOperation30d).reduce((acc, v) => acc + v, 0),
  );
  const totalImage30d = Math.max(
    1,
    Object.values(report.byImageMethod30d).reduce((acc, v) => acc + v, 0),
  );
  const legacyImage30d = report.byImageMethod30d.VISION_LEGACY || 0;
  const legacyImage7d = report.byImageMethod7d.VISION_LEGACY || 0;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="font-serif text-2xl font-medium tracking-tight text-foreground">
            AI Usage &amp; Quota Analytics
          </h1>
          <p className="text-xs text-muted mt-1">
            Live request volume across Vision, Stylist, Chat &amp; Lookbook generation from{" "}
            <code className="text-[11px]">ai_usage_events</code> and{" "}
            <code className="text-[11px]">usage_records</code>.
          </p>
        </div>

        <Link
          href="/admin/system"
          className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3.5 py-2 text-xs font-medium text-foreground hover:bg-surface-muted transition-colors self-start sm:self-auto"
        >
          <Cpu className="size-3.5 text-accent" />
          <span>Provider Health &amp; Keys</span>
          <ArrowRight className="size-3" />
        </Link>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card className="p-5 space-y-2 bg-surface border-border">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
              24h Requests
            </span>
            <Activity className="size-4 text-accent" />
          </div>
          <div className="font-serif text-2xl sm:text-3xl font-medium text-foreground">
            {report.calls24h.toLocaleString()}
          </div>
          <p className="text-[11px] text-muted border-t border-border/60 pt-2">
            {report.activeUsers24h} active user{report.activeUsers24h === 1 ? "" : "s"} today
          </p>
        </Card>

        <Card className="p-5 space-y-2 bg-surface border-border">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
              7-Day Volume
            </span>
            <Sparkles className="size-4 text-purple-600" />
          </div>
          <div className="font-serif text-2xl sm:text-3xl font-medium text-foreground">
            {report.calls7d.toLocaleString()}
          </div>
          <p className="text-[11px] text-muted border-t border-border/60 pt-2">
            {report.activeUsers7d} unique members in 7d
          </p>
        </Card>

        <Card className="p-5 space-y-2 bg-surface border-border">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
              30-Day Volume
            </span>
            <Cpu className="size-4 text-sky-600" />
          </div>
          <div className="font-serif text-2xl sm:text-3xl font-medium text-foreground">
            {report.calls30d.toLocaleString()}
          </div>
          <p className="text-[11px] text-muted border-t border-border/60 pt-2">
            {report.totalCallsAllTime.toLocaleString()} total all-time calls
          </p>
        </Card>

        <Card className="p-5 space-y-2 bg-surface border-border">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
              Active AI Users (30d)
            </span>
            <Users className="size-4 text-emerald-600" />
          </div>
          <div className="font-serif text-2xl sm:text-3xl font-medium text-foreground">
            {report.activeUsers30d}
          </div>
          <p className="text-[11px] text-muted border-t border-border/60 pt-2">
            Avg{" "}
            {report.activeUsers30d > 0
              ? (report.calls30d / report.activeUsers30d).toFixed(1)
              : "0"}{" "}
            calls / active user
          </p>
        </Card>

        <Card className="p-5 space-y-2 bg-surface border-border">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted">
              Quota / Rate Caps
            </span>
            <AlertTriangle className="size-4 text-amber-600" />
          </div>
          <div className="font-serif text-2xl sm:text-3xl font-medium text-foreground">
            {report.quotaExhaustedUsersCount}
          </div>
          <p className="text-[11px] text-muted border-t border-border/60 pt-2">
            At plan cap · {report.rateLimitedUsersLastHour} at hourly limit
          </p>
        </Card>
      </div>

      {/* 14-Day Trend & Operation Share */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        {/* 14-Day Daily Bar Chart */}
        <Card className="lg:col-span-3 p-5 bg-surface border-border flex flex-col justify-between space-y-4">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h2 className="font-serif text-base font-medium text-foreground">
                14-Day Daily AI Call Volume
              </h2>
              <p className="text-[11px] text-muted mt-0.5">
                Daily UTC request volume across all AI endpoints.
              </p>
            </div>
            <div className="hidden sm:flex items-center gap-3 text-[10px] text-muted">
              <span className="inline-flex items-center gap-1">
                <span className="size-2 rounded-full bg-sky-500" /> Vision
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="size-2 rounded-full bg-purple-500" /> Stylist
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="size-2 rounded-full bg-emerald-500" /> Chat
              </span>
            </div>
          </div>

          <div className="grid grid-cols-14 gap-1.5 items-end h-44 pt-4">
            {report.dailyTrend14d.map((day) => {
              const heightPct = day.total > 0 ? Math.max(8, Math.round((day.total / maxDaily) * 100)) : 3;
              return (
                <div
                  key={day.date}
                  className="flex flex-col items-center justify-end h-full gap-1.5 group"
                  title={`${day.label}: ${day.total} total (${day.analyseImage} Vision, ${day.styleOutfits} Stylist, ${day.chat} Chat, ${day.generatePhoto} Photo)`}
                >
                  <span className="text-[9px] text-muted opacity-0 group-hover:opacity-100 transition-opacity font-medium">
                    {day.total}
                  </span>
                  <div className="w-full flex-1 flex items-end">
                    <div
                      style={{ height: `${heightPct}%` }}
                      className={`w-full rounded-t-md transition-all ${
                        day.total > 0 ? "bg-accent/85 group-hover:bg-accent" : "bg-border/60"
                      }`}
                    />
                  </div>
                  <span className="text-[9px] text-muted truncate max-w-full">
                    {day.label.split(" ")[1]}
                  </span>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Capability Breakdown */}
        <Card className="lg:col-span-2 p-5 bg-surface border-border space-y-4">
          <div>
            <h2 className="font-serif text-base font-medium text-foreground">
              Requests by Capability (30d)
            </h2>
            <p className="text-[11px] text-muted mt-0.5">
              Distribution by operation &amp; rolling hourly rate-limit guardrails.
            </p>
          </div>

          <div className="space-y-3.5">
            {(Object.keys(OPERATION_META) as AiOperation[]).map((op) => {
              const meta = OPERATION_META[op];
              const Icon = meta.Icon;
              const count30d = report.byOperation30d[op] || 0;
              const count7d = report.byOperation7d[op] || 0;
              const pct = Math.round((count30d / total30dForShare) * 100);

              return (
                <div key={op} className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2 min-w-0">
                      <Icon className="size-3.5 text-accent shrink-0" />
                      <span className="font-medium text-foreground truncate">{meta.label}</span>
                    </div>
                    <span className="text-[11px] font-semibold text-foreground shrink-0">
                      {count30d.toLocaleString()}{" "}
                      <span className="text-muted font-normal">({count7d} in 7d)</span>
                    </span>
                  </div>
                  <div className="h-1.5 w-full rounded-full bg-surface-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full ${meta.barCls}`}
                      style={{ width: `${Math.max(count30d > 0 ? 4 : 0, pct)}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-muted">
                    <span className="truncate">{meta.routes}</span>
                    <span className="shrink-0">Cap: {AI_HOURLY_LIMITS[op]}/hr</span>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>
      </div>

      {/* Granular Image Analysis Method Breakdown */}
      <Card className="p-5 bg-surface border-border space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="font-serif text-base font-medium text-foreground">
              How Images Were Analyzed (30d Breakdown)
            </h2>
            <p className="text-[11px] text-muted mt-0.5">
              Splits <code className="text-[10px]">ANALYSE_IMAGE</code> into exact scan &amp; studio modes across single garment photos, OOTD extraction, screenshots, and beautification.
            </p>
          </div>
          <span className="text-[11px] font-medium text-muted shrink-0">
            {(report.byOperation30d.ANALYSE_IMAGE || 0).toLocaleString()} total image calls (30d)
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {IMAGE_ANALYSIS_METHODS.map((methodKey) => {
            const meta = AI_METHOD_META[methodKey];
            const vis = IMAGE_METHOD_VISUALS[methodKey];
            const Icon = vis.Icon;
            const count30d = report.byImageMethod30d[methodKey] || 0;
            const count7d = report.byImageMethod7d[methodKey] || 0;
            const sharePct = Math.round((count30d / totalImage30d) * 100);

            return (
              <div
                key={methodKey}
                className="rounded-xl border border-border/80 bg-background/40 p-3.5 flex flex-col justify-between gap-2.5"
              >
                <div className="space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-foreground">
                      <Icon className={`size-3.5 shrink-0 ${vis.iconCls}`} />
                      <span className="truncate">{meta.label}</span>
                    </span>
                    <span className="font-serif text-lg font-medium text-foreground shrink-0">
                      {count30d.toLocaleString()}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted leading-relaxed">
                    {meta.description}
                  </p>
                </div>

                <div className="space-y-1.5">
                  <div className="h-1.5 w-full rounded-full bg-surface-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full ${vis.barCls}`}
                      style={{ width: `${Math.max(count30d > 0 ? 5 : 0, sharePct)}%` }}
                    />
                  </div>
                  <div className="flex items-center justify-between text-[10px] text-muted">
                    <code className="truncate">{meta.route}</code>
                    <span className="shrink-0">
                      {count7d} in 7d · {sharePct}%
                    </span>
                  </div>
                </div>
              </div>
            );
          })}

          {legacyImage30d > 0 && (
            <div className="rounded-xl border border-dashed border-border bg-surface-muted/30 p-3.5 flex flex-col justify-between gap-2.5">
              <div className="space-y-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted">
                    <Camera className="size-3.5 shrink-0 text-muted" />
                    <span className="truncate">Pre-Tracking Vision</span>
                  </span>
                  <span className="font-serif text-lg font-medium text-muted shrink-0">
                    {legacyImage30d.toLocaleString()}
                  </span>
                </div>
                <p className="text-[10px] text-muted leading-relaxed">
                  Historical image calls recorded before granular method telemetry was enabled.
                </p>
              </div>
              <div className="flex items-center justify-between text-[10px] text-muted pt-1 border-t border-border/50">
                <span>Unlinked historical logs</span>
                <span>
                  {legacyImage7d} in 7d · {Math.round((legacyImage30d / totalImage30d) * 100)}%
                </span>
              </div>
            </div>
          )}
        </div>
      </Card>

      {/* Per-User AI Leaderboard, Quota Table & Filterable Live Activity Stream */}
      <AdminAiUsageClient
        rows={report.userLeaderboard}
        recentEvents={report.recentEvents}
      />
    </div>
  );
}

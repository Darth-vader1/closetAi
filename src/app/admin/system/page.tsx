import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  Cpu,
  CreditCard,
  Database,
  Mail,
  MessageSquare,
  ShieldCheck,
  Sparkles,
  XCircle,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { getAdminSystemHealth, type HealthState } from "@/lib/admin/system-and-usage";
import { AdminSystemProbePanel } from "@/components/admin/admin-system-client";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "System Health & Providers · ClosetAI Admin",
};

function getBadgeStyle(state: HealthState) {
  switch (state) {
    case "healthy":
      return {
        cls: "bg-emerald-500/10 text-emerald-600",
        Icon: CheckCircle2,
      };
    case "warning":
      return {
        cls: "bg-amber-500/10 text-amber-600",
        Icon: AlertTriangle,
      };
    case "degraded":
      return {
        cls: "bg-red-500/10 text-red-600",
        Icon: XCircle,
      };
    case "unconfigured":
    default:
      return {
        cls: "bg-surface-muted text-muted",
        Icon: Clock,
      };
  }
}

function getServiceIcon(id: string) {
  switch (id) {
    case "supabase":
      return Database;
    case "ai_models":
      return Cpu;
    case "beautify":
      return ShieldCheck;
    case "email_cron":
      return Mail;
    case "whatsapp":
      return MessageSquare;
    case "billing":
      return CreditCard;
    default:
      return Sparkles;
  }
}

export default async function AdminSystemPage() {
  const report = await getAdminSystemHealth();
  const overallBadge = getBadgeStyle(report.overallState);
  const OverallIcon = overallBadge.Icon;

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 className="font-serif text-2xl font-medium tracking-tight text-foreground">
              System &amp; Service Health
            </h1>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold capitalize ${overallBadge.cls}`}
            >
              <OverallIcon className="size-3" />
              <span>
                {report.overallState === "healthy"
                  ? "All Core Systems Healthy"
                  : report.overallState === "warning"
                    ? "Attention Recommended"
                    : "Degraded"}
              </span>
            </span>
          </div>
          <p className="text-xs text-muted mt-1">
            Live environment inspection, Postgres query latency, 7-day cron delivery telemetry, and on-demand upstream API probes.
          </p>
        </div>

        <Link
          href="/admin/ai-usage"
          className="inline-flex items-center gap-1.5 rounded-xl border border-border bg-surface px-3.5 py-2 text-xs font-medium text-foreground hover:bg-surface-muted transition-colors self-start sm:self-auto"
        >
          <Sparkles className="size-3.5 text-accent" />
          <span>Inspect AI Usage by User</span>
          <ArrowRight className="size-3" />
        </Link>
      </div>

      {/* Interactive Live Probe Panel */}
      <AdminSystemProbePanel />

      {/* Live Service Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {report.services.map((service) => {
          const ServiceIcon = getServiceIcon(service.id);
          const badge = getBadgeStyle(service.state);
          const BadgeIcon = badge.Icon;

          return (
            <Card
              key={service.id}
              className="p-5 bg-surface border-border flex flex-col justify-between gap-4"
            >
              <div className="flex items-start gap-3.5">
                <div className="size-9 rounded-xl bg-accent-soft text-accent grid place-items-center shrink-0 mt-0.5">
                  <ServiceIcon className="size-4" />
                </div>
                <div className="flex-1 min-w-0 space-y-1.5">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <h3 className="font-medium text-xs text-foreground">
                      {service.name}
                    </h3>
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold ${badge.cls}`}
                    >
                      <BadgeIcon className="size-3" />
                      <span>{service.statusLabel}</span>
                    </span>
                  </div>
                  <p className="text-[11px] text-muted leading-relaxed">
                    {service.summary}
                  </p>
                </div>
              </div>

              {/* Granular Check Rows */}
              <div className="border-t border-border/60 pt-3 grid grid-cols-2 gap-x-4 gap-y-2">
                {service.checks.map((c) => (
                  <div key={c.label} className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="text-muted truncate">{c.label}</span>
                    <span
                      className={`font-medium shrink-0 ${
                        c.ok ? "text-foreground" : "text-amber-600"
                      }`}
                    >
                      {c.value}
                    </span>
                  </div>
                ))}
              </div>
            </Card>
          );
        })}
      </div>

      {/* 7-Day Cron Delivery Telemetry Card */}
      <Card className="p-5 bg-surface border-border space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="font-serif text-base font-medium text-foreground">
              Scheduled Briefing Cron Telemetry (Last 7 Days)
            </h2>
            <p className="text-xs text-muted mt-0.5">
              Live delivery counts recorded in <code className="text-[11px]">email_logs</code> for Daily Outfit &amp; Weekly Laundry briefings.
            </p>
          </div>
          <span className="text-[11px] text-muted">
            Last sent:{" "}
            <strong className="text-foreground">
              {report.cron.lastSentAt
                ? new Date(report.cron.lastSentAt).toLocaleString()
                : "No scheduled sends in last 7d"}
            </strong>
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
          <div className="rounded-xl border border-border/70 bg-background/50 p-3">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-muted">Sent</span>
            <p className="font-serif text-xl font-medium text-emerald-600 mt-0.5">
              {report.cron.sent7d}
            </p>
          </div>
          <div className="rounded-xl border border-border/70 bg-background/50 p-3">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-muted">Failed</span>
            <p
              className={`font-serif text-xl font-medium mt-0.5 ${
                report.cron.failed7d > 0 ? "text-red-600" : "text-foreground"
              }`}
            >
              {report.cron.failed7d}
            </p>
          </div>
          <div className="rounded-xl border border-border/70 bg-background/50 p-3">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-muted">Pending</span>
            <p className="font-serif text-xl font-medium text-foreground mt-0.5">
              {report.cron.pending7d}
            </p>
          </div>
          <div className="rounded-xl border border-border/70 bg-background/50 p-3">
            <span className="text-[10px] uppercase tracking-wider font-semibold text-muted">Skipped</span>
            <p className="font-serif text-xl font-medium text-muted mt-0.5">
              {report.cron.skipped7d}
            </p>
          </div>
        </div>

        {report.cron.lastFailureError && (
          <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 px-3.5 py-2.5 text-xs text-amber-700">
            <strong>Most recent delivery error:</strong> {report.cron.lastFailureError}
            {report.cron.lastFailureAt
              ? ` (${new Date(report.cron.lastFailureAt).toLocaleString()})`
              : ""}
          </div>
        )}
      </Card>
    </div>
  );
}

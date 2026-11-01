"use client";

import { useState } from "react";
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Radio,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { LiveProbeResult } from "@/lib/admin/system-and-usage";

export function AdminSystemProbePanel() {
  const [isRunning, setIsRunning] = useState(false);
  const [probes, setProbes] = useState<LiveProbeResult[] | null>(null);
  const [checkedAt, setCheckedAt] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleRunProbe = async () => {
    setIsRunning(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/system/probe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(data.error || "Live connectivity probe failed.");
        return;
      }
      setProbes(data.probes || []);
      setCheckedAt(data.checkedAt || new Date().toISOString());
    } catch {
      setError("Network error while running live upstream probes.");
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <Card className="p-5 bg-surface border-border space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="size-9 rounded-xl bg-accent-soft text-accent grid place-items-center shrink-0 mt-0.5">
            <Radio className="size-4" />
          </div>
          <div>
            <h2 className="font-serif text-base font-medium text-foreground">
              Live Upstream Connectivity Probe
            </h2>
            <p className="text-xs text-muted mt-0.5">
              Actively ping Supabase, configured AI provider APIs (Groq / Mistral / Gemini), Open-Meteo Weather, and Paystack to verify live credentials and latency.
            </p>
          </div>
        </div>

        <Button
          type="button"
          variant="primary"
          size="sm"
          disabled={isRunning}
          onClick={handleRunProbe}
          className="text-xs px-4 flex items-center gap-1.5 shrink-0"
        >
          {isRunning ? (
            <>
              <Loader2 className="size-3.5 animate-spin" />
              <span>Pinging Upstreams...</span>
            </>
          ) : (
            <>
              <RefreshCw className="size-3.5" />
              <span>{probes ? "Re-run Live Probe" : "Run Live Probe"}</span>
            </>
          )}
        </Button>
      </div>

      {error && (
        <div className="rounded-xl bg-red-500/10 border border-red-500/20 px-3.5 py-2.5 text-xs text-red-600 flex items-center gap-2">
          <AlertTriangle className="size-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {probes && (
        <div className="space-y-3 pt-2 border-t border-border/60">
          <div className="flex items-center justify-between text-[11px] text-muted">
            <span className="inline-flex items-center gap-1.5 font-medium text-foreground">
              <Activity className="size-3.5 text-accent" />
              <span>
                {probes.filter((p) => p.ok).length} of {probes.length} endpoints responded healthy
              </span>
            </span>
            {checkedAt && (
              <span>Checked at {new Date(checkedAt).toLocaleTimeString()}</span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {probes.map((p) => (
              <div
                key={p.id}
                className="rounded-xl border border-border/80 bg-background/60 p-3 space-y-1"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-foreground truncate">
                    {p.name}
                  </span>
                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold shrink-0 ${
                      p.ok
                        ? "bg-emerald-500/10 text-emerald-600"
                        : "bg-red-500/10 text-red-600"
                    }`}
                  >
                    {p.ok ? (
                      <CheckCircle2 className="size-2.5" />
                    ) : (
                      <XCircle className="size-2.5" />
                    )}
                    <span>{p.latencyMs}ms</span>
                  </span>
                </div>
                <p className="text-[11px] text-muted truncate" title={p.detail}>
                  {p.detail}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  );
}

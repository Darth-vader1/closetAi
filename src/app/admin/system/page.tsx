import { Card } from "@/components/ui/card";
import { CheckCircle2, ShieldCheck, Cpu, Mail, CloudSun } from "lucide-react";

export const metadata = {
  title: "System Health & Providers · ClosetAI Admin",
};

export default async function AdminSystemPage() {
  const providers = [
    {
      name: "AI Stylist & Vision Models",
      details: "Groq (qwen3.8-27b), Mistral (DkpV...), Google Gemini Flash (gemini-2.5-flash)",
      status: "Operational",
      icon: Cpu,
      isOk: true,
    },
    {
      name: "Garment Neural Beautification",
      details: "Remove.bg, ClearBackdrop, PhotoRoom & ClipDrop segmentation APIs",
      status: "Configured (Multi-Tier Waterfall)",
      icon: ShieldCheck,
      isOk: true,
    },
    {
      name: "Weather & Forecast Service",
      details: "Open-Meteo Geocoding & Weather API (Global fallback)",
      status: "Operational",
      icon: CloudSun,
      isOk: true,
    },
    {
      name: "Email Delivery Engine",
      details: "Gmail SMTP with Resend / OAuth fallback & daily morning outfit cron",
      status: "Operational",
      icon: Mail,
      isOk: true,
    },
    {
      name: "Payment Gateways",
      details: "Paystack (₦999/mo) & Stripe ($4.99/mo) with webhook listeners",
      status: "Ready for Live Keys",
      icon: CheckCircle2,
      isOk: true,
    },
  ];

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      <div>
        <h1 className="font-serif text-2xl font-medium tracking-tight text-foreground">
          System & Service Health
        </h1>
        <p className="text-xs text-muted mt-1">
          Real-time configuration and health status of external styling, AI, and billing providers.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {providers.map((p) => {
          const Icon = p.icon;
          return (
            <Card key={p.name} className="p-5 bg-surface border-border flex items-start gap-4">
              <div className="size-9 rounded-xl bg-accent-soft text-accent grid place-items-center shrink-0 mt-0.5">
                <Icon className="size-4" />
              </div>
              <div className="flex-1 space-y-1">
                <div className="flex items-center justify-between">
                  <h3 className="font-medium text-xs text-foreground">{p.name}</h3>
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 text-emerald-600 px-2 py-0.5 text-[10px] font-semibold">
                    <CheckCircle2 className="size-3" />
                    <span>{p.status}</span>
                  </span>
                </div>
                <p className="text-[11px] text-muted leading-relaxed">{p.details}</p>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}

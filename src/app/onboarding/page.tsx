import { redirect } from "next/navigation";
import { Layers, MessageCircle, Sparkles, Wand2 } from "lucide-react";
import { signOutAction } from "@/app/(auth)/actions";
import { ConfigNotice } from "@/components/layout/config-notice";
import { Logo } from "@/components/layout/logo";
import { OnboardingForm } from "@/components/onboarding/onboarding-form";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { getProfile, requireUser } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/env";

export const metadata = { title: "Set up your profile" };

// Every page in this group is per-user and reads the session, so it must never be prerendered
// at build time (that could bake a "not configured" state into a deployed build).
export const dynamic = "force-dynamic";

const ONBOARDING_HIGHLIGHTS = [
  {
    icon: Wand2,
    title: "Beautify & Store Import",
    body: "Studio background removal, multi-item crop detection, and 1-click online store URL imports.",
  },
  {
    icon: Sparkles,
    title: "Proportion & Modest Styling",
    body: "Weather-smart outfits tuned to 9 body shapes, slip-dress layering, and modest coverage.",
  },
  {
    icon: Layers,
    title: "Flatlay & 3D Studio",
    body: "Compose editorial fashion collages, preview looks in 3D, and export high-res PNG boards.",
  },
  {
    icon: MessageCircle,
    title: "Live Stylist Chat & Connect",
    body: "Chat with @ClosetAI Stylist for saveable outfit cards, share with friends, & get WhatsApp briefs.",
  },
];

export default async function OnboardingPage() {
  if (!isSupabaseConfigured()) {
    return <ConfigNotice integration="Supabase" variables={["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]} />;
  }
  const user = await requireUser();
  const profile = await getProfile();
  if (profile?.onboarding_completed_at) {
    redirect("/dashboard");
  }

  return (
    <div className="flex min-h-dvh flex-col items-center px-4 py-8 sm:py-14">
      <div className="w-full max-w-2xl flex items-center justify-between">
        <Logo href="/onboarding" />
        <form action={signOutAction}>
          <Button variant="ghost" size="sm" type="submit" className="text-xs text-muted hover:text-foreground">
            Sign out
          </Button>
        </form>
      </div>
      <main id="main" className="mt-8 w-full max-w-2xl">
        <h1 className="text-3xl sm:text-4xl">Let&apos;s set up your closet</h1>
        <p className="mt-2 text-muted">
          A few quick questions so your AI stylist, flatlay studio, and morning briefings fit you from day one. Everything is optional except your name.
        </p>

        {/* Feature Highlights Strip */}
        <section aria-label="What's inside ClosetAI" className="mt-6 grid gap-3 sm:grid-cols-2">
          {ONBOARDING_HIGHLIGHTS.map(({ icon: Icon, title, body }) => (
            <div
              key={title}
              className="flex items-start gap-3 rounded-2xl border border-border bg-surface p-3.5"
            >
              <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
                <Icon className="size-4" aria-hidden />
              </span>
              <div>
                <h2 className="font-sans text-xs font-semibold text-foreground">{title}</h2>
                <p className="mt-0.5 text-[11px] leading-relaxed text-muted">{body}</p>
              </div>
            </div>
          ))}
        </section>

        <Card className="mt-6 p-6 sm:p-8">
          <OnboardingForm initialName={profile?.display_name ?? user.email?.split("@")[0] ?? ""} />
        </Card>
      </main>
    </div>
  );
}

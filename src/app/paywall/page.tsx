import { redirect } from "next/navigation";
import { LogOut } from "lucide-react";
import { signOutAction } from "@/app/(auth)/actions";
import { PaywallClient } from "@/components/billing/paywall-client";
import { Logo } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";
import { getProfile, requireUser } from "@/lib/auth/session";
import { getUserSubscription } from "@/lib/billing/subscription";
import { PRICING_PLANS } from "@/lib/billing/plans";

export const metadata = {
  title: "Unlock ClosetAI Pro · Membership",
  description: "Get unlimited AI styling, trip packing, flatlay collages, and garment beautification.",
};

export default async function PaywallPage({
  searchParams,
}: {
  searchParams?: Promise<{ canceled?: string; reason?: string }>;
}) {
  const user = await requireUser();
  const profile = await getProfile();

  // If user hasn't finished preferences, take them to onboarding first
  if (!profile || !profile.onboarding_completed_at) {
    redirect("/onboarding");
  }

  // If user already has an active subscription, redirect straight to dashboard
  const sub = await getUserSubscription(user.id);
  if (sub.isSubscribed) {
    redirect("/dashboard");
  }

  const resolvedParams = searchParams ? await searchParams : {};
  const isCanceled = Boolean(resolvedParams?.canceled);

  return (
    <div className="min-h-dvh bg-background text-foreground flex flex-col justify-between p-4 sm:p-8">
      <header className="w-full max-w-4xl mx-auto flex items-center justify-between pb-4 border-b border-border/50">
        <Logo href="/paywall" />
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted hidden sm:inline">{user.email}</span>
          <form action={signOutAction}>
            <Button variant="ghost" size="sm" type="submit" className="text-xs text-muted hover:text-foreground">
              <LogOut className="size-3.5 mr-1.5" />
              Sign out
            </Button>
          </form>
        </div>
      </header>

      <main className="max-w-4xl mx-auto w-full my-auto py-8">
        <PaywallClient
          userEmail={user.email || ""}
          plans={Object.values(PRICING_PLANS)}
          isCanceled={isCanceled}
        />
      </main>

      <footer className="text-center text-xs text-muted py-4 border-t border-border/50">
        <p>© {new Date().getFullYear()} ClosetAI. Safe & encrypted 256-bit checkout via Paystack & Stripe.</p>
      </footer>
    </div>
  );
}

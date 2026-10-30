import { Metadata } from "next";
import { LogOut } from "lucide-react";
import { signOutAction } from "@/app/(auth)/actions";
import { SubscriptionClient } from "@/components/billing/subscription-client";
import { Logo } from "@/components/layout/logo";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth/session";
import { getUserPlan } from "@/lib/billing/entitlements";

export const metadata: Metadata = {
  title: "Subscription Plans · ClosetAI",
  description: "Choose between ClosetAI Free or upgrade to ClosetAI Premium for unlimited styling and wardrobe management.",
};

export const dynamic = "force-dynamic";

export default async function SubscriptionPage({
  searchParams,
}: {
  searchParams?: Promise<{ canceled?: string; upgraded?: string }>;
}) {
  const user = await requireUser();
  const planInfo = await getUserPlan(user.id);
  const resolvedParams = searchParams ? await searchParams : {};
  const isCanceled = Boolean(resolvedParams?.canceled);
  const isUpgraded = resolvedParams?.upgraded === "true";

  return (
    <div className="min-h-dvh bg-background text-foreground flex flex-col justify-between p-4 sm:p-8">
      {/* Top Navigation */}
      <header className="w-full max-w-5xl mx-auto flex items-center justify-between pb-4 border-b border-border/50">
        <Logo href="/dashboard" />
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted hidden sm:inline">{user.email}</span>
          <form action={signOutAction}>
            <Button
              variant="ghost"
              size="sm"
              type="submit"
              className="text-xs text-muted hover:text-foreground"
            >
              <LogOut className="size-3.5 mr-1.5" />
              Sign out
            </Button>
          </form>
        </div>
      </header>

      {/* Main Content */}
      <main className="w-full my-auto py-8">
        <SubscriptionClient
          currentPlanId={planInfo.planId}
          userEmail={user.email || ""}
          isCanceled={isCanceled}
          isUpgraded={isUpgraded}
        />
      </main>

      {/* Footer */}
      <footer className="text-center text-xs text-muted py-4 border-t border-border/50">
        <p>© {new Date().getFullYear()} ClosetAI. Fast & secure checkout via Paystack & Stripe.</p>
      </footer>
    </div>
  );
}

import { redirect } from "next/navigation";
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
        <p className="mt-2 text-muted">A few quick questions so suggestions fit you. Everything here is optional except your name.</p>
        <Card className="mt-6 p-6 sm:p-8">
          <OnboardingForm initialName={profile?.display_name ?? user.email?.split("@")[0] ?? ""} />
        </Card>
      </main>
    </div>
  );
}

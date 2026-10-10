import { redirect } from "next/navigation";
import { ConfigNotice } from "@/components/layout/config-notice";
import { MobileNav, Sidebar } from "@/components/layout/app-nav";
import { getProfile, requireUser } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/env";

// Every page in this group is per-user and reads the session, so it must never be prerendered
// at build time (that could bake a "not configured" state into a deployed build).
export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (!isSupabaseConfigured()) {
    return <ConfigNotice integration="Supabase" variables={["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]} />;
  }

  const user = await requireUser();
  const profile = await getProfile();
  // First sign-in after registration goes through onboarding exactly once.
  if (profile && !profile.onboarding_completed_at) redirect("/onboarding");

  const displayName = profile?.display_name ?? user.email ?? "You";

  return (
    <div className="flex min-h-dvh">
      <Sidebar displayName={displayName} />
      <div className="min-w-0 flex-1">
        <MobileNav displayName={displayName} />
        <main id="main" className="mx-auto w-full max-w-6xl px-4 pb-28 pt-6 sm:px-8 lg:pb-12 lg:pt-10">
          {children}
        </main>
      </div>
    </div>
  );
}

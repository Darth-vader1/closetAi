import { redirect } from "next/navigation";
import { ConfigNotice } from "@/components/layout/config-notice";
import { MobileNav, Sidebar } from "@/components/layout/app-nav";
import { AppMain } from "@/components/layout/app-main";
import { ProductTour } from "@/components/onboarding/product-tour";
import { ConnectNotificationProvider } from "@/components/connect/connect-notification-provider";
import { getProfile, requireUser } from "@/lib/auth/session";
import { isAdminUser } from "@/lib/auth/admin";
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
  if (!profile || !profile.onboarding_completed_at) redirect("/onboarding");

  const isAdmin = await isAdminUser(user);

  const displayName = profile?.display_name ?? user.email ?? "You";

  return (
    <ConnectNotificationProvider currentUserId={user.id}>
      <div className="flex min-h-dvh overflow-x-hidden">
        <Sidebar displayName={displayName} isAdmin={isAdmin} />
        <div className="min-w-0 flex-1 overflow-x-hidden lg:pl-64">
          <MobileNav displayName={displayName} isAdmin={isAdmin} />
          <AppMain>
            {children}
          </AppMain>
        </div>
        <ProductTour userId={user.id} />
      </div>
    </ConnectNotificationProvider>
  );
}

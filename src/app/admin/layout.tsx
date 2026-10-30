import { requireAdmin } from "@/lib/auth/admin";
import { AdminNav } from "@/components/admin/admin-nav";
import { Logo } from "@/components/layout/logo";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Admin Console · ClosetAI",
  description: "Platform analytics, subscribers, user management, and broadcast tools.",
};

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const admin = await requireAdmin();

  return (
    <div className="min-h-dvh bg-background text-foreground flex flex-col">
      {/* Top Admin Bar */}
      <header className="sticky top-0 z-40 border-b border-border bg-surface/95 backdrop-blur-md px-4 sm:px-8 py-3.5">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
          <div className="flex items-center gap-6">
            <Logo href="/admin" />
            <span className="hidden sm:inline-flex items-center rounded-md bg-accent-soft px-2 py-0.5 text-xs font-semibold text-accent uppercase tracking-wider">
              Staff Console
            </span>
          </div>

          <div className="flex items-center gap-3">
            <span className="hidden md:inline text-xs text-muted">
              Signed in as <strong className="text-foreground">{admin.email}</strong>
            </span>
            <a
              href="/dashboard"
              className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3.5 py-1.5 text-xs font-medium text-foreground hover:bg-surface-muted transition-colors"
            >
              Back to Member App →
            </a>
          </div>
        </div>
      </header>

      {/* Admin Tab Navigation */}
      <div className="border-b border-border bg-surface px-4 sm:px-8">
        <div className="max-w-7xl mx-auto">
          <AdminNav />
        </div>
      </div>

      {/* Main Admin Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-8 py-8">
        {children}
      </main>
    </div>
  );
}

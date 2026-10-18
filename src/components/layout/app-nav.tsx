"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Compass, Ellipsis, LogOut, X } from "lucide-react";
import { signOutAction } from "@/app/(auth)/actions";
import { Logo } from "@/components/layout/logo";
import { NAV_ITEMS } from "@/components/layout/nav-items";
import { triggerProductTour } from "@/components/onboarding/product-tour";
import { cn } from "@/lib/utils/cn";
import { InstallPwaBanner } from "@/components/ui/install-pwa-banner";
import { isChatRoute } from "@/components/layout/app-main";

function isActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

function SignOutButton({ className }: { className?: string }) {
  return (
    <form action={signOutAction}>
      <button
        type="submit"
        className={cn(
          "flex min-h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-muted hover:bg-surface-muted hover:text-foreground",
          className,
        )}
      >
        <LogOut className="size-[1.125rem]" aria-hidden />
        Sign out
      </button>
    </form>
  );
}

/** Desktop sidebar (lg and up). */
export function Sidebar({ displayName }: { displayName: string }) {
  const pathname = usePathname();
  return (
    <aside className="fixed left-0 top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-border bg-surface px-4 py-6 lg:flex overflow-hidden">
      <Logo href="/dashboard" className="px-2" />
      <nav aria-label="Main" className="mt-8 flex flex-1 flex-col gap-1 overflow-y-auto">
        {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              data-tour={`nav-${href}`}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex min-h-11 items-center gap-3 rounded-xl px-3 text-sm font-medium transition-colors",
                active ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface-muted hover:text-foreground",
              )}
            >
              <Icon className="size-[1.125rem]" aria-hidden />
              {label}
            </Link>
          );
        })}
      </nav>
      <div className="border-t border-border pt-3 space-y-1.5 shrink-0">
        <InstallPwaBanner />
        <button
          type="button"
          onClick={triggerProductTour}
          className="flex min-h-10 w-full items-center gap-3 rounded-xl px-3 text-sm font-medium text-muted hover:bg-surface-muted hover:text-foreground cursor-pointer"
        >
          <Compass className="size-[1.125rem] text-accent" aria-hidden />
          Product Tour
        </button>
        <p className="truncate px-3 pt-1 text-sm text-muted">{displayName}</p>
        <SignOutButton />
      </div>
    </aside>
  );
}

/** Compact mobile top bar + bottom tab bar (below lg). */
export function MobileNav({ displayName }: { displayName: string }) {
  const pathname = usePathname();
  const isChat = isChatRoute(pathname);

  // Remember which path the sheet was opened on, so it closes automatically after navigation
  // without needing an effect to reset state.
  const [openedOnPath, setOpenedOnPath] = useState<string | null>(null);
  const moreOpen = openedOnPath === pathname;
  const setMoreOpen = (open: boolean) => setOpenedOnPath(open ? pathname : null);
  const primary = NAV_ITEMS.filter((i) => i.primary);
  const secondary = NAV_ITEMS.filter((i) => !i.primary);
  const moreActive = secondary.some((i) => isActive(pathname, i.href));

  // Escape closes the sheet.
  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpenedOnPath(null);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moreOpen]);

  if (isChat) {
    return null;
  }

  return (
    <div className="lg:hidden">
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border bg-background/95 px-4 backdrop-blur-sm">
        <Logo href="/dashboard" />
        <button
          type="button"
          onClick={triggerProductTour}
          className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium text-muted hover:text-foreground"
        >
          <Compass className="size-3.5 text-accent" aria-hidden />
          Tour
        </button>
      </header>

      {moreOpen ? (
        <div className="fixed inset-0 z-40" role="dialog" aria-modal="true" aria-label="More navigation">
          <button type="button" className="absolute inset-0 bg-foreground/30" aria-label="Close menu" onClick={() => setMoreOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 rounded-t-3xl border-t border-border bg-surface px-4 pb-24 pt-5 space-y-3">
            <div className="flex items-center justify-between px-2">
              <p className="truncate text-sm text-muted">{displayName}</p>
              <button type="button" onClick={() => setMoreOpen(false)} className="grid size-11 place-items-center rounded-full hover:bg-surface-muted" aria-label="Close menu">
                <X className="size-5" aria-hidden />
              </button>
            </div>
            <InstallPwaBanner />
            <nav aria-label="More" className="flex flex-col gap-1">
              {secondary.map(({ href, label, icon: Icon }) => (
                <Link
                  key={href}
                  href={href}
                  aria-current={isActive(pathname, href) ? "page" : undefined}
                  className={cn(
                    "flex min-h-12 items-center gap-3 rounded-xl px-3 text-base font-medium",
                    isActive(pathname, href) ? "bg-accent-soft text-accent" : "text-foreground hover:bg-surface-muted",
                  )}
                >
                  <Icon className="size-5" aria-hidden />
                  {label}
                </Link>
              ))}
              <button
                type="button"
                onClick={() => {
                  setMoreOpen(false);
                  triggerProductTour();
                }}
                className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-base font-medium text-foreground hover:bg-surface-muted"
              >
                <Compass className="size-5 text-accent" aria-hidden />
                Product Tour
              </button>
              <SignOutButton className="min-h-12 text-base" />
            </nav>
          </div>
        </div>
      ) : null}

      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 z-50 grid grid-cols-5 border-t border-border bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm"
      >
        {primary.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              data-tour-mobile={`nav-${href}`}
              aria-current={active ? "page" : undefined}
              className={cn("flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium", active ? "text-accent" : "text-muted")}
            >
              <Icon className="size-5" aria-hidden />
              {label.replace("My ", "").replace("Outfit ", "")}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={() => setMoreOpen(!moreOpen)}
          aria-expanded={moreOpen}
          className={cn("flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs font-medium", moreActive || moreOpen ? "text-accent" : "text-muted")}
        >
          <Ellipsis className="size-5" aria-hidden />
          More
        </button>
      </nav>
    </div>
  );
}

"use client";

import { Suspense, useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import Script from "next/script";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

const GA_ID =
  process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim() || "G-95KHRZ6S5S";
const SIGNUP_TRACKED_KEY = "closetai:ga_signup_tracked";

/**
 * Fires a custom or recommended Google Analytics 4 event if GA4 is configured.
 */
export function trackGaEvent(
  eventName: string,
  params?: Record<string, string | number | boolean>,
): void {
  if (typeof window === "undefined" || typeof window.gtag !== "function") {
    return;
  }
  window.gtag("event", eventName, params ?? {});
}

function RouteChangeTracker({ gaId }: { gaId: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const prevPathRef = useRef<string | null>(null);

  useEffect(() => {
    if (!gaId || typeof window === "undefined" || typeof window.gtag !== "function") {
      return;
    }
    const qs = searchParams?.toString();
    const pagePath = qs ? `${pathname}?${qs}` : pathname;
    window.gtag("config", gaId, {
      page_path: pagePath,
    });

    const prevPath = prevPathRef.current;
    prevPathRef.current = pathname;

    // 1. Track new user registration (every new account is routed to /onboarding once)
    if (pathname.startsWith("/onboarding")) {
      try {
        if (!window.localStorage.getItem(SIGNUP_TRACKED_KEY)) {
          window.localStorage.setItem(SIGNUP_TRACKED_KEY, "1");
          trackGaEvent("sign_up", { method: "closetai_auth" });
        }
      } catch {
        trackGaEvent("sign_up", { method: "closetai_auth" });
      }
    }

    // 2. Track sign-in completion when transitioning from /login to an authenticated route
    if (
      prevPath === "/login" &&
      (pathname.startsWith("/dashboard") ||
        pathname.startsWith("/wardrobe") ||
        pathname.startsWith("/connect"))
    ) {
      trackGaEvent("login", { method: "closetai_auth" });
    }

    // 3. Track core feature engagement milestones
    if (pathname === "/wardrobe/new") {
      trackGaEvent("begin_add_garment");
    } else if (pathname === "/studio") {
      trackGaEvent("view_outfit_studio");
    } else if (pathname === "/packing") {
      trackGaEvent("view_packing_planner");
    } else if (pathname === "/connect") {
      trackGaEvent("view_connect_inbox");
    }
  }, [gaId, pathname, searchParams]);

  return null;
}

export function GoogleAnalytics() {
  if (!GA_ID || !/^G-[A-Z0-9]+$/i.test(GA_ID)) {
    return null;
  }

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA_ID)}`}
        strategy="afterInteractive"
      />
      <Script id="google-analytics-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          window.gtag = gtag;
          gtag('js', new Date());
          gtag('config', '${GA_ID}', {
            anonymize_ip: true,
            send_page_view: true
          });
        `}
      </Script>
      <Suspense fallback={null}>
        <RouteChangeTracker gaId={GA_ID} />
      </Suspense>
    </>
  );
}

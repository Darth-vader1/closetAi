"use client";

import { useEffect, useSyncExternalStore } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Script from "next/script";

const GA_MEASUREMENT_ID =
  process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID?.trim() || "G-MVB7W0WNCX";

const CONSENT_STORAGE_KEY = "closetai_analytics_consent_v1";
const CONSENT_CHANGE_EVENT = "closetai:analytics-consent-change";

type ConsentState = "loading" | "undecided" | "accepted" | "declined";

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

/**
 * Private application routes where Google Analytics must never run or fire
 * page_view events.
 */
export function isAnalyticsExcludedPath(pathname: string | null): boolean {
  if (!pathname) return true;
  return (
    pathname === "/connect" ||
    pathname.startsWith("/connect/") ||
    pathname === "/settings" ||
    pathname.startsWith("/settings/") ||
    pathname === "/wardrobe" ||
    pathname.startsWith("/wardrobe/")
  );
}

function readStoredConsent(): ConsentState {
  if (typeof window === "undefined") return "loading";
  try {
    const val = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    if (val === "accepted" || val === "declined") return val;
  } catch {
    // Ignore storage read errors in restricted browsing modes
  }
  return "undecided";
}

function subscribeConsent(callback: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener("storage", callback);
  window.addEventListener(CONSENT_CHANGE_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(CONSENT_CHANGE_EVENT, callback);
  };
}

function getServerConsentSnapshot(): ConsentState {
  return "loading";
}

function writeStoredConsent(choice: "accepted" | "declined"): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, choice);
    const maxAge = 60 * 60 * 24 * 365;
    document.cookie = `${CONSENT_STORAGE_KEY}=${choice}; path=/; max-age=${maxAge}; SameSite=Lax`;
    window.dispatchEvent(new Event(CONSENT_CHANGE_EVENT));
  } catch {
    // Ignore storage write errors
  }
}

export function GoogleAnalytics() {
  const pathname = usePathname();
  const consent = useSyncExternalStore(
    subscribeConsent,
    readStoredConsent,
    getServerConsentSnapshot,
  );

  const skipOnRoute = isAnalyticsExcludedPath(pathname);
  const shouldLoadGa = Boolean(GA_MEASUREMENT_ID) && consent === "accepted" && !skipOnRoute;

  useEffect(() => {
    if (!shouldLoadGa || !pathname) return;
    if (typeof window === "undefined" || typeof window.gtag !== "function") return;

    // Never include query strings in page_path or page_location
    window.gtag("event", "page_view", {
      page_path: pathname,
      page_location: `${window.location.origin}${pathname}`,
    });
  }, [pathname, shouldLoadGa]);

  if (!GA_MEASUREMENT_ID) return null;

  return (
    <>
      {shouldLoadGa && (
        <>
          <Script
            src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`}
            strategy="afterInteractive"
          />
          <Script id="google-analytics-init" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              window.gtag = gtag;
              gtag('js', new Date());
              gtag('config', '${GA_MEASUREMENT_ID}', {
                send_page_view: false,
                anonymize_ip: true,
                allow_google_signals: false,
                allow_ad_personalization_signals: false,
                page_path: window.location.pathname,
                page_location: window.location.origin + window.location.pathname
              });
            `}
          </Script>
        </>
      )}

      {consent === "undecided" && (
        <div
          role="region"
          aria-label="Cookie consent"
          className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-surface/95 px-4 py-3 shadow-lg backdrop-blur-sm"
        >
          <div className="mx-auto flex max-w-5xl flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
            <p className="text-xs text-muted">
              We use optional analytics cookies to understand public page visits. Analytics never
              runs on your private wardrobe, Connect messages, or account settings. See our{" "}
              <Link href="/privacy" className="font-medium text-foreground underline underline-offset-4">
                Privacy Policy
              </Link>
              .
            </p>
            <div className="flex shrink-0 items-center gap-2">
              <button
                type="button"
                onClick={() => writeStoredConsent("declined")}
                className="rounded-lg border border-border bg-surface-muted px-3 py-1.5 text-xs font-medium text-foreground transition hover:bg-surface"
              >
                Essential only
              </button>
              <button
                type="button"
                onClick={() => writeStoredConsent("accepted")}
                className="rounded-lg bg-foreground px-3 py-1.5 text-xs font-medium text-background transition hover:opacity-90"
              >
                Accept analytics
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

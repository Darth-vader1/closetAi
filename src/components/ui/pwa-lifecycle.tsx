"use client";

import { useEffect } from "react";

/**
 * Registers the service worker and handles its lifecycle.
 * Must be included in the root layout for PWA functionality.
 */
export function PwaLifecycle() {
  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      "serviceWorker" in navigator &&
      process.env.NODE_ENV === "production"
    ) {
      const registerServiceWorker = async () => {
        try {
          const registration = await navigator.serviceWorker.register("/sw.js", {
            scope: "/",
          });

          console.log("Service Worker registered successfully:", registration.scope);

          // Check for updates immediately
          registration.update();
        } catch (error) {
          console.error("Service Worker registration failed:", error);
        }
      };

      // Register on page load
      registerServiceWorker();
    }
  }, []);

  return null; // This component doesn't render anything
}

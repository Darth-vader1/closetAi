"use client";

import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils/cn";
import { useVisualViewport } from "@/lib/hooks/use-visual-viewport";

/**
 * Checks whether the current path is a direct conversation thread (/connect/[id]),
 * excluding the main inbox (/connect), sharing settings (/connect/sharing),
 * and shared wardrobe views (/connect/shared/[grantId]).
 */
export function isChatRoute(pathname: string): boolean {
  return (
    pathname.startsWith("/connect/") &&
    pathname !== "/connect" &&
    pathname !== "/connect/sharing" &&
    !pathname.startsWith("/connect/shared/")
  );
}

export function AppMain({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isChat = isChatRoute(pathname);
  const { height, offsetTop } = useVisualViewport();

  const chatStyle =
    isChat && height !== null
      ? {
          height: `${height}px`,
          top: `${offsetTop}px`,
          bottom: "auto",
        }
      : undefined;

  return (
    <main
      id="main"
      style={chatStyle}
      className={cn(
        "mx-auto w-full",
        isChat
          ? "fixed inset-0 z-30 lg:static h-dvh max-w-none p-0 flex flex-col overflow-hidden overscroll-none lg:h-[calc(100dvh-2.5rem)] lg:max-w-6xl lg:px-8 lg:pt-6 lg:pb-6"
          : "max-w-6xl px-4 pb-28 pt-6 sm:px-8 lg:pb-12 lg:pt-10",
      )}
    >
      {children}
    </main>
  );
}

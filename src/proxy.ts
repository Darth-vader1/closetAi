import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // Skip Next internals, static assets, SEO files, Service Worker, OpenGraph images, and PWA manifest.
    "/((?!_next/static|_next/image|favicon.ico|robots\\.txt|sitemap\\.xml|sw\\.js|google96e8abdd2270e5c3\\.html|opengraph-image|twitter-image|manifest\\.webmanifest|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|webmanifest)$).*)",
  ],
};

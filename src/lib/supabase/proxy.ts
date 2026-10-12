import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isSupabaseConfigured } from "@/lib/env";

/** Routes reachable without a session. Everything else requires sign-in. */
const PUBLIC_EXACT = new Set([
  "/",
  "/login",
  "/signup",
  "/forgot-password",
  "/reset-password",
  "/privacy",
  "/terms",
  "/contact",
  "/manifest.webmanifest",
  "/manifest.json",
]);
const PUBLIC_PREFIXES = ["/auth/", "/api/cron/", "/unsubscribe"];
/** Signed-in users are bounced away from these. */
const AUTH_ONLY_GUEST = new Set(["/login", "/signup", "/forgot-password"]);

export function isPublicPath(pathname: string): boolean {
  return PUBLIC_EXACT.has(pathname) || PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

/**
 * Refreshes the Supabase session cookies and applies optimistic route protection.
 * This is a convenience layer only. Real authorization happens in the data layer
 * (requireUser) and in Postgres RLS.
 */
export async function updateSession(request: NextRequest): Promise<NextResponse> {
  const { pathname } = request.nextUrl;
  if (isPublicPath(pathname)) {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  if (!isSupabaseConfigured()) {
    // Without Supabase there is no session to check. Public pages still render;
    // protected pages show a configuration message via requireUser().
    return response;
  }

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) request.cookies.set(name, value);
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) response.cookies.set(name, value, options);
        },
      },
    },
  );

  // getClaims() validates the JWT and refreshes it when needed. Do not run other
  // logic between creating the client and this call.
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);

  if (!signedIn && !isPublicPath(pathname)) {
    // API callers (fetch/XHR) need a status code they can act on, not an HTML redirect.
    if (pathname.startsWith("/api/")) {
      const unauthorised = NextResponse.json({ error: "Please sign in again." }, { status: 401, headers: { "Cache-Control": "no-store" } });
      for (const cookie of response.cookies.getAll()) unauthorised.cookies.set(cookie);
      return unauthorised;
    }
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", pathname);
    return redirectWithCookies(url, response);
  }

  if (signedIn && AUTH_ONLY_GUEST.has(pathname)) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return redirectWithCookies(url, response);
  }

  return response;
}

/** Preserve any refreshed auth cookies when redirecting. */
function redirectWithCookies(url: URL, from: NextResponse): NextResponse {
  const redirect = NextResponse.redirect(url);
  for (const cookie of from.cookies.getAll()) redirect.cookies.set(cookie);
  return redirect;
}

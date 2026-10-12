import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabasePublicEnv } from "@/lib/env";

/**
 * Per-request Supabase client for Server Components, Server Actions and Route Handlers.
 * Acts as the signed-in user, so Row Level Security applies to every query.
 */
export const REMEMBER_COOKIE = "closetai_remember";
const THIRTY_DAYS_SECONDS = 60 * 60 * 24 * 30;

export async function createClient(clientOptions?: { rememberMe?: boolean }) {
  const env = getSupabasePublicEnv();
  const cookieStore = await cookies();

  const sessionOnly =
    clientOptions?.rememberMe === false ||
    (clientOptions?.rememberMe === undefined && cookieStore.get(REMEMBER_COOKIE)?.value === "0");

  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            if (sessionOnly && value) {
              const sessionOpts = { ...options };
              delete sessionOpts.maxAge;
              delete sessionOpts.expires;
              cookieStore.set(name, value, sessionOpts);
            } else if (!sessionOnly && value) {
              cookieStore.set(name, value, {
                ...options,
                maxAge: options?.maxAge ?? THIRTY_DAYS_SECONDS,
              });
            } else {
              cookieStore.set(name, value, options);
            }
          }
        } catch {
          // Called from a Server Component, where cookies are read-only.
          // Safe to ignore because proxy.ts refreshes the session on every request.
        }
      },
    },
  });
}

import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface SessionUser {
  id: string;
  email: string | null;
}

/**
 * Reads the verified session for this request. `getClaims()` validates the JWT, so the
 * returned id can be trusted for ownership checks. Never accept a user id from the client.
 * Memoised per request with React `cache`.
 */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  return { id: claims.sub, email: typeof claims.email === "string" ? claims.email : null };
});

/** Data-access-layer guard: call at the top of every protected page, action and route handler. */
export async function requireUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  return user;
}

export interface Profile {
  id: string;
  display_name: string | null;
  preferred_style: string | string[] | null;
  favourite_colours: string[];
  common_occasions: string[];
  location: string | null;
  timezone: string;
  rewear_worn_items: boolean;
  onboarding_completed_at: string | null;
}

export const getProfile = cache(async (): Promise<Profile | null> => {
  const user = await getSessionUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("profiles")
    .select(
      "id, display_name, preferred_style, favourite_colours, common_occasions, location, timezone, rewear_worn_items, onboarding_completed_at",
    )
    .eq("id", user.id)
    .maybeSingle();
  if (error) throw new Error(`Could not load profile: ${error.message}`);
  return data;
});

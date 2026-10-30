import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { getProfile, getSessionUser, type SessionUser } from "@/lib/auth/session";
import { createAdminClient } from "@/lib/supabase/admin";

const DEFAULT_NOTIFICATION_ADMIN_EMAILS = [
  "gbolahanabiodun92@gmail.com",
  "olufemi-abiodun.gbolahan@st.tau.edu.ng",
];

export function getAdminEmails(): string[] {
  const envAdminsRaw = process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || "";
  const envAdmins = envAdminsRaw
    ? envAdminsRaw
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean)
    : [];
  return Array.from(new Set([...DEFAULT_NOTIFICATION_ADMIN_EMAILS, ...envAdmins]));
}

export function getEnvAdminEmails(): string[] {
  const envAdminsRaw = process.env.ADMIN_EMAILS || process.env.ADMIN_EMAIL || "";
  return envAdminsRaw
    ? envAdminsRaw
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean)
    : [];
}

/**
 * Checks whether a session user has administrator privileges.
 *
 * Rules:
 * - Removed hardcoded emails.
 * - Primary source of truth: `profiles.role` column ('admin' or 'superadmin').
 * - Fallback: ADMIN_EMAILS environment variable ONLY if user has a confirmed email (email_confirmed_at).
 */
export const isAdminUser = cache(async (user?: SessionUser | null): Promise<boolean> => {
  const sessionUser = user || (await getSessionUser());
  if (!sessionUser) return false;

  // 1. Check profiles.role column via profile or service-role client
  const profile = await getProfile();
  const profileRole = (profile as { role?: string } | null)?.role;

  if (profileRole === "admin" || profileRole === "superadmin") {
    return true;
  }

  // If profile didn't select role or wasn't loaded, check directly via admin client
  const adminClient = createAdminClient();
  const { data: dbProfile } = await adminClient
    .from("profiles")
    .select("role")
    .eq("id", sessionUser.id)
    .maybeSingle();

  if (dbProfile?.role === "admin" || dbProfile?.role === "superadmin") {
    return true;
  }

  // 2. Fallback: ADMIN_EMAILS environment variable (requires email_confirmed_at)
  const envAdmins = getEnvAdminEmails();
  const userEmail = sessionUser.email?.toLowerCase();

  if (userEmail && envAdmins.includes(userEmail)) {
    try {
      const { data: authUser, error: authError } = await adminClient.auth.admin.getUserById(sessionUser.id);
      if (!authError && authUser?.user?.email_confirmed_at) {
        return true;
      }
    } catch {
      // If auth lookup fails, do not grant admin access
      return false;
    }
  }

  return false;
});

/** Enforces admin access for layouts, pages, and Server Actions. */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    redirect("/login");
  }

  const authorized = await isAdminUser(user);
  if (!authorized) {
    redirect("/dashboard");
  }

  return user;
}

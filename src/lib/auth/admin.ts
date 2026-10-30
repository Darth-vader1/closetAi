import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { getProfile, getSessionUser, type SessionUser } from "@/lib/auth/session";

const DEFAULT_ADMIN_EMAILS = [
  "gbolahanabiodun92@gmail.com",
  "olufemi-abiodun.gbolahan@st.tau.edu.ng",
];

export function getAdminEmails(): string[] {
  const envAdmins = process.env.ADMIN_EMAILS
    ? process.env.ADMIN_EMAILS.split(",").map((e) => e.trim().toLowerCase()).filter(Boolean)
    : [];
  return Array.from(new Set([...DEFAULT_ADMIN_EMAILS, ...envAdmins]));
}

/** Checks whether a session user has administrator privileges. */
export const isAdminUser = cache(async (user?: SessionUser | null): Promise<boolean> => {
  const sessionUser = user || (await getSessionUser());
  if (!sessionUser) return false;

  const email = sessionUser.email?.toLowerCase();
  const adminEmails = getAdminEmails();

  if (email && adminEmails.includes(email)) {
    return true;
  }

  const profile = await getProfile();
  const role = (profile as { role?: string } | null)?.role;
  return role === "admin" || role === "superadmin";
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

import type { Metadata } from "next";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { ResetPasswordForm } from "@/components/auth/auth-forms";
import { Alert } from "@/components/ui/card";
import { getSessionUser } from "@/lib/auth/session";
import { isSupabaseConfigured } from "@/lib/env";

export const metadata: Metadata = { title: "Choose a new password" };

// Every page in this group is per-user and reads the session, so it must never be prerendered
// at build time (that could bake a "not configured" state into a deployed build).
export const dynamic = "force-dynamic";

export default async function ResetPasswordPage() {
  // The recovery link signs the user in via /auth/callback; without that session there is nothing to reset.
  const user = isSupabaseConfigured() ? await getSessionUser() : null;

  return (
    <AuthShell title="Choose a new password">
      {user ? (
        <ResetPasswordForm />
      ) : (
        <div className="space-y-4">
          <Alert tone="warning">This reset link has expired or was already used.</Alert>
          <Link href="/forgot-password" className="inline-block font-medium text-accent underline underline-offset-4">
            Request a new link
          </Link>
        </div>
      )}
    </AuthShell>
  );
}

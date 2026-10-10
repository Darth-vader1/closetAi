import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { LoginForm } from "@/components/auth/auth-forms";
import { safeRedirectPath } from "@/lib/security/redirect";

export const metadata: Metadata = { title: "Sign in" };

const NOTICES: Record<string, string> = {
  link_expired: "That link has expired or was already used. Sign in, or request a new one.",
  link_invalid: "That link isn't valid. Sign in, or request a new one.",
};

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const params = await searchParams;
  const next = params.next ? safeRedirectPath(params.next) : undefined;
  return (
    <AuthShell title="Welcome back" subtitle="Sign in to see what's ready to wear.">
      <LoginForm next={next} notice={params.error ? NOTICES[params.error] ?? null : null} />
    </AuthShell>
  );
}

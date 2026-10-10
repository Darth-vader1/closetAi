import type { Metadata } from "next";
import { NotBuiltYet } from "@/components/layout/not-built-yet";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  await requireUser();
  return (
    <NotBuiltYet title="Settings" description="Profile, style preferences and email notifications." phase="Phase 5">
      You&apos;ll set your preferences during onboarding. A full settings page comes with the email workflows, so every control shown here will actually work.
    </NotBuiltYet>
  );
}

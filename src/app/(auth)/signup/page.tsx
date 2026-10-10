import type { Metadata } from "next";
import { AuthShell } from "@/components/auth/auth-shell";
import { SignUpForm } from "@/components/auth/auth-forms";

export const metadata: Metadata = { title: "Create your account" };

export default function SignUpPage() {
  return (
    <AuthShell title="Create your account" subtitle="Start building a wardrobe you can actually see.">
      <SignUpForm />
    </AuthShell>
  );
}

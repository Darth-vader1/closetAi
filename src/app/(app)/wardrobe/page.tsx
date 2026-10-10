import type { Metadata } from "next";
import { NotBuiltYet } from "@/components/layout/not-built-yet";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "My Wardrobe" };

export default async function WardrobePage() {
  await requireUser();
  return (
    <NotBuiltYet title="My Wardrobe" description="Every garment you own, with its photo and laundry status." phase="Phase 2">
      Photo upload, AI-assisted tagging, search and filters are the next thing being built.
    </NotBuiltYet>
  );
}

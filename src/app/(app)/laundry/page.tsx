import type { Metadata } from "next";
import { NotBuiltYet } from "@/components/layout/not-built-yet";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Laundry" };

export default async function LaundryPage() {
  await requireUser();
  return (
    <NotBuiltYet title="Laundry" description="See what's clean, dirty, washing or drying." phase="Phase 2">
      The status rules and database function behind this page already exist and are tested. The dashboard that uses them arrives with the wardrobe.
    </NotBuiltYet>
  );
}

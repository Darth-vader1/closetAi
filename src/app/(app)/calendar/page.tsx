import type { Metadata } from "next";
import { NotBuiltYet } from "@/components/layout/not-built-yet";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Outfit Calendar" };

export default async function CalendarPage() {
  await requireUser();
  return (
    <NotBuiltYet title="Outfit Calendar" description="Plan outfits for the week ahead." phase="Phase 4">
      Planning needs saved outfits first. Planned outfits will stay separate from outfits you&apos;ve confirmed you wore.
    </NotBuiltYet>
  );
}

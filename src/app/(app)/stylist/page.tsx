import type { Metadata } from "next";
import { NotBuiltYet } from "@/components/layout/not-built-yet";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "AI Stylist" };

export default async function StylistPage() {
  await requireUser();
  return (
    <NotBuiltYet title="AI Stylist" description="Ask for outfit ideas in plain language." phase="Phase 4">
      The stylist will be grounded in your real wardrobe and laundry status, so it comes after the outfit engine.
    </NotBuiltYet>
  );
}

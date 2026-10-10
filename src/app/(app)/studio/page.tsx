import type { Metadata } from "next";
import { NotBuiltYet } from "@/components/layout/not-built-yet";
import { requireUser } from "@/lib/auth/session";

export const metadata: Metadata = { title: "Outfit Studio" };

export default async function StudioPage() {
  await requireUser();
  return (
    <NotBuiltYet title="Outfit Studio" description="Generate and build outfits from clothes that are ready to wear." phase="Phase 3">
      The outfit engine needs your wardrobe first, so this follows the wardrobe and laundry work.
    </NotBuiltYet>
  );
}

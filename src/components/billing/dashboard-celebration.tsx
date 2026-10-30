"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { PremiumCelebrationModal } from "./premium-celebration-modal";

export function DashboardCelebration({
  initialUpgraded = false,
}: {
  initialUpgraded?: boolean;
}) {
  const searchParams = useSearchParams();
  const [dismissed, setDismissed] = useState(false);

  const isUpgraded = searchParams.get("upgraded") === "true" || initialUpgraded;
  const isOpen = !dismissed && isUpgraded;

  if (!isOpen) return null;

  return (
    <PremiumCelebrationModal
      isOpen={isOpen}
      onClose={() => setDismissed(true)}
    />
  );
}

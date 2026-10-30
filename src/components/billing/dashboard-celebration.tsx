"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PremiumCelebrationModal } from "./premium-celebration-modal";

export function DashboardCelebration({
  initialUpgraded = false,
}: {
  initialUpgraded?: boolean;
}) {
  const searchParams = useSearchParams();
  const [isOpen, setIsOpen] = useState(initialUpgraded);

  useEffect(() => {
    if (searchParams.get("upgraded") === "true") {
      setIsOpen(true);
    }
  }, [searchParams]);

  if (!isOpen) return null;

  return (
    <PremiumCelebrationModal
      isOpen={isOpen}
      onClose={() => setIsOpen(false)}
    />
  );
}

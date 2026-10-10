import { Check, Droplets, Hourglass, PackageX, Shirt, WashingMachine, Wind, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { STATUS_LABELS, type LaundryStatus } from "@/lib/wardrobe/status";

const STYLES: Record<LaundryStatus, { tone: string; icon: LucideIcon }> = {
  CLEAN: { tone: "bg-success-soft text-success", icon: Check },
  WORN: { tone: "bg-surface-muted text-foreground", icon: Shirt },
  DIRTY: { tone: "bg-warning-soft text-warning", icon: Droplets },
  IN_LAUNDRY: { tone: "bg-warning-soft text-warning", icon: Hourglass },
  WASHING: { tone: "bg-accent-soft text-accent", icon: WashingMachine },
  DRYING: { tone: "bg-accent-soft text-accent", icon: Wind },
  UNAVAILABLE: { tone: "bg-danger-soft text-danger", icon: PackageX },
};

/** Status is always shown as icon + text, never colour alone. */
export function StatusBadge({ status, className }: { status: LaundryStatus; className?: string }) {
  const { tone, icon: Icon } = STYLES[status];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium", tone, className)}>
      <Icon className="size-3" aria-hidden />
      {STATUS_LABELS[status]}
    </span>
  );
}

import { Droplet, Sparkles, XCircle } from "lucide-react";
import type { CareType } from "@/lib/wardrobe/categories";
import { careTypeLabel } from "@/lib/wardrobe/categories";

export function CareTypeBadge({ careType }: { careType: CareType }) {
  const label = careTypeLabel(careType);
  
  switch (careType) {
    case "WASHABLE":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800 dark:bg-blue-950 dark:text-blue-200">
          <Droplet className="size-3" aria-hidden />
          {label}
        </span>
      );
    case "WIPE_CLEAN":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-200">
          <Sparkles className="size-3" aria-hidden />
          {label}
        </span>
      );
    case "NO_WASH":
      return (
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-800 dark:bg-slate-800 dark:text-slate-200">
          <XCircle className="size-3" aria-hidden />
          {label}
        </span>
      );
  }
}

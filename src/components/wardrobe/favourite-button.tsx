"use client";

import { useOptimistic, useTransition } from "react";
import { Heart } from "lucide-react";
import { setFavouriteAction } from "@/app/(app)/wardrobe/actions";
import { cn } from "@/lib/utils/cn";

export function FavouriteButton({ id, name, isFavourite, className }: { id: string; name: string; isFavourite: boolean; className?: string }) {
  const [, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useOptimistic(isFavourite);

  return (
    <button
      type="button"
      aria-pressed={optimistic}
      aria-label={optimistic ? `Remove ${name} from favourites` : `Add ${name} to favourites`}
      onClick={() =>
        startTransition(async () => {
          setOptimistic(!optimistic);
          await setFavouriteAction(id, !optimistic);
        })
      }
      className={cn("grid size-11 place-items-center rounded-full bg-surface/90 shadow-sm backdrop-blur-sm hover:bg-surface", className)}
    >
      <Heart className={cn("size-5", optimistic ? "fill-accent text-accent" : "text-foreground")} aria-hidden />
    </button>
  );
}

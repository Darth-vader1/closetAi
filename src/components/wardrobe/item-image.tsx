import { ImageOff } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/**
 * Renders a garment photo from a short-lived signed URL. A plain <img> is used on purpose: signed URLs
 * change every request, so next/image's optimiser cache would never hit, and photos are already
 * resized to at most 1600px when uploaded.
 */
export function ItemImage({ url, alt, className }: { url: string | undefined; alt: string; className?: string }) {
  if (!url) {
    return (
      <div className={cn("grid place-items-center bg-surface-muted text-muted", className)} role="img" aria-label={`${alt} (photo unavailable)`}>
        <ImageOff className="size-6" aria-hidden />
      </div>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element -- signed, per-request URL; see note above
  return <img src={url} alt={alt} loading="lazy" decoding="async" className={cn("bg-surface-muted object-cover", className)} />;
}

import Image from "next/image";
import { ImageOff } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/**
 * Renders a garment photo from a Supabase signed URL (plain or transform-signed).
 *
 * Switching from a plain <img> to next/image is now safe because we request
 * transform-signed URLs (/render/image/sign/…) which include the resize
 * dimensions in the path rather than as volatile query-string tokens.
 * next/image adds:
 *   - Automatic WebP/AVIF negotiation via the Accept header
 *   - Lazy-loading by default (loading="lazy")
 *   - Prevents layout shift via the required sizes prop
 *   - Serves a locally cached optimised copy on Vercel (or the Next.js built-in
 *     image optimiser in self-hosted deployments)
 *
 * The `sizes` prop must be passed by each call-site so the browser can pick the
 * right resolution from the srcset without downloading a needlessly large image.
 * A sensible default is provided for backwards-compatible call-sites.
 */
export function ItemImage({
  url,
  alt,
  className,
  sizes = "(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 240px",
  priority = false,
}: {
  url: string | undefined;
  alt: string;
  className?: string;
  /** Passed directly to next/image to enable responsive srcsets. */
  sizes?: string;
  /** Set true for the first visible image on the page to avoid LCP penalty. */
  priority?: boolean;
}) {
  if (!url) {
    return (
      <div
        className={cn("grid place-items-center bg-surface-muted text-muted", className)}
        role="img"
        aria-label={`${alt} (photo unavailable)`}
      >
        <ImageOff className="size-6" aria-hidden />
      </div>
    );
  }

  return (
    <div className={cn("relative overflow-hidden bg-surface-muted", className)}>
      <Image
        src={url}
        alt={alt}
        fill
        sizes={sizes}
        className="object-cover"
        loading={priority ? "eager" : "lazy"}
        priority={priority}
      />
    </div>
  );
}

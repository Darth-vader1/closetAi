import Link from "next/link";
import { cn } from "@/lib/utils/cn";

/** Wordmark with a simple hanger glyph, drawn inline so it needs no asset. */
export function Logo({ className, href = "/" }: { className?: string; href?: string }) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-2.5", className)} aria-label="ClosetAI home">
      <svg viewBox="0 0 32 32" className="size-7 text-accent" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M16 9.5a2.6 2.6 0 1 0-2.6-2.6" />
        <path d="M16 9.5v2.2L3.8 20.4a1.6 1.6 0 0 0 .9 2.9h22.6a1.6 1.6 0 0 0 .9-2.9L16 11.7" />
      </svg>
      <span className="font-display text-xl font-semibold tracking-tight">ClosetAI</span>
    </Link>
  );
}

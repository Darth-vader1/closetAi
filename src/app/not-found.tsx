import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col items-center justify-center gap-4 px-4 text-center">
      <p className="font-display text-7xl text-accent">404</p>
      <h1 className="text-3xl">We couldn&apos;t find that page</h1>
      <p className="text-muted">It may have moved, or the link might be mistyped.</p>
      <Button asChild className="mt-2">
        <Link href="/">Back to ClosetAI</Link>
      </Button>
    </div>
  );
}

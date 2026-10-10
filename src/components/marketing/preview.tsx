import { Check, WashingMachine } from "lucide-react";
import { cn } from "@/lib/utils/cn";

/** Flat garment silhouettes. Purely illustrative; real photos replace these once users upload them. */
const SHAPES = {
  tee: "M30 14 L10 28 L20 42 L28 37 L28 88 L72 88 L72 37 L80 42 L90 28 L70 14 C65 22 35 22 30 14 Z",
  trousers: "M30 12 H70 L74 90 H55 L50 40 L45 90 H26 Z",
  shoe: "M6 60 C6 48 14 44 24 44 L40 46 C48 52 58 56 72 58 C88 60 94 64 94 72 V80 H6 Z",
} as const;

function Garment({
  shape,
  color,
  name,
  status,
  dimmed,
}: {
  shape: keyof typeof SHAPES;
  color: string;
  name: string;
  status: "Clean" | "Needs washing";
  dimmed?: boolean;
}) {
  const clean = status === "Clean";
  return (
    <div className={cn("rounded-2xl border border-border bg-surface p-3", dimmed && "opacity-60")}>
      <div className="grid aspect-square place-items-center rounded-xl bg-surface-muted">
        <svg viewBox="0 0 100 100" className="size-3/4" aria-hidden>
          <path d={SHAPES[shape]} fill={color} stroke="rgba(35,33,30,0.25)" strokeWidth="1.5" strokeLinejoin="round" />
          {shape === "shoe" ? <path d="M6 72 H94" stroke="rgba(35,33,30,0.25)" strokeWidth="1.5" /> : null}
        </svg>
      </div>
      <p className="mt-2 truncate text-sm font-medium">{name}</p>
      <p className={cn("mt-0.5 inline-flex items-center gap-1 text-xs font-medium", clean ? "text-success" : "text-warning")}>
        {clean ? <Check className="size-3" aria-hidden /> : <WashingMachine className="size-3" aria-hidden />}
        {status}
      </p>
    </div>
  );
}

export function WardrobePreview() {
  return (
    <figure>
      <div className="rounded-[1.75rem] border border-border bg-surface p-4 shadow-[0_24px_60px_-30px_rgba(35,33,30,0.35)] sm:p-6">
        <div className="mb-4 flex items-center justify-between">
          <p className="font-display text-xl">Today&apos;s outfit</p>
          <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-medium text-accent">Smart casual</span>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Garment shape="tee" color="#2f3a4a" name="Navy tee" status="Clean" />
          <Garment shape="trousers" color="#b9a98f" name="Stone chinos" status="Clean" />
          <Garment shape="shoe" color="#e9e4da" name="White sneakers" status="Clean" />
        </div>
        <p className="mt-4 text-sm text-muted">Navy and stone sit well together, and every piece here is ready to wear.</p>
        <div className="mt-5 border-t border-border pt-4">
          <p className="mb-3 text-xs font-medium uppercase tracking-wider text-muted">Left out of suggestions</p>
          <div className="grid grid-cols-3 gap-3">
            <Garment shape="tee" color="#3f5a46" name="Green tee" status="Needs washing" dimmed />
          </div>
        </div>
      </div>
      <figcaption className="mt-3 text-center text-sm text-muted">
        Illustrative preview. In the app, your own photos appear here.
      </figcaption>
    </figure>
  );
}

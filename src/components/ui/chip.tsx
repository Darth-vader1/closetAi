import { cn } from "@/lib/utils/cn";

/** Toggle chip for multi-select groups. Uses aria-pressed so screen readers announce state. */
export function Chip({ selected, onToggle, children }: { selected: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onToggle}
      className={cn(
        "min-h-10 rounded-full border px-4 text-sm font-medium transition-colors",
        selected ? "border-accent bg-accent-soft text-accent" : "border-border-strong bg-surface text-foreground hover:bg-surface-muted",
      )}
    >
      {children}
    </button>
  );
}

export function toggleValue<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
}

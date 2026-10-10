import Link from "next/link";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { SORT_OPTIONS, type WardrobeQuery } from "@/lib/validation/wardrobe";
import { CATEGORIES, humanise, WARDROBE_COLOURS } from "@/lib/wardrobe/categories";
import { LAUNDRY_STATUSES, STATUS_LABELS } from "@/lib/wardrobe/status";

/** A plain GET form: filters live in the URL, are shareable, and work without JavaScript. */
export function FilterBar({ query }: { query: WardrobeQuery }) {
  const active = Boolean(query.q || query.category || query.colour || query.status || query.favouritesOnly || query.sort !== "newest");

  return (
    <form method="get" action="/wardrobe" role="search" aria-label="Filter wardrobe" className="mb-6 space-y-4 rounded-[1.25rem] border border-border bg-surface p-4 sm:p-5">
      <div className="relative">
        <Label htmlFor="q" className="sr-only">Search by name</Label>
        <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
        <Input id="q" name="q" type="search" defaultValue={query.q} placeholder="Search by name" className="pl-11" />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Label htmlFor="category" className="mb-1 block text-muted">Category</Label>
          <Select id="category" name="category" defaultValue={query.category ?? ""}>
            <option value="">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="colour" className="mb-1 block text-muted">Colour</Label>
          <Select id="colour" name="colour" defaultValue={query.colour ?? ""}>
            <option value="">All colours</option>
            {WARDROBE_COLOURS.map((c) => (
              <option key={c} value={c}>{humanise(c)}</option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="status" className="mb-1 block text-muted">Status</Label>
          <Select id="status" name="status" defaultValue={query.status ?? ""}>
            <option value="">Any status</option>
            {LAUNDRY_STATUSES.map((s) => (
              <option key={s} value={s}>{STATUS_LABELS[s]}</option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="sort" className="mb-1 block text-muted">Sort by</Label>
          <Select id="sort" name="sort" defaultValue={query.sort}>
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </Select>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex min-h-11 items-center gap-3 text-sm font-medium">
          <input type="checkbox" name="favourites" value="1" defaultChecked={query.favouritesOnly} className="size-5 accent-[var(--accent)]" />
          Favourites only
        </label>
        <div className="flex items-center gap-3">
          {active ? (
            <Link href="/wardrobe" className="text-sm font-medium text-accent underline underline-offset-4">
              Clear filters
            </Link>
          ) : null}
          <Button type="submit" variant="dark">Apply</Button>
        </div>
      </div>
    </form>
  );
}

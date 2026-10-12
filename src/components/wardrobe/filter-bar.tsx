"use client";

import { useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { SORT_OPTIONS, type WardrobeQuery } from "@/lib/validation/wardrobe";
import { CATEGORIES, humanise, WARDROBE_COLOURS } from "@/lib/wardrobe/categories";
import { LAUNDRY_STATUSES, STATUS_LABELS } from "@/lib/wardrobe/status";

/**
 * Interactive FilterBar: filters live in the URL, update immediately when dropdowns or
 * checkboxes change, and also support standard form submission ("Apply" / Enter).
 */
export function FilterBar({ query }: { query: WardrobeQuery }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const active = Boolean(
    query.q ||
      query.category ||
      query.colour ||
      query.status ||
      query.favouritesOnly ||
      query.sort !== "newest",
  );

  const applyFiltersFromForm = () => {
    const form = formRef.current;
    if (!form) return;

    const formData = new FormData(form);
    const params = new URLSearchParams();

    const q = String(formData.get("q") ?? "").trim();
    const category = String(formData.get("category") ?? "");
    const colour = String(formData.get("colour") ?? "");
    const status = String(formData.get("status") ?? "");
    const sort = String(formData.get("sort") ?? "newest");
    const favourites = formData.get("favourites");

    if (q) params.set("q", q);
    if (category) params.set("category", category);
    if (colour) params.set("colour", colour);
    if (status) params.set("status", status);
    if (favourites === "1") params.set("favourites", "1");
    if (sort && sort !== "newest") params.set("sort", sort);

    const qs = params.toString();
    router.push(qs ? `/wardrobe?${qs}` : "/wardrobe");
  };

  const handleSearchChange = () => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      applyFiltersFromForm();
    }, 350);
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    applyFiltersFromForm();
  };

  const queryKey = `${query.q}|${query.category ?? ""}|${query.colour ?? ""}|${query.status ?? ""}|${query.favouritesOnly}|${query.sort}`;

  return (
    <form
      key={queryKey}
      ref={formRef}
      method="get"
      action="/wardrobe"
      onSubmit={handleSubmit}
      role="search"
      aria-label="Filter wardrobe"
      className="mb-6 space-y-4 rounded-[1.25rem] border border-border bg-surface p-4 sm:p-5"
    >
      <div className="relative">
        <Label htmlFor="q" className="sr-only">
          Search by name
        </Label>
        <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-muted" aria-hidden />
        <Input
          id="q"
          name="q"
          type="search"
          defaultValue={query.q}
          onChange={handleSearchChange}
          placeholder="Search by name"
          className="pl-11"
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Label htmlFor="category" className="mb-1 block text-muted">
            Category
          </Label>
          <Select id="category" name="category" defaultValue={query.category ?? ""} onChange={applyFiltersFromForm}>
            <option value="">All categories</option>
            {CATEGORIES.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="colour" className="mb-1 block text-muted">
            Colour
          </Label>
          <Select id="colour" name="colour" defaultValue={query.colour ?? ""} onChange={applyFiltersFromForm}>
            <option value="">All colours</option>
            {WARDROBE_COLOURS.map((c) => (
              <option key={c} value={c}>
                {humanise(c)}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="status" className="mb-1 block text-muted">
            Status
          </Label>
          <Select id="status" name="status" defaultValue={query.status ?? ""} onChange={applyFiltersFromForm}>
            <option value="">Any status</option>
            {LAUNDRY_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
        </div>
        <div>
          <Label htmlFor="sort" className="mb-1 block text-muted">
            Sort by
          </Label>
          <Select id="sort" name="sort" defaultValue={query.sort} onChange={applyFiltersFromForm}>
            {SORT_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex min-h-11 items-center gap-3 text-sm font-medium cursor-pointer">
          <input
            type="checkbox"
            name="favourites"
            value="1"
            defaultChecked={query.favouritesOnly}
            onChange={applyFiltersFromForm}
            className="size-5 accent-[var(--accent)]"
          />
          Favourites only
        </label>
        <div className="flex items-center gap-3">
          {active ? (
            <Link href="/wardrobe" className="text-sm font-medium text-accent underline underline-offset-4">
              Clear filters
            </Link>
          ) : null}
          <Button type="submit" variant="dark">
            Apply
          </Button>
        </div>
      </div>
    </form>
  );
}

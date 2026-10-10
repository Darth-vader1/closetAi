import type { Metadata } from "next";
import Link from "next/link";
import { Plus, SearchX, Shirt } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/card";
import { FilterBar } from "@/components/wardrobe/filter-bar";
import { ItemCard } from "@/components/wardrobe/item-card";
import { requireUser } from "@/lib/auth/session";
import { createClient } from "@/lib/supabase/server";
import { PAGE_SIZE, parseWardrobeQuery, type WardrobeQuery } from "@/lib/validation/wardrobe";
import { listWardrobeItems, signImageUrls } from "@/lib/wardrobe/queries";

export const metadata: Metadata = { title: "My Wardrobe" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function pageHref(query: WardrobeQuery, page: number): string {
  const params = new URLSearchParams();
  if (query.q) params.set("q", query.q);
  if (query.category) params.set("category", query.category);
  if (query.colour) params.set("colour", query.colour);
  if (query.status) params.set("status", query.status);
  if (query.favouritesOnly) params.set("favourites", "1");
  if (query.sort !== "newest") params.set("sort", query.sort);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return qs ? `/wardrobe?${qs}` : "/wardrobe";
}

export default async function WardrobePage({ searchParams }: { searchParams: SearchParams }) {
  const user = await requireUser();
  const query = parseWardrobeQuery(await searchParams);
  const supabase = await createClient();

  const { items, total } = await listWardrobeItems(supabase, user.id, query);
  const urls = await signImageUrls(supabase, items.map((i) => i.imagePath));
  const filtered = Boolean(query.q || query.category || query.colour || query.status || query.favouritesOnly);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <PageHeader
        title="My Wardrobe"
        description={total > 0 ? `${total} ${total === 1 ? "garment" : "garments"}${filtered ? " match your filters" : ""}.` : "Every garment you own, with its photo and laundry status."}
        action={
          <Button asChild>
            <Link href="/wardrobe/new">
              <Plus className="size-4" aria-hidden /> Add clothes
            </Link>
          </Button>
        }
      />

      {total === 0 && !filtered ? (
        <EmptyState
          icon={Shirt}
          title="Your wardrobe is empty"
          action={
            <Button asChild>
              <Link href="/wardrobe/new">Add your first garment</Link>
            </Button>
          }
        >
          Upload a photo of each piece. A few tops, bottoms and shoes are enough for ClosetAI to start suggesting outfits.
        </EmptyState>
      ) : (
        <>
          <FilterBar query={query} />
          {items.length === 0 ? (
            <EmptyState
              icon={SearchX}
              title={query.page > 1 ? "No more garments" : "Nothing matches those filters"}
              action={
                <Button asChild variant="outline">
                  <Link href="/wardrobe">Clear filters</Link>
                </Button>
              }
            >
              Try a different search or remove a filter.
            </EmptyState>
          ) : (
            <ul className="grid grid-cols-2 gap-3 sm:gap-5 md:grid-cols-3 xl:grid-cols-4">
              {items.map((item) => (
                <li key={item.id}>
                  <ItemCard item={item} imageUrl={urls.get(item.imagePath)} />
                </li>
              ))}
            </ul>
          )}

          {pages > 1 ? (
            <nav aria-label="Pagination" className="mt-8 flex items-center justify-between">
              {query.page > 1 ? (
                <Button asChild variant="outline"><Link href={pageHref(query, query.page - 1)}>Previous</Link></Button>
              ) : <span />}
              <p className="text-sm text-muted">Page {query.page} of {pages}</p>
              {query.page < pages ? (
                <Button asChild variant="outline"><Link href={pageHref(query, query.page + 1)}>Next</Link></Button>
              ) : <span />}
            </nav>
          ) : null}
        </>
      )}
    </>
  );
}

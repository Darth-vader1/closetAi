import type { Metadata } from "next";
import Link from "next/link";
import { Plus, SearchX, Shirt } from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { ContextualGuide } from "@/components/onboarding/contextual-guide";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/card";
import { FilterBar } from "@/components/wardrobe/filter-bar";
import { WardrobeBrowser } from "@/components/wardrobe/wardrobe-browser";
import { UsageIndicator } from "@/components/billing/usage-indicator";
import { requireUser } from "@/lib/auth/session";
import { checkUsageLimit } from "@/lib/billing/entitlements";
import { createClient } from "@/lib/supabase/server";
import { PAGE_SIZE, parseWardrobeQuery, type WardrobeQuery } from "@/lib/validation/wardrobe";
import { countItemsByCategory, listWardrobeItems, signImageUrls } from "@/lib/wardrobe/queries";

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

  const [{ items, total }, categoryCounts, wardrobeUsage] = await Promise.all([
    listWardrobeItems(supabase, user.id, query),
    countItemsByCategory(supabase, user.id),
    checkUsageLimit(user.id, "wardrobe_items"),
  ]);
  const urls = await signImageUrls(supabase, items.map((i) => i.imagePath), "thumbnail");
  const imageUrls = Object.fromEntries(urls.entries());
  const totalUnfiltered = Object.values(categoryCounts).reduce((sum, n) => sum + n, 0);
  const filtered = Boolean(query.q || query.category || query.colour || query.status || query.favouritesOnly);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <PageHeader
        title="My Wardrobe"
        description={total > 0 ? `${total} ${total === 1 ? "item" : "items"}${filtered ? " match your filters" : ""}.` : "Every item you own, with its photo and laundry status."}
        action={
          <Button asChild>
            <Link href="/wardrobe/new">
              <Plus className="size-4" aria-hidden /> Add clothes
            </Link>
          </Button>
        }
      />

      <UsageIndicator usage={wardrobeUsage} label="Wardrobe capacity" className="mb-4" />

      <ContextualGuide section="wardrobe" forceShowWhenEmpty={total === 0 && !filtered} />

      {total === 0 && !filtered ? (
        <EmptyState
          icon={Shirt}
          title="Your wardrobe is empty"
          action={
            <Button asChild>
              <Link href="/wardrobe/new">Add your first item</Link>
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
              title={query.page > 1 ? "No more items" : "Nothing matches those filters"}
              action={
                <Button asChild variant="outline">
                  <Link href="/wardrobe">Clear filters</Link>
                </Button>
              }
            >
              Try a different search or remove a filter.
            </EmptyState>
          ) : (
            <WardrobeBrowser
              items={items}
              imageUrls={imageUrls}
              query={query}
              categoryCounts={categoryCounts}
              totalUnfiltered={totalUnfiltered}
            />
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

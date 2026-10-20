-- ---------------------------------------------------------------------------
-- Wardrobe Items: Brand identification and Price Tag (Cost-Per-Wear)
-- ---------------------------------------------------------------------------

alter table public.wardrobe_items
  add column if not exists brand text check (brand is null or char_length(brand) <= 80),
  add column if not exists price numeric(10, 2) check (price is null or price >= 0),
  add column if not exists currency text default 'USD' check (currency is null or char_length(currency) between 2 and 4);

create index if not exists wardrobe_items_user_brand_idx
  on public.wardrobe_items (user_id, brand)
  where brand is not null;

-- Only backfill from source_brand if that column exists
do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'wardrobe_items'
      and column_name = 'source_brand'
  ) then
    execute 'update public.wardrobe_items set brand = source_brand where brand is null and source_brand is not null';
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- ClosetAI Wardrobe: Universal Product Import (Phase 1)
-- ---------------------------------------------------------------------------
-- Adds optional import provenance and duplicate-detection columns to
-- public.wardrobe_items:
--   - source_url: normalized HTTP(S) product page URL when imported from a store
--   - source_brand: optional brand extracted from product metadata
--   - source_image_sha256: optional SHA-256 hex digest of the imported source image
--
-- Note: public.shared_wardrobe_items is intentionally NOT modified so store
-- purchase URLs and import provenance remain private to the wardrobe owner.
-- ---------------------------------------------------------------------------

alter table public.wardrobe_items
  add column if not exists source_url text,
  add column if not exists source_brand text,
  add column if not exists source_image_sha256 text;

alter table public.wardrobe_items
  drop constraint if exists wardrobe_items_source_url_check;

alter table public.wardrobe_items
  add constraint wardrobe_items_source_url_check
  check (
    source_url is null
    or (
      char_length(source_url) <= 2000
      and source_url ~* '^https?://'
    )
  );

alter table public.wardrobe_items
  drop constraint if exists wardrobe_items_source_brand_check;

alter table public.wardrobe_items
  add constraint wardrobe_items_source_brand_check
  check (
    source_brand is null
    or char_length(source_brand) <= 120
  );

alter table public.wardrobe_items
  drop constraint if exists wardrobe_items_source_image_sha256_check;

alter table public.wardrobe_items
  add constraint wardrobe_items_source_image_sha256_check
  check (
    source_image_sha256 is null
    or source_image_sha256 ~ '^[0-9a-f]{64}$'
  );

create index if not exists wardrobe_items_user_source_url_idx
  on public.wardrobe_items (user_id, source_url)
  where source_url is not null;

create index if not exists wardrobe_items_user_source_image_sha256_idx
  on public.wardrobe_items (user_id, source_image_sha256)
  where source_image_sha256 is not null;

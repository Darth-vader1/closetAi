-- ---------------------------------------------------------------------------
-- Image metadata columns for wardrobe_items
--
-- These columns are OPTIONAL: the application works correctly without them.
-- They are added now so that a future server-side thumbnail pipeline can
-- persist processed variant paths and track processing status without another
-- schema change.
--
-- Nothing in the current codebase writes to these columns.  The columns are
-- used as forward-compatible placeholders and by the optional backfill script
-- (scripts/backfill-image-paths.ts).
--
-- Current image delivery uses Supabase Storage on-the-fly image transforms
-- (/render/image/sign/…) which do NOT require stored variant paths.  If the
-- project ever moves to a pre-generated thumbnail pipeline the relevant code
-- can start writing to thumbnail_path / medium_path without another migration.
-- ---------------------------------------------------------------------------

-- Variant paths ---------------------------------------------------------------
-- Null means "not yet generated" (or "not needed" for the transform approach).
-- Values follow the same <user_id>/<uuid>-<suffix>.<ext> convention as image_path.

alter table public.wardrobe_items
  add column if not exists thumbnail_path text
    check (thumbnail_path is null or char_length(thumbnail_path) between 1 and 300),
  add column if not exists medium_path text
    check (medium_path is null or char_length(medium_path) between 1 and 300);

-- Processing status -----------------------------------------------------------
-- Tracks whether server-side variant generation has been attempted.
--   pending   – not yet queued (default for existing rows)
--   done      – variants exist and are current
--   failed    – last attempt errored; eligible for retry
--   skipped   – intentionally not processed (e.g. image too small to need a thumbnail)

do $$ begin
  if not exists (select 1 from pg_type where typname = 'image_processing_status') then
    create type public.image_processing_status as enum ('pending', 'done', 'failed', 'skipped');
  end if;
end $$;

alter table public.wardrobe_items
  add column if not exists image_processing_status public.image_processing_status
    not null default 'pending';

-- Dimensions and file size (informational; useful for storage cost reporting) --
alter table public.wardrobe_items
  add column if not exists original_width  integer check (original_width  is null or original_width  > 0),
  add column if not exists original_height integer check (original_height is null or original_height > 0),
  add column if not exists file_size_bytes integer check (file_size_bytes is null or file_size_bytes > 0);

-- Indexes ---------------------------------------------------------------------
-- Supports a "find all items with pending processing" query efficiently.
create index if not exists wardrobe_items_processing_status_idx
  on public.wardrobe_items (image_processing_status)
  where image_processing_status = 'pending';

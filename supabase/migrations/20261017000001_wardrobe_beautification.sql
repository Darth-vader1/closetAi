-- =============================================================================
-- Migration: Wardrobe Garment Beautification (Original + Beautified Image Paths)
-- =============================================================================
-- Preserves the original uploaded photograph (`original_image_path`) alongside
-- the standardized product cutout/enhanced image (`beautified_image_path`) and
-- records the processing mode (`beautification_mode`: 'clean-cutout' | 'ai-enhance').
-- `image_path` remains the active display path used by Wardrobe grids, Detail pages,
-- and Flatlay / Outfit Studio so all existing queries and views work seamlessly.

alter table public.wardrobe_items
  add column if not exists original_image_path text,
  add column if not exists beautified_image_path text,
  add column if not exists beautification_mode text
    check (beautification_mode is null or beautification_mode in ('clean-cutout', 'ai-enhance')),
  add column if not exists beautification_provider text,
  add column if not exists beautification_model text,
  add column if not exists beautification_status text not null default 'NONE'
    check (beautification_status in ('NONE', 'PROCESSING', 'COMPLETED', 'FAILED', 'RESTORED_ORIGINAL')),
  add column if not exists beautified_at timestamptz;

-- Backfill existing wardrobe items so original_image_path is always populated.
update public.wardrobe_items
set original_image_path = image_path
where original_image_path is null;

alter table public.wardrobe_items
  alter column original_image_path set not null;

-- 1. BEFORE INSERT OR UPDATE: automatically default original_image_path to image_path
create or replace function public.wardrobe_items_default_original_path()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.original_image_path is null or btrim(new.original_image_path) = '' then
    new.original_image_path := new.image_path;
  end if;
  return new;
end;
$$;

drop trigger if exists wardrobe_items_enforce_image_paths_trg on public.wardrobe_items;
drop trigger if exists wardrobe_items_default_original_path_trg on public.wardrobe_items;
create trigger wardrobe_items_default_original_path_trg
  before insert or update on public.wardrobe_items
  for each row execute function public.wardrobe_items_default_original_path();

-- 2. AFTER INSERT OR UPDATE (runs after RLS WITH CHECK): enforce that original_image_path
-- and beautified_image_path reside inside the owner's storage folder (<user_id>/...).
create or replace function public.wardrobe_items_enforce_image_paths()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if position('/' in new.original_image_path) > 0
     and new.original_image_path not like (new.user_id::text || '/%') then
    raise exception 'original_image_path must reside inside the owner folder'
      using errcode = '42501';
  end if;

  if new.beautified_image_path is not null
     and new.beautified_image_path not like (new.user_id::text || '/%') then
    raise exception 'beautified_image_path must reside inside the owner folder'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger wardrobe_items_enforce_image_paths_trg
  after insert or update on public.wardrobe_items
  for each row execute function public.wardrobe_items_enforce_image_paths();

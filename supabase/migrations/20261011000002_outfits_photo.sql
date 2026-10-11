-- Migration: add optional full-body photo path to outfits
alter table public.profiles
  drop constraint if exists profiles_preferred_style_check;

alter table public.outfits
  add column if not exists photo_path text check (photo_path is null or char_length(photo_path) <= 300);

-- Migration: allow multiple preferred styles in profiles
-- Drops the single-string check constraint and changes preferred_style to text[].

alter table public.profiles drop constraint if exists profiles_preferred_style_check;

alter table public.profiles
  alter column preferred_style drop default,
  alter column preferred_style type text[] using (
    case
      when preferred_style is null then '{}'::text[]
      else string_to_array(preferred_style, ',')
    end
  ),
  alter column preferred_style set default '{}';

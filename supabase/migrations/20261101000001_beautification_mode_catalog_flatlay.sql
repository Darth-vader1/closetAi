-- Allow 'catalog-flatlay' (De-Body Studio Flat-Lay) in wardrobe_items.beautification_mode.
alter table public.wardrobe_items
  drop constraint if exists wardrobe_items_beautification_mode_check;

alter table public.wardrobe_items
  add constraint wardrobe_items_beautification_mode_check
  check (
    beautification_mode is null
    or beautification_mode in ('clean-cutout', 'ai-enhance', 'catalog-flatlay')
  );

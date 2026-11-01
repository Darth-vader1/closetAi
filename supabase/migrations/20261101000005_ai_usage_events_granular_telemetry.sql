-- =============================================================================
-- Migration: Granular AI Image Analysis & Invocation Telemetry on ai_usage_events
-- =============================================================================
-- Distinguishes HOW an image or AI call was executed (e.g. Single Garment Photo
-- Scan vs OOTD Outfit Extraction vs Order Screenshot Scan vs Studio Background
-- Cutout vs AI Studio Enhance vs De-Body Catalog Flat-Lay), along with the
-- upstream AI provider/model and lightweight structured metadata.

alter table public.ai_usage_events
  add column if not exists sub_operation text,
  add column if not exists provider text,
  add column if not exists model text,
  add column if not exists metadata jsonb;

create index if not exists ai_usage_events_created_idx
  on public.ai_usage_events (created_at desc);

create index if not exists ai_usage_events_sub_operation_idx
  on public.ai_usage_events (sub_operation, created_at desc)
  where sub_operation is not null;

-- Allow authenticated callers to enrich their own just-created usage row with
-- resolved provider/model/photoType outcome after the AI request completes.
drop policy if exists "ai_usage_events_update_own" on public.ai_usage_events;
create policy "ai_usage_events_update_own" on public.ai_usage_events
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- Backfill historical ANALYSE_IMAGE rows that match a saved beautified item within 90s
with matched_beautify as (
  select distinct on (e.id)
    e.id as event_id,
    case w.beautification_mode
      when 'catalog-flatlay' then 'BEAUTIFY_FLATLAY'
      when 'ai-enhance' then 'BEAUTIFY_ENHANCE'
      else 'BEAUTIFY_CUTOUT'
    end as inferred_sub_op,
    w.beautification_provider as inferred_provider,
    w.beautification_model as inferred_model
  from public.ai_usage_events e
  join public.wardrobe_items w
    on w.user_id = e.user_id
   and w.beautified_at is not null
   and abs(extract(epoch from (w.beautified_at - e.created_at))) <= 90
  where e.operation = 'ANALYSE_IMAGE'
    and e.sub_operation is null
  order by e.id, abs(extract(epoch from (w.beautified_at - e.created_at))) asc
)
update public.ai_usage_events e
set
  sub_operation = m.inferred_sub_op,
  provider = coalesce(e.provider, m.inferred_provider),
  model = coalesce(e.model, m.inferred_model)
from matched_beautify m
where e.id = m.event_id;

-- Backfill GENERATE_PHOTO rows
update public.ai_usage_events
set sub_operation = 'LOOKBOOK_PHOTO'
where operation = 'GENERATE_PHOTO'
  and sub_operation is null;

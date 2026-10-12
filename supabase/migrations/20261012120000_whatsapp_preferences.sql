-- Add WhatsApp notification fields to email_preferences
alter table public.email_preferences
  add column if not exists whatsapp_phone text,
  add column if not exists whatsapp_daily_enabled boolean not null default false;

-- Ensure outfits.photo_path exists even on databases initialized from the unmodified Phase 1 schema
alter table public.outfits
  add column if not exists photo_path text check (photo_path is null or char_length(photo_path) <= 300);

-- Expand ai_usage_events operation check to include GENERATE_PHOTO
alter table public.ai_usage_events
  drop constraint if exists ai_usage_events_operation_check;
alter table public.ai_usage_events
  add constraint ai_usage_events_operation_check
  check (operation in ('ANALYSE_IMAGE', 'STYLE_OUTFITS', 'CHAT', 'GENERATE_PHOTO'));

-- Deduplicate any existing same-day outfit wear rows before adding the unique index
delete from public.outfit_history a
using public.outfit_history b
where a.user_id = b.user_id
  and a.outfit_id = b.outfit_id
  and a.worn_on = b.worn_on
  and a.id > b.id;

-- Prevent duplicate wear logs for the same outfit on the same day
create unique index if not exists outfit_history_user_outfit_worn_on_uniq
  on public.outfit_history (user_id, outfit_id, worn_on);

-- Harden storage.objects policies against '..' path traversal segments
drop policy if exists "wardrobe_objects_select_own" on storage.objects;
create policy "wardrobe_objects_select_own" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'wardrobe'
    and position('..' in name) = 0
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "wardrobe_objects_insert_own" on storage.objects;
create policy "wardrobe_objects_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'wardrobe'
    and position('..' in name) = 0
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "wardrobe_objects_update_own" on storage.objects;
create policy "wardrobe_objects_update_own" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'wardrobe'
    and position('..' in name) = 0
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'wardrobe'
    and position('..' in name) = 0
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "wardrobe_objects_delete_own" on storage.objects;
create policy "wardrobe_objects_delete_own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'wardrobe'
    and position('..' in name) = 0
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- Allow authenticated users to delete their own profile row (cascades to all user-owned tables)
drop policy if exists "profiles_delete_own" on public.profiles;
create policy "profiles_delete_own" on public.profiles
  for delete to authenticated using (id = (select auth.uid()));

drop policy if exists "email_preferences_insert_own" on public.email_preferences;
create policy "email_preferences_insert_own" on public.email_preferences
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists "email_preferences_delete_own" on public.email_preferences;
create policy "email_preferences_delete_own" on public.email_preferences
  for delete to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- wear_outfit: atomic transaction for wearing an outfit on a given date.
-- 1. Verifies authentication and outfit ownership.
-- 2. Bounds p_worn_on between (current_date - 30) and (current_date + 1).
-- 3. Rejects duplicate wear for the same (user_id, outfit_id, worn_on).
-- 4. Verifies the outfit has items and every item is wearable (CLEAN, or WORN when rewear_worn_items = true).
-- 5. Atomically records history, logs laundry events, increments wear_count, and marks plans WORN.
-- ---------------------------------------------------------------------------
create or replace function public.wear_outfit(
  p_outfit_id uuid,
  p_worn_on date default current_date,
  p_plan_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_worn_on date := coalesce(p_worn_on, current_date);
  v_rewear_allowed boolean := true;
  v_item_count integer := 0;
  v_unready_count integer := 0;
  v_history_id uuid;
  v_now timestamptz := now();
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  if v_worn_on < (current_date - 30) or v_worn_on > (current_date + 1) then
    raise exception 'worn_on date is out of allowed range' using errcode = '22008';
  end if;

  if not exists (
    select 1 from public.outfits where id = p_outfit_id and user_id = v_uid
  ) then
    raise exception 'Outfit not found' using errcode = 'P0002';
  end if;

  if exists (
    select 1
      from public.outfit_history
     where user_id = v_uid
       and outfit_id = p_outfit_id
       and worn_on = v_worn_on
  ) then
    raise exception 'Outfit already marked as worn on this date' using errcode = '23505';
  end if;

  select coalesce(p.rewear_worn_items, true)
    into v_rewear_allowed
    from public.profiles p
   where p.id = v_uid;

  select count(*),
         count(*) filter (
           where wi.status <> 'CLEAN'::public.laundry_status
             and not (v_rewear_allowed and wi.status = 'WORN'::public.laundry_status)
         )
    into v_item_count, v_unready_count
    from public.outfit_items oi
    join public.wardrobe_items wi
      on wi.id = oi.item_id and wi.user_id = oi.user_id
   where oi.outfit_id = p_outfit_id
     and oi.user_id = v_uid;

  if v_item_count = 0 then
    raise exception 'Outfit has no garments' using errcode = '22023';
  end if;

  if v_unready_count > 0 then
    raise exception 'One or more garments in this outfit are not clean and ready to wear' using errcode = '22023';
  end if;

  insert into public.outfit_history (user_id, outfit_id, plan_id, worn_on, worn_at)
  values (v_uid, p_outfit_id, p_plan_id, v_worn_on, v_now)
  returning id into v_history_id;

  insert into public.outfit_history_items (history_id, item_id, user_id)
  select v_history_id, oi.item_id, v_uid
    from public.outfit_items oi
   where oi.outfit_id = p_outfit_id
     and oi.user_id = v_uid;

  insert into public.laundry_events (user_id, item_id, from_status, to_status, confirmed_washed)
  select v_uid, wi.id, wi.status, 'WORN'::public.laundry_status, false
    from public.wardrobe_items wi
    join public.outfit_items oi
      on oi.item_id = wi.id and oi.user_id = wi.user_id
   where oi.outfit_id = p_outfit_id
     and wi.user_id = v_uid;

  update public.wardrobe_items wi
     set status = 'WORN'::public.laundry_status,
         wear_count = wi.wear_count + 1,
         last_worn_at = v_now
    from public.outfit_items oi
   where oi.outfit_id = p_outfit_id
     and oi.user_id = v_uid
     and wi.id = oi.item_id
     and wi.user_id = v_uid;

  if p_plan_id is not null then
    update public.outfit_plans
       set status = 'WORN'::public.plan_status,
           worn_at = v_now
     where id = p_plan_id
       and user_id = v_uid;
  else
    update public.outfit_plans
       set status = 'WORN'::public.plan_status,
           worn_at = v_now
     where user_id = v_uid
       and outfit_id = p_outfit_id
       and planned_for = v_worn_on;
  end if;

  return v_history_id;
end;
$$;

revoke all on function public.wear_outfit(uuid, date, uuid) from public, anon;
grant execute on function public.wear_outfit(uuid, date, uuid) to authenticated;

-- Add WhatsApp notification fields to email_preferences
alter table public.email_preferences
  add column if not exists whatsapp_phone text,
  add column if not exists whatsapp_daily_enabled boolean not null default false;

-- Ensure outfits.photo_path exists even on databases initialized from the unmodified Phase 1 schema
alter table public.outfits
  add column if not exists photo_path text check (photo_path is null or char_length(photo_path) <= 300);

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
-- Reads garment IDs strictly from outfit_items in the database (never trusting client IDs),
-- records outfit_history + outfit_history_items, logs laundry_events, increments wear_count,
-- sets last_worn_at and status = 'WORN', and marks matching outfit_plans as WORN.
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
  v_history_id uuid;
  v_now timestamptz := now();
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  if not exists (
    select 1 from public.outfits where id = p_outfit_id and user_id = v_uid
  ) then
    raise exception 'Outfit not found' using errcode = 'P0002';
  end if;

  insert into public.outfit_history (user_id, outfit_id, plan_id, worn_on, worn_at)
  values (v_uid, p_outfit_id, p_plan_id, coalesce(p_worn_on, current_date), v_now)
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
       and planned_for = coalesce(p_worn_on, current_date);
  end if;

  return v_history_id;
end;
$$;

revoke all on function public.wear_outfit(uuid, date, uuid) from public, anon;
grant execute on function public.wear_outfit(uuid, date, uuid) to authenticated;

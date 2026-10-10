-- Row Level Security for every user-owned table, plus transactional laundry function.
-- RLS is never disabled. `(select auth.uid())` lets Postgres evaluate the uid once per statement.

alter table public.profiles enable row level security;
alter table public.email_preferences enable row level security;
alter table public.wardrobe_items enable row level security;
alter table public.outfits enable row level security;
alter table public.outfit_items enable row level security;
alter table public.outfit_plans enable row level security;
alter table public.outfit_history enable row level security;
alter table public.outfit_history_items enable row level security;
alter table public.outfit_feedback enable row level security;
alter table public.laundry_events enable row level security;
alter table public.outfit_recommendations enable row level security;
alter table public.email_logs enable row level security;
alter table public.ai_usage_events enable row level security;

-- profiles: rows are created by the signup trigger; users can read and update only their own.
create policy "profiles_select_own" on public.profiles
  for select to authenticated using (id = (select auth.uid()));
create policy "profiles_update_own" on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- email_preferences: read and update only.
create policy "email_preferences_select_own" on public.email_preferences
  for select to authenticated using (user_id = (select auth.uid()));
create policy "email_preferences_update_own" on public.email_preferences
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Full CRUD on tables the user manages directly.
create policy "wardrobe_items_select_own" on public.wardrobe_items
  for select to authenticated using (user_id = (select auth.uid()));
create policy "wardrobe_items_insert_own" on public.wardrobe_items
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "wardrobe_items_update_own" on public.wardrobe_items
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "wardrobe_items_delete_own" on public.wardrobe_items
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "outfits_select_own" on public.outfits
  for select to authenticated using (user_id = (select auth.uid()));
create policy "outfits_insert_own" on public.outfits
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "outfits_update_own" on public.outfits
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "outfits_delete_own" on public.outfits
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "outfit_items_select_own" on public.outfit_items
  for select to authenticated using (user_id = (select auth.uid()));
create policy "outfit_items_insert_own" on public.outfit_items
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "outfit_items_update_own" on public.outfit_items
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "outfit_items_delete_own" on public.outfit_items
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "outfit_plans_select_own" on public.outfit_plans
  for select to authenticated using (user_id = (select auth.uid()));
create policy "outfit_plans_insert_own" on public.outfit_plans
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "outfit_plans_update_own" on public.outfit_plans
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "outfit_plans_delete_own" on public.outfit_plans
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "outfit_history_select_own" on public.outfit_history
  for select to authenticated using (user_id = (select auth.uid()));
create policy "outfit_history_insert_own" on public.outfit_history
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "outfit_history_delete_own" on public.outfit_history
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "outfit_history_items_select_own" on public.outfit_history_items
  for select to authenticated using (user_id = (select auth.uid()));
create policy "outfit_history_items_insert_own" on public.outfit_history_items
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "outfit_history_items_delete_own" on public.outfit_history_items
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "outfit_feedback_select_own" on public.outfit_feedback
  for select to authenticated using (user_id = (select auth.uid()));
create policy "outfit_feedback_insert_own" on public.outfit_feedback
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "outfit_feedback_delete_own" on public.outfit_feedback
  for delete to authenticated using (user_id = (select auth.uid()));

create policy "outfit_recommendations_select_own" on public.outfit_recommendations
  for select to authenticated using (user_id = (select auth.uid()));
create policy "outfit_recommendations_insert_own" on public.outfit_recommendations
  for insert to authenticated with check (user_id = (select auth.uid()));

-- Audit and operational tables: users may read, but only trusted code writes.
create policy "laundry_events_select_own" on public.laundry_events
  for select to authenticated using (user_id = (select auth.uid()));
create policy "email_logs_select_own" on public.email_logs
  for select to authenticated using (user_id = (select auth.uid()));

create policy "ai_usage_events_select_own" on public.ai_usage_events
  for select to authenticated using (user_id = (select auth.uid()));
create policy "ai_usage_events_insert_own" on public.ai_usage_events
  for insert to authenticated with check (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- change_item_status: the ONLY way laundry_events rows are written on behalf of users.
-- Users have no INSERT policy on laundry_events (so audit rows cannot be forged), which means
-- this function runs as SECURITY DEFINER and enforces ownership itself via auth.uid().
-- last_washed_at changes only when the user explicitly confirms washing is complete.
-- ---------------------------------------------------------------------------
create or replace function public.change_item_status(
  p_item_id uuid,
  p_to public.laundry_status,
  p_confirm_washed boolean default false
)
returns public.wardrobe_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.wardrobe_items;
  v_prev public.laundry_status;
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  if p_confirm_washed and p_to <> 'CLEAN' then
    raise exception 'Washing can only be confirmed when returning an item to CLEAN'
      using errcode = '22023';
  end if;

  select * into v_item from public.wardrobe_items where id = p_item_id and user_id = v_uid for update;
  if not found then
    raise exception 'Item not found' using errcode = 'P0002';
  end if;

  v_prev := v_item.status;

  -- Nothing to do if the status is unchanged and no washing is being confirmed.
  if v_prev = p_to and not p_confirm_washed then
    return v_item;
  end if;

  update public.wardrobe_items
     set status = p_to,
         last_washed_at = case when p_confirm_washed then now() else last_washed_at end
   where id = p_item_id and user_id = v_uid
   returning * into v_item;

  insert into public.laundry_events (user_id, item_id, from_status, to_status, confirmed_washed)
  values (v_item.user_id, v_item.id, v_prev, p_to, p_confirm_washed);

  return v_item;
end;
$$;

revoke all on function public.change_item_status(uuid, public.laundry_status, boolean) from public, anon;
grant execute on function public.change_item_status(uuid, public.laundry_status, boolean) to authenticated;

-- The signup trigger function must not be callable through the API.
revoke all on function public.handle_new_user() from public, anon, authenticated;

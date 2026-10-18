-- ---------------------------------------------------------------------------
-- ClosetAI Connect: Make Name Discovery Enabled by Default & Support 2+ Chars
-- ---------------------------------------------------------------------------

-- 1. Default profiles.discoverable to true for all new accounts and backfill
--    existing profiles so users can find each other by name immediately.
alter table public.profiles
  alter column discoverable set default true;

update public.profiles
set discoverable = true
where discoverable = false;

-- 2. Update handle_new_user() so OAuth users (full_name / name) also get their
--    display_name populated automatically on signup, with discoverable = true.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  v_name := nullif(
    left(
      trim(
        coalesce(
          nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''),
          nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
          nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
          ''
        )
      ),
      80
    ),
    ''
  );

  insert into public.profiles (id, display_name, discoverable)
  values (new.id, v_name, true);

  insert into public.email_preferences (user_id)
  values (new.id);

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;

-- 3. Update connect_search_users(p_term) to allow 2+ character name searches
create or replace function public.connect_search_users(p_term text)
returns table (
  id           uuid,
  display_name text,
  closet_id    text,
  discoverable boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller  uuid := (select auth.uid());
  v_term    text := trim(coalesce(p_term, ''));
  v_escaped text;
begin
  if v_caller is null then
    raise exception 'Not authenticated' using errcode = 'insufficient_privilege';
  end if;

  if v_term = '' then
    return;
  end if;

  -- Rate limit: 20 searches / minute / user
  perform public.connect_check_rate_limit(v_caller, 'search', 20, interval '1 minute');

  -- Escape \, % and _ so ILIKE treats user input as literal characters
  v_escaped := replace(replace(replace(v_term, '\', '\\'), '%', '\%'), '_', '\_');

  return query
  -- 1. Exact case-insensitive closet_id match
  select p.id, p.display_name, p.closet_id, p.discoverable
  from public.profiles p
  where p.id <> v_caller
    and lower(p.closet_id) = lower(v_term)
  union
  -- 2. Display name substring match (2+ chars when discoverable = true)
  select p.id, p.display_name, p.closet_id, p.discoverable
  from public.profiles p
  where p.id <> v_caller
    and p.discoverable = true
    and char_length(v_term) >= 2
    and p.display_name ilike ('%' || v_escaped || '%') escape '\'
  order by display_name
  limit 10;
end;
$$;

revoke all on function public.connect_search_users(text) from public, anon;
grant execute on function public.connect_search_users(text) to authenticated;

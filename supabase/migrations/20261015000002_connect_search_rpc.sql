-- ---------------------------------------------------------------------------
-- connect_search_users RPC
--
-- Called by searchUsersAction() in src/app/(app)/connect/actions.ts.
-- Searches connect_user_profiles (the SECURITY DEFINER view that exposes
-- only id + display_name + closet_id) by:
--
--   1. Exact closet_id match (case-insensitive) — tried first when the term
--      looks like a Closet ID (starts with "CLOS-" or is 13 chars exactly).
--   2. Prefix closet_id match (CLOS-XXXXX%) for partial Closet ID entry.
--   3. Substring display_name match for plain name searches.
--   4. Union of 2 + 3 when the term doesn't match the Closet ID pattern,
--      so a single query handles both.
--
-- Returns up to 10 results. Never returns the caller's own profile.
-- Rate-limiting is intentionally omitted here — the server action layer
-- handles that via the existing AI quota or can add its own; keeping the
-- SQL simple and focused on the search logic.
-- ---------------------------------------------------------------------------

create or replace function public.connect_search_users(p_term text)
returns table (
  id           uuid,
  display_name text,
  closet_id    text
)
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_upper  text := upper(trim(p_term));
  v_lower  text := lower(trim(p_term));
  -- Closet ID pattern: starts with "CLOS-" and has at least one more char,
  -- or is exactly 13 characters of the form CLOS-XXXXXXXX.
  v_is_closet_id bool := (v_upper like 'CLOS-%');
begin
  if v_caller is null then
    raise exception 'Not authenticated' using errcode = 'insufficient_privilege';
  end if;

  if length(trim(p_term)) = 0 then
    return;
  end if;

  if v_is_closet_id then
    -- Closet ID search: prefix match so users can type partial IDs
    return query
      select p.id, p.display_name, p.closet_id
      from   public.connect_user_profiles p
      where  p.id <> v_caller
        and  upper(p.closet_id) like (v_upper || '%')
      order  by p.display_name nulls last
      limit  10;
  else
    -- Name search: substring match on display_name, plus try exact closet_id
    -- in case someone pastes a full ID without the CLOS- prefix.
    return query
      select p.id, p.display_name, p.closet_id
      from   public.connect_user_profiles p
      where  p.id <> v_caller
        and  (
               p.display_name ilike ('%' || p_term || '%')
               or upper(p.closet_id) = v_upper
             )
      order  by
        -- Exact closet_id match first, then alphabetical
        case when upper(p.closet_id) = v_upper then 0 else 1 end,
        p.display_name nulls last
      limit  10;
  end if;
end;
$$;

revoke all on function public.connect_search_users(text) from public, anon;
grant execute on function public.connect_search_users(text) to authenticated;

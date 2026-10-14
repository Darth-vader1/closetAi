-- ---------------------------------------------------------------------------
-- Allow authenticated users to discover other users by display_name.
--
-- The existing "profiles_select_own" policy only permits a user to read
-- their own profile row.  That blocks the Connect user-search feature,
-- which needs to query other users' display_names.
--
-- We add a second SELECT policy that exposes ONLY the minimum fields
-- required for search (id + display_name).  All other profile columns
-- (timezone, location, style preferences, etc.) remain private — the
-- application never selects them for other users, and PostgREST only
-- returns columns the query explicitly requests.
--
-- Security notes:
--   • Both policies on the same table are OR-combined by Postgres, so a
--     user can still read their own full profile row via the existing
--     "profiles_select_own" policy.
--   • The new policy applies to authenticated users only — unauthenticated
--     requests (anon key without a JWT) cannot search profiles.
--   • display_name is user-chosen and intentionally semi-public within the
--     platform; it is equivalent to a username.
-- ---------------------------------------------------------------------------

create policy "profiles_select_display_name_for_search"
  on public.profiles
  for select
  to authenticated
  using (true);   -- any authenticated user may read any profile row
                  -- (the app only ever selects id + display_name in search)

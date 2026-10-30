-- ---------------------------------------------------------------------------
-- 20261031000003_profiles_insert_policy.sql
-- Allow authenticated users to insert their own profile row.
--
-- Background:
--   Profiles are initially created via the auth.users signup trigger (handle_new_user).
--   However, without an INSERT policy for authenticated users, PostgREST upsert
--   (INSERT ... ON CONFLICT DO UPDATE) fails with 42501 (RLS violation) during
--   onboarding, and any user whose trigger failed to run cannot bootstrap their profile.
-- ---------------------------------------------------------------------------

drop policy if exists "profiles_insert_own" on public.profiles;

create policy "profiles_insert_own" on public.profiles
  for insert to authenticated
  with check (id = (select auth.uid()));

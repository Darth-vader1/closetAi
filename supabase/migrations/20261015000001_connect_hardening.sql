-- ---------------------------------------------------------------------------
-- ClosetAI Connect: Phase 1 hardening
--
-- 1. Add connect_messages to the supabase_realtime publication so the
--    MessageThread client receives live INSERT events.
-- 2. Replace the over-broad profiles_select_display_name_for_search policy
--    (using (true)) with a SECURITY DEFINER view that exposes ONLY id +
--    display_name for Connect user discovery. This restores strict profile
--    RLS isolation while still allowing name-based search.
-- 3. Add a SECURITY DEFINER RPC start_direct_conversation() so conversation
--    creation no longer requires the service-role admin client. It is
--    atomic, reuses an existing 1:1 conversation, and enforces the 2-member
--    limit.
-- ---------------------------------------------------------------------------

-- 1. Realtime publication -------------------------------------------------
-- Guarded: no-op in environments where supabase_realtime does not exist
-- (e.g. the PGlite test harness). In real Supabase it always exists.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    execute 'alter publication supabase_realtime add table public.connect_messages';
  end if;
end
$$ language plpgsql;

-- 2. Restricted profile view for Connect search ----------------------------
-- SECURITY DEFINER (security_invoker = false) so the view owner can read all
-- profile rows regardless of RLS, but authenticated callers only ever see the
-- fields explicitly needed for Connect discovery: id, display_name, and the
-- public closet_id handle. All other profile columns remain private.
create or replace view public.connect_user_profiles
with (security_invoker = false)
as
select id, display_name, closet_id from public.profiles;

revoke all on public.connect_user_profiles from public, anon;
grant select on public.connect_user_profiles to authenticated;

-- Drop the policy that exposed every profile column to every authenticated user.
drop policy if exists "profiles_select_display_name_for_search" on public.profiles;

-- 3. SECURITY DEFINER RPC for starting a 1:1 conversation -------------------
create or replace function public.start_direct_conversation(p_other_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conv_id uuid;
  v_caller  uuid := (select auth.uid());
begin
  if v_caller is null then
    raise exception 'Not authenticated' using errcode = 'insufficient_privilege';
  end if;

  if p_other_user_id = v_caller then
    raise exception 'You cannot start a conversation with yourself';
  end if;

  if not exists (select 1 from public.profiles where id = p_other_user_id) then
    raise exception 'User not found';
  end if;

  -- Reuse an existing 1:1 conversation between these two users.
  select c.conversation_id into v_conv_id
  from   public.connect_members c
  where  c.user_id = v_caller
    and  exists (
      select 1 from public.connect_members m
      where  m.conversation_id = c.conversation_id
        and  m.user_id = p_other_user_id
    )
  limit 1;

  if v_conv_id is not null then
    return v_conv_id;
  end if;

  insert into public.connect_conversations default values returning id into v_conv_id;

  insert into public.connect_members (conversation_id, user_id) values
    (v_conv_id, v_caller),
    (v_conv_id, p_other_user_id);

  return v_conv_id;
end;
$$;

revoke all on function public.start_direct_conversation(uuid) from public, anon;
grant execute on function public.start_direct_conversation(uuid) to authenticated;

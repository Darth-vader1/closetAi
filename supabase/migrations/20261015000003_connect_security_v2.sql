-- ---------------------------------------------------------------------------
-- ClosetAI Connect: Security Hardening v2
--
-- Fixes:
--   1. Email fallback removed from search (handled in actions.ts; this
--      migration provides the locked-down search RPC).
--   2. Search: exact case-insensitive closet_id match + opt-in discoverable
--      name search. Rate limited to 20/min/user. No .or() interpolation.
--   3. profiles.closet_id immutable for anon/authenticated (BEFORE UPDATE
--      trigger raises).
--   4. Consent: connect_conversations.status ('pending','active') + requester.
--      Requester limited to 1 message in pending; recipient accepts via RPC.
--      connect_blocks + connect_reports with RLS. Message rate limit
--      (30/min/user) and new-conversation rate limit (20/day/user).
--   5. start_direct_conversation atomic via pg_advisory_xact_lock.
--   6. connect_members column protection (only last_read_at writable).
--   7. Revoke execute on generate_closet_id / assign_closet_id from
--      public, anon, authenticated.
-- ---------------------------------------------------------------------------

-- ===========================================================================
-- 1. profiles.discoverable (opt-in name search)
-- ===========================================================================
alter table public.profiles
  add column if not exists discoverable boolean not null default false;

comment on column public.profiles.discoverable is
  'When true, other users may find this profile by display_name substring search. closet_id exact match always works regardless.';

-- Extend the restricted view to include discoverable (still SECURITY DEFINER).
create or replace view public.connect_user_profiles
with (security_invoker = false)
as
select id, display_name, closet_id, discoverable from public.profiles;

revoke all on public.connect_user_profiles from public, anon;
grant select on public.connect_user_profiles to authenticated;

-- ===========================================================================
-- 2. connect_conversations: status + requester (consent model)
-- ===========================================================================
alter table public.connect_conversations
  add column if not exists status text not null default 'active'
  check (status in ('pending', 'active'));

alter table public.connect_conversations
  add column if not exists requester uuid
  references public.profiles (id) on delete set null;

comment on column public.connect_conversations.status is
  'pending = requester may send 1 message, recipient must accept; active = both members can message freely.';
comment on column public.connect_conversations.requester is
  'The user who initiated the conversation. Only the other member may accept.';

-- Backfill requester for pre-existing conversations = oldest member.
update public.connect_conversations c
set requester = (
  select user_id from public.connect_members m
  where m.conversation_id = c.id
  order by m.joined_at asc
  limit 1
)
where requester is null;

-- ===========================================================================
-- 3. connect_blocks (blocker -> blocked) with RLS
-- ===========================================================================
create table if not exists public.connect_blocks (
  blocker    uuid not null references public.profiles (id) on delete cascade,
  blocked    uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker, blocked),
  check (blocker <> blocked)
);

create index if not exists connect_blocks_blocked_idx
  on public.connect_blocks (blocked);

alter table public.connect_blocks enable row level security;

revoke all on public.connect_blocks from public, anon;
grant select, insert, delete on public.connect_blocks to authenticated;

drop policy if exists "connect_blocks_select_own" on public.connect_blocks;
create policy "connect_blocks_select_own"
  on public.connect_blocks for select
  to authenticated
  using (blocker = (select auth.uid()));

drop policy if exists "connect_blocks_insert_own" on public.connect_blocks;
create policy "connect_blocks_insert_own"
  on public.connect_blocks for insert
  to authenticated
  with check (blocker = (select auth.uid()));

drop policy if exists "connect_blocks_delete_own" on public.connect_blocks;
create policy "connect_blocks_delete_own"
  on public.connect_blocks for delete
  to authenticated
  using (blocker = (select auth.uid()));

-- ===========================================================================
-- 4. connect_reports
-- ===========================================================================
create table if not exists public.connect_reports (
  id              uuid primary key default gen_random_uuid(),
  reporter        uuid not null references public.profiles (id) on delete cascade,
  reported_user   uuid not null references public.profiles (id) on delete cascade,
  conversation_id uuid references public.connect_conversations (id) on delete set null,
  reason          text not null check (char_length(reason) between 1 and 1000),
  created_at      timestamptz not null default now()
);

alter table public.connect_reports enable row level security;

revoke all on public.connect_reports from public, anon;
grant insert on public.connect_reports to authenticated;

drop policy if exists "connect_reports_insert_own" on public.connect_reports;
create policy "connect_reports_insert_own"
  on public.connect_reports for insert
  to authenticated
  with check (reporter = (select auth.uid()));

-- ===========================================================================
-- 5. connect_rate_events (generic rolling-window counter)
-- ===========================================================================
create table if not exists public.connect_rate_events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  action     text not null,
  created_at timestamptz not null default now()
);

create index if not exists connect_rate_events_user_action_idx
  on public.connect_rate_events (user_id, action, created_at desc);

alter table public.connect_rate_events enable row level security;
revoke all on public.connect_rate_events from public, anon, authenticated;

-- SECURITY DEFINER helper: raises RATE_LIMITED when the user has performed
-- p_action >= p_limit times in the last p_window. Records the attempt.
create or replace function public.connect_check_rate_limit(
  p_user_id uuid,
  p_action  text,
  p_limit   int,
  p_window  interval
) returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count int;
begin
  select count(*) into v_count
  from public.connect_rate_events
  where user_id = p_user_id
    and action = p_action
    and created_at > now() - p_window;

  if v_count >= p_limit then
    raise exception 'RATE_LIMITED' using errcode = 'check_violation';
  end if;

  insert into public.connect_rate_events (user_id, action)
  values (p_user_id, p_action);
end;
$$;

revoke all on function public.connect_check_rate_limit(uuid, text, int, interval)
  from public, anon, authenticated;

-- ===========================================================================
-- 6. Helper: is either user blocking the other? (SECURITY DEFINER)
-- ===========================================================================
create or replace function public.connect_is_blocked(p_subject uuid, p_other uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.connect_blocks
    where (blocker = p_other and blocked = p_subject)
       or (blocker = p_subject and blocked = p_other)
  );
$$;

revoke all on function public.connect_is_blocked(uuid, uuid)
  from public, anon;
grant execute on function public.connect_is_blocked(uuid, uuid) to authenticated;

-- ===========================================================================
-- 7. profiles.closet_id immutability guard (anon + authenticated)
-- ===========================================================================
create or replace function public.profiles_guard_closet_id()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if new.closet_id is distinct from old.closet_id then
      raise exception 'closet_id cannot be changed by users'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_closet_id on public.profiles;
create trigger profiles_guard_closet_id
  before update on public.profiles
  for each row execute function public.profiles_guard_closet_id();

-- ===========================================================================
-- 8. connect_members column protection (only last_read_at is user-writable)
-- ===========================================================================
create or replace function public.connect_guard_members_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    new.conversation_id := old.conversation_id;
    new.user_id         := old.user_id;
    new.joined_at       := old.joined_at;
  end if;
  return new;
end;
$$;

drop trigger if exists connect_guard_members_columns on public.connect_members;
create trigger connect_guard_members_columns
  before update on public.connect_members
  for each row execute function public.connect_guard_members_columns();

-- ===========================================================================
-- 9. Message insert guard: membership + sender (RLS-style), rate limit,
--    blocks, consent (1 msg in pending). BEFORE INSERT fires before RLS,
--    so membership/sender are re-checked here to surface RLS errors first.
-- ===========================================================================
create or replace function public.connect_before_message_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status    text;
  v_requester uuid;
  v_existing  int;
  v_other     uuid;
  v_caller    uuid := (select auth.uid());
  v_is_member boolean;
begin
  -- Membership + sender check (mirrors the RLS policy; fires first).
  if new.sender_id is distinct from v_caller then
    raise exception 'new row violates row-level security policy for table connect_messages'
      using errcode = '42501';
  end if;

  select exists (
    select 1 from public.connect_members
    where conversation_id = new.conversation_id
      and user_id = new.sender_id
  ) into v_is_member;

  if not v_is_member then
    raise exception 'new row violates row-level security policy for table connect_messages'
      using errcode = '42501';
  end if;

  -- Rate limit: 30 messages / minute / user
  perform public.connect_check_rate_limit(new.sender_id, 'message', 30, interval '1 minute');

  -- Block check: find the other member (1:1 conversations)
  select m.user_id into v_other
  from public.connect_members m
  where m.conversation_id = new.conversation_id
    and m.user_id <> new.sender_id
  limit 1;

  if v_other is not null and public.connect_is_blocked(new.sender_id, v_other) then
    raise exception 'You cannot send messages to this user.';
  end if;

  -- Consent check
  select status, requester into v_status, v_requester
  from public.connect_conversations
  where id = new.conversation_id;

  if v_status = 'pending' then
    if new.sender_id <> v_requester then
      raise exception 'You must accept this conversation before sending messages.'
        using errcode = 'check_violation';
    end if;
    select count(*) into v_existing
    from public.connect_messages
    where conversation_id = new.conversation_id
      and sender_id = v_requester
      and deleted_at is null;
    if v_existing >= 1 then
      raise exception 'You can only send one message until the recipient accepts.'
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists connect_before_message_insert on public.connect_messages;
create trigger connect_before_message_insert
  before insert on public.connect_messages
  for each row execute function public.connect_before_message_insert();

-- ===========================================================================
-- 10. connect_messages insert policy: membership + sender check only.
--     Blocks and consent are enforced by the BEFORE INSERT trigger.
-- ===========================================================================
drop policy if exists "connect_messages_insert_member" on public.connect_messages;
create policy "connect_messages_insert_member"
  on public.connect_messages for insert
  to authenticated
  with check (
    sender_id = (select auth.uid())
    and public.is_conversation_member(conversation_id)
  );

-- ===========================================================================
-- 11. start_direct_conversation: atomic, consent-aware, block-aware, rate-limited
-- ===========================================================================
create or replace function public.start_direct_conversation(p_other_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_conv_id  uuid;
  v_caller   uuid := (select auth.uid());
  v_lock_key bigint;
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

  -- Block check (either direction)
  if public.connect_is_blocked(v_caller, p_other_user_id) then
    raise exception 'You cannot start a conversation with this user.';
  end if;

  -- Rate limit: 20 new conversations / day / user
  perform public.connect_check_rate_limit(v_caller, 'new_conversation', 20, interval '1 day');

  -- Atomic pair uniqueness: advisory lock on the sorted pair.
  v_lock_key := hashtext(
    least(v_caller::text, p_other_user_id::text)
    || greatest(v_caller::text, p_other_user_id::text)
  );
  perform pg_advisory_xact_lock(v_lock_key);

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

  insert into public.connect_conversations (status, requester)
  values ('pending', v_caller)
  returning id into v_conv_id;

  insert into public.connect_members (conversation_id, user_id) values
    (v_conv_id, v_caller),
    (v_conv_id, p_other_user_id);

  return v_conv_id;
end;
$$;

revoke all on function public.start_direct_conversation(uuid) from public, anon;
grant execute on function public.start_direct_conversation(uuid) to authenticated;

-- ===========================================================================
-- 12. accept_conversation: recipient-only RPC bound to auth.uid()
-- ===========================================================================
create or replace function public.accept_conversation(p_conv_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller    uuid := (select auth.uid());
  v_requester uuid;
  v_status    text;
  v_is_member boolean;
begin
  if v_caller is null then
    raise exception 'Not authenticated' using errcode = 'insufficient_privilege';
  end if;

  select requester, status into v_requester, v_status
  from public.connect_conversations
  where id = p_conv_id;

  if not found then
    raise exception 'Conversation not found';
  end if;

  select exists (
    select 1 from public.connect_members
    where conversation_id = p_conv_id and user_id = v_caller
  ) into v_is_member;

  if not v_is_member then
    raise exception 'Not a member of this conversation';
  end if;

  if v_caller = v_requester then
    raise exception 'Only the recipient can accept this conversation';
  end if;

  if v_status = 'active' then
    return;
  end if;

  update public.connect_conversations
  set status = 'active'
  where id = p_conv_id;
end;
$$;

revoke all on function public.accept_conversation(uuid) from public, anon;
grant execute on function public.accept_conversation(uuid) to authenticated;

-- ===========================================================================
-- 13. connect_search_users: exact closet_id match + discoverable name match,
--     rate-limited to 20/min/user. Two separate SELECTs (no .or() interp).
--
--     DROP first: the previous version (20261015000002_connect_search_rpc.sql)
--     returned 3 columns; CREATE OR REPLACE cannot change a return type.
-- ===========================================================================
drop function if exists public.connect_search_users(text);

create function public.connect_search_users(p_term text)
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
  v_caller uuid := (select auth.uid());
  v_term   text := trim(coalesce(p_term, ''));
begin
  if v_caller is null then
    raise exception 'Not authenticated' using errcode = 'insufficient_privilege';
  end if;

  if v_term = '' then
    return;
  end if;

  -- Rate limit: 20 searches / minute / user
  perform public.connect_check_rate_limit(v_caller, 'search', 20, interval '1 minute');

  return query
  -- Exact case-insensitive closet_id match
  select p.id, p.display_name, p.closet_id, p.discoverable
  from public.profiles p
  where p.id <> v_caller
    and lower(p.closet_id) = lower(v_term)
  union
  -- Opt-in display_name substring match (discoverable only)
  select p.id, p.display_name, p.closet_id, p.discoverable
  from public.profiles p
  where p.id <> v_caller
    and p.discoverable = true
    and p.display_name ilike '%' || v_term || '%'
  order by display_name
  limit 10;
end;
$$;

revoke all on function public.connect_search_users(text) from public, anon;
grant execute on function public.connect_search_users(text) to authenticated;

-- ===========================================================================
-- 14. Revoke execute on closet_id generator/assigner from public/anon/auth
-- ===========================================================================
revoke all on function public.generate_closet_id() from public, anon, authenticated;
revoke all on function public.assign_closet_id() from public, anon, authenticated;

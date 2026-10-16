-- ---------------------------------------------------------------------------
-- ClosetAI Connect: Security Hardening Round 3
--
-- 1. Drop policy connect_conversations_update_member and revoke UPDATE on
--    connect_conversations from public/anon/authenticated. Status changes
--    only via accept_conversation (or decline_conversation to remove pending).
-- 2. Add connect_conversations.request_messages_sent int not null default 0,
--    incremented by connect_before_message_insert and checked against 1.
--    Deleting a message does not decrement it (send -> delete -> resend fails).
-- 3. Revoke all privileges on connect_user_profiles from public/anon/authenticated
--    so normal users cannot list or enumerate non-discoverable profiles.
--    Provide connect_resolve_partner_profiles(uuid[]) SECURITY DEFINER RPC
--    that only resolves display_name + closet_id for users who share a
--    conversation or active wardrobe grant with auth.uid() (or auth.uid() self).
-- 4. Revoke EXECUTE on connect_is_blocked from public/anon/authenticated and
--    move grant block enforcement into SECURITY DEFINER triggers.
-- 5. Harden connect_reports: reporter must share a conversation with
--    reported_user, rate-limited to 5/day, and max 1 open report per
--    (reporter, reported_user).
-- 6. Harden connect_search_users: min 3 chars for name search (except exact
--    Closet ID), escape \, % and _ in ILIKE, and opportunistically delete
--    connect_rate_events older than 2 days.
-- ---------------------------------------------------------------------------

-- ===========================================================================
-- 1. Lock down connect_conversations UPDATE
-- ===========================================================================
drop policy if exists "connect_conversations_update_member" on public.connect_conversations;
revoke update, delete, insert on public.connect_conversations from public, anon, authenticated;
grant select on public.connect_conversations to authenticated;

-- Allow the recipient of a pending conversation to decline (delete) it via RPC.
create or replace function public.decline_conversation(p_conv_id uuid)
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
    raise exception 'Not a member of this conversation' using errcode = '42501';
  end if;

  if v_status <> 'pending' then
    raise exception 'Only pending conversation requests can be declined';
  end if;

  if v_caller = v_requester then
    raise exception 'Only the recipient can decline this conversation request';
  end if;

  delete from public.connect_conversations where id = p_conv_id;
end;
$$;

revoke all on function public.decline_conversation(uuid) from public, anon;
grant execute on function public.decline_conversation(uuid) to authenticated;

-- ===========================================================================
-- 2. Pending message counter (connect_conversations.request_messages_sent)
-- ===========================================================================
alter table public.connect_conversations
  add column if not exists request_messages_sent int not null default 0;

-- Backfill from existing messages in pending conversations
update public.connect_conversations c
set request_messages_sent = (
  select count(*)::int
  from public.connect_messages m
  where m.conversation_id = c.id
    and m.sender_id = c.requester
)
where c.status = 'pending'
  and c.request_messages_sent = 0;

create or replace function public.connect_before_message_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status    text;
  v_requester uuid;
  v_sent      int;
  v_other     uuid;
  v_caller    uuid := (select auth.uid());
  v_is_member boolean;
begin
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

  -- Consent check using monotonic request_messages_sent counter
  select status, requester, request_messages_sent
  into v_status, v_requester, v_sent
  from public.connect_conversations
  where id = new.conversation_id
  for update;

  if v_status = 'pending' then
    if new.sender_id <> v_requester then
      raise exception 'You must accept this conversation before sending messages.'
        using errcode = 'check_violation';
    end if;

    if v_sent >= 1 then
      raise exception 'You can only send one message until the recipient accepts.'
        using errcode = 'check_violation';
    end if;

    update public.connect_conversations
    set request_messages_sent = request_messages_sent + 1
    where id = new.conversation_id;
  end if;

  return new;
end;
$$;

-- ===========================================================================
-- 3. Lock down connect_user_profiles & add partner-scoped resolver RPC
-- ===========================================================================
revoke all on public.connect_user_profiles from public, anon, authenticated;

create or replace function public.connect_resolve_partner_profiles(p_user_ids uuid[])
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
begin
  if v_caller is null then
    raise exception 'Not authenticated' using errcode = 'insufficient_privilege';
  end if;

  if p_user_ids is null or cardinality(p_user_ids) = 0 then
    return;
  end if;

  return query
  select p.id, p.display_name, p.closet_id
  from public.profiles p
  where p.id = any(p_user_ids)
    and (
      p.id = v_caller
      or exists (
        select 1
        from public.connect_members m1
        join public.connect_members m2
          on m2.conversation_id = m1.conversation_id
        where m1.user_id = v_caller
          and m2.user_id = p.id
      )
      or exists (
        select 1
        from public.connect_wardrobe_grants g
        where g.revoked_at is null
          and (
            (g.owner_id = v_caller and g.grantee_id = p.id)
            or (g.grantee_id = v_caller and g.owner_id = p.id)
          )
      )
    );
end;
$$;

revoke all on function public.connect_resolve_partner_profiles(uuid[]) from public, anon;
grant execute on function public.connect_resolve_partner_profiles(uuid[]) to authenticated;

-- ===========================================================================
-- 4. Revoke EXECUTE on connect_is_blocked from authenticated
--    Move grant block checks into SECURITY DEFINER triggers + auto-revoke on block
-- ===========================================================================
revoke all on function public.connect_is_blocked(uuid, uuid) from public, anon, authenticated;

-- Replace connect_wardrobe_grants & connect_grant_items policies so they don't
-- invoke connect_is_blocked directly as `authenticated`.
drop policy if exists "connect_wardrobe_grants_select" on public.connect_wardrobe_grants;
create policy "connect_wardrobe_grants_select"
  on public.connect_wardrobe_grants for select
  to authenticated
  using (
    owner_id = (select auth.uid())
    or (
      grantee_id = (select auth.uid())
      and revoked_at is null
    )
  );

drop policy if exists "connect_wardrobe_grants_insert_owner" on public.connect_wardrobe_grants;
create policy "connect_wardrobe_grants_insert_owner"
  on public.connect_wardrobe_grants for insert
  to authenticated
  with check (
    owner_id = (select auth.uid())
    and owner_id <> grantee_id
  );

drop policy if exists "connect_grant_items_select" on public.connect_grant_items;
create policy "connect_grant_items_select"
  on public.connect_grant_items for select
  to authenticated
  using (
    owner_id = (select auth.uid())
    or exists (
      select 1 from public.connect_wardrobe_grants g
      where g.id = grant_id
        and g.grantee_id = (select auth.uid())
        and g.revoked_at is null
        and g.can_view_items = true
    )
  );

-- Enforce block check on grant insert/update via SECURITY DEFINER trigger
create or replace function public.connect_before_grant_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.revoked_at is null and public.connect_is_blocked(new.owner_id, new.grantee_id) then
    raise exception 'Cannot grant wardrobe access to a blocked user'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists connect_before_grant_write on public.connect_wardrobe_grants;
create trigger connect_before_grant_write
  before insert or update on public.connect_wardrobe_grants
  for each row execute function public.connect_before_grant_write();

-- Automatically revoke any active wardrobe grants between blocker and blocked
create or replace function public.connect_on_block_inserted()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.connect_wardrobe_grants
  set revoked_at = now()
  where revoked_at is null
    and (
      (owner_id = new.blocker and grantee_id = new.blocked)
      or (owner_id = new.blocked and grantee_id = new.blocker)
    );
  return new;
end;
$$;

drop trigger if exists connect_on_block_inserted on public.connect_blocks;
create trigger connect_on_block_inserted
  after insert on public.connect_blocks
  for each row execute function public.connect_on_block_inserted();

-- ===========================================================================
-- 5. Harden connect_reports: shared conversation required, 5/day limit,
--    and 1 open report per (reporter, reported_user)
-- ===========================================================================
alter table public.connect_reports
  add column if not exists status text not null default 'open'
  check (status in ('open', 'resolved', 'dismissed'));

create unique index if not exists connect_reports_one_open_per_pair_idx
  on public.connect_reports (reporter, reported_user)
  where status = 'open';

create or replace function public.connect_shares_conversation(p_user_a uuid, p_user_b uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.connect_members m1
    join public.connect_members m2
      on m2.conversation_id = m1.conversation_id
    where m1.user_id = p_user_a
      and m2.user_id = p_user_b
  );
$$;

revoke all on function public.connect_shares_conversation(uuid, uuid) from public, anon, authenticated;

drop policy if exists "connect_reports_insert_own" on public.connect_reports;
create policy "connect_reports_insert_own"
  on public.connect_reports for insert
  to authenticated
  with check (
    reporter = (select auth.uid())
    and reporter <> reported_user
  );

create or replace function public.connect_before_report_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
  v_shares boolean;
begin
  if v_caller is null or new.reporter is distinct from v_caller or new.reporter = new.reported_user then
    raise exception 'new row violates row-level security policy for table connect_reports'
      using errcode = '42501';
  end if;

  -- Force new reports to start in 'open' status so callers cannot bypass the unique index
  new.status := 'open';

  -- Reporter must share a conversation with reported_user
  select exists (
    select 1
    from public.connect_members m1
    join public.connect_members m2
      on m2.conversation_id = m1.conversation_id
    where m1.user_id = new.reporter
      and m2.user_id = new.reported_user
      and (new.conversation_id is null or m1.conversation_id = new.conversation_id)
  ) into v_shares;

  if not v_shares then
    raise exception 'new row violates row-level security policy for table connect_reports: you must share a conversation with the reported user'
      using errcode = '42501';
  end if;

  -- One open report per (reporter, reported_user) check before rate-limit consumption
  if exists (
    select 1 from public.connect_reports
    where reporter = new.reporter
      and reported_user = new.reported_user
      and status = 'open'
  ) then
    raise exception 'You already have an open report for this user'
      using errcode = '23505';
  end if;

  -- Rate limit: 5 reports / day / user
  perform public.connect_check_rate_limit(new.reporter, 'report', 5, interval '1 day');

  return new;
end;
$$;

drop trigger if exists connect_before_report_insert on public.connect_reports;
create trigger connect_before_report_insert
  before insert on public.connect_reports
  for each row execute function public.connect_before_report_insert();

-- ===========================================================================
-- 6. Opportunistic cleanup of connect_rate_events (> 2 days) &
--    connect_search_users min 3 chars + wildcard escaping
-- ===========================================================================
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
  -- Opportunistic cleanup of rate events older than 2 days
  delete from public.connect_rate_events
  where created_at < now() - interval '2 days';

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
  -- 2. Opt-in display_name substring match (requires min 3 chars and discoverable = true)
  select p.id, p.display_name, p.closet_id, p.discoverable
  from public.profiles p
  where p.id <> v_caller
    and p.discoverable = true
    and char_length(v_term) >= 3
    and p.display_name ilike ('%' || v_escaped || '%') escape '\'
  order by display_name
  limit 10;
end;
$$;

revoke all on function public.connect_search_users(text) from public, anon;
grant execute on function public.connect_search_users(text) to authenticated;

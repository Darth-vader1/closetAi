-- ---------------------------------------------------------------------------
-- ClosetAI Connect Phase 1: Conversations & Messaging
--
-- Tables
--   connect_conversations   — one row per 1:1 conversation
--   connect_members         — who belongs to which conversation (max 2 for DMs)
--   connect_messages        — individual messages in a conversation
--
-- Security model
--   All three tables have RLS enabled.
--   A user can only see / write to conversations they are a member of.
--   Membership is verified server-side before any insert; RLS is a second wall.
--   The member lookup sub-query uses (select auth.uid()) rather than auth.uid()
--   directly — this prevents a per-row re-evaluation performance issue on
--   Supabase's PostgREST layer.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- connect_conversations
-- ---------------------------------------------------------------------------
create table public.connect_conversations (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()   -- bumped on every new message
);

create trigger connect_conversations_updated_at
  before update on public.connect_conversations
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- connect_members
-- ---------------------------------------------------------------------------
create table public.connect_members (
  conversation_id uuid not null
    references public.connect_conversations (id) on delete cascade,
  user_id         uuid not null
    references public.profiles (id) on delete cascade,
  joined_at       timestamptz not null default now(),
  -- Track the last message the member has actually seen so we can show
  -- unread counts without a full message scan.
  last_read_at    timestamptz,
  primary key (conversation_id, user_id)
);

create index connect_members_user_idx
  on public.connect_members (user_id);

-- ---------------------------------------------------------------------------
-- connect_messages
-- ---------------------------------------------------------------------------
create table public.connect_messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null
    references public.connect_conversations (id) on delete cascade,
  sender_id       uuid not null
    references public.profiles (id) on delete cascade,
  body            text not null
    check (char_length(body) between 1 and 4000),
  created_at      timestamptz not null default now(),
  -- Soft delete: null means the message is visible.
  deleted_at      timestamptz
);

create index connect_messages_conversation_idx
  on public.connect_messages (conversation_id, created_at desc);

create index connect_messages_sender_idx
  on public.connect_messages (sender_id);

-- ---------------------------------------------------------------------------
-- Helper: bump conversation.updated_at whenever a message is inserted
-- ---------------------------------------------------------------------------
create or replace function public.touch_conversation_on_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.connect_conversations
  set    updated_at = now()
  where  id = new.conversation_id;
  return new;
end;
$$;

create trigger connect_messages_touch_conversation
  after insert on public.connect_messages
  for each row execute function public.touch_conversation_on_message();

-- ---------------------------------------------------------------------------
-- Helper: enforce max 2 members for direct conversations
-- ---------------------------------------------------------------------------
create or replace function public.check_conversation_member_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (
    select count(*)
    from   public.connect_members
    where  conversation_id = new.conversation_id
  ) >= 2 then
    raise exception 'Direct conversations are limited to 2 members.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger connect_members_limit
  before insert on public.connect_members
  for each row execute function public.check_conversation_member_limit();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.connect_conversations enable row level security;
alter table public.connect_members       enable row level security;
alter table public.connect_messages      enable row level security;

-- A helper expression used in multiple policies.
-- Returns true when the calling user is a member of the given conversation.
-- The sub-select form avoids per-row re-evaluation of auth.uid().

-- connect_conversations: visible only to members
create policy "connect_conversations_select_member"
  on public.connect_conversations for select
  to authenticated
  using (
    exists (
      select 1 from public.connect_members cm
      where  cm.conversation_id = id
        and  cm.user_id = (select auth.uid())
    )
  );

-- No direct INSERT on conversations from clients — server actions create them.
-- UPDATE is needed so the updated_at trigger fires (triggered by message insert
-- via the touch function which runs as security definer).
create policy "connect_conversations_update_member"
  on public.connect_conversations for update
  to authenticated
  using (
    exists (
      select 1 from public.connect_members cm
      where  cm.conversation_id = id
        and  cm.user_id = (select auth.uid())
    )
  );

-- connect_members: members can see who else is in their conversations
create policy "connect_members_select_member"
  on public.connect_members for select
  to authenticated
  using (
    exists (
      select 1 from public.connect_members cm
      where  cm.conversation_id = conversation_id
        and  cm.user_id = (select auth.uid())
    )
  );

-- Users can update their own member row (e.g. last_read_at)
create policy "connect_members_update_own"
  on public.connect_members for update
  to authenticated
  using  (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- connect_messages: members can read messages
create policy "connect_messages_select_member"
  on public.connect_messages for select
  to authenticated
  using (
    exists (
      select 1 from public.connect_members cm
      where  cm.conversation_id = conversation_id
        and  cm.user_id = (select auth.uid())
    )
  );

-- Members can insert messages (sender_id must equal their own uid)
create policy "connect_messages_insert_member"
  on public.connect_messages for insert
  to authenticated
  with check (
    sender_id = (select auth.uid())
    and exists (
      select 1 from public.connect_members cm
      where  cm.conversation_id = conversation_id
        and  cm.user_id = (select auth.uid())
    )
  );

-- Soft-delete: only the sender may delete their own message
create policy "connect_messages_delete_own"
  on public.connect_messages for delete
  to authenticated
  using (sender_id = (select auth.uid()));

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
--   Membership checks use a SECURITY DEFINER function to avoid the
--   classic infinite-recursion trap that occurs when an RLS policy on
--   connect_members queries connect_members itself.
-- ---------------------------------------------------------------------------

-- ---------------------------------------------------------------------------
-- connect_conversations
-- ---------------------------------------------------------------------------
create table public.connect_conversations (
  id          uuid primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
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
  deleted_at      timestamptz
);

create index connect_messages_conversation_idx
  on public.connect_messages (conversation_id, created_at desc);

create index connect_messages_sender_idx
  on public.connect_messages (sender_id);

-- ---------------------------------------------------------------------------
-- Trigger: bump conversation.updated_at on every new message
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
-- Trigger: enforce max 2 members per conversation
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
-- Security-definer membership helper
--
-- RLS policies must NOT query connect_members directly from within a
-- connect_members policy — Postgres detects the recursion and raises an
-- error.  A SECURITY DEFINER function bypasses RLS on the table it reads,
-- breaking the cycle while still enforcing the correct logic.
-- ---------------------------------------------------------------------------
create or replace function public.is_conversation_member(conv_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.connect_members
    where  conversation_id = conv_id
      and  user_id = (select auth.uid())
  );
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.connect_conversations enable row level security;
alter table public.connect_members       enable row level security;
alter table public.connect_messages      enable row level security;

-- connect_conversations: visible / updatable only to members
create policy "connect_conversations_select_member"
  on public.connect_conversations for select
  to authenticated
  using (public.is_conversation_member(id));

create policy "connect_conversations_update_member"
  on public.connect_conversations for update
  to authenticated
  using (public.is_conversation_member(id));

-- connect_members: members can see who else is in their conversations
create policy "connect_members_select_member"
  on public.connect_members for select
  to authenticated
  using (public.is_conversation_member(conversation_id));

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
  using (public.is_conversation_member(conversation_id));

-- Members can insert messages (sender_id must equal their own uid)
create policy "connect_messages_insert_member"
  on public.connect_messages for insert
  to authenticated
  with check (
    sender_id = (select auth.uid())
    and public.is_conversation_member(conversation_id)
  );

-- Soft-delete: only the sender may delete their own message
create policy "connect_messages_delete_own"
  on public.connect_messages for delete
  to authenticated
  using (sender_id = (select auth.uid()));

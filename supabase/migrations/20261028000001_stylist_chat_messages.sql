-- ---------------------------------------------------------------------------
-- stylist_chat_messages: Persistent multi-turn chat history with @ClosetAI Stylist
-- ---------------------------------------------------------------------------

create table if not exists public.stylist_chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  body text not null check (char_length(body) between 1 and 8000),
  attached_item_ids uuid[] not null default '{}',
  attached_outfit_ids uuid[] not null default '{}',
  referenced_item_ids uuid[] not null default '{}',
  proposed_outfits jsonb not null default '[]'::jsonb,
  quick_replies text[] not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists stylist_chat_messages_user_created_idx
  on public.stylist_chat_messages (user_id, created_at desc);

-- Enable Row Level Security
alter table public.stylist_chat_messages enable row level security;

create policy "Users can view own stylist chat messages"
  on public.stylist_chat_messages for select
  using (auth.uid() = user_id);

create policy "Users can insert own stylist chat messages"
  on public.stylist_chat_messages for insert
  with check (auth.uid() = user_id);

create policy "Users can delete own stylist chat messages"
  on public.stylist_chat_messages for delete
  using (auth.uid() = user_id);

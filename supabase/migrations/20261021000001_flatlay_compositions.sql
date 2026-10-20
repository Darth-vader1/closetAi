-- ---------------------------------------------------------------------------
-- flatlay_compositions: Editable fashion collage and flatlay outfit boards
-- ---------------------------------------------------------------------------

create table if not exists public.flatlay_compositions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  preset text not null default 'collage' check (preset in ('collage', 'editorial', 'streetwear', 'minimal', 'catalogue')),
  aspect_ratio text not null default '4:5' check (aspect_ratio in ('1:1', '4:5', '9:16', '16:9')),
  canvas_width integer not null default 1200,
  canvas_height integer not null default 1500,
  background_color text not null default '#fcfaf7',
  background_style text not null default 'plain' check (background_style in ('plain', 'linen', 'limewash', 'editorial_frame', 'dark')),
  items jsonb not null default '[]'::jsonb,
  thumbnail_path text check (thumbnail_path is null or char_length(thumbnail_path) <= 300),
  outfit_id uuid references public.outfits (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);

create index if not exists flatlay_compositions_user_created_idx
  on public.flatlay_compositions (user_id, created_at desc);

create trigger flatlay_compositions_updated_at before update on public.flatlay_compositions
  for each row execute function public.set_updated_at();

-- Enable Row Level Security
alter table public.flatlay_compositions enable row level security;

-- Policies: Owners have complete control over their own flatlay compositions
create policy "Users can view own flatlay compositions"
  on public.flatlay_compositions for select
  using (auth.uid() = user_id);

create policy "Users can create own flatlay compositions"
  on public.flatlay_compositions for insert
  with check (auth.uid() = user_id);

create policy "Users can update own flatlay compositions"
  on public.flatlay_compositions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own flatlay compositions"
  on public.flatlay_compositions for delete
  using (auth.uid() = user_id);

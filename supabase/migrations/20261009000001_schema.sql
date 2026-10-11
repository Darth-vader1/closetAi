-- ClosetAI core schema.
-- Timestamps are UTC (timestamptz). User scheduling uses IANA timezone identifiers stored in profiles.timezone.

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type public.laundry_status as enum (
  'CLEAN', 'WORN', 'DIRTY', 'IN_LAUNDRY', 'WASHING', 'DRYING', 'UNAVAILABLE'
);
create type public.outfit_source as enum ('MANUAL', 'ENGINE', 'AI');
create type public.plan_status as enum ('PLANNED', 'WORN', 'SKIPPED');
create type public.email_kind as enum ('DAILY', 'WEEKLY');
create type public.delivery_status as enum ('PENDING', 'SENT', 'FAILED', 'SKIPPED');
create type public.feedback_action as enum ('LIKED', 'REJECTED', 'RATED');

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (display_name is null or char_length(display_name) between 1 and 80),
  preferred_style text[] not null default '{}',
  favourite_colours text[] not null default '{}',
  common_occasions text[] not null default '{}',
  location text check (location is null or char_length(location) <= 120),
  timezone text not null default 'UTC' check (char_length(timezone) between 1 and 64),
  -- When true, items marked WORN remain eligible for outfit recommendations.
  rewear_worn_items boolean not null default false,
  onboarding_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- email_preferences (opt-in, off by default)
-- ---------------------------------------------------------------------------
create table public.email_preferences (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  daily_enabled boolean not null default false,
  daily_time time not null default '07:00',
  weekly_enabled boolean not null default false,
  weekly_day smallint not null default 0 check (weekly_day between 0 and 6), -- 0 = Sunday
  weekly_time time not null default '18:00',
  -- Secret used by the one-click unsubscribe link in emails.
  unsubscribe_token uuid not null default gen_random_uuid() unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger email_preferences_updated_at before update on public.email_preferences
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- wardrobe_items
-- ---------------------------------------------------------------------------
create table public.wardrobe_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  -- Category is validated in the app (src/lib/wardrobe/categories.ts) so the list stays extensible.
  category text not null check (char_length(category) between 1 and 60),
  subcategory text check (subcategory is null or char_length(subcategory) <= 60),
  primary_colour text check (primary_colour is null or char_length(primary_colour) <= 40),
  secondary_colours text[] not null default '{}',
  pattern text check (pattern is null or char_length(pattern) <= 40),
  material text check (material is null or char_length(material) <= 60),
  style text check (style is null or char_length(style) <= 40),
  occasions text[] not null default '{}',
  seasons text[] not null default '{}',
  warmth_level smallint check (warmth_level is null or warmth_level between 1 and 5),
  image_path text not null check (char_length(image_path) between 1 and 300),
  status public.laundry_status not null default 'CLEAN',
  is_favourite boolean not null default false,
  ai_analysed boolean not null default false,
  wear_count integer not null default 0 check (wear_count >= 0),
  last_worn_at timestamptz,
  last_washed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, image_path)
);
create index wardrobe_items_user_status_idx on public.wardrobe_items (user_id, status);
create index wardrobe_items_user_category_idx on public.wardrobe_items (user_id, category);
create index wardrobe_items_user_created_idx on public.wardrobe_items (user_id, created_at desc);
create trigger wardrobe_items_updated_at before update on public.wardrobe_items
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- outfits and their items
-- ---------------------------------------------------------------------------
create table public.outfits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  occasion text check (occasion is null or char_length(occasion) <= 60),
  style_description text check (style_description is null or char_length(style_description) <= 400),
  explanation text check (explanation is null or char_length(explanation) <= 800),
  styling_tip text check (styling_tip is null or char_length(styling_tip) <= 400),
  photo_path text check (photo_path is null or char_length(photo_path) <= 300),
  source public.outfit_source not null default 'MANUAL',
  is_favourite boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id)
);
create index outfits_user_created_idx on public.outfits (user_id, created_at desc);
create trigger outfits_updated_at before update on public.outfits
  for each row execute function public.set_updated_at();

-- Composite foreign keys guarantee an outfit can only contain its owner's garments.
-- Deleting an outfit removes only these link rows; deleting a garment removes only its links.
create table public.outfit_items (
  outfit_id uuid not null,
  item_id uuid not null,
  user_id uuid not null,
  position smallint not null default 0,
  primary key (outfit_id, item_id),
  foreign key (outfit_id, user_id) references public.outfits (id, user_id) on delete cascade,
  foreign key (item_id, user_id) references public.wardrobe_items (id, user_id) on delete cascade
);
create index outfit_items_item_idx on public.outfit_items (item_id);
create index outfit_items_user_idx on public.outfit_items (user_id);

-- ---------------------------------------------------------------------------
-- outfit_plans: what the user intends to wear. Never counted as worn.
-- ---------------------------------------------------------------------------
create table public.outfit_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  outfit_id uuid not null,
  planned_for date not null,
  status public.plan_status not null default 'PLANNED',
  worn_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, user_id),
  unique (user_id, planned_for),
  foreign key (outfit_id, user_id) references public.outfits (id, user_id) on delete cascade
);
create index outfit_plans_user_date_idx on public.outfit_plans (user_id, planned_for);
create trigger outfit_plans_updated_at before update on public.outfit_plans
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- outfit_history: outfits the user CONFIRMED they actually wore.
-- ---------------------------------------------------------------------------
create table public.outfit_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  outfit_id uuid,
  plan_id uuid,
  worn_on date not null,
  worn_at timestamptz not null default now(),
  unique (id, user_id),
  foreign key (outfit_id, user_id) references public.outfits (id, user_id) on delete set null (outfit_id),
  foreign key (plan_id, user_id) references public.outfit_plans (id, user_id) on delete set null (plan_id)
);
create index outfit_history_user_worn_idx on public.outfit_history (user_id, worn_on desc);

-- Snapshot of garments worn, so reports stay accurate even if the outfit is later edited or deleted.
create table public.outfit_history_items (
  history_id uuid not null,
  item_id uuid not null,
  user_id uuid not null,
  primary key (history_id, item_id),
  foreign key (history_id, user_id) references public.outfit_history (id, user_id) on delete cascade,
  foreign key (item_id, user_id) references public.wardrobe_items (id, user_id) on delete cascade
);
create index outfit_history_items_item_idx on public.outfit_history_items (item_id);

-- ---------------------------------------------------------------------------
-- outfit_feedback
-- ---------------------------------------------------------------------------
create table public.outfit_feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  outfit_id uuid not null,
  action public.feedback_action not null,
  rating smallint check (rating is null or rating between 1 and 5),
  created_at timestamptz not null default now(),
  check ((action = 'RATED') = (rating is not null)),
  foreign key (outfit_id, user_id) references public.outfits (id, user_id) on delete cascade
);
create index outfit_feedback_user_outfit_idx on public.outfit_feedback (user_id, outfit_id);

-- ---------------------------------------------------------------------------
-- laundry_events: audit trail of status transitions
-- ---------------------------------------------------------------------------
create table public.laundry_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  item_id uuid not null,
  from_status public.laundry_status,
  to_status public.laundry_status not null,
  confirmed_washed boolean not null default false,
  created_at timestamptz not null default now(),
  foreign key (item_id, user_id) references public.wardrobe_items (id, user_id) on delete cascade
);
create index laundry_events_user_created_idx on public.laundry_events (user_id, created_at desc);
create index laundry_events_item_idx on public.laundry_events (item_id, created_at desc);

-- ---------------------------------------------------------------------------
-- outfit_recommendations: persisted BEFORE emailing; also powers de-duplication
-- ---------------------------------------------------------------------------
create table public.outfit_recommendations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  outfit_id uuid not null,
  kind public.email_kind not null,
  recommendation_date date not null,
  rank smallint not null default 1,
  created_at timestamptz not null default now(),
  unique (user_id, kind, recommendation_date, outfit_id),
  foreign key (outfit_id, user_id) references public.outfits (id, user_id) on delete cascade
);
create index outfit_recommendations_user_date_idx
  on public.outfit_recommendations (user_id, recommendation_date desc);

-- ---------------------------------------------------------------------------
-- email_logs: one row per user + kind + period. The unique key IS the idempotency guard.
-- ---------------------------------------------------------------------------
create table public.email_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind public.email_kind not null,
  -- Local-calendar period identifier, e.g. '2026-10-09' (daily) or '2026-W41' (weekly).
  period_key text not null check (char_length(period_key) between 1 and 20),
  status public.delivery_status not null default 'PENDING',
  attempt_count integer not null default 0 check (attempt_count >= 0),
  provider_message_id text,
  last_error text check (last_error is null or char_length(last_error) <= 500),
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, kind, period_key)
);
create index email_logs_status_idx on public.email_logs (status, updated_at);
create trigger email_logs_updated_at before update on public.email_logs
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- ai_usage_events: lightweight per-user rate limiting for expensive AI calls
-- ---------------------------------------------------------------------------
create table public.ai_usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  operation text not null check (operation in ('ANALYSE_IMAGE', 'STYLE_OUTFITS', 'CHAT')),
  created_at timestamptz not null default now()
);
create index ai_usage_events_user_created_idx on public.ai_usage_events (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- New-user bootstrap: profile + email preferences (emails stay opt-in / disabled)
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, nullif(left(coalesce(new.raw_user_meta_data ->> 'display_name', ''), 80), ''));
  insert into public.email_preferences (user_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

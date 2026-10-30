-- ---------------------------------------------------------------------------
-- 20261031000002_freemium_subscriptions.sql
-- Complete Freemium & Premium Subscription System for ClosetAI
-- ---------------------------------------------------------------------------

-- 1. Subscription Plans catalog
create table if not exists public.subscription_plans (
  id text primary key, -- 'free', 'monthly', 'annual'
  name text not null,
  description text not null,
  price_ngn integer not null default 0,
  price_usd numeric(10,2) not null default 0,
  period text not null check (period in ('free', 'monthly', 'annual', 'lifetime')),
  features jsonb not null default '[]'::jsonb,
  limits jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- Seed subscription plans
insert into public.subscription_plans (id, name, description, price_ngn, price_usd, period, features, limits)
values
(
  'free',
  'ClosetAI Free',
  'Build your digital wardrobe and discover smarter ways to style yourself.',
  0,
  0,
  'free',
  '[
    "Up to 30 wardrobe items",
    "5 AI outfit recommendations per week",
    "10 saved outfits",
    "3 saved Flatlay Studio designs",
    "2 Beautify / background removals per month",
    "Basic style preferences & outfit explanations",
    "Basic ClosetAI Connect access",
    "7-stage laundry tracking",
    "Basic wardrobe insights"
  ]'::jsonb,
  '{
    "wardrobe_items": 30,
    "outfit_recommendations": 5,
    "outfit_recommendations_window": "week",
    "saved_outfits": 10,
    "flatlay_designs": 3,
    "beautify_processing": 2,
    "beautify_processing_window": "month",
    "advanced_styling": false,
    "closetai_connect": "basic",
    "advanced_insights": false
  }'::jsonb
),
(
  'monthly',
  'ClosetAI Premium (Monthly)',
  'Unlock your complete personal styling experience.',
  999,
  4.99,
  'monthly',
  '[
    "Unlimited wardrobe items",
    "100 AI outfit recommendations per month",
    "Unlimited saved outfits",
    "Unlimited Flatlay Studio designs",
    "30 Beautify / background removals per month",
    "Advanced personalized styling & detailed explanations",
    "Full ClosetAI Connect access",
    "Advanced wardrobe & wear analytics",
    "Priority access to new AI features"
  ]'::jsonb,
  '{
    "wardrobe_items": null,
    "outfit_recommendations": 100,
    "outfit_recommendations_window": "month",
    "saved_outfits": null,
    "flatlay_designs": null,
    "beautify_processing": 30,
    "beautify_processing_window": "month",
    "advanced_styling": true,
    "closetai_connect": "full",
    "advanced_insights": true
  }'::jsonb
),
(
  'annual',
  'ClosetAI Premium (Annual)',
  'Unlock your complete personal styling experience with 2 months free.',
  9990,
  49.99,
  'annual',
  '[
    "Everything in Premium Monthly",
    "2 Months Free (Save 17%)",
    "Priority AI Generation Queue",
    "Early Access to Experimental Style Models"
  ]'::jsonb,
  '{
    "wardrobe_items": null,
    "outfit_recommendations": 100,
    "outfit_recommendations_window": "month",
    "saved_outfits": null,
    "flatlay_designs": null,
    "beautify_processing": 30,
    "beautify_processing_window": "month",
    "advanced_styling": true,
    "closetai_connect": "full",
    "advanced_insights": true
  }'::jsonb
)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  price_ngn = excluded.price_ngn,
  price_usd = excluded.price_usd,
  features = excluded.features,
  limits = excluded.limits;

-- 2. User Subscriptions table
create table if not exists public.user_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade unique,
  plan_id text not null references public.subscription_plans (id) default 'free',
  status text not null default 'active' check (status in ('active', 'trialing', 'past_due', 'canceled', 'unpaid', 'expired')),
  provider text not null default 'manual' check (provider in ('paystack', 'stripe', 'manual')),
  provider_subscription_id text,
  provider_customer_id text,
  current_period_start timestamptz not null default now(),
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_user_subscriptions_user on public.user_subscriptions (user_id);
create index if not exists idx_user_subscriptions_plan on public.user_subscriptions (plan_id);

-- 3. Feature Usage Records table
create table if not exists public.usage_records (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  feature text not null check (feature in ('outfit_recommendations', 'beautify_processing', 'garment_crop', 'ai_packing')),
  period_start timestamptz not null,
  period_end timestamptz not null,
  count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint uq_user_feature_period unique (user_id, feature, period_start)
);

create index if not exists idx_usage_records_lookup on public.usage_records (user_id, feature, period_start, period_end);

-- 4. Payment Transactions table
create table if not exists public.payment_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  provider text not null check (provider in ('paystack', 'stripe', 'manual')),
  reference text not null unique,
  amount integer not null, -- Lowest currency unit (kobo or cents)
  currency text not null,
  status text not null check (status in ('success', 'failed', 'abandoned', 'pending', 'refunded')),
  plan_id text not null references public.subscription_plans (id),
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_payment_transactions_user on public.payment_transactions (user_id);
create index if not exists idx_payment_transactions_ref on public.payment_transactions (reference);

-- 5. Row Level Security
alter table public.subscription_plans enable row level security;
alter table public.user_subscriptions enable row level security;
alter table public.usage_records enable row level security;
alter table public.payment_transactions enable row level security;

-- subscription_plans: Public read-only
drop policy if exists "Plans are viewable by everyone" on public.subscription_plans;
create policy "Plans are viewable by everyone"
  on public.subscription_plans for select
  using (true);

-- user_subscriptions: Users see their own
drop policy if exists "Users view own subscription" on public.user_subscriptions;
create policy "Users view own subscription"
  on public.user_subscriptions for select
  using (auth.uid() = user_id);

-- usage_records: Users see their own
drop policy if exists "Users view own usage" on public.usage_records;
create policy "Users view own usage"
  on public.usage_records for select
  using (auth.uid() = user_id);

-- payment_transactions: Users see their own
drop policy if exists "Users view own transactions" on public.payment_transactions;
create policy "Users view own transactions"
  on public.payment_transactions for select
  using (auth.uid() = user_id);

-- Service role full access
create policy "Service role manages plans" on public.subscription_plans for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "Service role manages user_subscriptions" on public.user_subscriptions for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "Service role manages usage_records" on public.usage_records for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');
create policy "Service role manages payment_transactions" on public.payment_transactions for all using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- 6. Atomic Usage Consumption RPC
create or replace function public.consume_feature_usage(
  p_user_id uuid,
  p_feature text,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_amount integer default 1
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_new_count integer;
begin
  insert into public.usage_records (user_id, feature, period_start, period_end, count, updated_at)
  values (p_user_id, p_feature, p_period_start, p_period_end, p_amount, now())
  on conflict (user_id, feature, period_start)
  do update set
    count = public.usage_records.count + p_amount,
    updated_at = now()
  returning count into v_new_count;

  return v_new_count;
end;
$$;

revoke all on function public.consume_feature_usage from public, anon, authenticated;
grant execute on function public.consume_feature_usage to service_role;

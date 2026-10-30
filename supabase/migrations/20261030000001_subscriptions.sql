-- ---------------------------------------------------------------------------
-- 20261030000001_subscriptions.sql
-- Subscriptions & Paywall for ClosetAI
-- Supports Paystack (NGN) and Stripe (USD)
-- ---------------------------------------------------------------------------

create type public.subscription_status as enum (
  'active',
  'trialing',
  'past_due',
  'canceled',
  'unpaid',
  'incomplete'
);

create type public.payment_provider as enum (
  'paystack',
  'stripe',
  'manual'
);

-- Add subscription fields to profiles for quick access and RLS gating
alter table public.profiles
  add column if not exists subscription_status text default 'incomplete',
  add column if not exists subscription_plan text, -- 'monthly', 'annual', 'lifetime'
  add column if not exists subscription_provider text, -- 'paystack', 'stripe', 'manual'
  add column if not exists subscription_expires_at timestamptz,
  add column if not exists customer_id text; -- Paystack customer code or Stripe customer ID

-- Create dedicated subscriptions table for payment records & transaction logs
create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  provider text not null check (provider in ('paystack', 'stripe', 'manual')),
  provider_subscription_id text, -- Paystack sub code or Stripe sub ID
  provider_customer_id text,
  plan_code text not null default 'monthly_ngn_999',
  amount integer not null default 99900, -- Amount in lowest currency denomination (e.g. 99900 kobo = 999 NGN)
  currency text not null default 'NGN',
  status text not null default 'incomplete',
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists subscriptions_user_id_idx on public.subscriptions (user_id);
create index if not exists subscriptions_provider_sub_idx on public.subscriptions (provider_subscription_id);

alter table public.subscriptions enable row level security;

create policy "Users can view own subscriptions"
  on public.subscriptions for select
  using (auth.uid() = user_id);

-- System/service role can manage subscriptions
create policy "Service role manages subscriptions"
  on public.subscriptions for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

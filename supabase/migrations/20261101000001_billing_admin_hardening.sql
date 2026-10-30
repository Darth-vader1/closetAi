-- ---------------------------------------------------------------------------
-- Billing / admin hardening
-- Users could update their own profiles row, including role and subscription_*.
-- Only the service role (server-side, after verifying a webhook or requireAdmin)
-- may change these columns.
-- ---------------------------------------------------------------------------
create or replace function public.profiles_guard_privileged_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    new.role                    := old.role;
    new.subscription_status     := old.subscription_status;
    new.subscription_plan       := old.subscription_plan;
    new.subscription_provider   := old.subscription_provider;
    new.subscription_expires_at := old.subscription_expires_at;
    new.customer_id             := old.customer_id;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_privileged_columns on public.profiles;
create trigger profiles_guard_privileged_columns
  before update on public.profiles
  for each row execute function public.profiles_guard_privileged_columns();

-- Webhook idempotency: the same provider reference can only be recorded once.
create unique index if not exists subscriptions_provider_ref_uniq
  on public.subscriptions (provider, provider_subscription_id)
  where provider_subscription_id is not null;

-- Repair any rows already self-granted: review before running in production.
-- select id, role, subscription_status, subscription_provider from public.profiles
--   where (role <> 'user' or subscription_status in ('active','trialing'))
--     and not exists (select 1 from public.subscriptions s where s.user_id = profiles.id);

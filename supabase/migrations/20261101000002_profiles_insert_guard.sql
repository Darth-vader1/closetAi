-- ---------------------------------------------------------------------------
-- profiles INSERT guard.
-- 20261031000003 lets authenticated users insert their own profile row, and
-- profiles_delete_own lets them delete it. Delete + re-insert therefore bypassed
-- profiles_guard_privileged_columns (which only fires on UPDATE) and let a user
-- create their own row with role='superadmin' and an active subscription.
-- Force safe values for any insert made through the public API roles.
-- ---------------------------------------------------------------------------
create or replace function public.profiles_guard_privileged_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    new.role                    := 'user';
    new.subscription_status     := 'incomplete';
    new.subscription_plan       := null;
    new.subscription_provider   := null;
    new.subscription_expires_at := null;
    new.customer_id             := null;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_guard_privileged_insert on public.profiles;
create trigger profiles_guard_privileged_insert
  before insert on public.profiles
  for each row execute function public.profiles_guard_privileged_insert();

-- Usage counters must never go negative (would grant unlimited quota).
alter table public.usage_records drop constraint if exists usage_records_count_nonneg;
alter table public.usage_records add constraint usage_records_count_nonneg check (count >= 0) not valid;

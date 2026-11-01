-- ---------------------------------------------------------------------------
-- 20261101000004_plan_limits_outfits_flatlays.sql
-- Enforce free-plan limits in the database for outfits (10) and flatlays (3).
-- Row-level locking on profiles (FOR UPDATE) serializes concurrent inserts
-- per user, eliminating the parallel-insert race condition.
-- ---------------------------------------------------------------------------

-- 1. Saved outfits limit trigger (10 saved outfits on Free plan)
create or replace function public.outfits_enforce_plan_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_premium boolean;
  v_count integer;
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  select coalesce(p.subscription_status in ('active', 'trialing')
                  and (p.subscription_expires_at is null or p.subscription_expires_at > now()), false)
    into v_premium
    from public.profiles p where p.id = new.user_id
    for update;

  if coalesce(v_premium, false) then
    return new;
  end if;

  select count(*) into v_count from public.outfits where user_id = new.user_id;
  if v_count >= 10 then
    raise exception 'Free plan limit reached (10 saved outfits)' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists outfits_enforce_plan_limit_trg on public.outfits;
create trigger outfits_enforce_plan_limit_trg
  before insert on public.outfits
  for each row execute function public.outfits_enforce_plan_limit();

-- 2. Flatlay compositions limit trigger (3 flatlay designs on Free plan)
create or replace function public.flatlay_compositions_enforce_plan_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_premium boolean;
  v_count integer;
begin
  if current_user not in ('anon', 'authenticated') then
    return new;
  end if;

  select coalesce(p.subscription_status in ('active', 'trialing')
                  and (p.subscription_expires_at is null or p.subscription_expires_at > now()), false)
    into v_premium
    from public.profiles p where p.id = new.user_id
    for update;

  if coalesce(v_premium, false) then
    return new;
  end if;

  select count(*) into v_count from public.flatlay_compositions where user_id = new.user_id;
  if v_count >= 3 then
    raise exception 'Free plan limit reached (3 flatlay designs)' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists flatlay_compositions_enforce_plan_limit_trg on public.flatlay_compositions;
create trigger flatlay_compositions_enforce_plan_limit_trg
  before insert on public.flatlay_compositions
  for each row execute function public.flatlay_compositions_enforce_plan_limit();

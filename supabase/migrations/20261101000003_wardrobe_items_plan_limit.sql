-- Enforce the free-plan wardrobe cap in the database so it can't be bypassed
-- by calling the API directly. Premium = active/trialing and not expired.
create or replace function public.wardrobe_items_enforce_plan_limit()
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

  select count(*) into v_count from public.wardrobe_items where user_id = new.user_id;
  if v_count >= 30 then
    raise exception 'Free plan limit reached (30 wardrobe items)' using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop trigger if exists wardrobe_items_enforce_plan_limit_trg on public.wardrobe_items;
create trigger wardrobe_items_enforce_plan_limit_trg
  before insert on public.wardrobe_items
  for each row execute function public.wardrobe_items_enforce_plan_limit();

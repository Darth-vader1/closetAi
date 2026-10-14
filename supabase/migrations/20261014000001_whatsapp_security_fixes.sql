-- Migration: WhatsApp verification security fixes
--
-- Fixes found in the post-20261013000001 audit:
--   * Any signed-in user could mark their own number verified (direct UPDATE on email_preferences,
--     or by calling the SECURITY DEFINER RPCs with a hash of their choosing).
--   * The RPCs trusted a caller-supplied user id and were executable by anon/authenticated.
--   * A user could delete + re-insert their own email_preferences row with verified = true.
--   * Verification codes were not bound to the phone number they were issued for.
--   * Nothing stopped the same number being verified by two accounts, or us messaging a number
--     that had sent STOP.
--
-- Every account that was "verified" before this migration is reset, because the old check could be
-- bypassed and those rows cannot be trusted. Users re-verify once.

-- ---------------------------------------------------------------------------
-- 1. Columns
-- ---------------------------------------------------------------------------
alter table public.email_preferences
  add column if not exists whatsapp_last_inbound_at timestamptz;

comment on column public.email_preferences.whatsapp_last_inbound_at is
  'When the USER last messaged our business number. Meta''s 24-hour customer-service window starts here, not at our last outbound send.';

-- Canonical digits-only form of the phone number, so webhook matching never depends on how the
-- user typed it ("+234 801 234 5678" and "2348012345678" are the same number).
alter table public.email_preferences
  add column if not exists whatsapp_phone_digits text
  generated always as (nullif(regexp_replace(coalesce(whatsapp_phone, ''), '\D', '', 'g'), '')) stored;

-- Existing "verified" rows are untrustworthy (bypassable check): force re-verification.
update public.email_preferences
set whatsapp_phone_verified = false,
    whatsapp_phone_verified_at = null,
    whatsapp_verification_attempts = 0,
    whatsapp_verification_locked_until = null
where whatsapp_phone_verified is distinct from false;

-- Old codes were not bound to a number; drop them, then bind new ones.
delete from public.whatsapp_verifications;
alter table public.whatsapp_verifications
  add column if not exists phone_digits text not null;

create index if not exists idx_whatsapp_verifications_phone
  on public.whatsapp_verifications (phone_digits, created_at desc);

-- One verified owner per number.
create unique index if not exists email_prefs_verified_phone_uniq
  on public.email_preferences (whatsapp_phone_digits)
  where whatsapp_phone_verified and whatsapp_phone_digits is not null;

create index if not exists email_prefs_phone_digits_idx
  on public.email_preferences (whatsapp_phone_digits)
  where whatsapp_phone_digits is not null;

-- ---------------------------------------------------------------------------
-- 2. Opt-out list (numbers that texted STOP; we never message them again until they text START)
-- ---------------------------------------------------------------------------
create table if not exists public.whatsapp_optouts (
  phone_digits text primary key check (phone_digits ~ '^[0-9]{6,15}$'),
  opted_out_at timestamptz not null default now()
);
alter table public.whatsapp_optouts enable row level security;
revoke all on public.whatsapp_optouts from public, anon, authenticated;

drop policy if exists "Service role full access to optouts" on public.whatsapp_optouts;
create policy "Service role full access to optouts" on public.whatsapp_optouts
  for all to service_role using (true) with check (true);

-- ---------------------------------------------------------------------------
-- 3. Protect the verification columns on email_preferences
--    Signed-in users (and anon) may never write them, on INSERT or UPDATE. Only the service role
--    and our SECURITY DEFINER functions (which run as the owner) may.
-- ---------------------------------------------------------------------------
create or replace function public.guard_email_preferences_protected_columns()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      -- A user re-creating their own row must not be able to seed trusted values.
      new.whatsapp_phone_verified := false;
      new.whatsapp_phone_verified_at := null;
      new.whatsapp_verification_attempts := 0;
      new.whatsapp_verification_locked_until := null;
      new.last_whatsapp_message_at := null;
      new.whatsapp_last_inbound_at := null;
    else
      if new.whatsapp_phone_verified is distinct from old.whatsapp_phone_verified
         or new.whatsapp_phone_verified_at is distinct from old.whatsapp_phone_verified_at
         or new.whatsapp_verification_attempts is distinct from old.whatsapp_verification_attempts
         or new.whatsapp_verification_locked_until is distinct from old.whatsapp_verification_locked_until
         or new.last_whatsapp_message_at is distinct from old.last_whatsapp_message_at
         or new.whatsapp_last_inbound_at is distinct from old.whatsapp_last_inbound_at then
        raise exception 'WhatsApp verification fields can only be changed by the server'
          using errcode = '42501';
      end if;
    end if;
  end if;

  -- Changing the number always drops verification (for every caller).
  if tg_op = 'UPDATE' and new.whatsapp_phone is distinct from old.whatsapp_phone then
    new.whatsapp_phone_verified := false;
    new.whatsapp_phone_verified_at := null;
    new.whatsapp_verification_attempts := 0;
    new.whatsapp_verification_locked_until := null;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_email_preferences_protected on public.email_preferences;
create trigger trg_guard_email_preferences_protected
  before insert or update on public.email_preferences
  for each row execute function public.guard_email_preferences_protected_columns();

-- ---------------------------------------------------------------------------
-- 4. Verification table: server-only (hashes are never needed by the browser)
-- ---------------------------------------------------------------------------
drop policy if exists "Users can view own verifications" on public.whatsapp_verifications;
revoke all on public.whatsapp_verifications from public, anon, authenticated;
revoke all on public.whatsapp_webhook_messages from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 5. Replace the RPCs. They are SERVER-ONLY: execute is revoked from everyone but service_role,
--    and they never trust a caller to say who they are.
-- ---------------------------------------------------------------------------
drop function if exists public.create_whatsapp_verification(uuid, text, text, timestamptz);
drop function if exists public.verify_whatsapp_code(uuid, text);

create or replace function public.start_whatsapp_verification(
  p_user_id uuid,
  p_code_hash text,
  p_code_prefix text,
  p_expires_at timestamptz
)
returns table (out_verification_id uuid, out_phone_digits text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text;
  v_verified boolean;
  v_user_recent integer;
  v_phone_recent integer;
  v_id uuid;
begin
  if p_expires_at <= now() or p_expires_at > now() + interval '30 minutes' then
    raise exception 'INVALID_EXPIRY';
  end if;

  select ep.whatsapp_phone_digits, ep.whatsapp_phone_verified
    into v_phone, v_verified
  from public.email_preferences ep
  where ep.user_id = p_user_id
  for update;

  -- The settings UI controls whatsapp_daily_enabled; verification only needs a saved number.
  if not found or v_phone is null then
    raise exception 'NO_PHONE';
  end if;
  if v_verified then
    raise exception 'ALREADY_VERIFIED';
  end if;
  if exists (select 1 from public.whatsapp_optouts o where o.phone_digits = v_phone) then
    raise exception 'OPTED_OUT';
  end if;
  if exists (
    select 1 from public.email_preferences o
    where o.whatsapp_phone_digits = v_phone and o.whatsapp_phone_verified and o.user_id <> p_user_id
  ) then
    raise exception 'PHONE_IN_USE';
  end if;

  select count(*) into v_user_recent
  from public.whatsapp_verifications v
  where v.user_id = p_user_id and v.created_at > now() - interval '1 hour';
  if v_user_recent >= 5 then
    raise exception 'RATE_LIMITED';
  end if;

  -- Per NUMBER limit across all accounts, so nobody can use us to spam one phone.
  select count(*) into v_phone_recent
  from public.whatsapp_verifications v
  where v.phone_digits = v_phone and v.created_at > now() - interval '24 hours';
  if v_phone_recent >= 3 then
    raise exception 'PHONE_RATE_LIMITED';
  end if;

  -- Only the newest code is ever valid.
  update public.whatsapp_verifications v
  set expires_at = v.created_at + interval '1 millisecond'
  where v.user_id = p_user_id and v.verified_at is null and v.expires_at > now();

  insert into public.whatsapp_verifications (user_id, phone_digits, code_hash, code_prefix, expires_at)
  values (p_user_id, v_phone, p_code_hash, p_code_prefix, p_expires_at)
  returning id into v_id;

  return query select v_id, v_phone;
end;
$$;

-- Exactly one of p_user_id (code typed on the website) or p_phone_digits (code texted to our
-- number) identifies the code's owner. Both are supplied by trusted server code only.
create or replace function public.verify_whatsapp_code(
  p_code_hash text,
  p_user_id uuid default null,
  p_phone_digits text default null
)
returns table (out_success boolean, out_message text, out_user_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.whatsapp_verifications%rowtype;
  v_current_phone text;
begin
  if (p_user_id is null) = (p_phone_digits is null) then
    raise exception 'EXACTLY_ONE_IDENTIFIER_REQUIRED';
  end if;

  select v.* into v_row
  from public.whatsapp_verifications v
  where v.verified_at is null
    and v.expires_at > now()
    and (p_user_id is null or v.user_id = p_user_id)
    and (p_phone_digits is null or v.phone_digits = p_phone_digits)
  order by v.created_at desc
  limit 1
  for update;

  if not found then
    return query select false, 'INVALID: Code not found or expired'::text, null::uuid;
    return;
  end if;

  -- The code only counts for the number it was issued for.
  select ep.whatsapp_phone_digits into v_current_phone
  from public.email_preferences ep where ep.user_id = v_row.user_id;
  if v_current_phone is distinct from v_row.phone_digits then
    return query select false, 'INVALID: Code not found or expired'::text, null::uuid;
    return;
  end if;

  if v_row.attempts >= v_row.max_attempts then
    return query select false, 'LOCKED: Too many failed attempts. Request a new code.'::text, null::uuid;
    return;
  end if;

  if v_row.code_hash <> p_code_hash then
    update public.whatsapp_verifications set attempts = attempts + 1 where id = v_row.id;
    if v_row.attempts + 1 >= v_row.max_attempts then
      return query select false, 'LOCKED: Too many failed attempts. Request a new code.'::text, null::uuid;
    else
      return query select false, 'INVALID: Code not found or expired'::text, null::uuid;
    end if;
    return;
  end if;

  begin
    update public.email_preferences
    set whatsapp_phone_verified = true,
        whatsapp_phone_verified_at = now(),
        whatsapp_verification_attempts = 0,
        whatsapp_verification_locked_until = null
    where user_id = v_row.user_id;
  exception when unique_violation then
    return query select false, 'PHONE_IN_USE: This number is verified on another account'::text, null::uuid;
    return;
  end;

  update public.whatsapp_verifications set verified_at = now() where id = v_row.id;
  return query select true, 'SUCCESS: Phone verified'::text, v_row.user_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Lock down every function this feature added. REVOKE FROM PUBLIC is essential: Postgres (and
--    Supabase default privileges) make new functions executable by everyone otherwise.
-- ---------------------------------------------------------------------------
revoke all on function public.start_whatsapp_verification(uuid, text, text, timestamptz) from public, anon, authenticated;
grant execute on function public.start_whatsapp_verification(uuid, text, text, timestamptz) to service_role;

revoke all on function public.verify_whatsapp_code(text, uuid, text) from public, anon, authenticated;
grant execute on function public.verify_whatsapp_code(text, uuid, text) to service_role;

revoke all on function public.cleanup_expired_verifications() from public, anon, authenticated;
grant execute on function public.cleanup_expired_verifications() to service_role;

revoke all on function public.cleanup_old_webhook_messages() from public, anon, authenticated;
grant execute on function public.cleanup_old_webhook_messages() to service_role;

-- ---------------------------------------------------------------------------
-- 7. Care-type helpers from 20261013000003
-- ---------------------------------------------------------------------------
-- item_needs_washing was SECURITY DEFINER with no ownership check: any user could read the
-- laundry state of any item id. Run it as the caller so RLS applies.
create or replace function public.item_needs_washing(p_item_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = public
as $$
  select wi.care_type = 'WASHABLE' and wi.status in ('WORN', 'DIRTY')
  from public.wardrobe_items wi
  where wi.id = p_item_id;
$$;
revoke all on function public.item_needs_washing(uuid) from public, anon;
grant execute on function public.item_needs_washing(uuid) to authenticated;

create or replace function public.validate_care_type_status_change()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.care_type in ('NO_WASH', 'WIPE_CLEAN')
     and new.status in ('DIRTY', 'IN_LAUNDRY', 'WASHING', 'DRYING') then
    raise exception 'Cannot set % items to % status', new.care_type, new.status
      using errcode = '23514';
  end if;
  return new;
end;
$$;

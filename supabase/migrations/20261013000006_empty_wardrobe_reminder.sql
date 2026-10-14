-- ---------------------------------------------------------------------------
-- Empty-wardrobe onboarding reminder
--
-- 1. Extend the email_kind enum with 'EMPTY_WARDROBE' so email_logs can record
--    these sends with the same idempotency machinery used by DAILY / WEEKLY.
--
-- 2. Add remind_empty_wardrobe to email_preferences (opt-in by default for all
--    new users; existing users also opt in automatically because the default is
--    true — this is an onboarding-critical transactional nudge, not marketing).
--    Users can turn it off from Settings or via the unsubscribe link in the
--    email itself.
-- ---------------------------------------------------------------------------

-- Extend the enum.
-- ALTER TYPE … ADD VALUE cannot run inside a transaction on older Postgres
-- versions so we guard with a DO block that skips if the value already exists.
do $$
begin
  if not exists (
    select 1 from pg_enum
    where enumtypid = 'public.email_kind'::regtype
      and enumlabel  = 'EMPTY_WARDROBE'
  ) then
    alter type public.email_kind add value 'EMPTY_WARDROBE';
  end if;
end;
$$;

-- Add the opt-out column to email_preferences.
-- Default true: every user gets the nudge unless they explicitly turn it off.
alter table public.email_preferences
  add column if not exists remind_empty_wardrobe boolean not null default true;

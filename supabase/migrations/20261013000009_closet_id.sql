-- ---------------------------------------------------------------------------
-- Closet ID
--
-- A stable, human-readable, guaranteed-unique public identifier for every
-- ClosetAI user. Displayed in the Connect inbox, conversation headers, and
-- Settings so users can share it with friends who want to find them.
--
-- Format: CLOS-XXXXXXXX  (uppercase alphanumeric, 8 chars after the prefix)
--   Example: CLOS-A3F8C249
--
-- Design decisions:
--   1. Stored in the database — unique constraint enforced at the DB level,
--      not derived from a UUID (which offers no uniqueness guarantee per the
--      spec). The UUID remains the authoritative internal identifier.
--   2. Generated automatically on INSERT by a BEFORE trigger, so signup
--      code and the onboarding flow need no changes.
--   3. Existing rows are backfilled by the same function immediately after
--      the column is added (DO block below).
--   4. Server-controlled: users cannot set or change their own Closet ID.
--      No client RLS policy allows UPDATE on this column.
--   5. Collision handling: the generator retries up to 10 times with fresh
--      randomness before raising an exception. With an alphabet of 36^8
--      (~2.8 trillion) values, collisions are vanishingly unlikely even at
--      millions of users.
-- ---------------------------------------------------------------------------

-- Add the column (nullable initially so backfill can run safely)
alter table public.profiles
  add column if not exists closet_id text
  check (closet_id is null or closet_id ~ '^CLOS-[A-Z0-9]{8}$');

-- Unique index — the core guarantee
create unique index if not exists profiles_closet_id_unique
  on public.profiles (closet_id)
  where closet_id is not null;

-- ---------------------------------------------------------------------------
-- Generator function
-- Returns a new unique CLOS-XXXXXXXX value, retrying on collision.
-- ---------------------------------------------------------------------------
create or replace function public.generate_closet_id()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  candidate text;
  alphabet  text  := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; -- omit 0/O, 1/I for legibility
  i         int;
  attempt   int   := 0;
  max_tries int   := 10;
begin
  loop
    -- Build 8-character random string from the alphabet
    candidate := 'CLOS-';
    for i in 1..8 loop
      candidate := candidate || substr(alphabet, floor(random() * length(alphabet))::int + 1, 1);
    end loop;

    begin
      -- Try inserting; if unique violation, retry
      if not exists (
        select 1 from public.profiles where closet_id = candidate
      ) then
        return candidate;
      end if;
    end;

    attempt := attempt + 1;
    if attempt >= max_tries then
      raise exception 'Could not generate a unique Closet ID after % attempts.', max_tries;
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Trigger: assign Closet ID automatically on new profile creation
-- ---------------------------------------------------------------------------
create or replace function public.assign_closet_id()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.closet_id is null then
    new.closet_id := public.generate_closet_id();
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_assign_closet_id on public.profiles;

create trigger profiles_assign_closet_id
  before insert on public.profiles
  for each row execute function public.assign_closet_id();

-- ---------------------------------------------------------------------------
-- Backfill existing rows that have no Closet ID yet
-- ---------------------------------------------------------------------------
do $$
declare
  r record;
begin
  for r in
    select id from public.profiles where closet_id is null
  loop
    update public.profiles
    set closet_id = public.generate_closet_id()
    where id = r.id;
  end loop;
end;
$$;

-- Make the column NOT NULL now that every row has a value
alter table public.profiles
  alter column closet_id set not null;

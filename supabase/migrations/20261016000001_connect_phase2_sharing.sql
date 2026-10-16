-- ---------------------------------------------------------------------------
-- ClosetAI Connect Phase 2: Wardrobe & Outfit Sharing + Controlled Grants
--
-- Tables
--   connect_message_attachments — shared clothing items or outfits inside a message
--   connect_wardrobe_grants     — permission-based wardrobe sharing grants
--   connect_grant_items         — specific items included when grant.scope = 'selected_items'
--
-- Security model
--   • Sharing an item or outfit in a message only authorizes members of that
--     conversation to read that specific item/outfit while the attachment is
--     not revoked and the message is not deleted.
--   • Wardrobe grants support granular, independent permissions:
--       can_view_items, can_recommend, can_submit_for_approval, can_collaborate_request
--     with scope in ('selected_items', 'wardrobe').
--   • Revoking an attachment or grant (setting revoked_at) or blocking a user
--     immediately prevents any subsequent SELECT on wardrobe_items, outfits,
--     outfit_items, and storage.objects.
--   • Recipients can NEVER update, delete, or change laundry status of shared items.
-- ---------------------------------------------------------------------------

-- ===========================================================================
-- 1. connect_message_attachments
-- ===========================================================================
create table if not exists public.connect_message_attachments (
  id              uuid primary key default gen_random_uuid(),
  message_id      uuid not null references public.connect_messages (id) on delete cascade,
  conversation_id uuid not null references public.connect_conversations (id) on delete cascade,
  owner_id        uuid not null references public.profiles (id) on delete cascade,
  kind            text not null check (kind in ('item', 'outfit')),
  item_id         uuid references public.wardrobe_items (id) on delete set null,
  outfit_id       uuid references public.outfits (id) on delete set null,
  revoked_at      timestamptz,
  created_at      timestamptz not null default now()
);

create index if not exists connect_msg_attachments_message_idx
  on public.connect_message_attachments (message_id);
create index if not exists connect_msg_attachments_conv_idx
  on public.connect_message_attachments (conversation_id);
create index if not exists connect_msg_attachments_item_idx
  on public.connect_message_attachments (item_id) where item_id is not null;
create index if not exists connect_msg_attachments_outfit_idx
  on public.connect_message_attachments (outfit_id) where outfit_id is not null;

alter table public.connect_message_attachments enable row level security;

revoke all on public.connect_message_attachments from public, anon;
grant select, insert, update, delete on public.connect_message_attachments to authenticated;

-- Validate ownership, conversation membership, and message ownership before insert.
create or replace function public.connect_before_attachment_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller      uuid := (select auth.uid());
  v_msg_sender  uuid;
  v_msg_conv    uuid;
  v_owns_target boolean;
begin
  if v_caller is null or new.owner_id is distinct from v_caller then
    raise exception 'new row violates row-level security policy for table connect_message_attachments'
      using errcode = '42501';
  end if;

  select sender_id, conversation_id into v_msg_sender, v_msg_conv
  from public.connect_messages
  where id = new.message_id and deleted_at is null;

  if not found or v_msg_sender is distinct from v_caller or v_msg_conv is distinct from new.conversation_id then
    raise exception 'Attachment must belong to your own message in the same conversation'
      using errcode = '42501';
  end if;

  if new.kind = 'item' then
    if new.item_id is null or new.outfit_id is not null then
      raise exception 'Item attachment requires item_id only' using errcode = '23514';
    end if;
    select exists (
      select 1 from public.wardrobe_items
      where id = new.item_id and user_id = v_caller
    ) into v_owns_target;
    if not v_owns_target then
      raise exception 'You can only share clothing items that you own'
        using errcode = '42501';
    end if;
  elsif new.kind = 'outfit' then
    if new.outfit_id is null or new.item_id is not null then
      raise exception 'Outfit attachment requires outfit_id only' using errcode = '23514';
    end if;
    select exists (
      select 1 from public.outfits
      where id = new.outfit_id and user_id = v_caller
    ) into v_owns_target;
    if not v_owns_target then
      raise exception 'You can only share outfits that you own'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists connect_before_attachment_insert on public.connect_message_attachments;
create trigger connect_before_attachment_insert
  before insert on public.connect_message_attachments
  for each row execute function public.connect_before_attachment_insert();

-- Guard immutable columns on update (only revoked_at may change).
create or replace function public.connect_guard_attachment_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    new.id              := old.id;
    new.message_id      := old.message_id;
    new.conversation_id := old.conversation_id;
    new.owner_id        := old.owner_id;
    new.kind            := old.kind;
    new.item_id         := old.item_id;
    new.outfit_id       := old.outfit_id;
    new.created_at      := old.created_at;
  end if;
  return new;
end;
$$;

drop trigger if exists connect_guard_attachment_columns on public.connect_message_attachments;
create trigger connect_guard_attachment_columns
  before update on public.connect_message_attachments
  for each row execute function public.connect_guard_attachment_columns();

drop policy if exists "connect_msg_attachments_select_member" on public.connect_message_attachments;
create policy "connect_msg_attachments_select_member"
  on public.connect_message_attachments for select
  to authenticated
  using (public.is_conversation_member(conversation_id));

drop policy if exists "connect_msg_attachments_insert_owner" on public.connect_message_attachments;
create policy "connect_msg_attachments_insert_owner"
  on public.connect_message_attachments for insert
  to authenticated
  with check (
    owner_id = (select auth.uid())
    and public.is_conversation_member(conversation_id)
  );

drop policy if exists "connect_msg_attachments_update_owner" on public.connect_message_attachments;
create policy "connect_msg_attachments_update_owner"
  on public.connect_message_attachments for update
  to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists "connect_msg_attachments_delete_owner" on public.connect_message_attachments;
create policy "connect_msg_attachments_delete_owner"
  on public.connect_message_attachments for delete
  to authenticated
  using (owner_id = (select auth.uid()));

-- ===========================================================================
-- 2. connect_wardrobe_grants & connect_grant_items
-- ===========================================================================
create table if not exists public.connect_wardrobe_grants (
  id                       uuid primary key default gen_random_uuid(),
  owner_id                 uuid not null references public.profiles (id) on delete cascade,
  grantee_id               uuid not null references public.profiles (id) on delete cascade,
  conversation_id          uuid references public.connect_conversations (id) on delete set null,
  scope                    text not null default 'selected_items'
    check (scope in ('selected_items', 'wardrobe')),
  can_view_items           boolean not null default true,
  can_recommend            boolean not null default false,
  can_submit_for_approval  boolean not null default false,
  can_collaborate_request  boolean not null default false,
  revoked_at               timestamptz,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  check (owner_id <> grantee_id)
);

create unique index if not exists connect_wardrobe_grants_active_pair_idx
  on public.connect_wardrobe_grants (owner_id, grantee_id)
  where revoked_at is null;

create index if not exists connect_wardrobe_grants_grantee_idx
  on public.connect_wardrobe_grants (grantee_id)
  where revoked_at is null;

drop trigger if exists connect_wardrobe_grants_updated_at on public.connect_wardrobe_grants;
create trigger connect_wardrobe_grants_updated_at
  before update on public.connect_wardrobe_grants
  for each row execute function public.set_updated_at();

create or replace function public.connect_guard_grant_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('anon', 'authenticated') then
    new.id         := old.id;
    new.owner_id   := old.owner_id;
    new.grantee_id := old.grantee_id;
    new.created_at := old.created_at;
  end if;
  return new;
end;
$$;

drop trigger if exists connect_guard_grant_columns on public.connect_wardrobe_grants;
create trigger connect_guard_grant_columns
  before update on public.connect_wardrobe_grants
  for each row execute function public.connect_guard_grant_columns();

alter table public.connect_wardrobe_grants enable row level security;

revoke all on public.connect_wardrobe_grants from public, anon;
grant select, insert, update, delete on public.connect_wardrobe_grants to authenticated;

drop policy if exists "connect_wardrobe_grants_select" on public.connect_wardrobe_grants;
create policy "connect_wardrobe_grants_select"
  on public.connect_wardrobe_grants for select
  to authenticated
  using (
    owner_id = (select auth.uid())
    or (
      grantee_id = (select auth.uid())
      and revoked_at is null
      and not public.connect_is_blocked((select auth.uid()), owner_id)
    )
  );

drop policy if exists "connect_wardrobe_grants_insert_owner" on public.connect_wardrobe_grants;
create policy "connect_wardrobe_grants_insert_owner"
  on public.connect_wardrobe_grants for insert
  to authenticated
  with check (
    owner_id = (select auth.uid())
    and owner_id <> grantee_id
    and not public.connect_is_blocked(owner_id, grantee_id)
  );

drop policy if exists "connect_wardrobe_grants_update_owner" on public.connect_wardrobe_grants;
create policy "connect_wardrobe_grants_update_owner"
  on public.connect_wardrobe_grants for update
  to authenticated
  using (owner_id = (select auth.uid()))
  with check (owner_id = (select auth.uid()));

drop policy if exists "connect_wardrobe_grants_delete_owner" on public.connect_wardrobe_grants;
create policy "connect_wardrobe_grants_delete_owner"
  on public.connect_wardrobe_grants for delete
  to authenticated
  using (owner_id = (select auth.uid()));

-- Grant items table (for scope = 'selected_items')
create table if not exists public.connect_grant_items (
  grant_id   uuid not null references public.connect_wardrobe_grants (id) on delete cascade,
  item_id    uuid not null,
  owner_id   uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (grant_id, item_id),
  foreign key (item_id, owner_id) references public.wardrobe_items (id, user_id) on delete cascade
);

create index if not exists connect_grant_items_item_idx
  on public.connect_grant_items (item_id);

create or replace function public.connect_before_grant_item_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller     uuid := (select auth.uid());
  v_grant_owner uuid;
begin
  if v_caller is null or new.owner_id is distinct from v_caller then
    raise exception 'new row violates row-level security policy for table connect_grant_items'
      using errcode = '42501';
  end if;

  select owner_id into v_grant_owner
  from public.connect_wardrobe_grants
  where id = new.grant_id;

  if not found or v_grant_owner is distinct from v_caller then
    raise exception 'Grant does not belong to caller'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists connect_before_grant_item_insert on public.connect_grant_items;
create trigger connect_before_grant_item_insert
  before insert on public.connect_grant_items
  for each row execute function public.connect_before_grant_item_insert();

alter table public.connect_grant_items enable row level security;

revoke all on public.connect_grant_items from public, anon;
grant select, insert, delete on public.connect_grant_items to authenticated;

drop policy if exists "connect_grant_items_select" on public.connect_grant_items;
create policy "connect_grant_items_select"
  on public.connect_grant_items for select
  to authenticated
  using (
    owner_id = (select auth.uid())
    or exists (
      select 1 from public.connect_wardrobe_grants g
      where g.id = grant_id
        and g.grantee_id = (select auth.uid())
        and g.revoked_at is null
        and g.can_view_items = true
        and not public.connect_is_blocked((select auth.uid()), g.owner_id)
    )
  );

drop policy if exists "connect_grant_items_insert_owner" on public.connect_grant_items;
create policy "connect_grant_items_insert_owner"
  on public.connect_grant_items for insert
  to authenticated
  with check (owner_id = (select auth.uid()));

drop policy if exists "connect_grant_items_delete_owner" on public.connect_grant_items;
create policy "connect_grant_items_delete_owner"
  on public.connect_grant_items for delete
  to authenticated
  using (owner_id = (select auth.uid()));

-- ===========================================================================
-- 3. Controlled Read Access Helpers (SECURITY DEFINER, break RLS cycles)
-- ===========================================================================

-- Can the current authenticated caller read a specific wardrobe item?
create or replace function public.can_access_wardrobe_item(p_item_id uuid, p_owner_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select
    case
      when (select auth.uid()) is null then false
      when p_owner_id = (select auth.uid()) then true
      when public.connect_is_blocked((select auth.uid()), p_owner_id) then false
      else (
        -- 1. Explicitly shared as an item attachment in a conversation the caller belongs to
        exists (
          select 1
          from public.connect_message_attachments a
          join public.connect_messages m on m.id = a.message_id
          join public.connect_members cm on cm.conversation_id = a.conversation_id
          where a.kind = 'item'
            and a.item_id = p_item_id
            and a.owner_id = p_owner_id
            and a.revoked_at is null
            and m.deleted_at is null
            and cm.user_id = (select auth.uid())
        )
        -- 2. Part of an outfit that was shared in a conversation the caller belongs to
        or exists (
          select 1
          from public.connect_message_attachments a
          join public.connect_messages m on m.id = a.message_id
          join public.connect_members cm on cm.conversation_id = a.conversation_id
          join public.outfit_items oi on oi.outfit_id = a.outfit_id and oi.user_id = a.owner_id
          where a.kind = 'outfit'
            and oi.item_id = p_item_id
            and a.owner_id = p_owner_id
            and a.revoked_at is null
            and m.deleted_at is null
            and cm.user_id = (select auth.uid())
        )
        -- 3. Covered by an active wardrobe-sharing grant
        or exists (
          select 1
          from public.connect_wardrobe_grants g
          where g.owner_id = p_owner_id
            and g.grantee_id = (select auth.uid())
            and g.revoked_at is null
            and g.can_view_items = true
            and (
              g.scope = 'wardrobe'
              or (
                g.scope = 'selected_items'
                and exists (
                  select 1 from public.connect_grant_items gi
                  where gi.grant_id = g.id and gi.item_id = p_item_id
                )
              )
            )
        )
      )
    end;
$$;

revoke all on function public.can_access_wardrobe_item(uuid, uuid) from public, anon;
grant execute on function public.can_access_wardrobe_item(uuid, uuid) to authenticated;

-- Can the current authenticated caller read a specific saved outfit?
create or replace function public.can_access_outfit(p_outfit_id uuid, p_owner_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select
    case
      when (select auth.uid()) is null then false
      when p_owner_id = (select auth.uid()) then true
      when public.connect_is_blocked((select auth.uid()), p_owner_id) then false
      else exists (
        select 1
        from public.connect_message_attachments a
        join public.connect_messages m on m.id = a.message_id
        join public.connect_members cm on cm.conversation_id = a.conversation_id
        where a.kind = 'outfit'
          and a.outfit_id = p_outfit_id
          and a.owner_id = p_owner_id
          and a.revoked_at is null
          and m.deleted_at is null
          and cm.user_id = (select auth.uid())
      )
    end;
$$;

revoke all on function public.can_access_outfit(uuid, uuid) from public, anon;
grant execute on function public.can_access_outfit(uuid, uuid) to authenticated;

-- Can the current authenticated caller read a storage path in the 'wardrobe' bucket?
create or replace function public.can_access_storage_object(p_name text)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select
    case
      when (select auth.uid()) is null then false
      else (
        exists (
          select 1 from public.wardrobe_items wi
          where wi.image_path = p_name
            and public.can_access_wardrobe_item(wi.id, wi.user_id)
        )
        or exists (
          select 1 from public.outfits o
          where o.photo_path = p_name
            and public.can_access_outfit(o.id, o.user_id)
        )
      )
    end;
$$;

revoke all on function public.can_access_storage_object(text) from public, anon;
grant execute on function public.can_access_storage_object(text) to authenticated;

-- ===========================================================================
-- 4. Add SELECT-only sharing policies on wardrobe_items, outfits, outfit_items,
--    and storage.objects (INSERT/UPDATE/DELETE remain strictly owner-only!)
-- ===========================================================================
drop policy if exists "wardrobe_items_select_shared" on public.wardrobe_items;
create policy "wardrobe_items_select_shared"
  on public.wardrobe_items for select
  to authenticated
  using (public.can_access_wardrobe_item(id, user_id));

drop policy if exists "outfits_select_shared" on public.outfits;
create policy "outfits_select_shared"
  on public.outfits for select
  to authenticated
  using (public.can_access_outfit(id, user_id));

drop policy if exists "outfit_items_select_shared" on public.outfit_items;
create policy "outfit_items_select_shared"
  on public.outfit_items for select
  to authenticated
  using (public.can_access_outfit(outfit_id, user_id));

drop policy if exists "wardrobe_objects_select_shared" on storage.objects;
create policy "wardrobe_objects_select_shared"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'wardrobe' and public.can_access_storage_object(name));

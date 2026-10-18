-- ---------------------------------------------------------------------------
-- ClosetAI Connect: Security & Privacy Hardening Round 4
-- ---------------------------------------------------------------------------
-- 1. Path forgery protection:
--    - BEFORE INSERT OR UPDATE triggers on wardrobe_items and outfits rejecting
--      image_path, thumbnail_path, medium_path, original_image_path,
--      beautified_image_path (and outfits.photo_path) unless the value starts
--      with <user_id>/ and contains no '..'.
--    - Removes the legacy exception that skipped original_image_path values
--      without a '/'.
--    - Hardens can_access_storage_object(text) to require name like owner_id||'/%'.
-- 2. Least-privilege shared item projection:
--    - Creates view public.shared_wardrobe_items (security_invoker = false)
--      exposing only id, user_id, name, category, subcategory, primary_colour,
--      secondary_colours, pattern, material, style, image_path, thumbnail_path,
--      medium_path, filtered by can_access_wardrobe_item(id, user_id).
--    - Drops wardrobe_items_select_shared policy from public.wardrobe_items so
--      grantees cannot read status, wear_count, last_worn_at, care_type,
--      original_*, or beautification_*.
-- 3. Hidden & excluded categories:
--    - Underwear, Intimates, and Swimwear are never visible through grants or
--      attachments (enforced in can_access_wardrobe_item).
--    - Adds excluded_categories text[] to connect_wardrobe_grants and enforces
--      per-grant category exclusions in can_access_wardrobe_item.
-- 4. Attachment limits & pending conversation guard:
--    - Enforces at most 6 attachments per message and 0 attachments on messages
--      in conversations with status = 'pending'.
-- ---------------------------------------------------------------------------

-- ===========================================================================
-- 1. PATH FORGERY PROTECTION
-- ===========================================================================

create or replace function public.is_valid_owner_storage_path(
  p_user_id uuid,
  p_path    text
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select
    p_user_id is not null
    and p_path is not null
    and p_path like p_user_id::text || '/%'
    and char_length(p_path) > char_length(p_user_id::text) + 1
    and position('..' in p_path) = 0;
$$;

revoke all on function public.is_valid_owner_storage_path(uuid, text) from public;
grant execute on function public.is_valid_owner_storage_path(uuid, text) to anon, authenticated;

-- Backfill any legacy test/dev rows whose image_path or original_image_path
-- lacked a '<user_id>/' prefix before installing the stricter trigger.
update public.wardrobe_items
set image_path = user_id::text || '/' || ltrim(replace(image_path, '..', ''), '/')
where not public.is_valid_owner_storage_path(user_id, image_path);

update public.wardrobe_items
set original_image_path = image_path
where not public.is_valid_owner_storage_path(user_id, original_image_path);

update public.wardrobe_items
set thumbnail_path = null
where thumbnail_path is not null
  and not public.is_valid_owner_storage_path(user_id, thumbnail_path);

update public.wardrobe_items
set medium_path = null
where medium_path is not null
  and not public.is_valid_owner_storage_path(user_id, medium_path);

update public.wardrobe_items
set beautified_image_path = null
where beautified_image_path is not null
  and not public.is_valid_owner_storage_path(user_id, beautified_image_path);

update public.outfits
set photo_path = null
where photo_path is not null
  and not public.is_valid_owner_storage_path(user_id, photo_path);

-- Replace legacy triggers on wardrobe_items with a unified BEFORE INSERT OR UPDATE trigger
drop trigger if exists wardrobe_items_default_original_path_trg on public.wardrobe_items;
drop trigger if exists wardrobe_items_enforce_beautification_paths_trg on public.wardrobe_items;

create or replace function public.wardrobe_items_enforce_image_paths()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Preserve standard RLS error semantics when an authenticated caller tries
  -- to insert or update a row claiming another user's user_id.
  if (select auth.uid()) is not null
     and new.user_id is distinct from (select auth.uid()) then
    raise exception 'new row violates row-level security policy for table "wardrobe_items"'
      using errcode = '42501';
  end if;

  -- On INSERT, default original_image_path to image_path when omitted.
  if tg_op = 'INSERT' and (new.original_image_path is null or btrim(new.original_image_path) = '') then
    new.original_image_path := new.image_path;
  end if;

  if not public.is_valid_owner_storage_path(new.user_id, new.image_path) then
    raise exception 'image_path must reside inside the owner folder'
      using errcode = '23514';
  end if;

  if not public.is_valid_owner_storage_path(new.user_id, new.original_image_path) then
    raise exception 'original_image_path must reside inside the owner folder'
      using errcode = '23514';
  end if;

  if new.thumbnail_path is not null
     and not public.is_valid_owner_storage_path(new.user_id, new.thumbnail_path) then
    raise exception 'thumbnail_path must reside inside the owner folder'
      using errcode = '23514';
  end if;

  if new.medium_path is not null
     and not public.is_valid_owner_storage_path(new.user_id, new.medium_path) then
    raise exception 'medium_path must reside inside the owner folder'
      using errcode = '23514';
  end if;

  if new.beautified_image_path is not null
     and not public.is_valid_owner_storage_path(new.user_id, new.beautified_image_path) then
    raise exception 'beautified_image_path must reside inside the owner folder'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.wardrobe_items_enforce_image_paths() from public, anon, authenticated;

drop trigger if exists wardrobe_items_enforce_image_paths_trg on public.wardrobe_items;
create trigger wardrobe_items_enforce_image_paths_trg
  before insert or update of user_id, image_path, thumbnail_path, medium_path, original_image_path, beautified_image_path
  on public.wardrobe_items
  for each row execute function public.wardrobe_items_enforce_image_paths();

-- BEFORE INSERT OR UPDATE trigger on outfits for photo_path
create or replace function public.outfits_enforce_photo_path()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is not null
     and new.user_id is distinct from (select auth.uid()) then
    raise exception 'new row violates row-level security policy for table "outfits"'
      using errcode = '42501';
  end if;

  if new.photo_path is not null
     and not public.is_valid_owner_storage_path(new.user_id, new.photo_path) then
    raise exception 'photo_path must reside inside the owner folder'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.outfits_enforce_photo_path() from public, anon, authenticated;

drop trigger if exists outfits_enforce_photo_path_trg on public.outfits;
create trigger outfits_enforce_photo_path_trg
  before insert or update of user_id, photo_path
  on public.outfits
  for each row execute function public.outfits_enforce_photo_path();

-- ===========================================================================
-- 3. HIDDEN CATEGORIES & PER-GRANT EXCLUDED_CATEGORIES
-- ===========================================================================

alter table public.connect_wardrobe_grants
  add column if not exists excluded_categories text[] not null default '{}'::text[];

create or replace function public.can_access_wardrobe_item(
  p_item_id  uuid,
  p_owner_id uuid
)
returns boolean
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_caller      uuid := (select auth.uid());
  v_category    text;
  v_subcategory text;
  v_cat_norm    text;
  v_subcat_norm text;
begin
  if v_caller is null or p_item_id is null or p_owner_id is null then
    return false;
  end if;

  if p_owner_id = v_caller then
    return true;
  end if;

  if public.connect_is_blocked(v_caller, p_owner_id) then
    return false;
  end if;

  select wi.category, wi.subcategory
    into v_category, v_subcategory
  from public.wardrobe_items wi
  where wi.id = p_item_id
    and wi.user_id = p_owner_id;

  if not found then
    return false;
  end if;

  v_cat_norm := lower(btrim(coalesce(v_category, '')));
  v_subcat_norm := lower(btrim(coalesce(v_subcategory, '')));

  -- Hidden categories: Underwear, Intimates, and Swimwear are never visible
  -- through grants or attachments.
  if v_cat_norm in ('underwear', 'intimates', 'swimwear')
     or v_subcat_norm in ('underwear', 'intimates', 'swimwear') then
    return false;
  end if;

  -- 1. Active wardrobe grant (entire wardrobe or selected items), respecting excluded_categories
  if exists (
    select 1
    from public.connect_wardrobe_grants g
    where g.owner_id = p_owner_id
      and g.grantee_id = v_caller
      and g.revoked_at is null
      and g.can_view_items = true
      and not exists (
        select 1
        from unnest(g.excluded_categories) as ex
        where lower(btrim(ex)) <> ''
          and (
            lower(btrim(ex)) = v_cat_norm
            or (v_subcat_norm <> '' and lower(btrim(ex)) = v_subcat_norm)
          )
      )
      and (
        g.scope = 'wardrobe'
        or exists (
          select 1
          from public.connect_grant_items gi
          where gi.grant_id = g.id
            and gi.item_id = p_item_id
            and gi.owner_id = p_owner_id
        )
      )
  ) then
    return true;
  end if;

  -- 2. Direct item attachment in a conversation where caller is a member
  if exists (
    select 1
    from public.connect_message_attachments a
    join public.connect_messages m
      on m.id = a.message_id
     and m.deleted_at is null
    join public.connect_members cm
      on cm.conversation_id = a.conversation_id
     and cm.user_id = v_caller
    where a.owner_id = p_owner_id
      and a.kind = 'item'
      and a.item_id = p_item_id
      and a.revoked_at is null
  ) then
    return true;
  end if;

  -- 3. Item inside an outfit attached in a conversation where caller is a member
  if exists (
    select 1
    from public.connect_message_attachments a
    join public.connect_messages m
      on m.id = a.message_id
     and m.deleted_at is null
    join public.connect_members cm
      on cm.conversation_id = a.conversation_id
     and cm.user_id = v_caller
    join public.outfit_items oi
      on oi.outfit_id = a.outfit_id
     and oi.item_id = p_item_id
     and oi.user_id = p_owner_id
    where a.owner_id = p_owner_id
      and a.kind = 'outfit'
      and a.revoked_at is null
  ) then
    return true;
  end if;

  return false;
end;
$$;

revoke all on function public.can_access_wardrobe_item(uuid, uuid) from public;
grant execute on function public.can_access_wardrobe_item(uuid, uuid) to authenticated;

-- Harden can_access_storage_object to require name like owner_id||'/%' and no '..'
create or replace function public.can_access_storage_object(
  p_name text
)
returns boolean
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_caller uuid := (select auth.uid());
begin
  if v_caller is null
     or p_name is null
     or btrim(p_name) = ''
     or position('..' in p_name) > 0 then
    return false;
  end if;

  if exists (
    select 1
    from public.wardrobe_items wi
    where p_name like wi.user_id::text || '/%'
      and (
        wi.image_path = p_name
        or wi.thumbnail_path = p_name
        or wi.medium_path = p_name
      )
      and public.can_access_wardrobe_item(wi.id, wi.user_id)
  ) then
    return true;
  end if;

  if exists (
    select 1
    from public.outfits o
    where p_name like o.user_id::text || '/%'
      and o.photo_path = p_name
      and public.can_access_outfit(o.id, o.user_id)
  ) then
    return true;
  end if;

  return false;
end;
$$;

revoke all on function public.can_access_storage_object(text) from public;
grant execute on function public.can_access_storage_object(text) to authenticated;

-- ===========================================================================
-- 2. SHARED_WARDROBE_ITEMS VIEW & DROP DIRECT SHARED POLICY ON WARDROBE_ITEMS
-- ===========================================================================

drop policy if exists "wardrobe_items_select_shared" on public.wardrobe_items;

create or replace view public.shared_wardrobe_items
with (security_invoker = false)
as
select
  wi.id,
  wi.user_id,
  wi.name,
  wi.category,
  wi.subcategory,
  wi.primary_colour,
  wi.secondary_colours,
  wi.pattern,
  wi.material,
  wi.style,
  wi.image_path,
  wi.thumbnail_path,
  wi.medium_path
from public.wardrobe_items wi
where public.can_access_wardrobe_item(wi.id, wi.user_id);

revoke all on public.shared_wardrobe_items from public, anon;
grant select on public.shared_wardrobe_items to authenticated;

-- ===========================================================================
-- 4. ATTACHMENTS: MAX 6 PER MESSAGE & NONE IN PENDING CONVERSATIONS
-- ===========================================================================

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
  v_conv_status text;
  v_att_count   integer;
begin
  if v_caller is null then
    raise exception 'Not authenticated' using errcode = '42501';
  end if;

  if new.owner_id <> v_caller then
    raise exception 'Attachment owner must match authenticated user' using errcode = '42501';
  end if;

  -- Lock the parent message row to serialize attachment count checks per message
  select m.sender_id, m.conversation_id
    into v_msg_sender, v_msg_conv
  from public.connect_messages m
  where m.id = new.message_id
  for update;

  if v_msg_sender is null then
    raise exception 'Message not found' using errcode = '23503';
  end if;

  if v_msg_sender <> v_caller then
    raise exception 'Only the message sender can attach items' using errcode = '42501';
  end if;

  if v_msg_conv <> new.conversation_id then
    raise exception 'Attachment conversation_id must match message conversation_id'
      using errcode = '23514';
  end if;

  -- Reject attachments in pending conversations
  select c.status
    into v_conv_status
  from public.connect_conversations c
  where c.id = new.conversation_id;

  if v_conv_status is null then
    raise exception 'Conversation not found' using errcode = '23503';
  end if;

  if v_conv_status = 'pending' then
    raise exception 'Attachments are not allowed in pending conversations'
      using errcode = '42501';
  end if;

  -- Enforce maximum 6 attachments per message
  select count(*)::integer
    into v_att_count
  from public.connect_message_attachments a
  where a.message_id = new.message_id;

  if v_att_count >= 6 then
    raise exception 'A message can have at most 6 attachments'
      using errcode = '23514';
  end if;

  if new.kind = 'item' then
    if not exists (
      select 1
      from public.wardrobe_items wi
      where wi.id = new.item_id
        and wi.user_id = v_caller
    ) then
      raise exception 'You can only share clothing items that you own.'
        using errcode = '42501';
    end if;
  elsif new.kind = 'outfit' then
    if not exists (
      select 1
      from public.outfits o
      where o.id = new.outfit_id
        and o.user_id = v_caller
    ) then
      raise exception 'You can only share outfits that you own.'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.connect_before_attachment_insert() from public, anon, authenticated;

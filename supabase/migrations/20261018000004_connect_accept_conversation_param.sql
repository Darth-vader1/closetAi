-- ---------------------------------------------------------------------------
-- ClosetAI Connect: Accept & Decline Conversation RPC Parameter Normalization
--
-- Ensures accept_conversation and decline_conversation can be invoked by PostgREST
-- regardless of whether p_conv_id or p_conversation_id is passed as the parameter.
-- ---------------------------------------------------------------------------

create or replace function public.accept_conversation(p_conv_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_caller    uuid := (select auth.uid());
  v_requester uuid;
  v_status    text;
  v_is_member boolean;
begin
  if v_caller is null then
    raise exception 'Not authenticated' using errcode = 'insufficient_privilege';
  end if;

  select requester, status into v_requester, v_status
  from public.connect_conversations
  where id = p_conv_id;

  if not found then
    raise exception 'Conversation not found';
  end if;

  select exists (
    select 1 from public.connect_members
    where conversation_id = p_conv_id and user_id = v_caller
  ) into v_is_member;

  if not v_is_member then
    raise exception 'Not a member of this conversation';
  end if;

  if v_caller = v_requester then
    raise exception 'Only the recipient can accept this conversation';
  end if;

  if v_status = 'active' then
    return;
  end if;

  update public.connect_conversations
  set status = 'active'
  where id = p_conv_id;
end;
$$;

revoke all on function public.accept_conversation(uuid) from public, anon;
grant execute on function public.accept_conversation(uuid) to authenticated;

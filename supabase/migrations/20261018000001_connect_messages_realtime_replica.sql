-- ---------------------------------------------------------------------------
-- ClosetAI Connect: Realtime Replica Identity & Publication Hardening
--
-- Sets REPLICA IDENTITY FULL on connect_messages and connect_message_attachments
-- so Supabase Realtime can evaluate row-level filters (conversation_id=eq...)
-- and broadcast changes to subscribed participants reliably.
-- ---------------------------------------------------------------------------

alter table public.connect_messages replica identity full;
alter table public.connect_message_attachments replica identity full;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables 
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'connect_message_attachments'
    ) then
      execute 'alter publication supabase_realtime add table public.connect_message_attachments';
    end if;
  end if;
end
$$ language plpgsql;

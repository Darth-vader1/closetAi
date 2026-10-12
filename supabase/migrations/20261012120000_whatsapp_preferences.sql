-- Add WhatsApp notification fields to email_preferences
alter table public.email_preferences
  add column if not exists whatsapp_phone text,
  add column if not exists whatsapp_daily_enabled boolean not null default false;

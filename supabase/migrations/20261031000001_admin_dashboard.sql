-- ---------------------------------------------------------------------------
-- 20261031000001_admin_dashboard.sql
-- Role-based access control and administrative audit logging for ClosetAI
-- ---------------------------------------------------------------------------

-- 1. Add role column to profiles
alter table public.profiles
  add column if not exists role text not null default 'user' check (role in ('user', 'admin', 'superadmin'));

create index if not exists idx_profiles_role on public.profiles (role);

-- Set primary developer as superadmin if profile exists
update public.profiles
set role = 'superadmin'
where id in (
  select id from auth.users where email in ('gbolahanabiodun92@gmail.com', 'olufemi-abiodun.gbolahan@st.tau.edu.ng')
);

-- 2. Create admin audit log table
create table if not exists public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.profiles (id) on delete cascade,
  action text not null,
  target_user_id uuid references public.profiles (id) on delete set null,
  details jsonb default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_admin_audit_logs_created on public.admin_audit_logs (created_at desc);

-- RLS: Only admins can view audit logs
alter table public.admin_audit_logs enable row level security;

create policy "Admins can view audit logs"
  on public.admin_audit_logs for select
  using (
    exists (
      select 1 from public.profiles
      where id = auth.uid() and role in ('admin', 'superadmin')
    )
  );

create policy "Service role manages audit logs"
  on public.admin_audit_logs for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

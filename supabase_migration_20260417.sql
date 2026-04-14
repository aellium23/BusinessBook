-- ============================================================
-- BusinessBook FY26 — Migration 2026-04-17
--   • contacts table (people per client/account)
-- Run in: Supabase Dashboard > SQL Editor > New query
-- Idempotent — safe to re-run.
-- ============================================================

create table if not exists public.contacts (
  id           uuid primary key default gen_random_uuid(),
  bu           text not null check (bu in ('VGT','ECT')),
  client_name  text not null,
  full_name    text not null,
  role_type    text not null default 'other'
                 check (role_type in ('decision_maker','champion','influencer','user','blocker','other')),
  job_title    text,
  email        text,
  phone        text,
  notes        text,
  is_primary   boolean not null default false,
  country      text,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

comment on column public.contacts.role_type is
  'Stakeholder role in the decision-making unit: decision_maker | champion | influencer | user | blocker | other';

-- Fast lookup by client (case-insensitive)
create index if not exists contacts_bu_client_idx
  on public.contacts (bu, lower(client_name));

create index if not exists contacts_name_idx
  on public.contacts (lower(full_name));

-- Reuse existing set_updated_at() trigger helper
drop trigger if exists contacts_updated_at on public.contacts;
create trigger contacts_updated_at
  before update on public.contacts
  for each row execute procedure public.set_updated_at();

-- RLS: read by BU; admin reads all; write within your BU
alter table public.contacts enable row level security;

drop policy if exists "contacts read" on public.contacts;
create policy "contacts read" on public.contacts for select using (
  auth.uid() in (select id from public.profiles where role = 'admin')
  or auth.uid() in (select id from public.profiles where bu = contacts.bu)
);

drop policy if exists "contacts write" on public.contacts;
create policy "contacts write" on public.contacts for all using (
  auth.uid() in (select id from public.profiles where role = 'admin')
  or auth.uid() in (select id from public.profiles where bu = contacts.bu)
) with check (
  auth.uid() in (select id from public.profiles where role = 'admin')
  or auth.uid() in (select id from public.profiles where bu = contacts.bu)
);

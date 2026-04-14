-- ============================================================
-- BusinessBook FY26 — Migration 2026-04-18 (accounts)
--   • accounts table (with self-ref parent for hierarchy)
--   • deals.account_id (optional FK — keeps deals.client string)
-- Run in: Supabase Dashboard > SQL Editor > New query
-- Idempotent — safe to re-run.
-- ============================================================

create table if not exists public.accounts (
  id           uuid primary key default gen_random_uuid(),
  bu           text not null check (bu in ('VGT','ECT')),
  name         text not null,
  parent_id    uuid references public.accounts(id) on delete set null,
  country      text,
  region       text,
  notes        text,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz default now(),
  updated_at   timestamptz default now()
);

create index if not exists accounts_bu_name_idx on public.accounts (bu, lower(name));
create index if not exists accounts_parent_idx  on public.accounts (parent_id);

drop trigger if exists accounts_updated_at on public.accounts;
create trigger accounts_updated_at
  before update on public.accounts
  for each row execute procedure public.set_updated_at();

-- RLS: read within BU, write within BU (admins see/write all)
alter table public.accounts enable row level security;

drop policy if exists "accounts read" on public.accounts;
create policy "accounts read" on public.accounts for select using (
  auth.uid() in (select id from public.profiles where role = 'admin')
  or auth.uid() in (select id from public.profiles where bu = accounts.bu)
);

drop policy if exists "accounts write" on public.accounts;
create policy "accounts write" on public.accounts for all using (
  auth.uid() in (select id from public.profiles where role = 'admin')
  or auth.uid() in (select id from public.profiles where bu = accounts.bu)
) with check (
  auth.uid() in (select id from public.profiles where role = 'admin')
  or auth.uid() in (select id from public.profiles where bu = accounts.bu)
);

-- Link deals to accounts (optional — existing string `client` stays authoritative
-- for display until you migrate). Setting null on delete keeps deals safe.
alter table if exists public.deals
  add column if not exists account_id uuid references public.accounts(id) on delete set null;

create index if not exists deals_account_idx on public.deals (account_id);

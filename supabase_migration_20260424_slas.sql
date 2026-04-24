-- ============================================================
-- BusinessBook FY26 — Migration 2026-04-24 (SLA Management)
--   • slas table (separate from deals, own owner/status/lifecycle)
--   • Indexes, RLS, audit trigger
-- Run in: Supabase Dashboard > SQL Editor > New query
-- Idempotent — safe to re-run.
-- ============================================================

create table if not exists public.slas (
  id                uuid primary key default gen_random_uuid(),
  deal_id           uuid references public.deals(id) on delete set null,
  bu                text not null check (bu in ('VGT','ECT')),
  client            text not null,
  description       text,
  sla_type          text,
  status            text not null default 'pipeline'
                      check (status in ('pipeline','negotiation','waiting_po','active','invoiced','reduced','cancelled')),
  sla_owner         text,
  deal_owner        text,
  annual_value      numeric(14,2) default 0,
  currency          text default 'EUR',
  exchange_rate     numeric(10,4) default 1.0,
  warranty_months   int,
  warranty_end_date date,
  start_date        date,
  end_date          date,
  revenue_by_fy     jsonb default '{}'::jsonb,
  billing_month     text,
  billing_year      int,
  renewal_target_pct numeric(5,2),
  renewal_notes     text,
  previous_value    numeric(14,2),
  change_reason     text,
  change_date       date,
  account_id        uuid references public.accounts(id) on delete set null,
  country           text,
  region            text,
  product           text,
  created_by        uuid references auth.users(id) on delete set null,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);

create index if not exists slas_deal_idx      on public.slas (deal_id);
create index if not exists slas_bu_status_idx on public.slas (bu, status);
create index if not exists slas_owner_idx     on public.slas (lower(sla_owner));
create index if not exists slas_client_idx    on public.slas (bu, lower(client));

drop trigger if exists slas_updated_at on public.slas;
create trigger slas_updated_at
  before update on public.slas
  for each row execute procedure public.set_updated_at();

alter table public.slas enable row level security;

drop policy if exists "slas read" on public.slas;
create policy "slas read" on public.slas for select using (
  auth.uid() in (select id from public.profiles where role = 'admin')
  or auth.uid() in (select id from public.profiles where bu = slas.bu)
);

drop policy if exists "slas write" on public.slas;
create policy "slas write" on public.slas for all using (
  auth.uid() in (select id from public.profiles where role = 'admin')
  or auth.uid() in (select id from public.profiles where role = 'manager' and bu = slas.bu)
  or auth.uid() in (
    select p.id from public.profiles p
    where p.bu = slas.bu and (
      lower(p.full_name) = lower(slas.sla_owner)
      or lower(p.sales_owner_name) = lower(slas.sla_owner)
    )
  )
) with check (
  auth.uid() in (select id from public.profiles where role = 'admin')
  or auth.uid() in (select id from public.profiles where role = 'manager' and bu = slas.bu)
  or auth.uid() in (select id from public.profiles where bu = slas.bu)
);

drop trigger if exists audit_slas on public.slas;
create trigger audit_slas
  after insert or update or delete on public.slas
  for each row execute procedure public.audit_trigger();

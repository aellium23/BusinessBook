-- ============================================================
-- BusinessBook FY26 — Migration 2026-04-19 (distribution network)
--   • regional_hubs  (e.g. HCUS)
--   • distributors   (e.g. Ajoveco in Colombia, linked to HCUS)
--   • deals: distribution_path + structured FKs + price levels
-- Run in: Supabase Dashboard > SQL Editor > New query
-- Idempotent — safe to re-run.
-- ============================================================

-- ------------------------------------------------------------
-- regional_hubs
-- ------------------------------------------------------------
create table if not exists public.regional_hubs (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  region      text,
  notes       text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create unique index if not exists regional_hubs_name_idx
  on public.regional_hubs (lower(name));

drop trigger if exists regional_hubs_updated_at on public.regional_hubs;
create trigger regional_hubs_updated_at
  before update on public.regional_hubs
  for each row execute procedure public.set_updated_at();

alter table public.regional_hubs enable row level security;

drop policy if exists "hubs read" on public.regional_hubs;
create policy "hubs read" on public.regional_hubs for select
  using (auth.uid() is not null);

drop policy if exists "hubs admin write" on public.regional_hubs;
create policy "hubs admin write" on public.regional_hubs for all using (
  auth.uid() in (select id from public.profiles where role = 'admin')
) with check (
  auth.uid() in (select id from public.profiles where role = 'admin')
);

-- ------------------------------------------------------------
-- distributors
-- ------------------------------------------------------------
create table if not exists public.distributors (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  country     text,
  region      text,
  hub_id      uuid references public.regional_hubs(id) on delete set null,
  notes       text,
  created_at  timestamptz default now(),
  updated_at  timestamptz default now()
);

create index if not exists distributors_country_idx on public.distributors (lower(country));
create index if not exists distributors_hub_idx     on public.distributors (hub_id);
create unique index if not exists distributors_name_country_idx
  on public.distributors (lower(name), coalesce(lower(country),''));

drop trigger if exists distributors_updated_at on public.distributors;
create trigger distributors_updated_at
  before update on public.distributors
  for each row execute procedure public.set_updated_at();

alter table public.distributors enable row level security;

drop policy if exists "distributors read" on public.distributors;
create policy "distributors read" on public.distributors for select
  using (auth.uid() is not null);

drop policy if exists "distributors write" on public.distributors;
create policy "distributors write" on public.distributors for all using (
  auth.uid() in (select id from public.profiles where role in ('admin'))
  or auth.uid() in (select id from public.profiles where role = 'manager')
) with check (
  auth.uid() in (select id from public.profiles where role in ('admin'))
  or auth.uid() in (select id from public.profiles where role = 'manager')
);

-- ------------------------------------------------------------
-- deals: distribution_path + structured FKs + price levels
-- ------------------------------------------------------------
alter table if exists public.deals
  add column if not exists distribution_path  text,
  add column if not exists distributor_id     uuid references public.distributors(id)   on delete set null,
  add column if not exists hub_id             uuid references public.regional_hubs(id) on delete set null,
  add column if not exists vgt_cost           numeric(14,2),
  add column if not exists distributor_price  numeric(14,2),
  add column if not exists end_customer_price numeric(14,2);

-- Add constraint (separate so re-runs don't fail)
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'deals_distribution_path_check'
  ) then
    alter table public.deals
      add constraint deals_distribution_path_check
      check (distribution_path is null or distribution_path in ('direct','hub_mediated'));
  end if;
end $$;

comment on column public.deals.distribution_path is
  'direct = VGT → Distributor → Client; hub_mediated = VGT → Hub → Distributor → Client';
comment on column public.deals.vgt_cost is
  'What this deal costs VGT to produce (cost of goods). value_total - vgt_cost = VGT margin.';
comment on column public.deals.distributor_price is
  'hub_mediated: price the hub charges the distributor. direct: same as value_total (redundant).';
comment on column public.deals.end_customer_price is
  'What the distributor charges the end customer. Used to compute distributor margin.';

create index if not exists deals_distributor_idx on public.deals (distributor_id);
create index if not exists deals_hub_idx         on public.deals (hub_id);

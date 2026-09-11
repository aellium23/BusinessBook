-- The SAP month, by customer, so the two books can be compared.
--
-- SAP actuals already live in this database — in `budget`, cycle ACT, keyed on
-- business unit and P&L line. That is the right shape for a P&L and the wrong
-- one for the question being asked here, which is not "how much" but "on which
-- customers". A total that disagrees tells nobody what to do; three named rows
-- do.
--
-- So this is the same monthly import at the grain it is exported in: one row
-- per customer per month per company. 1715 is VGT, 1766 is ECT, and the two are
-- kept apart so Iberia can be read as either side or as the sum.
--
-- `customer_key` is the normalised name — accents, case, punctuation and the
-- legal form removed — and it is what the reconciliation matches on. Where two
-- systems name one hospital differently beyond that, an alias is recorded once
-- in `sap_client_aliases` and used for ever. Nothing is fuzzy-matched: a wrong
-- pairing hides one gap and invents another, and two wrongs are harder to find
-- than one.
--
-- Requires supabase_migration_20260910_distributor_guards.sql for the role
-- guards.
--
-- Safe to run more than once.

create table if not exists public.sap_sales (
  id            uuid primary key default gen_random_uuid(),
  bu            text not null check (bu in ('VGT', 'ECT')),
  fiscal_year   text not null default 'FY26',
  fy_month      text not null check (fy_month in
                  ('apr','may','jun','jul','aug','sep','oct','nov','dec','jan','feb','mar')),
  customer_name text not null,
  customer_key  text not null,
  net_sales     numeric(14,2) not null default 0,
  gross_margin  numeric(14,2) not null default 0,
  source        text default 'paste',
  imported_by   uuid references public.profiles(id) on delete set null,
  imported_at   timestamptz not null default now(),
  unique (bu, fiscal_year, fy_month, customer_key)
);

comment on table public.sap_sales is
  'Invoiced sales from SAP, per customer per month per business unit. The official book, imported by hand; the CRM deals are the other one, and the Verification page is where they are compared.';
comment on column public.sap_sales.customer_key is
  'Normalised name used for matching: lower case, no accents, no punctuation, legal form removed.';

create index if not exists sap_sales_period_idx on public.sap_sales(fiscal_year, fy_month, bu);
create index if not exists sap_sales_key_idx on public.sap_sales(customer_key);

-- One hospital, two names. Recorded by hand, once.
create table if not exists public.sap_client_aliases (
  sap_key    text primary key,
  crm_key    text not null,
  crm_name   text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.sap_client_aliases is
  'Maps a normalised SAP customer name onto a normalised CRM client name, for the pairs no amount of normalising will join.';

alter table public.sap_sales enable row level security;
alter table public.sap_client_aliases enable row level security;

-- Reading it is reading our revenue by customer: ours only.
drop policy if exists "sap_sales read" on public.sap_sales;
create policy "sap_sales read" on public.sap_sales
  for select using (public.sees_internal_economics());

-- Importing the official month is a P&L act, so it stays with the people who
-- answer for the P&L.
drop policy if exists "sap_sales write" on public.sap_sales;
create policy "sap_sales write" on public.sap_sales
  for all using (public.sees_governance()) with check (public.sees_governance());

drop policy if exists "sap_alias read" on public.sap_client_aliases;
create policy "sap_alias read" on public.sap_client_aliases
  for select using (public.sees_internal_economics());

-- An alias changes what a number is compared against, so it is written by the
-- same people who import the numbers.
drop policy if exists "sap_alias write" on public.sap_client_aliases;
create policy "sap_alias write" on public.sap_client_aliases
  for all using (public.sees_governance()) with check (public.sees_governance());

select bu, fy_month, count(*) as customers, round(sum(net_sales), 2) as net_sales
from public.sap_sales group by 1, 2 order by 1, 2;

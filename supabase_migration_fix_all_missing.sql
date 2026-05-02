-- ============================================================
-- BusinessBook — Fix All Missing Tables & Columns
-- Consolidated idempotent migration. Run ONCE in Supabase SQL Editor.
-- ============================================================

-- ┌──────────────────────────────────────────────┐
-- │ 1. products table (must exist before FKs)    │
-- └──────────────────────────────────────────────┘
create table if not exists public.products (
  id                uuid primary key default gen_random_uuid(),
  category          text not null,
  sku               text,
  name              text not null,
  description       text,
  license_fee       numeric(12,2) default 0,
  annual_fee        numeric(12,2) default 0,
  pricing_model     text default 'license_plus_annual'
                      check (pricing_model in ('license_plus_annual','subscription','pay_per_study','saas')),
  bu                text not null default 'VGT' check (bu in ('VGT','ECT')),
  active            boolean default true,
  distributor_visible boolean default true,
  sort_order        int default 0,
  created_at        timestamptz default now(),
  updated_at        timestamptz default now()
);
create unique index if not exists products_sku_unique on public.products (sku) where sku is not null;
alter table public.products enable row level security;

-- products: allowed_license_types, allowed_pricing_models
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='products' and column_name='allowed_license_types') then
    alter table public.products add column allowed_license_types jsonb default '["flat"]'::jsonb;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='products' and column_name='allowed_pricing_models') then
    alter table public.products add column allowed_pricing_models jsonb default '["license_plus_annual"]'::jsonb;
  end if;
end $$;

-- ┌──────────────────────────────────────────────┐
-- │ 2. forecast_snapshots                        │
-- └──────────────────────────────────────────────┘
create table if not exists public.forecast_snapshots (
  id          uuid primary key default gen_random_uuid(),
  cycle       text not null check (cycle in ('BUD','EST1','EST2')),
  bu          text not null check (bu in ('VGT','ECT')),
  pl_key      text not null check (pl_key in ('ns_int','ns_ext')),
  apr numeric(12,3) default 0, may numeric(12,3) default 0,
  jun numeric(12,3) default 0, jul numeric(12,3) default 0,
  aug numeric(12,3) default 0, sep numeric(12,3) default 0,
  oct numeric(12,3) default 0, nov numeric(12,3) default 0,
  dec numeric(12,3) default 0, jan numeric(12,3) default 0,
  feb numeric(12,3) default 0, mar numeric(12,3) default 0,
  is_locked   boolean default false,
  notes       text,
  created_by  uuid references auth.users(id),
  created_at  timestamptz default now()
);
alter table public.forecast_snapshots enable row level security;

-- ┌──────────────────────────────────────────────┐
-- │ 3. deals — missing columns                   │
-- └──────────────────────────────────────────────┘
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='deals' and column_name='business_model') then
    alter table public.deals add column business_model text check (business_model in ('capex','opex','saas','hybrid','pay_per_study'));
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='deals' and column_name='warranty_months') then
    alter table public.deals add column warranty_months int default 36;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='deals' and column_name='converted_to_sla') then
    alter table public.deals add column converted_to_sla boolean default false;
  end if;
end $$;

-- ┌──────────────────────────────────────────────┐
-- │ 4. deal_products                             │
-- └──────────────────────────────────────────────┘
create table if not exists public.deal_products (
  id            uuid primary key default gen_random_uuid(),
  deal_id       uuid not null references public.deals(id) on delete cascade,
  product_id    uuid references public.products(id) on delete set null,
  product_name  text not null,
  quantity      int default 1,
  unit_price    numeric(12,2) default 0,
  discount_pct  numeric(5,2) default 0,
  net_price     numeric(12,2) default 0,
  annual_fee    numeric(12,2) default 0,
  notes         text,
  created_at    timestamptz default now()
);
create index if not exists deal_products_deal_idx on public.deal_products (deal_id);
alter table public.deal_products enable row level security;

-- deal_products: license_type, volume, package_size, cost_price, margin_pct
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='deal_products' and column_name='license_type') then
    alter table public.deal_products add column license_type text default 'flat'
      check (license_type in ('per_equipment','per_volume','per_package','per_ccu','flat'));
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='deal_products' and column_name='volume') then
    alter table public.deal_products add column volume int;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='deal_products' and column_name='package_size') then
    alter table public.deal_products add column package_size int;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='deal_products' and column_name='cost_price') then
    alter table public.deal_products add column cost_price numeric(12,2) default 0;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='deal_products' and column_name='margin_pct') then
    alter table public.deal_products add column margin_pct numeric(5,2) default 0;
  end if;
end $$;

-- ┌──────────────────────────────────────────────┐
-- │ 5. product_components                        │
-- └──────────────────────────────────────────────┘
create table if not exists public.product_components (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null references public.products(id) on delete cascade,
  component_id  uuid not null references public.products(id) on delete cascade,
  quantity      int default 1,
  included      boolean default true,
  notes         text,
  created_at    timestamptz default now(),
  unique(product_id, component_id)
);
create index if not exists product_components_product_idx on public.product_components (product_id);
alter table public.product_components enable row level security;

-- ┌──────────────────────────────────────────────┐
-- │ 6. tender_products                           │
-- └──────────────────────────────────────────────┘
create table if not exists public.tender_products (
  id            uuid primary key default gen_random_uuid(),
  tender_id     uuid not null references public.tenders(id) on delete cascade,
  product_id    uuid references public.products(id) on delete set null,
  product_name  text not null,
  quantity      int default 1,
  unit_price    numeric(12,2) default 0,
  notes         text,
  created_at    timestamptz default now()
);
create index if not exists tender_products_tender_idx on public.tender_products (tender_id);
alter table public.tender_products enable row level security;

-- ┌──────────────────────────────────────────────┐
-- │ 7. slas table                                │
-- └──────────────────────────────────────────────┘
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
alter table public.slas enable row level security;

-- slas: contract_duration_years, renewal_date, invoice_date
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='slas' and column_name='contract_duration_years') then
    alter table public.slas add column contract_duration_years int default 1;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='slas' and column_name='renewal_date') then
    alter table public.slas add column renewal_date date;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='slas' and column_name='invoice_date') then
    alter table public.slas add column invoice_date date;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='slas' and column_name='billing_model') then
    alter table public.slas add column billing_model text default 'fixed' check (billing_model in ('fixed','pay_per_study_variable','pay_per_study_estimated'));
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='slas' and column_name='price_per_study') then
    alter table public.slas add column price_per_study numeric(10,2);
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='slas' and column_name='estimated_annual_studies') then
    alter table public.slas add column estimated_annual_studies int;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='slas' and column_name='billing_frequency') then
    alter table public.slas add column billing_frequency text default 'annual' check (billing_frequency in ('monthly','quarterly','semi_annual','annual'));
  end if;
end $$;

-- ┌──────────────────────────────────────────────┐
-- │ 8. sla_products                              │
-- └──────────────────────────────────────────────┘
create table if not exists public.sla_products (
  id                uuid primary key default gen_random_uuid(),
  sla_id            uuid not null references public.slas(id) on delete cascade,
  product_id        uuid references public.products(id) on delete set null,
  product_name      text,
  quantity          int default 1,
  contracted_volume int,
  unit_price        numeric(12,2),
  annual_value      numeric(12,2),
  notes             text,
  created_at        timestamptz default now()
);
create index if not exists sla_products_sla_idx on public.sla_products (sla_id);
alter table public.sla_products enable row level security;

-- ┌──────────────────────────────────────────────┐
-- │ 9. sla_usage                                 │
-- └──────────────────────────────────────────────┘
create table if not exists public.sla_usage (
  id                uuid primary key default gen_random_uuid(),
  sla_id            uuid not null references public.slas(id) on delete cascade,
  sla_product_id    uuid references public.sla_products(id) on delete set null,
  period_start      date not null,
  period_end        date not null,
  contracted_volume int,
  actual_volume     int default 0,
  overage           int generated always as (greatest(actual_volume - coalesce(contracted_volume, 0), 0)) stored,
  overage_value     numeric(12,2),
  notes             text,
  recorded_by       uuid references auth.users(id),
  created_at        timestamptz default now()
);
create index if not exists sla_usage_sla_idx on public.sla_usage (sla_id);
alter table public.sla_usage enable row level security;

-- ┌──────────────────────────────────────────────┐
-- │ 10. accounts — missing columns               │
-- └──────────────────────────────────────────────┘
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='accounts' and column_name='client_type') then
    alter table public.accounts add column client_type text default 'public' check (client_type in ('public','private'));
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='accounts' and column_name='distributor_id') then
    alter table public.accounts add column distributor_id uuid references public.distributors(id) on delete set null;
  end if;
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='accounts' and column_name='active') then
    alter table public.accounts add column active boolean default true;
  end if;
end $$;

-- ┌──────────────────────────────────────────────┐
-- │ 11. distributors.sales_type                  │
-- └──────────────────────────────────────────────┘
do $$ begin
  if not exists (select 1 from information_schema.columns where table_schema='public' and table_name='distributors' and column_name='sales_type') then
    alter table public.distributors add column sales_type text default 'external' check (sales_type in ('internal','external'));
  end if;
end $$;

-- ============================================================
-- Done. All tables and columns now exist.
-- ============================================================

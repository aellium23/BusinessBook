-- ============================================================
-- BusinessBook — Deal Products + Business Model
-- Phase 1: Multi-product deals with catalog pricing
-- Run in: Supabase Dashboard > SQL Editor
-- ============================================================

-- 1. Add business_model and warranty_months to deals
do $$ begin
  if not exists (select 1 from information_schema.columns where table_name='deals' and column_name='business_model') then
    alter table public.deals add column business_model text check (business_model in ('capex','opex','saas','hybrid','pay_per_study'));
  end if;
  if not exists (select 1 from information_schema.columns where table_name='deals' and column_name='warranty_months') then
    alter table public.deals add column warranty_months int default 36;
  end if;
end $$;

-- 2. Deal Products junction table
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

drop policy if exists "deal_products read" on public.deal_products;
create policy "deal_products read" on public.deal_products for select using (
  exists (select 1 from public.profiles where id = auth.uid() and active = true and role = 'admin')
  or exists (select 1 from public.profiles where id = auth.uid() and active = true and bu in (
    select bu from public.deals where id = deal_products.deal_id
  ))
);

drop policy if exists "deal_products write" on public.deal_products;
create policy "deal_products write" on public.deal_products for all using (
  exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','manager'))
  or exists (select 1 from public.profiles where id = auth.uid() and bu in (
    select bu from public.deals where id = deal_products.deal_id
  ))
) with check (
  exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','manager'))
  or exists (select 1 from public.profiles where id = auth.uid() and bu in (
    select bu from public.deals where id = deal_products.deal_id
  ))
);

drop trigger if exists audit_deal_products on public.deal_products;
create trigger audit_deal_products
  after insert or update or delete on public.deal_products
  for each row execute procedure public.audit_trigger();

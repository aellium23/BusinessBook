-- ============================================================
-- BusinessBook — Tender Products
-- Links products from catalog to tenders
-- Run in: Supabase Dashboard > SQL Editor
-- ============================================================

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

drop policy if exists "tender_products read" on public.tender_products;
create policy "tender_products read" on public.tender_products for select using (
  exists (select 1 from public.profiles where id = auth.uid() and active = true)
);

drop policy if exists "tender_products write" on public.tender_products;
create policy "tender_products write" on public.tender_products for all using (
  exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','manager','member'))
) with check (
  exists (select 1 from public.profiles where id = auth.uid() and role in ('admin','manager','member'))
);

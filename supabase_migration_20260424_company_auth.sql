-- BusinessBook — Company Product Authorizations
-- Per-distributor, per-product, per-country authorization
create table if not exists public.company_product_authorizations (
  id          uuid primary key default gen_random_uuid(),
  company_id  uuid not null references public.companies(id) on delete cascade,
  product_id  uuid not null references public.products(id) on delete cascade,
  country     text not null,
  active      boolean default true,
  created_at  timestamptz default now(),
  unique(company_id, product_id, country)
);

create index if not exists cpa_company_idx on public.company_product_authorizations (company_id);
create index if not exists cpa_product_idx on public.company_product_authorizations (product_id);

alter table public.company_product_authorizations enable row level security;

drop policy if exists "cpa read" on public.company_product_authorizations;
create policy "cpa read" on public.company_product_authorizations for select using (
  exists (select 1 from public.profiles where id = auth.uid() and active = true)
);

drop policy if exists "cpa write" on public.company_product_authorizations;
create policy "cpa write" on public.company_product_authorizations for all using (
  exists (select 1 from public.profiles where id = auth.uid() and active = true and role = 'admin')
) with check (
  exists (select 1 from public.profiles where id = auth.uid() and active = true and role = 'admin')
);

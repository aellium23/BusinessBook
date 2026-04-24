-- ============================================================
-- BusinessBook — Product Components (packages composition)
-- Links products as components of other products (packages)
-- Run in: Supabase Dashboard > SQL Editor
-- ============================================================

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
create index if not exists product_components_component_idx on public.product_components (component_id);

alter table public.product_components enable row level security;

drop policy if exists "product_components read" on public.product_components;
create policy "product_components read" on public.product_components for select using (
  exists (select 1 from public.profiles where id = auth.uid() and active = true)
);

drop policy if exists "product_components write" on public.product_components;
create policy "product_components write" on public.product_components for all using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
) with check (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
);

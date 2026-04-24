-- ============================================================
-- BusinessBook — Security fixes 2026-04-24
-- 1. Fix SLA write policy (symmetric USING/WITH CHECK)
-- 2. Add active=true check to all RLS read policies
-- Run in: Supabase Dashboard > SQL Editor
-- ============================================================

-- 1. Fix SLA write policy — make USING and WITH CHECK symmetric
drop policy if exists "slas write" on public.slas;
create policy "slas write" on public.slas for all using (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  or exists (select 1 from public.profiles where id = auth.uid() and role = 'manager' and bu = slas.bu)
  or exists (select 1 from public.profiles where id = auth.uid() and bu = slas.bu)
) with check (
  exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  or exists (select 1 from public.profiles where id = auth.uid() and role = 'manager' and bu = slas.bu)
  or exists (select 1 from public.profiles where id = auth.uid() and bu = slas.bu)
);

-- 2. Add active=true enforcement to key read policies
-- This ensures deactivated users cannot read data even with a valid JWT

drop policy if exists "deals read" on public.deals;
create policy "deals read" on public.deals for select using (
  exists (select 1 from public.profiles where id = auth.uid() and active = true and role = 'admin')
  or exists (select 1 from public.profiles where id = auth.uid() and active = true and bu = deals.bu)
);

drop policy if exists "slas read" on public.slas;
create policy "slas read" on public.slas for select using (
  exists (select 1 from public.profiles where id = auth.uid() and active = true and role = 'admin')
  or exists (select 1 from public.profiles where id = auth.uid() and active = true and bu = slas.bu)
);

drop policy if exists "products read" on public.products;
create policy "products read" on public.products for select using (
  exists (select 1 from public.profiles where id = auth.uid() and active = true)
);

drop policy if exists "sla_products read" on public.sla_products;
create policy "sla_products read" on public.sla_products for select using (
  exists (select 1 from public.profiles where id = auth.uid() and active = true and role = 'admin')
  or exists (select 1 from public.profiles where id = auth.uid() and active = true and bu in (select bu from public.slas where id = sla_products.sla_id))
);

drop policy if exists "sla_usage read" on public.sla_usage;
create policy "sla_usage read" on public.sla_usage for select using (
  exists (select 1 from public.profiles where id = auth.uid() and active = true and role = 'admin')
  or exists (select 1 from public.profiles where id = auth.uid() and active = true and bu in (select bu from public.slas where id = sla_usage.sla_id))
);

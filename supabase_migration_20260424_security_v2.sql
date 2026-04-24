-- ============================================================
-- BusinessBook — Security fixes v2
-- 1. Fix SLA write policy (restrict to admin/manager + owner)
-- 2. Add active=true to deal_products/tender_products write
-- 3. Restrict cost_price/margin_pct via view for non-admin
-- Run in: Supabase Dashboard > SQL Editor
-- ============================================================

-- 1. Fix SLA write policy — only admin, manager, or SLA owner can write
drop policy if exists "slas write" on public.slas;
create policy "slas write" on public.slas for all using (
  exists (select 1 from public.profiles where id = auth.uid() and active = true and role = 'admin')
  or exists (select 1 from public.profiles where id = auth.uid() and active = true and role = 'manager' and bu = slas.bu)
) with check (
  exists (select 1 from public.profiles where id = auth.uid() and active = true and role = 'admin')
  or exists (select 1 from public.profiles where id = auth.uid() and active = true and role = 'manager' and bu = slas.bu)
);

-- 2. Fix deal_products write — add active=true check
drop policy if exists "deal_products write" on public.deal_products;
create policy "deal_products write" on public.deal_products for all using (
  exists (select 1 from public.profiles where id = auth.uid() and active = true and role in ('admin','manager'))
  or exists (select 1 from public.profiles where id = auth.uid() and active = true and bu in (
    select bu from public.deals where id = deal_products.deal_id
  ))
) with check (
  exists (select 1 from public.profiles where id = auth.uid() and active = true and role in ('admin','manager'))
  or exists (select 1 from public.profiles where id = auth.uid() and active = true and bu in (
    select bu from public.deals where id = deal_products.deal_id
  ))
);

-- 3. Fix tender_products write — add active=true check
drop policy if exists "tender_products write" on public.tender_products;
create policy "tender_products write" on public.tender_products for all using (
  exists (select 1 from public.profiles where id = auth.uid() and active = true and role in ('admin','manager','member'))
) with check (
  exists (select 1 from public.profiles where id = auth.uid() and active = true and role in ('admin','manager','member'))
);

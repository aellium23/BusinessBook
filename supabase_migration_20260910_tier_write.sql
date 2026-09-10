-- Let an admin edit a price ladder from the application.
--
-- Until now `product_price_tiers` was written only by hand-run SQL, so every
-- correction needed someone with database access — which is why the CWM Dose
-- curve sat wrong for as long as it did. The editor writes it now, and that
-- needs delete and insert, because a ladder is replaced as a set rather than
-- patched row by row.
--
-- Reading stays open to any active profile: a rep has to see the bands to
-- understand a quote. Writing is admin and manager only — a price list is not
-- something a salesperson should be able to move.
--
-- Safe to run more than once.

alter table public.product_price_tiers enable row level security;

drop policy if exists "price_tiers read" on public.product_price_tiers;
create policy "price_tiers read" on public.product_price_tiers for select using (
  exists (select 1 from public.profiles where id = auth.uid() and active = true)
);

drop policy if exists "price_tiers write" on public.product_price_tiers;
create policy "price_tiers write" on public.product_price_tiers for all using (
  exists (select 1 from public.profiles
          where id = auth.uid() and active = true and role in ('admin','manager'))
) with check (
  exists (select 1 from public.profiles
          where id = auth.uid() and active = true and role in ('admin','manager'))
);

revoke all on public.product_price_tiers from anon;

-- The regions and the country map are read by every quote and written by nobody
-- through the app.
alter table public.pricing_regions enable row level security;
drop policy if exists "pricing_regions read" on public.pricing_regions;
create policy "pricing_regions read" on public.pricing_regions for select using (
  exists (select 1 from public.profiles where id = auth.uid() and active = true)
);
revoke all on public.pricing_regions from anon;

alter table public.pricing_region_countries enable row level security;
drop policy if exists "region_countries read" on public.pricing_region_countries;
create policy "region_countries read" on public.pricing_region_countries for select using (
  exists (select 1 from public.profiles where id = auth.uid() and active = true)
);
revoke all on public.pricing_region_countries from anon;

select c.relname as tabela, c.relrowsecurity as rls_ativo, count(p.polname) as politicas
from pg_class c
left join pg_policy p on p.polrelid = c.oid
where c.relname in ('product_price_tiers','pricing_regions','pricing_region_countries')
group by c.relname, c.relrowsecurity order by c.relname;

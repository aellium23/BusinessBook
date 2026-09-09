-- Synapse Mobility joins the catalogue as a family.
--
-- Its nine price-list SKUs had nowhere to attach: unlike Gleamer or Lunit,
-- where a similar-looking catalogue row exists but describes a different
-- product, Mobility was simply absent.
--
-- Safe to run more than once.

insert into public.products
  (category, sku, name, description, bu, supplier_code, active, sort_order)
select
  (select category from public.products where sku = 'SYN-3D'),
  'SYN-MOB',
  'Synapse Mobility',
  'Familia Synapse Mobility. Packs de 2/10/20 CCU, licenca Enterprise por 10k estudos e modelo OPEX (minimo 3 anos).',
  (select bu from public.products where sku = 'SYN-3D'),
  'HCUS', true, 0
where not exists (select 1 from public.products where sku = 'SYN-MOB');

update public.product_items i set product_id = p.id
from public.products p
where i.family_code = 'SYNAPSE-MOB' and p.sku = 'SYN-MOB';

-- The Mobility CCU licences are capacity packs — you buy a 10 CCU pack the way
-- you buy a 10 CCU Synapse 3D package — but their SKU names say "LIC PER
-- 10CCU" rather than "PKG", so the loader classified them as modules and the
-- concurrent-user calculator skipped them. Upgrades keep their own kind, and
-- the Enterprise and OPEX lines are volume-based rather than per-seat.
update public.product_items
set kind = 'package'
where family_code = 'SYNAPSE-MOB'
  and kind = 'module'
  and ccu is not null;

select kind, count(*), min(ccu) as ccu_min, max(ccu) as ccu_max
from public.product_items where family_code = 'SYNAPSE-MOB'
group by kind order by kind;

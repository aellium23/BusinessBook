-- CWM PRICING UPDATE — ROLLBACK.
-- Reverses every statement in pricing_update.sql, restoring the database to the
-- state inventoried on 10 September 2026.
--
-- This restores values the pricing brief calls WRONG. It exists so the change
-- is reversible, not because the old values are correct. If you run this, the
-- $0.20 anchor band and the $28,000 site cap come back.

begin;

delete from public.product_price_tiers t
using public.products p
where p.id = t.product_id and p.sku = 'CWM-DOSE'
  and t.sort_order = 9 and t.global_list_price = 0.4600;             -- expect 1

update public.product_price_tiers t set
  tier_label = 'Over 1,000,000', tier_from = 1000001, tier_to = null,
  global_list_price = 0.0900
from public.products p
where p.id = t.product_id and p.sku = 'CWM-DOSE' and t.sort_order = 8;

update public.product_price_tiers t set
  tier_label = '500,001 – 1,000,000', tier_from = 500001, tier_to = 1000000,
  global_list_price = 0.1200
from public.products p
where p.id = t.product_id and p.sku = 'CWM-DOSE' and t.sort_order = 7;

update public.product_price_tiers t set
  tier_label = '250,001 – 500,000', tier_from = 250001, tier_to = 500000,
  global_list_price = 0.1500
from public.products p
where p.id = t.product_id and p.sku = 'CWM-DOSE' and t.sort_order = 6;

update public.product_price_tiers t set
  tier_label = '125,001 – 250,000', tier_from = 125001, tier_to = 250000,
  global_list_price = 0.2000
from public.products p
where p.id = t.product_id and p.sku = 'CWM-DOSE' and t.sort_order = 5;

update public.product_price_tiers t set
  tier_label = '60,001 – 125,000', tier_from = 60001, tier_to = 125000,
  global_list_price = 0.2800
from public.products p
where p.id = t.product_id and p.sku = 'CWM-DOSE' and t.sort_order = 4;

update public.product_price_tiers t set
  tier_label = '30,001 – 60,000', tier_from = 30001, tier_to = 60000,
  global_list_price = 0.4000
from public.products p
where p.id = t.product_id and p.sku = 'CWM-DOSE' and t.sort_order = 3;

update public.product_price_tiers t set
  tier_label = '15,001 – 30,000', tier_from = 15001, tier_to = 30000,
  global_list_price = 0.6000
from public.products p
where p.id = t.product_id and p.sku = 'CWM-DOSE' and t.sort_order = 2;

update public.product_price_tiers t set
  tier_label = 'Up to 15,000 studies', tier_from = 0, tier_to = 15000,
  global_list_price = 0.8000
from public.products p
where p.id = t.product_id and p.sku = 'CWM-DOSE' and t.sort_order = 1;

update public.products set price_unit = 'study'          where sku = 'CWM-DOSE';
update public.products set site_cap_annual = 28000.00    where sku = 'CWM-DOSE';
update public.products set min_annual_commitment = 8000.00 where sku = 'CWM-DOSE';

select p.sku, p.price_unit, p.min_annual_commitment, p.site_cap_annual,
       t.sort_order, t.tier_label, t.global_list_price
from public.product_price_tiers t
join public.products p on p.id = t.product_id
where p.sku = 'CWM-DOSE' order by t.sort_order;

-- commit;   -- only after confirming the original state is restored

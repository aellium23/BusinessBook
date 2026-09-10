-- TIMED sells the CWM line, not four products of it.
--
-- Authorisations are per product AND per country, which is right — a partner
-- authorised in Chile is not authorised in Peru — but it means adding a product
-- by hand for every country they operate in, and the ones that were missing
-- (AI Reporting, VR, RIS, and the rest) simply did not appear on their quote.
--
-- This adds every CWM product for every country TIMED is already authorised in.
-- It adds nothing anywhere else: the countries come from the rows that exist, so
-- the partner's territory is defined by what somebody already decided, not by
-- this file.
--
-- Prices are left null on purpose. Null means "the regional price list", which
-- is the transfer price we actually want — R1, R2, R3 at the tier the volume
-- reaches. A number typed here would freeze one product at one price and stop
-- following the ladder, and that is a decision for a negotiation, not a
-- migration.
--
-- Safe to run more than once: the unique key is (company_id, product_id,
-- country), and a row that already exists is left exactly as it is, price
-- included.

insert into public.company_product_authorizations (company_id, product_id, country, price, active)
select c.id, p.id, t.country, null, true
from public.companies c
join public.products p
  on p.active = true
 and (p.sku ilike 'CWM%' or p.name ilike 'CWM %')
cross join lateral (
  select distinct a.country
  from public.company_product_authorizations a
  where a.company_id = c.id and a.country is not null
) t
where lower(c.name) like '%timed%'
on conflict (company_id, product_id, country) do nothing;

-- What TIMED can now quote, and where. A price of null reads as the regional
-- list; anything else was pinned by hand and stays pinned.
select c.name as company, a.country, p.sku, p.name, a.price, a.active
from public.company_product_authorizations a
join public.companies c on c.id = a.company_id
join public.products p on p.id = a.product_id
where lower(c.name) like '%timed%'
order by a.country, p.sku;

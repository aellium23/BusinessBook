-- CWM PRICING UPDATE — generated for review, NOT to be run unreviewed.
-- Authorised by: BUSINESS BOOK — PRICING UPDATE, 10 September 2026.
-- Every statement cites the section that authorises it.
--
-- Scope: UPDATE and INSERT only. No DROP, ALTER, TRUNCATE or schema change,
-- per section 0.2. Every statement carries a WHERE clause.
--
-- Run inside the transaction below, after taking a backup, and check the row
-- counts against PRICING_CHANGES_FOR_REVIEW.md BEFORE committing.

begin;

-- ── products ────────────────────────────────────────────────────────────────

-- §9: the minimum annual commitment on CWM-Dose is $9,500, not $8,000.
update public.products set min_annual_commitment = 9500.00
where sku = 'CWM-DOSE' and min_annual_commitment = 8000.00;          -- expect 1

-- §1: the per-hospital site cap is WITHDRAWN ENTIRELY. It is also the single
-- most damaging value in the database: at $28,000 it flattens every deal above
-- roughly 140,000 exams to the same price, understating an 8M-exam site by 131x.
update public.products set site_cap_annual = null
where sku = 'CWM-DOSE' and site_cap_annual = 28000.00;               -- expect 1

-- §1 and §8.20: the unit is the exam, never the study.
update public.products set price_unit = 'exam'
where sku = 'CWM-DOSE' and price_unit = 'study';                     -- expect 1

-- ── product_price_tiers — CWM-Dose, §2.2 ────────────────────────────────────
-- The whole curve is replaced. Rows are addressed by sort_order, which is
-- stable, and each carries its expected current price so a row that has already
-- been changed by someone else simply does not match.

update public.product_price_tiers t set
  tier_label = 'Up to 15,000 exams', tier_from = 0, tier_to = 15000,
  global_list_price = 1.3000
from public.products p
where p.id = t.product_id and p.sku = 'CWM-DOSE'
  and t.sort_order = 1 and t.global_list_price = 0.8000;             -- expect 1

update public.product_price_tiers t set
  tier_label = '15,001 – 30,000 exams', tier_from = 15001, tier_to = 30000,
  global_list_price = 1.1900
from public.products p
where p.id = t.product_id and p.sku = 'CWM-DOSE'
  and t.sort_order = 2 and t.global_list_price = 0.6000;             -- expect 1

update public.product_price_tiers t set
  tier_label = '30,001 – 60,000 exams', tier_from = 30001, tier_to = 60000,
  global_list_price = 1.0600
from public.products p
where p.id = t.product_id and p.sku = 'CWM-DOSE'
  and t.sort_order = 3 and t.global_list_price = 0.4000;             -- expect 1

-- §2.2 band boundary note: the fourth band ends at 100,000, not 125,000.
update public.product_price_tiers t set
  tier_label = '60,001 – 100,000 exams', tier_from = 60001, tier_to = 100000,
  global_list_price = 0.9200
from public.products p
where p.id = t.product_id and p.sku = 'CWM-DOSE'
  and t.sort_order = 4 and t.global_list_price = 0.2800;             -- expect 1

-- The anchor band. €0.530 in R2 is the €0.53 that was PRESENTED and engaged
-- with; the €0.38 close is 71.7% of it, inside the 30% cap (§2.1, §2.3).
update public.product_price_tiers t set
  tier_label = '100,001 – 250,000 exams', tier_from = 100001, tier_to = 250000,
  global_list_price = 0.7700
from public.products p
where p.id = t.product_id and p.sku = 'CWM-DOSE'
  and t.sort_order = 5 and t.global_list_price = 0.2000;             -- expect 1

update public.product_price_tiers t set
  tier_label = '250,001 – 500,000 exams', tier_from = 250001, tier_to = 500000,
  global_list_price = 0.7000
from public.products p
where p.id = t.product_id and p.sku = 'CWM-DOSE'
  and t.sort_order = 6 and t.global_list_price = 0.1500;             -- expect 1

update public.product_price_tiers t set
  tier_label = '500,001 – 1,000,000 exams', tier_from = 500001, tier_to = 1000000,
  global_list_price = 0.6200
from public.products p
where p.id = t.product_id and p.sku = 'CWM-DOSE'
  and t.sort_order = 7 and t.global_list_price = 0.1200;             -- expect 1

-- §1: no tier structure may end at "Over 1,000,000". This band becomes bounded
-- and a ninth is added below.
update public.product_price_tiers t set
  tier_label = '1,000,001 – 5,000,000 exams', tier_from = 1000001, tier_to = 5000000,
  global_list_price = 0.5500
from public.products p
where p.id = t.product_id and p.sku = 'CWM-DOSE'
  and t.sort_order = 8 and t.global_list_price = 0.0900;             -- expect 1

-- §2.2: the curve now ends at "Over 5,000,000". §7.4: everything above 500,000
-- exams a year is extrapolated from a single negotiation — provisional.
insert into public.product_price_tiers
  (product_id, tier_label, tier_from, tier_to, global_list_price, sort_order)
select p.id, 'Over 5,000,000 exams', 5000001, null, 0.4600, 9
from public.products p
where p.sku = 'CWM-DOSE'
  and not exists (
    select 1 from public.product_price_tiers x
    where x.product_id = p.id and x.sort_order = 9
  );                                                                  -- expect 1

-- ── VERIFY BEFORE COMMITTING ────────────────────────────────────────────────
-- Nine Dose bands, 1.30 down to 0.46, no site cap, minimum 9,500, unit 'exam'.
select p.sku, p.price_unit, p.min_annual_commitment, p.site_cap_annual,
       t.sort_order, t.tier_label, t.tier_from, t.tier_to, t.global_list_price
from public.product_price_tiers t
join public.products p on p.id = t.product_id
where p.sku = 'CWM-DOSE' order by t.sort_order;

-- If anything above is not exactly as PRICING_CHANGES_FOR_REVIEW.md predicts:
--   rollback;
-- Otherwise:
--   commit;

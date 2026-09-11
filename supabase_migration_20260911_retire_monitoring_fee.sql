-- BIZ-01: the PACS ACTIVE MONITORING FEE leaves the catalogue.
--
-- It carried an 80 % discount ceiling inherited from the pricing spreadsheet,
-- which was wrong — and the answer to "what is the right number" turned out to
-- be that the SKU should not be quotable at all.
--
-- DEACTIVATED, NOT DELETED, and the difference matters. A quote saved with this
-- SKU on it was a real quote at a real price. Deleting the row does not unsay
-- that; it makes the saved quote reference something that no longer exists, and
-- a price nobody can trace back to a part number is a price nobody can defend.
-- `product_items` already carries `active`, and every screen that reads the
-- catalogue filters on it (`src/hooks/useProductItems.js`), so this takes it out
-- of every picker without touching a single saved figure.
--
-- Safe to run more than once.

-- ── What this is about to touch ─────────────────────────────────────────────
-- Run this FIRST, on its own, and read it. If more rows come back than you
-- expect, stop: a `like` over a name is a blunt instrument and the catalogue is
-- not mine to guess at.

select id, family_code, supplier_sku, name, description,
       max_discount_pct, active
from public.product_items
where name ilike '%active monitoring%'
   or description ilike '%active monitoring%'
   or supplier_sku ilike '%active monitoring%'
order by name;

-- ── Take it out of the pickers ──────────────────────────────────────────────

update public.product_items
set active = false
where (name ilike '%active monitoring%'
    or description ilike '%active monitoring%'
    or supplier_sku ilike '%active monitoring%')
  and active is distinct from false;

-- ── And confirm ─────────────────────────────────────────────────────────────
-- Expect every matching row to read active = false. Nothing else moves: saved
-- quotes keep their SKU, their price and their cost.

select id, name, active, max_discount_pct
from public.product_items
where name ilike '%active monitoring%'
   or description ilike '%active monitoring%'
   or supplier_sku ilike '%active monitoring%'
order by name;

-- ── Where it is already quoted ──────────────────────────────────────────────
-- Not changed by this, and worth knowing about: these deals carry the SKU on a
-- saved quote. Deactivating does not reprice them.

select q.deal_id, d.client, d.stage
from public.deal_quote q
join public.deals d on d.id = q.deal_id
where q.state::text ilike '%active monitoring%'
order by d.client;

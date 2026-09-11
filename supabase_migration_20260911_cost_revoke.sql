-- Phase 2: the cost columns stop being readable, and the June assessment's
-- first item closes.
--
-- `deal_products` is readable by any authenticated account, columns and all —
-- 217 lines in the table, 217 of them carrying cost — so a partner with a
-- browser console reads what every line of their own deals costs us. The view
-- masks it; the table does not, and a mask the API goes around is not a
-- control.
--
-- Phase 1 gave cost somewhere else to live (`deal_products_cost`, guarded by a
-- profile check rather than by RLS) and taught the app to read it there. That
-- is deployed and the deal form's economic breakdown was checked against it, so
-- this can now take the columns away.
--
-- A Postgres detail that decides the shape of this file: a TABLE-level
-- `grant select` covers every column, present and future, and revoking one
-- column while that grant stands does nothing. So the table grant comes off and
-- a column-list grant goes back on. Anything added to this table later will be
-- unreadable until it is added to that list, which is the right default for a
-- table that holds our cost.
--
-- INSERT, UPDATE and DELETE are untouched: the quote still writes cost, it
-- simply cannot read it back through this table.
--
-- `deal_products_cost` is deliberately not security_invoker, so it runs as its
-- owner and keeps the privilege this revokes from everybody else. That is the
-- whole mechanism — and it means the profile check in its WHERE clause is the
-- security boundary.
--
-- Requires supabase_migration_20260911_cost_view.sql, deployed and verified.
--
-- Safe to run more than once.

-- ── the shared view loses the columns ───────────────────────────────────────

drop view if exists public.deal_products_v;

create view public.deal_products_v
with (security_invoker = true)
as
select
  dp.id,
  dp.deal_id,
  dp.product_id,
  dp.product_name,
  dp.license_type,
  dp.quantity,
  dp.volume,
  dp.package_size,
  dp.unit_price,
  dp.net_price,
  dp.discount_pct,
  dp.annual_fee,
  dp.notes,
  dp.created_at
from public.deal_products dp;

grant select on public.deal_products_v to authenticated;

comment on view public.deal_products_v is
  'Deal product lines, without cost. Rows follow the caller''s RLS. Cost and margin live in deal_products_cost, which admins and managers alone may read. Read this, never deal_products.';

-- ── and the base table stops handing them out ───────────────────────────────

revoke select on public.deal_products from authenticated;

grant select (
  id, deal_id, product_id, product_name, license_type, quantity, volume,
  package_size, unit_price, net_price, discount_pct, annual_fee, notes, created_at
) on public.deal_products to authenticated;

-- Signed in as anybody at all, this now fails rather than returning a number:
--   select cost_price from public.deal_products;
-- From the SQL editor it still works, because the editor is the superuser and
-- no grant applies to it. That is not a hole; it is the one account that owns
-- the database.
select count(*) as linhas,
       count(cost_price) as ainda_com_custo
from public.deal_products;

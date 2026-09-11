-- Phase 1 of closing the cost leak: somewhere for cost to live.
--
-- `deal_products` is directly readable by any authenticated account, columns
-- and all, so a partner with a browser console reads our cost on every line of
-- their own deals. 217 lines in the table, 217 of them carrying cost. The view
-- `deal_products_v` masks those columns; the table does not, and the view is a
-- convenience rather than a control.
--
-- The fix is to revoke the columns. It cannot be done in one step, and the
-- reason is worth writing down: `deal_products_v` is now `security_invoker`, so
-- it reads the base table AS THE CALLER. Revoking the column would break the
-- view for admins too — and the deal form computes its whole economic breakdown
-- from it.
--
-- So: two phases, and no window in which anything is broken.
--
--   PHASE 1 (this file). Create somewhere else for cost to come from, change
--   nothing else. Then deploy the code that reads it there. Cost is still on
--   `deal_products_v` throughout, so the old code and the new code both work.
--
--   PHASE 2 (later). Drop the cost columns from `deal_products_v` and revoke
--   `select (cost_price, margin_pct)` on the base table. From that moment a
--   partner's console returns nothing.
--
-- This view is deliberately NOT `security_invoker`. It has to be: after phase 2
-- the caller's own role no longer holds the column, so the view must run as its
-- owner to read it at all. That is the same pattern `products_cost` uses here,
-- and it means THE `where` CLAUSE BELOW IS THE SECURITY BOUNDARY — whoever
-- edits that role list is deciding who sees our margins.
--
-- Note what it does not do: rows are not filtered by the caller's RLS, because
-- a non-invoker view cannot be. Admins and managers see cost across every deal,
-- which is what the column mask already granted them. It is not a widening.
--
-- Safe to run more than once.

drop view if exists public.deal_products_cost;

create view public.deal_products_cost as
select
  dp.id,
  dp.deal_id,
  dp.product_id,
  dp.cost_price,
  dp.margin_pct
from public.deal_products dp
where exists (
  select 1 from public.profiles p
  where p.id = auth.uid()
    and p.active = true
    and p.role in ('admin', 'manager')
);

grant select on public.deal_products_cost to authenticated;

comment on view public.deal_products_cost is
  'What a deal line costs us. Admins and managers only — the WHERE clause is the boundary, not a filter. Join it to deal_products_v on id. Deliberately not security_invoker: after the base-table columns are revoked, only the owner can read them.';

-- Signed in as a partner this returns nothing at all. From the SQL editor it
-- also returns nothing, because auth.uid() is null there and the guard fails —
-- which is the guard working, not a fault.
select count(*) as linhas_visiveis from public.deal_products_cost;

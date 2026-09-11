-- SPEC-01: three answers to "who may see what a line costs us", and the view is
-- the one that disagrees.
--
--   src/lib/roles.js          seesCost()                 admin · manager · member
--   sees_internal_economics() the SQL half of the same   admin · manager · member
--   deal_products_cost        the view that decides      admin · manager
--
-- The view is mine, written on 11-09, and it reached for the governance pair
-- when the question it was answering was the internal one. The consequence is
-- not academic: one of our own reps prices a deal in the quick deal — picks the
-- SKUs, reads the cost, sets the margin — saves it, reopens it, and is told the
-- lines have no cost. They wrote the number and cannot read it back.
--
-- Since 11-09 it also contradicts a guard: `deal_products_cost_guard` lets a
-- member WRITE cost, because `sees_internal_economics()` says they may. Write
-- but not read is the wrong way round, and nobody designed it.
--
-- So the view asks the same question the rest of the system asks. This widens
-- reading to our own sales people and to nobody else — distributors, partners
-- and viewers are not in `sees_internal_economics()` and stay out.
--
-- The view is deliberately NOT security_invoker: it runs as its owner, which is
-- how it keeps the SELECT privilege that `cost_revoke` took from everybody
-- else. That makes the profile check in its WHERE clause the security boundary,
-- and it is the only thing standing between a partner and our cost. Read it
-- twice before changing it.
--
-- Safe to run more than once.

drop view if exists public.deal_products_cost;

create view public.deal_products_cost as
  select dp.id, dp.deal_id, dp.product_id, dp.cost_price, dp.margin_pct
  from public.deal_products dp
  where public.sees_internal_economics();

grant select on public.deal_products_cost to authenticated;

comment on view public.deal_products_cost is
  'Cost and margin per deal line, for the roles that sees_internal_economics() names: admin, manager and our own sales. Not security_invoker on purpose — it runs as its owner, and the WHERE clause is the control. Rows are not RLS-filtered here, so anything joined off this must be joined to deal_products_v.';

-- Note on rows: this view does not filter by deal. `src/lib/dealLines.js` reads
-- `deal_products_v` (which IS security_invoker, so RLS applies) and joins cost
-- onto the rows that came back from it. The row scoping lives there; this view
-- only answers the column question.

-- Verification: three roles, and the two who must never appear.
select role, count(*) as perfis
from public.profiles
where active = true
group by role
order by role;

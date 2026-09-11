-- `deal_products_v` hands every line of every deal to everybody.
--
-- The view was created to hide cost_price and margin_pct from anyone who is not
-- an admin or a manager, and at that job it works. But it was created without
-- `security_invoker`, so it runs as its OWNER: the row-level policies on
-- deal_products are evaluated as the owner rather than as the caller, and the
-- view is granted to `authenticated`.
--
-- The effect is not a column leak, it is a row leak. Any signed-in account —
-- a distributor, a partner, a viewer — can read every product line of every
-- deal in the book: what each customer of each competitor-on-this-platform was
-- quoted, line by line, with volumes and net prices. The masking of the two
-- cost columns is beside the point.
--
-- This is the same fault the September migration found in five other views and
-- fixed there; this one was missed because its purpose is column masking, and a
-- view about columns does not look like a view about rows.
--
-- `security_invoker = true` makes the policies apply to the caller, which is
-- what was always intended: rows by RLS, columns by the CASE below.
--
-- Requires PostgreSQL 15+ (Supabase is well past it).
--
-- Safe to run more than once.

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
  dp.created_at,
  -- Column masking, unchanged. It is now the second line of defence rather
  -- than the only one.
  case when exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin', 'manager')
  ) then dp.cost_price else null end as cost_price,
  case when exists (
    select 1 from public.profiles
    where id = auth.uid() and role in ('admin', 'manager')
  ) then dp.margin_pct else null end as margin_pct
from public.deal_products dp;

grant select on public.deal_products_v to authenticated;

comment on view public.deal_products_v is
  'Deal product lines. Rows follow the caller''s RLS (security_invoker); cost_price and margin_pct are null for anyone who is not an admin or a manager. Read this, not deal_products, wherever a non-admin may be the reader.';

-- Signed in as a partner this returns only their own deals'' lines, with cost
-- and margin null. From the SQL editor it returns everything, because the
-- editor runs as the superuser and no policy applies to it.
select deal_id, product_name, net_price, cost_price, margin_pct
from public.deal_products_v
order by created_at desc limit 20;

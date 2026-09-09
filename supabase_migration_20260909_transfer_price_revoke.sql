-- Take `products.transfer_price` away from the browser.
--
-- RLS filters rows, not columns, so a policy cannot hide one column of a table
-- everyone is allowed to read. Column privileges can — but only once the
-- table-level grant is gone: `REVOKE SELECT (transfer_price)` on its own is
-- silently ineffective while a table-wide GRANT SELECT still stands. That is
-- the trap this file exists to avoid, and it is why the revoke and the re-grant
-- have to happen together.
--
-- RUN THIS ONLY AFTER the matching application code is deployed. Supabase runs
-- every signed-in user as the same Postgres role, so this bites admins exactly
-- as hard as distributors: any `select('*')` against products starts failing
-- for everyone the moment it runs.
--
-- Safe to run more than once.

-- ── 1. Managers keep a way to see cost ──────────────────────────────────────
-- Deliberately NOT security_invoker: the view runs as its owner, which is how
-- it can still read a column the caller's role no longer holds. The guard is
-- the profile check in its own WHERE clause. Whoever edits this view is
-- deciding who sees our margins — the role list is the whole security boundary.
drop view if exists public.products_cost;
create view public.products_cost as
  select p.id, p.sku, p.name, p.supplier_code, p.transfer_price
  from public.products p
  where exists (
    select 1 from public.profiles
    where id = auth.uid() and active = true and role in ('admin','manager','member')
  );

revoke all on public.products_cost from anon;
grant select on public.products_cost to authenticated;

-- ── 2. Drop the column privilege ────────────────────────────────────────────
-- The column list is read from the catalogue rather than typed out, so a column
-- added to `products` later is never silently left unreadable.
do $$
declare cols text;
begin
  select string_agg(quote_ident(column_name), ', ' order by ordinal_position)
    into cols
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'products'
    and column_name <> 'transfer_price';

  execute 'revoke select on public.products from authenticated';
  execute format('grant select (%s) on public.products to authenticated', cols);
end $$;

-- Writing it stays allowed: the Products screen saves a cost in its own
-- statement and never reads the row back.
grant update (transfer_price) on public.products to authenticated;

revoke all on public.products from anon;

-- ── 3. Prove it ─────────────────────────────────────────────────────────────
-- transfer_price must NOT appear in this list.
select column_name
from information_schema.column_privileges
where grantee = 'authenticated'
  and table_schema = 'public' and table_name = 'products'
  and privilege_type = 'SELECT'
order by column_name;

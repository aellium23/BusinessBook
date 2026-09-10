-- A partner can read their own deals but could never write one.
--
-- The read policy was fixed months ago to scope distributors to their own
-- company. The write policy was not: it knows two kinds of person, an admin and
-- somebody whose profile BU matches the deal's BU. A distributor has no BU —
-- they have a company — so every insert they attempted failed with
--
--   new row violates row-level security policy for table "deals"
--
-- which is what a partner creating a deal in the quick deal hits, and would
-- have hit in the long form too. Nobody had tried.
--
-- Two narrow policies rather than widening the existing one, because "write"
-- there is FOR ALL and a partner has no business deleting a deal: the app has
-- never offered them the button, and a policy is the wrong place to discover
-- that it now does.
--
-- Scoped to their own company, and only where the deal names a company at all —
-- a null company_id on both sides must never match.
--
-- Safe to run more than once.

drop policy if exists "deals partner insert" on public.deals;
create policy "deals partner insert" on public.deals for insert with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.active = true
      and p.role in ('distributor', 'partner')
      and p.company_id is not null
      and p.company_id = deals.company_id
  )
);

-- They edit their own company's deals — a quote is worked on more than once,
-- and the alternative is a partner who can create a deal and never fix it.
drop policy if exists "deals partner update" on public.deals;
create policy "deals partner update" on public.deals for update using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.active = true
      and p.role in ('distributor', 'partner')
      and p.company_id is not null
      and p.company_id = deals.company_id
  )
) with check (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.active = true
      and p.role in ('distributor', 'partner')
      and p.company_id is not null
      and p.company_id = deals.company_id
  )
);

-- The same gap, one table down: their deal's product lines.
drop policy if exists "deal_products partner write" on public.deal_products;
create policy "deal_products partner write" on public.deal_products for all using (
  exists (
    select 1 from public.deals d
    join public.profiles p on p.id = auth.uid()
    where d.id = deal_products.deal_id
      and p.active = true
      and p.role in ('distributor', 'partner')
      and p.company_id is not null
      and p.company_id = d.company_id
  )
) with check (
  exists (
    select 1 from public.deals d
    join public.profiles p on p.id = auth.uid()
    where d.id = deal_products.deal_id
      and p.active = true
      and p.role in ('distributor', 'partner')
      and p.company_id is not null
      and p.company_id = d.company_id
  )
);

-- Signed in as the partner, this must return their company and nothing else.
select id, client, company_id, bu, stage
from public.deals order by created_at desc limit 10;

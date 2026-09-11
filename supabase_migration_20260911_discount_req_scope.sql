-- A partner could read every discount request in the house.
--
-- The read policy on `deal_discount_requests` is "any active profile", which
-- was defensible when only our own people had one. It is not now: a partner
-- reads the justification, the percentage and the money at risk on every other
-- partner's deals and on all of ours.
--
-- Found while putting the answer to a discount request inside the quote, where
-- the person who asked for it actually works — which made a partner read that
-- table for the first time.
--
-- Three ways to be entitled to a request: it is ours to answer, you asked for
-- it, or it belongs to a deal of your own company.
--
-- Requires supabase_migration_20260910_distributor_guards.sql.
--
-- Safe to run more than once.

drop policy if exists "discount_req read" on public.deal_discount_requests;
create policy "discount_req read" on public.deal_discount_requests for select using (
  public.sees_internal_economics()
  or requested_by = auth.uid()
  or exists (
    select 1 from public.deals d
    join public.profiles p on p.id = auth.uid()
    where d.id = deal_discount_requests.deal_id
      and p.active = true
      and p.company_id is not null
      and p.company_id = d.company_id
  )
);

-- Writing was the same "any active profile". A request is raised by whoever is
-- quoting, and answered through respond_discount_request, which does its own
-- authorisation — so the table itself only ever needs an insert, and only of a
-- row you are the requester of.
drop policy if exists "discount_req write" on public.deal_discount_requests;

drop policy if exists "discount_req insert own" on public.deal_discount_requests;
create policy "discount_req insert own" on public.deal_discount_requests for insert with check (
  requested_by = auth.uid()
  and exists (select 1 from public.profiles where id = auth.uid() and active = true)
);

-- Our own people still correct a request they raised — a typo in a
-- justification, a supplier case number — and the external flow on a supplier
-- request is already covered by its own policy from the routing migration.
drop policy if exists "discount_req update own" on public.deal_discount_requests;
create policy "discount_req update own" on public.deal_discount_requests for update using (
  public.sees_internal_economics() and requested_by = auth.uid()
) with check (
  public.sees_internal_economics() and requested_by = auth.uid()
);

-- Signed in as a partner, this returns their own requests and nothing else.
select id, deal_id, status, requested_pct, approved_pct, requested_by
from public.deal_discount_requests order by created_at desc limit 20;

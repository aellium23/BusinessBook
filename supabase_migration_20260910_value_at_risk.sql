-- What each pending discount is worth.
--
-- The quote already knows: a 20% discount asked of HCUS on a five-year PACS is
-- a precise number of euros of margin that we do not yet have. Storing it means
-- the deal card can say so without re-deriving a whole quote from its lines,
-- and the pipeline can be asked how much of its margin is waiting on somebody
-- else's answer.
--
-- Safe to run more than once.

alter table public.deal_discount_requests
  add column if not exists value_at_risk numeric(14,2);

comment on column public.deal_discount_requests.value_at_risk is
  'Euros of gross margin that depend on this request being granted. Null once decided.';

drop view if exists public.discount_worklist;
create view public.discount_worklist as
  select r.id, r.deal_id, r.product_id, r.route, r.status, r.channel,
         r.supplier_code, r.scope, r.requested_pct, r.approved_pct,
         r.external_ref, r.justification, r.requested_by, r.requested_at,
         r.value_at_risk, r.created_at, r.brand,
         d.client, d.bu, d.country, d.value_total,
         p.name as product_name, p.sku as product_sku,
         greatest(0, extract(day from now() - r.created_at)::int) as days_waiting
  from public.deal_discount_requests r
  join public.deals d on d.id = r.deal_id
  left join public.products p on p.id = r.product_id
  where r.status in ('pending','counter','to_request','requested');

revoke all on public.discount_worklist from anon;
grant select on public.discount_worklist to authenticated;

-- Per deal, what is still open. Read by the deal list to badge a card.
drop view if exists public.deal_open_discounts;
create view public.deal_open_discounts as
  select deal_id,
         count(*) as open_requests,
         count(*) filter (where route = 'external' and status = 'to_request') as unfiled,
         coalesce(sum(value_at_risk), 0)::numeric(14,2) as value_at_risk,
         max(greatest(0, extract(day from now() - created_at)::int)) as oldest_days
  from public.deal_discount_requests
  where status in ('pending','counter','to_request','requested')
  group by deal_id;

revoke all on public.deal_open_discounts from anon;
grant select on public.deal_open_discounts to authenticated;

select * from public.deal_open_discounts order by value_at_risk desc limit 20;

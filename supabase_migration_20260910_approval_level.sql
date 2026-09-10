-- Which level of authority a discount needs.
--
-- On a product we make there is no meaningful direct cost to price against —
-- R&D, support, the datacentre and the rest of SG&A exist whether or not one
-- more deal closes, and charging a share of them to a quote line would make
-- gross margin stop meaning gross margin and would double-count against the
-- Budget's own SG&A line. So the control is the price: how far below the
-- published regional list a deal has fallen decides who signs for it.
--
--   0-10%   nobody signs
--   10-20%  Country Manager
--   20-30%  P&L owner
--   over 30 named programme only — not a bigger discount, a different thing
--
-- Safe to run more than once.

alter table public.deal_discount_requests
  add column if not exists approval_level text;

do $$
begin
  if not exists (select 1 from pg_constraint
                 where conname = 'ddr_approval_level_check') then
    alter table public.deal_discount_requests
      add constraint ddr_approval_level_check
      check (approval_level is null or approval_level in
             ('none','country_manager','pnl_owner','named_programme'));
  end if;
end $$;

comment on column public.deal_discount_requests.approval_level is
  'Authority the discount needs, from its distance below the regional list price';

create index if not exists ddr_approval_level_idx
  on public.deal_discount_requests(approval_level)
  where approval_level is not null;

drop view if exists public.discount_worklist;
create view public.discount_worklist as
  select r.id, r.deal_id, r.product_id, r.route, r.status, r.channel,
         r.supplier_code, r.scope, r.requested_pct, r.approved_pct,
         r.approval_level, r.external_ref, r.justification, r.requested_by,
         r.requested_at, r.value_at_risk, r.created_at, r.brand,
         d.client, d.bu, d.country, d.value_total,
         p.name as product_name, p.sku as product_sku,
         greatest(0, extract(day from now() - r.created_at)::int) as days_waiting
  from public.deal_discount_requests r
  join public.deals d on d.id = r.deal_id
  left join public.products p on p.id = r.product_id
  where r.status in ('pending','counter','to_request','requested');

revoke all on public.discount_worklist from anon;
grant select on public.discount_worklist to authenticated;

select approval_level, count(*) from public.deal_discount_requests
group by approval_level order by approval_level nulls first;

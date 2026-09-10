-- Discount requests learn where they have to go.
--
-- `deal_discount_requests` already carries the internal case: a discount on a
-- product we make, routed by brand to whoever approves that brand. What it
-- could not express is the other half of the same sentence — a discount on a
-- product we BUY, which is not an approval at all. Nobody here grants it; a rep
-- has to go and ask HCUS for it in their Salesforce, or Medsky for it by email,
-- and the thing that has to be tracked is whether they ever did.
--
-- One table, because it is one question ("who is giving us this discount, and
-- did they?") and because a deal's discount history should read in one place.
--
-- Safe to run more than once.

alter table public.deal_discount_requests
  add column if not exists route text not null default 'internal',
  add column if not exists supplier_code text,
  add column if not exists product_id uuid references public.products(id) on delete set null,
  add column if not exists scope text,
  add column if not exists channel text,
  add column if not exists external_ref text,
  add column if not exists requested_at timestamptz;

comment on column public.deal_discount_requests.route is
  'internal = we approve it and it costs us margin; external = we ask a supplier for it and it improves our cost';
comment on column public.deal_discount_requests.external_ref is
  'The Salesforce case, or whatever the supplier calls their reference';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'deal_discount_requests_route_check') then
    alter table public.deal_discount_requests
      add constraint deal_discount_requests_route_check check (route in ('internal','external'));
  end if;
end $$;

-- The status set has to cover a life the old one had no words for: raised but
-- not yet filed with the supplier, and filed but not yet answered.
do $$
declare c text;
begin
  select conname into c from pg_constraint
  where conrelid = 'public.deal_discount_requests'::regclass
    and contype = 'c' and pg_get_constraintdef(oid) ilike '%status%'
  limit 1;
  if c is not null then
    execute format('alter table public.deal_discount_requests drop constraint %I', c);
  end if;
  alter table public.deal_discount_requests
    add constraint deal_discount_requests_status_check
    check (status in ('pending','approved','rejected','counter','to_request','requested'));
end $$;

create index if not exists ddr_route_status_idx
  on public.deal_discount_requests(route, status);

-- A rep owns their own supplier requests: they raise them, they file them, they
-- record the answer. That is not an approval and must not need one — otherwise
-- the queue silts up waiting for a manager who has nothing to decide.
drop policy if exists "discount_req external update" on public.deal_discount_requests;
create policy "discount_req external update" on public.deal_discount_requests
  for update using (
    route = 'external' and (
      requested_by = auth.uid()
      or exists (select 1 from public.profiles
                 where id = auth.uid() and active = true and role in ('admin','manager'))
    )
  ) with check (
    route = 'external' and (
      requested_by = auth.uid()
      or exists (select 1 from public.profiles
                 where id = auth.uid() and active = true and role in ('admin','manager'))
    )
  );

drop policy if exists "discount_req insert" on public.deal_discount_requests;
create policy "discount_req insert" on public.deal_discount_requests
  for insert with check (
    requested_by = auth.uid()
    and exists (select 1 from public.profiles where id = auth.uid() and active = true)
  );

-- The worklist: everything still waiting on somebody, with how long it has been.
drop view if exists public.discount_worklist;
create view public.discount_worklist as
  select r.id, r.deal_id, r.product_id, r.route, r.status, r.channel,
         r.supplier_code, r.scope, r.requested_pct, r.approved_pct,
         r.external_ref, r.justification, r.requested_by, r.requested_at,
         r.created_at, r.brand,
         d.client, d.bu, d.country, d.value_total,
         p.name as product_name, p.sku as product_sku,
         greatest(0, extract(day from now() - r.created_at)::int) as days_waiting
  from public.deal_discount_requests r
  join public.deals d on d.id = r.deal_id
  left join public.products p on p.id = r.product_id
  where r.status in ('pending','counter','to_request','requested');

revoke all on public.discount_worklist from anon;
grant select on public.discount_worklist to authenticated;

select route, status, count(*) from public.deal_discount_requests group by 1, 2 order by 1, 2;

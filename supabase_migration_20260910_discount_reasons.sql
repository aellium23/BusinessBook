-- Every discount names its proof.
--
-- Until now a discount was stored as a percentage, and a percentage cannot be
-- re-tested. Three of the rules in the CWM discount architecture are impossible
-- against a bare number:
--
--   * no discount carries into renewal automatically — each is re-tested, and
--     the renewal quote starts from the regional list, not from last year's net
--   * the lighthouse discount is clawed back if the reference is not delivered
--     within twelve months
--   * the bundle discount dies with the bundle: drop a product at renewal and
--     three-product 15% becomes two-product 10%
--
-- All three need to know WHY, so the why is stored with the deal.
--
-- The reasons and what each is worth:
--
--   displacement   up to 15%   documented incumbent contract or written quote
--   bundle         10/15/20%   two / three / the four-product Suite
--   term5             8%       the signed term in the order form
--   prepay            5%       one year in advance, never multi-year
--   tender           10%       tender reference and three or more bidders
--   lighthouse       10%       reference clause, max two per country per year
--
-- Total still capped at 30% of regional list; past that it is a named
-- programme with its own transfer price, not a discount.
--
-- Safe to run more than once.

create table if not exists public.deal_discount_reasons (
  id           uuid primary key default gen_random_uuid(),
  deal_id      uuid not null references public.deals(id) on delete cascade,
  reason       text not null,
  pct          numeric(5,2) not null default 0,
  evidence     text,
  bidder_count int,
  -- The lighthouse clawback needs a date to count twelve months from, and the
  -- renewal re-test needs to know the discount was never re-tested.
  expires_at   timestamptz,
  cleared_at   timestamptz,
  created_by   uuid references public.profiles(id) on delete set null,
  created_at   timestamptz not null default now()
);

comment on table public.deal_discount_reasons is
  'Why a deal was discounted, with the evidence attached. One row per reason.';
comment on column public.deal_discount_reasons.evidence is
  'What was attached: the incumbent contract, the tender reference, the order-form clause. Null is only valid for bundle, which proves itself from the order form.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'ddreasons_reason_check') then
    alter table public.deal_discount_reasons
      add constraint ddreasons_reason_check
      check (reason in ('displacement','bundle','term5','prepay','tender','lighthouse'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'ddreasons_pct_check') then
    alter table public.deal_discount_reasons
      add constraint ddreasons_pct_check check (pct >= 0 and pct <= 30);
  end if;
  -- A tender discount with two bidders is not a paperwork problem, it is a
  -- false statement. The database refuses it as flatly as the screen does.
  if not exists (select 1 from pg_constraint where conname = 'ddreasons_tender_check') then
    alter table public.deal_discount_reasons
      add constraint ddreasons_tender_check
      check (reason <> 'tender' or coalesce(bidder_count, 0) >= 3);
  end if;
  -- Everything except the bundle has to carry something.
  if not exists (select 1 from pg_constraint where conname = 'ddreasons_evidence_check') then
    alter table public.deal_discount_reasons
      add constraint ddreasons_evidence_check
      check (reason = 'bundle' or length(coalesce(evidence, '')) > 0);
  end if;
end $$;

create index if not exists ddreasons_deal_idx on public.deal_discount_reasons(deal_id);
create index if not exists ddreasons_reason_idx on public.deal_discount_reasons(reason);

alter table public.deal_discount_reasons enable row level security;

-- Reading a deal's discount reasons is reading the deal: the same people who
-- can see the deal can see why it was priced the way it was.
drop policy if exists "ddreasons select" on public.deal_discount_reasons;
create policy "ddreasons select" on public.deal_discount_reasons
  for select using (
    exists (select 1 from public.deals d where d.id = deal_id)
  );

drop policy if exists "ddreasons insert" on public.deal_discount_reasons;
create policy "ddreasons insert" on public.deal_discount_reasons
  for insert with check (
    exists (select 1 from public.profiles where id = auth.uid() and active = true)
  );

-- Evidence is amended by whoever attached it, or by a manager reviewing it.
-- Nobody else edits somebody else's justification after the fact.
drop policy if exists "ddreasons update" on public.deal_discount_reasons;
create policy "ddreasons update" on public.deal_discount_reasons
  for update using (
    created_by = auth.uid()
    or exists (select 1 from public.profiles
               where id = auth.uid() and active = true and role in ('admin','manager'))
  ) with check (
    created_by = auth.uid()
    or exists (select 1 from public.profiles
               where id = auth.uid() and active = true and role in ('admin','manager'))
  );

drop policy if exists "ddreasons delete" on public.deal_discount_reasons;
create policy "ddreasons delete" on public.deal_discount_reasons
  for delete using (
    created_by = auth.uid()
    or exists (select 1 from public.profiles
               where id = auth.uid() and active = true and role in ('admin','manager'))
  );

-- The lighthouse discount has twelve months to become a reference. This is what
-- the reminder reads: still open, past its date, and worth this much.
drop view if exists public.discount_reason_clawbacks;
create view public.discount_reason_clawbacks as
  select r.id, r.deal_id, r.reason, r.pct, r.evidence, r.created_at,
         coalesce(r.expires_at, r.created_at + interval '12 months') as due_at,
         greatest(0, extract(day from now() - coalesce(r.expires_at, r.created_at + interval '12 months'))::int) as days_overdue,
         d.client, d.bu, d.country, d.value_total,
         round(d.value_total * r.pct / 100.0, 2) as value_at_risk
  from public.deal_discount_reasons r
  join public.deals d on d.id = r.deal_id
  where r.reason = 'lighthouse'
    and r.cleared_at is null
    and now() >= coalesce(r.expires_at, r.created_at + interval '12 months');

revoke all on public.discount_reason_clawbacks from anon;
grant select on public.discount_reason_clawbacks to authenticated;

-- What the discount architecture asks to be reported: how much price was given
-- away, by reason, per country, per quarter. A book that averages materially
-- below the 90% target is not negotiating hard, it is spending a price list
-- that costs the person spending it nothing.
drop view if exists public.discount_reason_summary;
create view public.discount_reason_summary as
  select d.bu, d.country, r.reason,
         date_trunc('quarter', r.created_at) as quarter,
         count(*) as deals,
         round(avg(r.pct), 1) as avg_pct,
         round(sum(d.value_total * r.pct / 100.0), 2) as value_given
  from public.deal_discount_reasons r
  join public.deals d on d.id = r.deal_id
  group by 1, 2, 3, 4;

revoke all on public.discount_reason_summary from anon;
grant select on public.discount_reason_summary to authenticated;

select reason, count(*) from public.deal_discount_reasons group by 1 order by 1;

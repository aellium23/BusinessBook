-- The partner's margin is protected, and the deal records what that cost.
--
-- The transfer price used to be a fixed share of the regional list, so an
-- authorised discount moved the customer's price and left the transfer where it
-- was. The partner paid for every concession we approved, and the model broke
-- at exactly the discount levels we had defined as legitimate:
--
--   no discount   transfer 60, customer pays 100  partner margin 40.0%
--   at the cap    transfer 60, customer pays  70  partner margin 14.3%
--
-- The rule now:
--
--   transfer = MIN[ list × (1 − channel discount), net × (1 − protected margin) ]
--
--   target 35% inside the 30% cap · floor 20% above it · never below 15%
--
-- capped by the partner's own role rate (Referral 15%, Renewal 25%, Reseller
-- 28%, Full VAR 40%), and overridden by a named programme's own transfer
-- (VR Displacement: net 60% of list, transfer 42%; Lighthouse: 65% / 45%).
--
-- These columns store the answer rather than deriving it later, because the
-- inputs move: the regional list is repriced, the partner's role changes, the
-- programme ends. A deal has to keep the economics it was written under.
--
-- value_total is deliberately NOT changed. On a partner deal our revenue is the
-- transfer, not the customer price — but changing what a deal is worth to the
-- pipeline re-runs the forecast, and that is a decision, not a migration.
-- `cwm_given_up` makes the delta visible; the quote prints it as its own line.
--
-- Safe to run more than once.

alter table public.deals
  add column if not exists partner_role       text,
  add column if not exists partner_programme  text,
  add column if not exists partner_transfer   numeric(14,2),
  add column if not exists partner_margin_pct numeric(5,2),
  add column if not exists cwm_given_up       numeric(14,2);

comment on column public.deals.partner_role is
  'Channel role at the time of quoting: full_var 40%, reseller 28%, renewal 25%, referral 15%. Null or direct = no partner.';
comment on column public.deals.partner_transfer is
  'What the partner pays us. On a partner deal this is OUR revenue; value_total remains what the customer pays.';
comment on column public.deals.cwm_given_up is
  'Revenue we gave up to protect the partner margin: transfer at list minus the transfer actually quoted.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'deals_partner_role_check') then
    alter table public.deals
      add constraint deals_partner_role_check
      check (partner_role is null
             or partner_role in ('direct','full_var','reseller','renewal','referral'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'deals_partner_programme_check') then
    alter table public.deals
      add constraint deals_partner_programme_check
      check (partner_programme is null
             or partner_programme in ('vr_displacement','lighthouse'));
  end if;
  -- Never below fifteen points. A stored margin under the floor means the rule
  -- was bypassed somewhere, and the database should not hold it quietly.
  if not exists (select 1 from pg_constraint where conname = 'deals_partner_margin_check') then
    alter table public.deals
      add constraint deals_partner_margin_check
      check (partner_margin_pct is null or partner_margin_pct >= 15);
  end if;
end $$;

create index if not exists deals_partner_role_idx on public.deals(partner_role)
  where partner_role is not null and partner_role <> 'direct';

-- What protecting the margin costs, per partner role, per country, per quarter.
-- The figure that has to be watched: a book averaging materially below the 90%
-- target is not negotiating hard, it is spending a price list that costs the
-- person spending it nothing.
drop view if exists public.partner_margin_summary;
create view public.partner_margin_summary as
  select d.bu, d.country, d.partner_role, d.partner_programme,
         date_trunc('quarter', d.created_at) as quarter,
         count(*) as deals,
         round(sum(d.value_total), 2)      as customer_value,
         round(sum(d.partner_transfer), 2) as our_revenue,
         round(sum(d.cwm_given_up), 2)     as given_up,
         round(avg(d.partner_margin_pct), 1) as avg_partner_margin_pct
  from public.deals d
  where d.partner_role is not null and d.partner_role <> 'direct'
  group by 1, 2, 3, 4, 5;

revoke all on public.partner_margin_summary from anon;
grant select on public.partner_margin_summary to authenticated;

select partner_role, count(*) from public.deals
where partner_role is not null group by 1 order by 1;

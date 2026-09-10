-- What a distributor must not see, closed at the database.
--
-- Two holes, both mine, found auditing the distributor profile (TIMED) against
-- the rule in CLAUDE.md: distributors are company_id-scoped and never see cost
-- or margin.
--
-- ── 1. Five views bypassed RLS entirely ────────────────────────────────────
--
-- A view created without `security_invoker` runs as its OWNER. Every policy on
-- the tables underneath it is evaluated as the owner, not as the caller — so
-- row-level security does not apply, and `grant select ... to authenticated`
-- hands the whole table to everybody who can log in.
--
-- That is used deliberately elsewhere in this schema (products_cost reads a
-- column the caller's role no longer holds), but there it carries a profile
-- check in its own WHERE clause. These five had no check at all:
--
--   discount_worklist          every open discount, with its justification
--   deal_open_discounts        margin at risk, per deal, across all companies
--   discount_reason_clawbacks  client names and the value owed
--   discount_reason_summary    price given away per country per quarter
--   partner_margin_summary     our transfer prices and what we gave up
--
-- A distributor could read all five with one request. The last one tells a
-- partner exactly what we make on them.
--
-- Each is recreated with the same guard products_cost uses. The role list in
-- the WHERE clause is the security boundary — whoever edits it is deciding who
-- sees our margins.
--
-- ── 2. Channel economics sat in columns of `deals` ─────────────────────────
--
-- partner_transfer, partner_margin_pct and cwm_given_up went onto `deals` in
-- the partner-margin migration. RLS filters rows, not columns, and the deal
-- list reads `select('*')` — so a distributor reading their own deals, which
-- they are entitled to do, got our transfer price and the revenue we gave up
-- along with them.
--
-- Column privileges would need every caller to name its columns, and `deals`
-- has too many for that to stay correct. So the figures move to a table of
-- their own, where RLS does apply and one policy settles it.
--
-- Safe to run more than once.

-- ── The guard, written once ────────────────────────────────────────────────
create or replace function public.sees_internal_economics()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and active = true and role in ('admin','manager','member')
  );
$$;

comment on function public.sees_internal_economics is
  'True for the roles allowed to see cost, margin and channel economics. Distributors, partners and viewers are not among them.';

create or replace function public.sees_governance()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and active = true and role in ('admin','manager')
  );
$$;

revoke all on function public.sees_internal_economics() from anon;
revoke all on function public.sees_governance() from anon;
grant execute on function public.sees_internal_economics() to authenticated;
grant execute on function public.sees_governance() to authenticated;

-- ── 1. The five views, guarded ─────────────────────────────────────────────

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
  where r.status in ('pending','counter','to_request','requested')
    and public.sees_internal_economics();

revoke all on public.discount_worklist from anon;
grant select on public.discount_worklist to authenticated;

drop view if exists public.deal_open_discounts;
create view public.deal_open_discounts as
  select r.deal_id,
         d.bu, d.stage, d.client, d.rec_month, d.rec_year,
         count(*) as open_requests,
         count(*) filter (where r.route = 'external' and r.status = 'to_request') as unfiled,
         coalesce(sum(r.value_at_risk), 0)::numeric(14,2) as value_at_risk,
         max(greatest(0, extract(day from now() - r.created_at)::int)) as oldest_days
  from public.deal_discount_requests r
  join public.deals d on d.id = r.deal_id
  where r.status in ('pending','counter','to_request','requested')
    and public.sees_internal_economics()
  group by r.deal_id, d.bu, d.stage, d.client, d.rec_month, d.rec_year;

revoke all on public.deal_open_discounts from anon;
grant select on public.deal_open_discounts to authenticated;

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
    and now() >= coalesce(r.expires_at, r.created_at + interval '12 months')
    and public.sees_internal_economics();

revoke all on public.discount_reason_clawbacks from anon;
grant select on public.discount_reason_clawbacks to authenticated;

-- The two aggregates are governance, not operations: they answer "how much
-- price is this book giving away", which is a P&L owner's question.
drop view if exists public.discount_reason_summary;
create view public.discount_reason_summary as
  select d.bu, d.country, r.reason,
         date_trunc('quarter', r.created_at) as quarter,
         count(*) as deals,
         round(avg(r.pct), 1) as avg_pct,
         round(sum(d.value_total * r.pct / 100.0), 2) as value_given
  from public.deal_discount_reasons r
  join public.deals d on d.id = r.deal_id
  where public.sees_governance()
  group by 1, 2, 3, 4;

revoke all on public.discount_reason_summary from anon;
grant select on public.discount_reason_summary to authenticated;

-- ── 2. Channel economics move off `deals` ──────────────────────────────────

create table if not exists public.deal_channel (
  deal_id            uuid primary key references public.deals(id) on delete cascade,
  partner_role       text,
  partner_programme  text,
  partner_transfer   numeric(14,2),
  partner_margin_pct numeric(5,2),
  cwm_given_up       numeric(14,2),
  end_customer_price numeric(14,2),
  created_by         uuid references public.profiles(id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on table public.deal_channel is
  'What the partner pays us and what protecting their margin cost. Kept out of `deals` because RLS filters rows, not columns, and the deal list reads every column of a deal the distributor is entitled to see.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'deal_channel_role_check') then
    alter table public.deal_channel
      add constraint deal_channel_role_check
      check (partner_role is null
             or partner_role in ('direct','full_var','reseller','renewal','referral'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'deal_channel_programme_check') then
    alter table public.deal_channel
      add constraint deal_channel_programme_check
      check (partner_programme is null
             or partner_programme in ('vr_displacement','lighthouse'));
  end if;
  -- Never below fifteen points. A stored margin under the floor means the rule
  -- was bypassed somewhere, and the database should not hold it quietly.
  if not exists (select 1 from pg_constraint where conname = 'deal_channel_margin_check') then
    alter table public.deal_channel
      add constraint deal_channel_margin_check
      check (partner_margin_pct is null or partner_margin_pct >= 15);
  end if;
end $$;

-- Anything already written by the deployed build comes across.
insert into public.deal_channel (deal_id, partner_role, partner_programme,
                                 partner_transfer, partner_margin_pct, cwm_given_up)
select d.id, d.partner_role, d.partner_programme,
       d.partner_transfer, d.partner_margin_pct, d.cwm_given_up
from public.deals d
where d.partner_role is not null and d.partner_role <> 'direct'
on conflict (deal_id) do nothing;

alter table public.deal_channel enable row level security;

drop policy if exists "deal_channel read" on public.deal_channel;
create policy "deal_channel read" on public.deal_channel
  for select using (public.sees_internal_economics());

drop policy if exists "deal_channel write" on public.deal_channel;
create policy "deal_channel write" on public.deal_channel
  for all using (public.sees_internal_economics())
  with check (public.sees_internal_economics());

-- The summary follows the figures to their new home.
drop view if exists public.partner_margin_summary;
create view public.partner_margin_summary as
  select d.bu, d.country, c.partner_role, c.partner_programme,
         date_trunc('quarter', c.created_at) as quarter,
         count(*) as deals,
         round(sum(d.value_total), 2)     as customer_value,
         round(sum(c.partner_transfer), 2) as our_revenue,
         round(sum(c.cwm_given_up), 2)     as given_up,
         round(avg(c.partner_margin_pct), 1) as avg_partner_margin_pct
  from public.deal_channel c
  join public.deals d on d.id = c.deal_id
  where c.partner_role is not null and c.partner_role <> 'direct'
    and public.sees_governance()
  group by 1, 2, 3, 4, 5;

revoke all on public.partner_margin_summary from anon;
grant select on public.partner_margin_summary to authenticated;

-- The columns on `deals` are now duplicates of a guarded table, and a duplicate
-- of a secret is a leak. Dropped only once the copy is safely across.
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema = 'public' and table_name = 'deals'
               and column_name = 'partner_transfer')
     and not exists (
       select 1 from public.deals d
       where d.partner_role is not null and d.partner_role <> 'direct'
         and not exists (select 1 from public.deal_channel c where c.deal_id = d.id)
     )
  then
    alter table public.deals
      drop column if exists partner_role,
      drop column if exists partner_programme,
      drop column if exists partner_transfer,
      drop column if exists partner_margin_pct,
      drop column if exists cwm_given_up;
  end if;
end $$;

-- ── 3. Discount evidence is internal too ───────────────────────────────────
-- The old policy said "if you can see the deal", which for a distributor means
-- their own — and the evidence on a discount is our reasoning, not theirs.
drop policy if exists "ddreasons select" on public.deal_discount_reasons;
create policy "ddreasons select" on public.deal_discount_reasons
  for select using (public.sees_internal_economics());

-- ── 4. A partner's authorised catalogue is their own ───────────────────────
-- The old policy was "any active profile", so one distributor could read every
-- other distributor's product list AND the prices agreed with them. With the
-- quick deal now reading this table to build a partner's catalogue, that is
-- both a competitor leak and a bigger surface than before.
--
-- Our own people still see all of it: an account manager sets these rows.
drop policy if exists "cpa read" on public.company_product_authorizations;
create policy "cpa read" on public.company_product_authorizations for select using (
  public.sees_internal_economics()
  or company_id = (select company_id from public.profiles where id = auth.uid())
);

-- ── Prove it ───────────────────────────────────────────────────────────────
-- Run as a distributor, every one of these must come back empty. Run as
-- yourself, they come back as before.
select 'discount_worklist' as view, count(*) from public.discount_worklist
union all select 'deal_open_discounts', count(*) from public.deal_open_discounts
union all select 'clawbacks', count(*) from public.discount_reason_clawbacks
union all select 'reason_summary', count(*) from public.discount_reason_summary
union all select 'partner_summary', count(*) from public.partner_margin_summary;

-- And this one, run as a distributor, must return only their own company.
select company_id, count(*) from public.company_product_authorizations group by 1;

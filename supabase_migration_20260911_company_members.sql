-- One person, several distributors.
--
-- The CEO of TIMED Chile is also an officer of TIMED Peru. Today that needs two
-- accounts, two passwords and two sets of notifications, and nobody ever sees
-- the two together. The alternative considered was a group — TIMED LATAM, on
-- the model of Iberia — and it was rejected on purpose: a group is all or
-- nothing. It cannot say "these two of the three", and it cannot say anything
-- at all about a manager who looks after two distributors that are not related
-- to each other, which happens.
--
-- So membership is a list. A profile belongs to as many companies as it belongs
-- to, named one at a time, and `profiles.company_id` stays as the home company
-- — the one a new deal is filed under by default.
--
-- Everything then goes through one function. Eight policies across six tables
-- currently spell out "your company is this company" in slightly different
-- words; after this they all ask `acts_for(...)` instead. That is the point as
-- much as the feature is: the rule exists once, so the next change to it is one
-- change and not eight.
--
-- Requires supabase_migration_20260910_distributor_guards.sql,
--          supabase_migration_20260910_partner_accounts.sql,
--          supabase_migration_20260910_partner_writes_deals.sql.
--
-- Safe to run more than once.

create table if not exists public.company_members (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (profile_id, company_id)
);

comment on table public.company_members is
  'Which companies a person may act for. A partner belongs to at least their home company (profiles.company_id) and possibly others; membership, not hierarchy, is what every company-scoped policy reads.';

create index if not exists company_members_company_idx
  on public.company_members (company_id);

-- Everyone who has a company today keeps it, as a membership.
insert into public.company_members (profile_id, company_id)
select p.id, p.company_id
from public.profiles p
where p.company_id is not null
on conflict do nothing;

-- ── the one question every policy asks ──────────────────────────────────────

drop function if exists public.acts_for(uuid);

/**
 * May the caller act for this company?
 *
 * SECURITY DEFINER so that a policy on one table can ask about membership
 * without needing a read policy on company_members — and STABLE so Postgres
 * calls it once per statement rather than once per row.
 *
 * A null company is never a match. That is not pedantry: `p.company_id =
 * deals.company_id` with both sides null was a real way for an unscoped profile
 * to match an unscoped deal, and this function exists partly to make that
 * mistake impossible to repeat.
 */
create or replace function public.acts_for(p_company uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select p_company is not null and exists (
    select 1
    from public.company_members m
    join public.profiles p on p.id = m.profile_id
    where m.profile_id = auth.uid()
      and m.company_id = p_company
      and p.active = true
  );
$$;

revoke all on function public.acts_for(uuid) from anon;
grant execute on function public.acts_for(uuid) to authenticated;

-- Reading your own memberships is how the app knows which companies to offer in
-- the switcher. Nobody reads anybody else's.
alter table public.company_members enable row level security;

drop policy if exists "company_members read own" on public.company_members;
create policy "company_members read own" on public.company_members for select using (
  profile_id = auth.uid() or public.sees_governance()
);

-- Who may act for whom is an administrative act, like granting a page.
drop policy if exists "company_members write" on public.company_members;
create policy "company_members write" on public.company_members for all
  using (public.sees_governance()) with check (public.sees_governance());

-- ── every company-scoped policy, rewritten to ask it ────────────────────────

-- deals: read
drop policy if exists "deals read" on public.deals;
create policy "deals read" on public.deals for select using (
  exists (select 1 from public.profiles
          where id = auth.uid() and active = true and role = 'admin')
  or exists (select 1 from public.profiles
             where id = auth.uid() and active = true
               and role in ('manager', 'member') and bu = deals.bu)
  or public.acts_for(deals.company_id)
  or exists (select 1 from public.profiles
             where id = auth.uid() and active = true
               and role in ('viewer', 'partner')
               and company_id is null and bu = deals.bu)
);

-- deals: partner insert and update
drop policy if exists "deals partner insert" on public.deals;
create policy "deals partner insert" on public.deals for insert
  with check (public.acts_for(deals.company_id));

drop policy if exists "deals partner update" on public.deals;
create policy "deals partner update" on public.deals for update
  using (public.acts_for(deals.company_id))
  with check (public.acts_for(deals.company_id));

-- deal_products: read and partner write, both through the parent deal
drop policy if exists "deal_products read" on public.deal_products;
create policy "deal_products read" on public.deal_products for select using (
  exists (select 1 from public.profiles
          where id = auth.uid() and active = true and role = 'admin')
  or exists (select 1 from public.profiles
             where id = auth.uid() and active = true and role = 'manager'
               and bu in (select bu from public.deals where id = deal_products.deal_id))
  or exists (select 1 from public.deals d
             where d.id = deal_products.deal_id and public.acts_for(d.company_id))
  or exists (select 1 from public.profiles p
             where p.id = auth.uid() and p.active = true and p.company_id is null
               and p.bu in (select bu from public.deals where id = deal_products.deal_id))
);

drop policy if exists "deal_products partner write" on public.deal_products;
create policy "deal_products partner write" on public.deal_products for all
  using (exists (select 1 from public.deals d
                 where d.id = deal_products.deal_id and public.acts_for(d.company_id)))
  with check (exists (select 1 from public.deals d
                      where d.id = deal_products.deal_id and public.acts_for(d.company_id)));

-- accounts
drop policy if exists "accounts partner read" on public.accounts;
create policy "accounts partner read" on public.accounts for select
  using (public.acts_for(accounts.company_id));

drop policy if exists "accounts partner insert" on public.accounts;
create policy "accounts partner insert" on public.accounts for insert
  with check (public.acts_for(accounts.company_id));

drop policy if exists "accounts partner update" on public.accounts;
create policy "accounts partner update" on public.accounts for update
  using (public.acts_for(accounts.company_id))
  with check (public.acts_for(accounts.company_id));

-- the authorised catalogue
drop policy if exists "cpa read" on public.company_product_authorizations;
create policy "cpa read" on public.company_product_authorizations for select using (
  public.sees_internal_economics()
  or public.acts_for(company_product_authorizations.company_id)
);

-- discount requests
drop policy if exists "discount_req read" on public.deal_discount_requests;
create policy "discount_req read" on public.deal_discount_requests for select using (
  public.sees_internal_economics()
  or requested_by = auth.uid()
  or exists (select 1 from public.deals d
             where d.id = deal_discount_requests.deal_id and public.acts_for(d.company_id))
);

-- targets
drop policy if exists "quotas read" on public.quotas;
create policy "quotas read" on public.quotas for select using (
  public.sees_internal_economics() or public.acts_for(quotas.company_id)
);

-- Who can act for whom, after the backfill. One row per person per company;
-- somebody who works for two distributors gets two.
select p.full_name, p.role, c.name as company
from public.company_members m
join public.profiles p on p.id = m.profile_id
join public.companies c on c.id = m.company_id
order by p.full_name, c.name;

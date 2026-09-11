-- Every sales target in the house is readable by everyone with a password.
--
-- Found while chasing an empty target on the distributor dashboard: the read
-- policy on `quotas` is "any active profile". That means a distributor can read
-- every one of our reps' individual numbers, and every other partner's target
-- as well — what we expect TIMED Chile to sell is visible to TIMED's
-- competitors on the platform, and to anybody else we ever give an account to.
--
-- Same shape as the others found this week: a policy written when every account
-- was ours, left alone when partners got accounts.
--
-- A target is now readable by our own people, and by the company it belongs to.
-- Writing is unchanged: admins only.
--
-- Requires supabase_migration_20260910_distributor_guards.sql.
--
-- Safe to run more than once.

drop policy if exists "quotas read" on public.quotas;
create policy "quotas read" on public.quotas for select using (
  public.sees_internal_economics()
  or exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.active = true
      and p.company_id is not null
      and p.company_id = quotas.company_id
  )
);

-- Signed in as a partner this returns their own company's target and nothing
-- else. Run from the SQL editor it returns everything, because the editor runs
-- as the superuser and is not subject to these policies at all.
select company_id, bu, sales_owner, fiscal_year, target_eur
from public.quotas order by fiscal_year desc, bu, sales_owner;

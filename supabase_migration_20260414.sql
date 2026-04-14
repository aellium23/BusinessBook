-- ============================================================
-- BusinessBook FY26 — Migration 2026-04-14
-- Run in: Supabase Dashboard > SQL Editor > New query
-- Idempotent — safe to re-run.
-- ============================================================

-- 1. Add product-level sub-targets to quotas (JSONB: { "Product": amount })
alter table if exists public.quotas
  add column if not exists sub_targets jsonb default '{}'::jsonb;

comment on column public.quotas.sub_targets is
  'Breakdown of target_eur per product family, e.g. {"CWM Dose": 1000000, "AI Reporting": 500000}';

-- 2. Tighten RLS on deals: viewers should only see their own BU
--    (previously any viewer could read every deal in both BUs)
do $$ begin
  if exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='deals' and policyname='viewer read all'
  ) then
    drop policy "viewer read all" on public.deals;
  end if;
end $$;

drop policy if exists "viewer read own bu" on public.deals;
create policy "viewer read own bu" on public.deals for select using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and p.role = 'viewer'
      and (
        p.bu is null -- viewers without a BU assigned fall back to no access
          and false
        or p.bu = deals.bu
      )
  )
);

-- 3. Tighten RLS on budget: only admins + users of the same BU may read
drop policy if exists "all read budget" on public.budget;
drop policy if exists "bu read budget" on public.budget;
create policy "bu read budget" on public.budget for select using (
  exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (p.role = 'admin' or p.bu = budget.bu)
  )
);

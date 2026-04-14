-- ============================================================
-- BusinessBook FY26 — Migration 2026-04-16
--   • forecast_category on deals (Commit / BestCase / Upside / Omit)
-- Run in: Supabase Dashboard > SQL Editor > New query
-- Idempotent — safe to re-run.
-- ============================================================

-- 1. Add the column with a permissive check constraint
alter table if exists public.deals
  add column if not exists forecast_category text;

-- 2. Add check constraint only if it doesn't already exist
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'deals_forecast_category_check'
  ) then
    alter table public.deals
      add constraint deals_forecast_category_check
      check (forecast_category is null or forecast_category in
        ('commit','best_case','upside','omit'));
  end if;
end $$;

comment on column public.deals.forecast_category is
  'Sales-owner forecast call for this deal: commit | best_case | upside | omit. '
  'NULL means "derive from stage" on the client side.';

-- 3. Backfill: derive a sensible default from the current stage so the
--    Commit/BestCase/Upside totals aren't empty right after the migration.
--    Only touches rows that are still NULL — this is idempotent.
update public.deals set forecast_category = case stage
  when 'BackLog'          then 'commit'
  when 'Invoiced'         then 'commit'
  when 'Offer Presented'  then 'best_case'
  when 'Pipeline'         then 'upside'
  when 'Lead'             then 'omit'
  when 'Lost'             then 'omit'
  else 'upside'
end
where forecast_category is null;

-- 4. Small index to speed up forecast roll-ups by BU + category
create index if not exists deals_bu_forecast_idx
  on public.deals (bu, forecast_category);

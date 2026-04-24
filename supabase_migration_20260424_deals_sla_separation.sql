-- ============================================================
-- BusinessBook — Deals/SLA Separation + Contract Duration
-- 1. Add converted_to_sla to deals
-- 2. Add contract_duration_years to slas
-- Run in: Supabase Dashboard > SQL Editor
-- ============================================================

do $$ begin
  if not exists (select 1 from information_schema.columns where table_name='deals' and column_name='converted_to_sla') then
    alter table public.deals add column converted_to_sla boolean default false;
  end if;
  if not exists (select 1 from information_schema.columns where table_name='slas' and column_name='contract_duration_years') then
    alter table public.slas add column contract_duration_years int default 1;
  end if;
  if not exists (select 1 from information_schema.columns where table_name='slas' and column_name='renewal_date') then
    alter table public.slas add column renewal_date date;
  end if;
end $$;

-- Auto-set end_date and renewal_date based on duration
-- (these will be computed in the frontend when saving)

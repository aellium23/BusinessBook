-- ============================================================
-- BusinessBook — Licensing model fields for deal_products
-- Adds license_type, volume, package_size columns
-- Run in: Supabase Dashboard > SQL Editor
-- ============================================================

do $$ begin
  if not exists (select 1 from information_schema.columns where table_name='deal_products' and column_name='license_type') then
    alter table public.deal_products add column license_type text default 'flat'
      check (license_type in ('per_equipment','per_volume','per_package','per_ccu','flat'));
  end if;
  if not exists (select 1 from information_schema.columns where table_name='deal_products' and column_name='volume') then
    alter table public.deal_products add column volume int;
  end if;
  if not exists (select 1 from information_schema.columns where table_name='deal_products' and column_name='package_size') then
    alter table public.deal_products add column package_size int;
  end if;
end $$;

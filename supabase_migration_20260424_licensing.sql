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
  if not exists (select 1 from information_schema.columns where table_name='deal_products' and column_name='cost_price') then
    alter table public.deal_products add column cost_price numeric(12,2) default 0;
  end if;
  if not exists (select 1 from information_schema.columns where table_name='deal_products' and column_name='margin_pct') then
    alter table public.deal_products add column margin_pct numeric(5,2) default 0;
  end if;
  if not exists (select 1 from information_schema.columns where table_name='products' and column_name='allowed_license_types') then
    alter table public.products add column allowed_license_types jsonb default '["flat"]'::jsonb;
  end if;
end $$;

-- Backfill allowed_license_types by category
update public.products set allowed_license_types = '["per_ccu"]' where category = 'Synapse 3D';
update public.products set allowed_license_types = '["per_package","per_volume"]' where category = 'PACS';
update public.products set allowed_license_types = '["per_equipment"]' where category = 'CWM' and sku != 'CWM-IVD';
update public.products set allowed_license_types = '["per_volume"]' where sku = 'CWM-IVD';
update public.products set allowed_license_types = '["per_volume","flat"]' where category in ('AI REiLI','Gleamer','Lunit','IBEX','SYN Pathology');
update public.products set allowed_license_types = '["flat"]' where category in ('Avicenna','Contextflow','AI Gateway','DP Extential','MedSky','VMWare');

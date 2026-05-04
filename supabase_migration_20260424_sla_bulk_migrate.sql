-- ============================================================
-- BusinessBook — Bulk migrate SLA deals to Contracts
-- Converts all deals with is_sla=true to slas table entries
-- Run in: Supabase Dashboard > SQL Editor
-- ============================================================

-- 1. Migrate SLA deals to slas table
insert into public.slas (deal_id, bu, client, description, sla_type, status,
  sla_owner, deal_owner, annual_value, currency, exchange_rate,
  billing_model, account_id, country, region, product)
select
  d.id,
  d.bu,
  d.client,
  d.description,
  d.sla_type,
  case
    when d.stage = 'Invoiced' then 'active'
    when d.stage = 'Lost'     then 'cancelled'
    else 'draft'
  end,
  d.sla_owner,
  d.sales_owner,
  coalesce(d.sla_annual_value, 0),
  coalesce(d.currency, 'EUR'),
  coalesce(d.exchange_rate, 1),
  'fixed',
  d.account_id,
  d.country,
  d.region,
  d.product
from public.deals d
where d.is_sla = true
  and (d.converted_to_sla is null or d.converted_to_sla = false)
  and not exists (select 1 from public.slas s where s.deal_id = d.id);

-- 2. Mark source deals as converted
update public.deals
set converted_to_sla = true
where is_sla = true
  and (converted_to_sla is null or converted_to_sla = false);

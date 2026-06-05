-- Migration: ECT (Spain) full history FY10–FY22 + FY23 consolidation
-- Source: SAP P&L "Actual" — Fujifilm Europe GmbH Sucursal España (cost center 1714).
-- Sign convention converted so positive = revenue/profit (SAP credit).
-- Scope notes:
--   * Z- → D- account structure change at FY17 (one year before VGT's FY18).
--   * FY22 = management took over Medical IT Spain / ECT created (prior years inherited).
--   * FY23 = mid-year legal transition GmbH-branch → Fujifilm Healthcare España (2 NIFs);
--     this file is only the GmbH-branch portion (677.4K) and must be CONSOLIDATED with the
--     existing Fujifilm Healthcare España FY23 row already in fy_summary (960.5K).
-- All values K€, 1 decimal. ns_ext defaults to net_sales (no intercompany detail for ECT).
-- Run in the Supabase SQL editor (idempotent via ON CONFLICT).

INSERT INTO public.fy_summary (fiscal_year, bu, net_sales, dm, op, net_profit, plan_ns, ns_int, ns_ext) VALUES
  ('FY10','ECT', 2607.6, 294.3, -216.5, 1222.7,   NULL, 0.0, 2607.6),
  ('FY11','ECT', 2777.1, -35.9, -619.6, -589.0, 2830.0, 0.0, 2777.1),
  ('FY12','ECT', 1699.0, 354.7, -175.2, -157.4, 1552.7, 0.0, 1699.0),
  ('FY13','ECT', 1282.2, 428.1,   42.6,   48.3, 1655.9, 0.0, 1282.2),
  ('FY14','ECT', 1736.6, 172.4, -196.9, -207.3, 1801.1, 0.0, 1736.6),
  ('FY15','ECT', 3572.0, 136.1, -232.0, -233.2, 3557.2, 0.0, 3572.0),
  ('FY16','ECT', 1739.6, 234.7, -125.4, -148.7, 2193.8, 0.0, 1739.6),
  ('FY17','ECT', 2023.1, 257.8,  -87.7, -123.0, 1886.8, 0.0, 2023.1),
  ('FY18','ECT', 2368.9, 419.6,   -5.9,  -33.3, 2206.2, 0.0, 2368.9),
  ('FY19','ECT', 2034.1,-181.0, -626.3, -645.9, 1818.9, 0.0, 2034.1),
  ('FY20','ECT', 1811.2,  57.9, -297.8, -333.2, 1914.4, 0.0, 1811.2),
  ('FY21','ECT', 2082.1, -65.7, -148.2, -167.9, 2131.4, 0.0, 2082.1),
  ('FY22','ECT', 1464.3,  98.5,   14.5,   -1.1, 1621.9, 0.0, 1464.3)
ON CONFLICT (fiscal_year, bu) DO UPDATE SET
  net_sales = EXCLUDED.net_sales, dm = EXCLUDED.dm, op = EXCLUDED.op,
  net_profit = EXCLUDED.net_profit, plan_ns = EXCLUDED.plan_ns,
  ns_int = EXCLUDED.ns_int, ns_ext = EXCLUDED.ns_ext, updated_at = now();

-- Keep gross_margin aligned with dm for the new rows (other views may read gross_margin)
UPDATE public.fy_summary SET gross_margin = dm
WHERE bu = 'ECT' AND fiscal_year IN
  ('FY10','FY11','FY12','FY13','FY14','FY15','FY16','FY17','FY18','FY19','FY20','FY21','FY22');

-- Ensure dm column populated for the pre-existing ECT FY24/FY25 rows
UPDATE public.fy_summary SET dm = gross_margin
WHERE bu = 'ECT' AND dm IS NULL AND gross_margin IS NOT NULL;

-- FY23 CONSOLIDATION: existing Healthcare España row (960.5 / 196.2 / 137.0)
--   + GmbH-branch portion (677.4 / -7.3 / -63.0)  =  1637.9 / 188.9 / 74.0
UPDATE public.fy_summary SET
  net_sales = 1637.9,
  dm        = 188.9,
  gross_margin = 188.9,
  op        = 74.0,
  ns_ext    = 1637.9,
  ns_int    = 0.0,
  updated_at = now()
WHERE fiscal_year = 'FY23' AND bu = 'ECT';

-- Migration: Extend fy_summary with plan_ns, net_profit, dm columns
-- and populate VGT FY10–FY22 historical data
-- Run this in Supabase SQL editor

-- Add new columns
ALTER TABLE public.fy_summary ADD COLUMN IF NOT EXISTS plan_ns numeric(12,1) DEFAULT NULL;
ALTER TABLE public.fy_summary ADD COLUMN IF NOT EXISTS net_profit numeric(12,1) DEFAULT NULL;
ALTER TABLE public.fy_summary ADD COLUMN IF NOT EXISTS dm numeric(12,1) DEFAULT NULL;

-- Backfill dm from existing gross_margin for FY23-25 (gross_margin stores distribution margin)
UPDATE public.fy_summary SET dm = gross_margin WHERE dm IS NULL AND gross_margin IS NOT NULL;

-- Insert VGT FY10–FY22 historical data (K€, 1 decimal)
-- Source: SAP P&L statements (Actual) + XLSX netsales_detail (int/ext split)
-- Sign convention: positive = revenue/profit
INSERT INTO public.fy_summary (fiscal_year, bu, net_sales, dm, op, net_profit, plan_ns, ns_int, ns_ext) VALUES
  ('FY10','VGT', 1341.0, 607.0,  334.0, 286.0,   NULL,    0.0, 1341.0),
  ('FY11','VGT', 1693.0, 621.0,  252.0, 239.0, 1642.0,    0.0, 1693.0),
  ('FY12','VGT',  988.0, 283.0,   37.0,  84.0, 1103.0,    8.0,  980.0),
  ('FY13','VGT',  933.0, 215.0,   65.0,  54.0,  966.0,   99.0,  834.0),
  ('FY14','VGT', 1029.0, 169.0,   -5.0, -13.0, 1056.0,  128.0,  901.0),
  ('FY15','VGT', 1181.0, 219.0,   99.0,  25.0, 1167.0,   14.0, 1167.0),
  ('FY16','VGT', 1204.0, 359.0,  199.0, 170.0, 1207.0,   10.0, 1194.0),
  ('FY17','VGT', 1133.0, 252.0,   71.0,  17.0, 1220.0,    2.0, 1131.0),
  ('FY18','VGT', 2561.0, 940.0,  599.0, 582.0, 2526.0,  742.0, 1819.0),
  ('FY19','VGT', 3213.0, 748.0,  313.0, 329.0, 3117.0,  648.0, 2565.0),
  ('FY20','VGT', 2810.0, 682.0,  172.0, 133.0, 3166.0,  651.0, 2159.0),
  ('FY21','VGT', 2978.0, 593.0,  132.0, 141.0, 2910.0, 1058.0, 1920.0),
  ('FY22','VGT', 3913.0,1022.0,  392.0, 326.0, 3354.0, 1742.0, 2171.0)
ON CONFLICT (fiscal_year, bu) DO UPDATE SET
  net_sales  = EXCLUDED.net_sales,
  dm         = EXCLUDED.dm,
  op         = EXCLUDED.op,
  net_profit = EXCLUDED.net_profit,
  plan_ns    = EXCLUDED.plan_ns,
  ns_int     = EXCLUDED.ns_int,
  ns_ext     = EXCLUDED.ns_ext,
  updated_at = now();

-- Also set dm for existing FY23-25 rows (copy from gross_margin if not yet set)
UPDATE public.fy_summary
SET dm = gross_margin
WHERE dm IS NULL AND gross_margin IS NOT NULL AND gross_margin != 0;

-- Backfill plan_ns + net_profit for FY23–FY25 (VGT) from SAP P&L Plan column
UPDATE public.fy_summary SET plan_ns = 4012.0, net_profit = 431.0 WHERE fiscal_year = 'FY23' AND bu = 'VGT';
UPDATE public.fy_summary SET plan_ns = 5007.0, net_profit = 520.0 WHERE fiscal_year = 'FY24' AND bu = 'VGT';
UPDATE public.fy_summary SET plan_ns = 5466.0, net_profit = 510.0 WHERE fiscal_year = 'FY25' AND bu = 'VGT';

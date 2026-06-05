-- Migration: FY26 Actuals (April + May) in the budget table
-- Source: SAP monthly P&L (VGT 1715 + ECT 1714) + netsales XLSX for int/ext split
-- Values in K€ (numeric 12,3). Only Apr and May populated; Jun–Mar = 0.
-- Run in Supabase SQL editor.

-- Step 1: Allow 'ACT' cycle in the budget table
ALTER TABLE public.budget DROP CONSTRAINT IF EXISTS budget_cycle_check;
ALTER TABLE public.budget ADD CONSTRAINT budget_cycle_check CHECK (cycle IN ('BUD','EST1','EST2','ACT'));

-- Step 2: Insert VGT FY26 actuals (Apr + May)
INSERT INTO public.budget (bu, cycle, pl_key, apr, may, jun, jul, aug, sep, oct, nov, dec, jan, feb, mar)
VALUES
  ('VGT','ACT','ns_int',    97.732, 153.823, 0,0,0,0,0,0,0,0,0,0),
  ('VGT','ACT','ns_ext',   352.650, 343.183, 0,0,0,0,0,0,0,0,0,0),
  ('VGT','ACT','cogs_var', 302.505, 314.124, 0,0,0,0,0,0,0,0,0,0),
  ('VGT','ACT','cogs_fix',   0.000,   0.000, 0,0,0,0,0,0,0,0,0,0),
  ('VGT','ACT','rd',        96.612, 103.522, 0,0,0,0,0,0,0,0,0,0),
  ('VGT','ACT','sgas',      77.450,  65.951, 0,0,0,0,0,0,0,0,0,0),
  ('VGT','ACT','bapa',      -0.629,   5.328, 0,0,0,0,0,0,0,0,0,0)
ON CONFLICT (bu, cycle, pl_key) DO UPDATE SET
  apr=EXCLUDED.apr, may=EXCLUDED.may, jun=EXCLUDED.jun, jul=EXCLUDED.jul,
  aug=EXCLUDED.aug, sep=EXCLUDED.sep, oct=EXCLUDED.oct, nov=EXCLUDED.nov,
  dec=EXCLUDED.dec, jan=EXCLUDED.jan, feb=EXCLUDED.feb, mar=EXCLUDED.mar,
  updated_at=now();

-- Step 3: Insert ECT FY26 actuals (Apr + May)
-- ECT has no intercompany → ns_int=0, ns_ext=total NS; no R&D department
INSERT INTO public.budget (bu, cycle, pl_key, apr, may, jun, jul, aug, sep, oct, nov, dec, jan, feb, mar)
VALUES
  ('ECT','ACT','ns_int',     0.000,   0.000, 0,0,0,0,0,0,0,0,0,0),
  ('ECT','ACT','ns_ext',   204.146, 185.961, 0,0,0,0,0,0,0,0,0,0),
  ('ECT','ACT','cogs_var', 158.753, 150.132, 0,0,0,0,0,0,0,0,0,0),
  ('ECT','ACT','cogs_fix',   0.000,   0.000, 0,0,0,0,0,0,0,0,0,0),
  ('ECT','ACT','rd',         0.000,   0.000, 0,0,0,0,0,0,0,0,0,0),
  ('ECT','ACT','sgas',      42.388,  33.890, 0,0,0,0,0,0,0,0,0,0),
  ('ECT','ACT','bapa',      -0.447,   0.731, 0,0,0,0,0,0,0,0,0,0)
ON CONFLICT (bu, cycle, pl_key) DO UPDATE SET
  apr=EXCLUDED.apr, may=EXCLUDED.may, jun=EXCLUDED.jun, jul=EXCLUDED.jul,
  aug=EXCLUDED.aug, sep=EXCLUDED.sep, oct=EXCLUDED.oct, nov=EXCLUDED.nov,
  dec=EXCLUDED.dec, jan=EXCLUDED.jan, feb=EXCLUDED.feb, mar=EXCLUDED.mar,
  updated_at=now();

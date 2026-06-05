-- Migration: SG&A rubrica (line-item) Plan vs Actual for VGT
-- Source: SAP P&L statements (Actual cycle) — SG&A block (Distribution Margin → Operating Income)
-- Natures aggregated across cost centers (Sales D7 / G&A D8 / R&D D9). K€, 1 decimal.
-- Currently available: FY23, FY24 (FY25 has no SG&A Plan in source; FY18–22 P&L not re-uploaded).
-- Run this in the Supabase SQL editor.

CREATE TABLE IF NOT EXISTS public.fy_sga_rubrica (
  fiscal_year text NOT NULL,
  bu          text NOT NULL CHECK (bu IN ('VGT','ECT')),
  rubrica     text NOT NULL,
  plan        numeric(12,1) DEFAULT 0,
  actual      numeric(12,1) DEFAULT 0,
  updated_at  timestamptz DEFAULT now(),
  PRIMARY KEY (fiscal_year, bu, rubrica)
);

ALTER TABLE public.fy_sga_rubrica ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='fy_sga_rubrica' AND policyname='fy_sga_rubrica read') THEN
    CREATE POLICY "fy_sga_rubrica read" ON public.fy_sga_rubrica FOR SELECT USING (auth.role() = 'authenticated');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='fy_sga_rubrica' AND policyname='fy_sga_rubrica write') THEN
    CREATE POLICY "fy_sga_rubrica write" ON public.fy_sga_rubrica FOR ALL USING (auth.role() = 'authenticated') WITH CHECK (auth.role() = 'authenticated');
  END IF;
END $$;

INSERT INTO public.fy_sga_rubrica (fiscal_year, bu, rubrica, plan, actual) VALUES
  ('FY23','VGT','Personnel',808.3,835.2),
  ('FY23','VGT','Subcontracting',442.8,364.1),
  ('FY23','VGT','IT & Software',89.4,67.7),
  ('FY23','VGT','Rent',67.5,73.2),
  ('FY23','VGT','Consulting',56.3,23.2),
  ('FY23','VGT','Travel',52.0,53.7),
  ('FY23','VGT','Cars, Fuel & Logist.',27.0,27.3),
  ('FY23','VGT','Other',27.4,27.4),
  ('FY23','VGT','Repair & Maint.',24.5,23.0),
  ('FY23','VGT','Communication',20.4,18.0),
  ('FY23','VGT','Commissions',17.2,22.2),
  ('FY23','VGT','Stationary & Suppl.',15.6,16.6),
  ('FY23','VGT','Taxes & Fees',9.1,6.8),
  ('FY23','VGT','Audit',7.4,7.1),
  ('FY23','VGT','Advertising',7.0,18.5),
  ('FY23','VGT','Entertainment',6.6,28.3),
  ('FY23','VGT','Depreciation',3.5,3.5),
  ('FY23','VGT','Legal Fees',2.4,3.1),
  ('FY23','VGT','Insurance',1.6,6.0),
  ('FY23','VGT','Gifts',0.4,0.3),
  ('FY23','VGT','Intercompany',-49.6,-52.2),
  ('FY24','VGT','Personnel',993.1,918.8),
  ('FY24','VGT','Subcontracting',425.2,382.7),
  ('FY24','VGT','Rent',116.8,126.0),
  ('FY24','VGT','IT & Software',82.7,82.1),
  ('FY24','VGT','Entertainment',59.3,59.8),
  ('FY24','VGT','Audit',44.8,46.2),
  ('FY24','VGT','Travel',39.7,101.6),
  ('FY24','VGT','Other',29.9,26.8),
  ('FY24','VGT','Stationary & Suppl.',47.2,50.4),
  ('FY24','VGT','Cars, Fuel & Logist.',16.6,16.4),
  ('FY24','VGT','Communication',13.0,13.4),
  ('FY24','VGT','Depreciation',11.8,13.0),
  ('FY24','VGT','Consulting',8.0,39.1),
  ('FY24','VGT','Legal Fees',4.4,7.5),
  ('FY24','VGT','Advertising',10.0,7.5),
  ('FY24','VGT','Commissions',3.6,-1.5),
  ('FY24','VGT','Insurance',3.1,5.1),
  ('FY24','VGT','Taxes & Fees',3.5,3.3),
  ('FY24','VGT','Gifts',0.3,0.4),
  ('FY24','VGT','Repair & Maint.',-1.3,-3.3),
  ('FY24','VGT','Intercompany',-46.3,-34.5)
ON CONFLICT (fiscal_year, bu, rubrica) DO UPDATE SET
  plan = EXCLUDED.plan, actual = EXCLUDED.actual, updated_at = now();

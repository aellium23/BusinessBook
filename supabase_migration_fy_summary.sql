-- ─────────────────────────────────────────────────────────────────────────
-- fy_summary — annual P&L actuals per fiscal year × BU (K€)
-- Feeds the History page 3-year evolution charts (FY23–FY25).
-- Source: SAP P&L exports (PT=VGT, ES=ECT). Run in Supabase SQL Editor.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.fy_summary (
  fiscal_year  text NOT NULL,                       -- 'FY23' | 'FY24' | 'FY25'
  bu           text NOT NULL CHECK (bu IN ('VGT','ECT')),
  net_sales    numeric(12,1) DEFAULT 0,             -- K€
  gross_margin numeric(12,1) DEFAULT 0,             -- K€ (Distribution Margin)
  op           numeric(12,1) DEFAULT 0,             -- K€ (Operating Profit / OP1)
  updated_at   timestamptz DEFAULT now(),
  PRIMARY KEY (fiscal_year, bu)
);

ALTER TABLE public.fy_summary ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fy_summary read" ON public.fy_summary;
CREATE POLICY "fy_summary read" ON public.fy_summary FOR SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "fy_summary write" ON public.fy_summary;
CREATE POLICY "fy_summary write" ON public.fy_summary FOR ALL USING (auth.role() = 'authenticated');

INSERT INTO public.fy_summary (fiscal_year, bu, net_sales, gross_margin, op) VALUES
  ('FY23','VGT', 4521.9, 2030.1, 457.0),
  ('FY24','VGT', 5506.0, 2417.1, 556.5),
  ('FY25','VGT', 6191.3, 2749.0, 629.2),
  ('FY23','ECT',  960.5,  196.2, 137.0),
  ('FY24','ECT', 1271.7,  141.4, -149.0),
  ('FY25','ECT', 2192.5,  468.7,  94.4)
ON CONFLICT (fiscal_year, bu) DO UPDATE SET
  net_sales    = EXCLUDED.net_sales,
  gross_margin = EXCLUDED.gross_margin,
  op           = EXCLUDED.op,
  updated_at   = now();

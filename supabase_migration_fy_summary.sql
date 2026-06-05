-- ─────────────────────────────────────────────────────────────────────────
-- fy_summary — annual P&L actuals per fiscal year × BU (K€)
-- Feeds the History page: 3-year evolution + VGT Internal/External split.
-- Source: SAP P&L exports + Net Sales detail (Trading Partner). PT=VGT, ES=ECT.
-- Run in Supabase SQL Editor. Idempotent / safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.fy_summary (
  fiscal_year  text NOT NULL,                       -- 'FY23' | 'FY24' | 'FY25'
  bu           text NOT NULL CHECK (bu IN ('VGT','ECT')),
  net_sales    numeric(12,1) DEFAULT 0,             -- K€
  gross_margin numeric(12,1) DEFAULT 0,             -- K€ (Distribution Margin)
  op           numeric(12,1) DEFAULT 0,             -- K€ (Operating Profit / OP1)
  ns_int       numeric(12,1) DEFAULT 0,             -- K€ internal (intercompany)
  ns_ext       numeric(12,1) DEFAULT 0,             -- K€ external
  updated_at   timestamptz DEFAULT now(),
  PRIMARY KEY (fiscal_year, bu)
);

-- If the table already existed, add the split columns
ALTER TABLE public.fy_summary ADD COLUMN IF NOT EXISTS ns_int numeric(12,1) DEFAULT 0;
ALTER TABLE public.fy_summary ADD COLUMN IF NOT EXISTS ns_ext numeric(12,1) DEFAULT 0;

ALTER TABLE public.fy_summary ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "fy_summary read" ON public.fy_summary;
CREATE POLICY "fy_summary read" ON public.fy_summary FOR SELECT USING (auth.role() = 'authenticated');
DROP POLICY IF EXISTS "fy_summary write" ON public.fy_summary;
CREATE POLICY "fy_summary write" ON public.fy_summary FOR ALL USING (auth.role() = 'authenticated');

-- Internal/External split: real % from SAP Trading Partner detail, applied to
-- the P&L Net Sales. VGT FY23 49,8% / FY24 38,6% / FY25 36,6% internal.
-- ECT: ~100% external (sells to end clients; no IC trading-partner detail).
INSERT INTO public.fy_summary (fiscal_year, bu, net_sales, gross_margin, op, ns_int, ns_ext) VALUES
  ('FY23','VGT', 4521.9, 2030.1, 457.0, 2253.1, 2268.8),
  ('FY24','VGT', 5506.0, 2417.1, 556.5, 2124.9, 3381.1),
  ('FY25','VGT', 6191.3, 2749.0, 629.2, 2263.4, 3927.9),
  ('FY23','ECT',  960.5,  196.2, 137.0,    0.0,  960.5),
  ('FY24','ECT', 1271.7,  141.4, -149.0,   0.0, 1271.7),
  ('FY25','ECT', 2192.5,  468.7,  94.4,    0.0, 2192.5)
ON CONFLICT (fiscal_year, bu) DO UPDATE SET
  net_sales    = EXCLUDED.net_sales,
  gross_margin = EXCLUDED.gross_margin,
  op           = EXCLUDED.op,
  ns_int       = EXCLUDED.ns_int,
  ns_ext       = EXCLUDED.ns_ext,
  updated_at   = now();

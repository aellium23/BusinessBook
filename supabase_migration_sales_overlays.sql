-- ============================================================
-- BusinessBook — Sales Overlay / Credit Rules
-- ============================================================
-- Run in: Supabase Dashboard → SQL Editor
--
-- Allows configuring that one sales rep's deals (for specific products)
-- also count toward another rep's numbers. Per-BU, per-fiscal-year.
--
-- Example: Patricia Gomes' CWM-Dose and CWM-AI deals count toward
-- Paulo Cunha's numbers for FY26.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.sales_overlays (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bu              text NOT NULL CHECK (bu IN ('VGT', 'ECT')),
  fiscal_year     int NOT NULL DEFAULT 2026,
  source_owner    text NOT NULL,  -- rep whose deals are shared
  target_owner    text NOT NULL,  -- rep who gets the credit
  products        jsonb NOT NULL DEFAULT '[]'::jsonb,  -- product names to include (empty = all)
  share_pct       numeric(5,2) NOT NULL DEFAULT 100,   -- % of value credited (100 = full overlay)
  active          boolean DEFAULT true,
  notes           text,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

DROP TRIGGER IF EXISTS sales_overlays_updated_at ON public.sales_overlays;
CREATE TRIGGER sales_overlays_updated_at
  BEFORE UPDATE ON public.sales_overlays
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

ALTER TABLE public.sales_overlays ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "overlays read" ON public.sales_overlays;
CREATE POLICY "overlays read" ON public.sales_overlays FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND active = true)
);

DROP POLICY IF EXISTS "overlays write" ON public.sales_overlays;
CREATE POLICY "overlays write" ON public.sales_overlays FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND active = true AND role IN ('admin', 'manager'))
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND active = true AND role IN ('admin', 'manager'))
);

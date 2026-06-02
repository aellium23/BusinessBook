-- ============================================================
-- BusinessBook — Discount Request History + TCO Project Costs
-- ============================================================
-- Run in: Supabase Dashboard → SQL Editor
-- ============================================================

-- ── 1. Discount Request History ──────────────────────────────
-- Replaces the single discount_requested/discount_approved fields
-- with a full negotiation log per deal.

CREATE TABLE IF NOT EXISTS public.deal_discount_requests (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id         uuid NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  requested_by    uuid REFERENCES public.profiles(id),
  requested_pct   numeric(5,2) NOT NULL,
  justification   text,
  status          text NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','approved','rejected','counter')),
  approved_pct    numeric(5,2),
  response_note   text,
  responded_by    uuid REFERENCES public.profiles(id),
  responded_at    timestamptz,
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE public.deal_discount_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "discount_req read" ON public.deal_discount_requests;
CREATE POLICY "discount_req read" ON public.deal_discount_requests FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND active = true)
);

DROP POLICY IF EXISTS "discount_req write" ON public.deal_discount_requests;
CREATE POLICY "discount_req write" ON public.deal_discount_requests FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND active = true)
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND active = true)
);

-- ── 2. TCO / Project Costs (third-party line items) ─────────
-- Allows distributors to add other vendor costs to show the global
-- project margin alongside the CWM/Fujifilm products.

CREATE TABLE IF NOT EXISTS public.deal_project_costs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id         uuid NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  vendor          text NOT NULL,
  product_name    text NOT NULL,
  cost_price      numeric(14,2) DEFAULT 0,
  sell_price      numeric(14,2) DEFAULT 0,
  notes           text,
  created_at      timestamptz DEFAULT now()
);

ALTER TABLE public.deal_project_costs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "project_costs read" ON public.deal_project_costs;
CREATE POLICY "project_costs read" ON public.deal_project_costs FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND active = true)
);

DROP POLICY IF EXISTS "project_costs write" ON public.deal_project_costs;
CREATE POLICY "project_costs write" ON public.deal_project_costs FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND active = true)
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND active = true)
);

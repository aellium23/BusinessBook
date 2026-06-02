-- ============================================================
-- BusinessBook — Brand-based Discount Approval Routing
-- ============================================================
-- Run in: Supabase Dashboard → SQL Editor
--
-- Adds:
--  • products.brand           — product brand/vendor (Fujifilm, Medsky…)
--  • profiles.approves_brands — brands a user may approve discounts for
--  • deal_discount_requests.brand — which brand a request routes to
-- ============================================================

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS brand text DEFAULT 'Fujifilm';

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS approves_brands jsonb DEFAULT '[]'::jsonb;

ALTER TABLE public.deal_discount_requests
  ADD COLUMN IF NOT EXISTS brand text;

-- Optional: seed existing CWM/Connectivity products as Fujifilm (default already covers it)
-- UPDATE public.products SET brand = 'Fujifilm' WHERE brand IS NULL;

-- ── RLS: allow brand approvers to read/update discount requests ──
-- A user may act on a request if:
--   • they are admin/manager, OR
--   • the request's brand is in their approves_brands array, OR
--   • they created the request (distributor sees their own)

DROP POLICY IF EXISTS "discount_req read" ON public.deal_discount_requests;
CREATE POLICY "discount_req read" ON public.deal_discount_requests FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND active = true)
);

DROP POLICY IF EXISTS "discount_req write" ON public.deal_discount_requests;
CREATE POLICY "discount_req write" ON public.deal_discount_requests FOR ALL USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.active = true
      AND (
        p.role IN ('admin','manager')
        OR p.id = deal_discount_requests.requested_by
        OR (deal_discount_requests.brand IS NOT NULL
            AND p.approves_brands ? deal_discount_requests.brand)
      )
  )
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND active = true)
);

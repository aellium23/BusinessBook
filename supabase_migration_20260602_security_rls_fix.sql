-- ============================================================
-- BusinessBook — CRITICAL Security RLS Fixes  2026-06-02
--
-- Fix 1: deal_products — restrict read access so distributors
--         only see deals linked to their own company, and
--         managers only see their own BU.
--
-- Fix 2: deals — add company_id scoping for distributors so
--         they cannot see deals belonging to other companies.
--
-- Run in: Supabase Dashboard > SQL Editor
-- ============================================================

-- ── Fix 1: deal_products read policy ─────────────────────────
-- The previous policy allowed any user in the same BU to SELECT
-- all rows (and all columns, including cost_price / margin_pct).
-- PostgreSQL RLS is row-level only — it cannot hide individual
-- columns.  The practical mitigation is to tighten the row filter
-- so that distributors can only reach their OWN company's deals.
--
-- NOTE: cost_price / margin_pct column masking must be enforced
-- at the application layer (PostgREST column selection or a
-- security-definer view).  This migration focuses on row-level
-- access control.

DROP POLICY IF EXISTS "deal_products read" ON public.deal_products;
CREATE POLICY "deal_products read" ON public.deal_products FOR SELECT USING (
  -- Admin sees all
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND active = true AND role = 'admin'
  )
  -- Manager sees own BU
  OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND active = true AND role = 'manager'
      AND bu IN (SELECT bu FROM public.deals WHERE id = deal_products.deal_id)
  )
  -- Others see only deals linked to their company (distributors)
  -- or deals in their BU (members / viewers / partners)
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.active = true
      AND (
        -- Company-scoped access (distributors)
        (p.company_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.deals d
          WHERE d.id = deal_products.deal_id AND d.company_id = p.company_id
        ))
        -- BU-scoped access (members, viewers, partners)
        OR (p.company_id IS NULL AND p.bu IN (
          SELECT bu FROM public.deals WHERE id = deal_products.deal_id
        ))
      )
  )
);


-- ── Fix 2: deals read policy ─────────────────────────────────
-- The previous policy only filtered by BU, which meant a
-- distributor for Company A could see Company B's deals if they
-- shared the same BU.  Now distributors are scoped to their own
-- company_id.

DROP POLICY IF EXISTS "deals read" ON public.deals;
CREATE POLICY "deals read" ON public.deals FOR SELECT USING (
  -- Admin sees all
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND active = true AND role = 'admin'
  )
  -- Manager / member sees own BU
  OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND active = true
      AND role IN ('manager', 'member') AND bu = deals.bu
  )
  -- Distributor sees only own company's deals
  OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND active = true
      AND role = 'distributor'
      AND company_id = deals.company_id
      AND company_id IS NOT NULL
  )
  -- Viewer / partner sees own BU (read-only enforced elsewhere)
  OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND active = true
      AND role IN ('viewer', 'partner') AND bu = deals.bu
  )
);

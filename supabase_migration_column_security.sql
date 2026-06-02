-- ============================================================
-- BusinessBook — Column-Level Security for deal_products
-- ============================================================
-- Date:        2026-06-02
-- Description: Creates a security-definer VIEW (deal_products_v)
--              that hides cost_price and margin_pct from
--              non-admin/non-manager roles.
--
-- WHY:  PostgreSQL Row-Level Security (RLS) can only filter
--       *rows*, not *columns*. To restrict column visibility
--       in Supabase/PostgREST the standard approach is a VIEW
--       with CASE expressions that null-out sensitive columns
--       for unauthorised roles.
--
-- USAGE: The front-end should query `deal_products_v` instead
--        of `deal_products` for all SELECT operations by
--        distributors, members, viewers, and partners.
--        INSERT / UPDATE / DELETE should still target the
--        underlying `deal_products` table (RLS policies apply).
--
-- Roles that can see cost_price & margin_pct:
--   - admin
--   - manager
--
-- Roles that see NULL for those columns:
--   - distributor
--   - member
--   - viewer
--   - partner
-- ============================================================

-- Drop the view if it already exists (idempotent)
DROP VIEW IF EXISTS public.deal_products_v;

CREATE OR REPLACE VIEW public.deal_products_v AS
SELECT
  dp.id,
  dp.deal_id,
  dp.product_id,
  dp.product_name,
  dp.license_type,
  dp.quantity,
  dp.volume,
  dp.package_size,
  dp.unit_price,
  dp.net_price,
  dp.discount_pct,
  dp.annual_fee,
  dp.notes,
  dp.created_at,
  -- Sensitive columns: only visible to admin / manager
  CASE WHEN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'manager')
  ) THEN dp.cost_price ELSE NULL END AS cost_price,
  CASE WHEN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'manager')
  ) THEN dp.margin_pct ELSE NULL END AS margin_pct
FROM public.deal_products dp;

-- Grant read access to all authenticated users.
-- Row-level filtering is still enforced by RLS on the
-- underlying deal_products table.
GRANT SELECT ON public.deal_products_v TO authenticated;

COMMENT ON VIEW public.deal_products_v IS
  'Security view over deal_products. Hides cost_price and margin_pct for non-admin/non-manager roles. Use this view for SELECT queries; use deal_products directly for INSERT/UPDATE/DELETE.';

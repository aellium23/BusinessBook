-- ============================================================
-- BusinessBook — Discount Response Function (brand approvers)
-- ============================================================
-- Run in: Supabase Dashboard → SQL Editor
--
-- Fixes:
--  1. deals.discount_status may have an old CHECK that rejects 'counter'
--  2. Brand approvers (no BU) can't UPDATE deals via RLS, so their
--     decision couldn't update the deal summary status.
--
-- Solution: a SECURITY DEFINER function that updates both the request
-- and the deal, after verifying the caller is allowed to act on that
-- request's brand (admin/manager OR approves_brands contains the brand).
-- ============================================================

-- 1. Remove any restrictive CHECK on deals.discount_status
DO $$
DECLARE c text;
BEGIN
  FOR c IN
    SELECT conname FROM pg_constraint
    WHERE conrelid = 'public.deals'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%discount_status%'
  LOOP
    EXECUTE format('ALTER TABLE public.deals DROP CONSTRAINT %I', c);
  END LOOP;
END $$;

-- 2. Response function (bypasses RLS safely, with internal authz)
CREATE OR REPLACE FUNCTION public.respond_discount_request(
  p_request_id uuid,
  p_status     text,
  p_approved_pct numeric,
  p_note       text
)
RETURNS TABLE (deal_id uuid, requested_by uuid, requested_pct numeric, client text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req   public.deal_discount_requests%ROWTYPE;
  v_can   boolean;
BEGIN
  SELECT * INTO v_req FROM public.deal_discount_requests WHERE id = p_request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;

  -- Authorization: admin/manager OR brand approver for this request's brand
  SELECT EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.active = true
      AND (
        p.role IN ('admin','manager')
        OR (v_req.brand IS NOT NULL AND p.approves_brands ? v_req.brand)
      )
  ) INTO v_can;
  IF NOT v_can THEN RAISE EXCEPTION 'Not authorized to respond to this request'; END IF;

  IF p_status NOT IN ('approved','rejected','counter') THEN
    RAISE EXCEPTION 'Invalid status %', p_status;
  END IF;

  UPDATE public.deal_discount_requests SET
    status        = p_status,
    approved_pct  = CASE WHEN p_status IN ('approved','counter') THEN p_approved_pct ELSE NULL END,
    response_note = p_note,
    responded_by  = auth.uid(),
    responded_at  = now()
  WHERE id = p_request_id;

  UPDATE public.deals SET
    discount_status   = p_status,
    discount_approved = CASE WHEN p_status IN ('approved','counter') THEN p_approved_pct ELSE NULL END
  WHERE id = v_req.deal_id;

  RETURN QUERY
    SELECT v_req.deal_id, v_req.requested_by, v_req.requested_pct, d.client
    FROM public.deals d WHERE d.id = v_req.deal_id;
END $$;

GRANT EXECUTE ON FUNCTION public.respond_discount_request(uuid, text, numeric, text) TO authenticated;

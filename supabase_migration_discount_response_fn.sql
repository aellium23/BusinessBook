-- ============================================================
-- BusinessBook — Discount Response Function (brand approvers) v2
-- ============================================================
-- Run in: Supabase Dashboard → SQL Editor
--
-- Handles the full response in ONE call (bypasses RLS safely):
--   1. validates caller (admin/manager OR brand approver)
--   2. updates the discount request
--   3. updates the deal summary status
--   4. creates the notification for the requester (distributor)
-- ============================================================

-- Remove any restrictive CHECK on deals.discount_status
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

CREATE OR REPLACE FUNCTION public.respond_discount_request(
  p_request_id uuid,
  p_status     text,
  p_approved_pct numeric,
  p_note       text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req    public.deal_discount_requests%ROWTYPE;
  v_client text;
  v_can    boolean;
  v_body   text;
BEGIN
  SELECT * INTO v_req FROM public.deal_discount_requests WHERE id = p_request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;

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
  WHERE id = v_req.deal_id
  RETURNING client INTO v_client;

  -- Notify the requester (distributor)
  IF v_req.requested_by IS NOT NULL THEN
    v_body := CASE
      WHEN p_status = 'approved' THEN 'Your ' || v_req.requested_pct || '% discount was approved.'
      WHEN p_status = 'counter'  THEN 'Counter-offer: ' || COALESCE(p_approved_pct::text,'—') || '%.'
      ELSE 'Your discount request was rejected.'
    END;
    INSERT INTO public.notifications (user_id, type, title, body, link_type, link_id)
    VALUES (
      v_req.requested_by,
      'discount_response',
      'Discount ' || p_status || ': ' || COALESCE(v_client, 'Deal'),
      v_body,
      'deal',
      v_req.deal_id
    );
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION public.respond_discount_request(uuid, text, numeric, text) TO authenticated;

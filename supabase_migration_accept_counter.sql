-- ============================================================
-- BusinessBook — Distributor accepts a counter-offer
-- ============================================================
-- Run in: Supabase Dashboard → SQL Editor
--
-- Lets the requester (distributor) accept a counter-offer, finalizing
-- the discount at the countered %. Runs as SECURITY DEFINER so the
-- distributor (who has no BU write access to deals) can finalize it.
-- ============================================================

DROP FUNCTION IF EXISTS public.accept_counter_offer(uuid);

CREATE OR REPLACE FUNCTION public.accept_counter_offer(p_request_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_req    public.deal_discount_requests%ROWTYPE;
  v_client text;
BEGIN
  SELECT * INTO v_req FROM public.deal_discount_requests WHERE id = p_request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;

  -- Only the original requester can accept the counter
  IF v_req.requested_by <> auth.uid() THEN
    RAISE EXCEPTION 'Only the requester can accept this counter-offer';
  END IF;
  IF v_req.status <> 'counter' THEN
    RAISE EXCEPTION 'Request is not a counter-offer';
  END IF;

  UPDATE public.deal_discount_requests SET
    status        = 'approved',
    response_note = COALESCE(response_note, '') || ' · Accepted by distributor',
    responded_at  = now()
  WHERE id = p_request_id;

  UPDATE public.deals SET
    discount_status   = 'approved',
    discount_approved = v_req.approved_pct
  WHERE id = v_req.deal_id
  RETURNING client INTO v_client;

  -- Notify the approver who made the counter
  IF v_req.responded_by IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, body, link_type, link_id)
    VALUES (
      v_req.responded_by,
      'discount_response',
      'Counter accepted: ' || COALESCE(v_client, 'Deal'),
      'Distributor accepted the ' || COALESCE(v_req.approved_pct::text, '—') || '% counter-offer.',
      'deal',
      v_req.deal_id
    );
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION public.accept_counter_offer(uuid) TO authenticated;

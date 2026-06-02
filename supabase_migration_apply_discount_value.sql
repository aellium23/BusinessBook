-- ============================================================
-- BusinessBook — Apply approved discount to deal value
-- ============================================================
-- Run in: Supabase Dashboard → SQL Editor
--
-- When a discount is approved (or a counter accepted), the deal's
-- value_total is recomputed from the product gross × (1 - discount%),
-- so forecast/pipeline/backlog reflect the real net value.
-- Recompute-from-gross is idempotent (no double-application).
-- On rejection, value_total is restored to the gross product total.
-- ============================================================

DROP FUNCTION IF EXISTS public.respond_discount_request(uuid, text, numeric, text);

CREATE OR REPLACE FUNCTION public.respond_discount_request(
  p_request_id uuid, p_status text, p_approved_pct numeric, p_note text
)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_req    public.deal_discount_requests%ROWTYPE;
  v_client text; v_can boolean; v_body text; v_gross numeric;
BEGIN
  SELECT * INTO v_req FROM public.deal_discount_requests WHERE id = p_request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.active = true
      AND (p.role IN ('admin','manager') OR (v_req.brand IS NOT NULL AND p.approves_brands ? v_req.brand))
  ) INTO v_can;
  IF NOT v_can THEN RAISE EXCEPTION 'Not authorized to respond to this request'; END IF;
  IF p_status NOT IN ('approved','rejected','counter') THEN RAISE EXCEPTION 'Invalid status %', p_status; END IF;

  UPDATE public.deal_discount_requests SET
    status = p_status,
    approved_pct = CASE WHEN p_status IN ('approved','counter') THEN p_approved_pct ELSE NULL END,
    response_note = p_note, responded_by = auth.uid(), responded_at = now()
  WHERE id = p_request_id;

  UPDATE public.deals SET
    discount_status = p_status,
    discount_approved = CASE WHEN p_status IN ('approved','counter') THEN p_approved_pct ELSE NULL END
  WHERE id = v_req.deal_id
  RETURNING client INTO v_client;

  -- Reflect the decision in the deal value (from product gross)
  SELECT COALESCE(SUM(net_price), 0) INTO v_gross
    FROM public.deal_products WHERE deal_id = v_req.deal_id;
  IF v_gross > 0 THEN
    IF p_status = 'approved' THEN
      UPDATE public.deals SET value_total = round(v_gross * (1 - COALESCE(p_approved_pct,0)/100.0))
        WHERE id = v_req.deal_id;
    ELSIF p_status = 'rejected' THEN
      UPDATE public.deals SET value_total = round(v_gross) WHERE id = v_req.deal_id;
    END IF;
  END IF;

  IF v_req.requested_by IS NOT NULL THEN
    v_body := CASE
      WHEN p_status = 'approved' THEN 'Your ' || v_req.requested_pct || '% discount was approved.'
      WHEN p_status = 'counter'  THEN 'Counter-offer: ' || COALESCE(p_approved_pct::text,'—') || '%.'
      ELSE 'Your discount request was rejected.' END;
    INSERT INTO public.notifications (user_id, type, title, body, link_type, link_id)
    VALUES (v_req.requested_by, 'discount_response',
      'Discount ' || p_status || ': ' || COALESCE(v_client,'Deal'), v_body, 'deal', v_req.deal_id);
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION public.respond_discount_request(uuid, text, numeric, text) TO authenticated;


DROP FUNCTION IF EXISTS public.accept_counter_offer(uuid);

CREATE OR REPLACE FUNCTION public.accept_counter_offer(p_request_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_req public.deal_discount_requests%ROWTYPE; v_client text; v_gross numeric;
BEGIN
  SELECT * INTO v_req FROM public.deal_discount_requests WHERE id = p_request_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Request not found'; END IF;
  IF v_req.requested_by <> auth.uid() THEN RAISE EXCEPTION 'Only the requester can accept'; END IF;
  IF v_req.status <> 'counter' THEN RAISE EXCEPTION 'Not a counter-offer'; END IF;

  UPDATE public.deal_discount_requests SET
    status = 'approved',
    response_note = COALESCE(response_note,'') || ' · Accepted by distributor',
    responded_at = now()
  WHERE id = p_request_id;

  UPDATE public.deals SET
    discount_status = 'approved', discount_approved = v_req.approved_pct
  WHERE id = v_req.deal_id RETURNING client INTO v_client;

  SELECT COALESCE(SUM(net_price), 0) INTO v_gross
    FROM public.deal_products WHERE deal_id = v_req.deal_id;
  IF v_gross > 0 THEN
    UPDATE public.deals SET value_total = round(v_gross * (1 - COALESCE(v_req.approved_pct,0)/100.0))
      WHERE id = v_req.deal_id;
  END IF;

  IF v_req.responded_by IS NOT NULL THEN
    INSERT INTO public.notifications (user_id, type, title, body, link_type, link_id)
    VALUES (v_req.responded_by, 'discount_response',
      'Counter accepted: ' || COALESCE(v_client,'Deal'),
      'Distributor accepted the ' || COALESCE(v_req.approved_pct::text,'—') || '% counter-offer.',
      'deal', v_req.deal_id);
  END IF;
END $$;

GRANT EXECUTE ON FUNCTION public.accept_counter_offer(uuid) TO authenticated;

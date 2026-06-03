-- ─────────────────────────────────────────────────────────────────────────
-- Delivery Acceptance workflow ("Auto de Receção")
-- Correr no Supabase SQL Editor. Idempotente.
-- ─────────────────────────────────────────────────────────────────────────

-- 1) Acceptance tokens table -----------------------------------------------
CREATE TABLE IF NOT EXISTS deal_acceptances (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id       uuid NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  token         uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  client_email  text NOT NULL,
  client_name   text,
  created_by    uuid REFERENCES auth.users(id),
  created_at    timestamptz NOT NULL DEFAULT now(),
  accepted_at   timestamptz,
  accepted_by_name  text,
  accepted_by_email text,
  reminder_count    int NOT NULL DEFAULT 0,
  last_reminder_at  timestamptz,
  expires_at    timestamptz NOT NULL DEFAULT (now() + interval '90 days')
);

-- RLS: authenticated users can CRUD their own org's acceptances;
-- the RPC functions handle anon access.
ALTER TABLE deal_acceptances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can manage acceptances" ON deal_acceptances;
CREATE POLICY "Authenticated can manage acceptances" ON deal_acceptances
  FOR ALL USING (auth.role() = 'authenticated');

-- 2) Deals: delivery status ------------------------------------------------
ALTER TABLE deals ADD COLUMN IF NOT EXISTS delivery_status text
  DEFAULT 'not_sent';

-- Add CHECK constraint (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'deals_delivery_status_check'
  ) THEN
    ALTER TABLE deals ADD CONSTRAINT deals_delivery_status_check
      CHECK (delivery_status IS NULL OR delivery_status IN ('not_sent','pending','accepted'));
  END IF;
END $$;

-- 3) RPC: get acceptance details (public / anon) ---------------------------
--    Returns deal summary + products for the acceptance page.
DROP FUNCTION IF EXISTS get_acceptance_details(uuid);
CREATE OR REPLACE FUNCTION get_acceptance_details(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_acc  deal_acceptances%ROWTYPE;
  v_deal jsonb;
  v_prods jsonb;
BEGIN
  SELECT * INTO v_acc FROM deal_acceptances
  WHERE token = p_token AND expires_at > now();

  IF v_acc IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT jsonb_build_object(
    'id', d.id,
    'client', d.client,
    'description', d.description,
    'value_total', d.value_total,
    'currency', d.currency,
    'bu', d.bu
  ) INTO v_deal
  FROM deals d WHERE d.id = v_acc.deal_id;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'product_name', dp.product_name,
    'quantity', dp.quantity
  )), '[]'::jsonb) INTO v_prods
  FROM deal_products dp WHERE dp.deal_id = v_acc.deal_id;

  RETURN jsonb_build_object(
    'acceptance', jsonb_build_object(
      'id', v_acc.id,
      'accepted_at', v_acc.accepted_at,
      'accepted_by_name', v_acc.accepted_by_name,
      'client_email', v_acc.client_email,
      'client_name', v_acc.client_name
    ),
    'deal', v_deal,
    'products', v_prods
  );
END;
$$;

-- Grant anon access to the RPC
GRANT EXECUTE ON FUNCTION get_acceptance_details(uuid) TO anon;
GRANT EXECUTE ON FUNCTION get_acceptance_details(uuid) TO authenticated;

-- 4) RPC: confirm delivery (public / anon) ---------------------------------
DROP FUNCTION IF EXISTS confirm_delivery(uuid);
CREATE OR REPLACE FUNCTION confirm_delivery(p_token uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_acc deal_acceptances%ROWTYPE;
BEGIN
  SELECT * INTO v_acc FROM deal_acceptances
  WHERE token = p_token
    AND expires_at > now()
    AND accepted_at IS NULL;

  IF v_acc IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid, expired, or already accepted token.');
  END IF;

  -- Mark the acceptance
  UPDATE deal_acceptances
  SET accepted_at = now()
  WHERE id = v_acc.id;

  -- Update the deal's delivery status
  UPDATE deals
  SET delivery_status = 'accepted'
  WHERE id = v_acc.deal_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION confirm_delivery(uuid) TO anon;
GRANT EXECUTE ON FUNCTION confirm_delivery(uuid) TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- Billing party → automatic Internal/External on deals
--   ECT                                   → External (always)
--   VGT invoicing a Fuji subsidiary (HCUS, Fuji España/UK/ME…) → Internal
--   VGT invoicing a distributor / end client                   → External
-- Run in Supabase SQL Editor. Idempotent.
-- ─────────────────────────────────────────────────────────────────────────

-- 1) Distributors: mark master distributors (e.g. future TIMED Chile) ------
ALTER TABLE distributors ADD COLUMN IF NOT EXISTS is_master_distributor boolean NOT NULL DEFAULT false;

-- 2) Deals: billing party --------------------------------------------------
ALTER TABLE deals ADD COLUMN IF NOT EXISTS billing_party_type text;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS billing_subsidiary_id uuid REFERENCES regional_hubs(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'deals_billing_party_type_check') THEN
    ALTER TABLE deals ADD CONSTRAINT deals_billing_party_type_check
      CHECK (billing_party_type IS NULL OR billing_party_type IN ('fuji_subsidiary', 'distributor', 'end_client'));
  END IF;
END $$;

-- 3) Backfill billing_party_type from existing sales_type ------------------
--    (so historical deals get a sensible billing party; editable afterwards)
--    Internal VGT deals → assume Fuji subsidiary; everything else → end client.
UPDATE deals
SET billing_party_type = CASE
  WHEN bu = 'VGT' AND sales_type = 'Internal' THEN 'fuji_subsidiary'
  WHEN distributor_id IS NOT NULL            THEN 'distributor'
  ELSE 'end_client'
END
WHERE billing_party_type IS NULL;

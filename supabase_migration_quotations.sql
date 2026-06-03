-- ─────────────────────────────────────────────────────────────────────────
-- Quotations module + SLA actual_production field
-- Correr no Supabase SQL Editor. Idempotente.
-- ─────────────────────────────────────────────────────────────────────────

-- 1) SLA: actual production for compliance detection ----------------------
ALTER TABLE slas ADD COLUMN IF NOT EXISTS actual_production integer;

-- 2) Quotations table -----------------------------------------------------
CREATE TABLE IF NOT EXISTS quotations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bu               text NOT NULL DEFAULT 'VGT',
  client           text NOT NULL,
  description      text,
  context_type     text NOT NULL DEFAULT 'new_business'
    CHECK (context_type IN ('license_compliance', 'new_business', 'upgrade')),
  status           text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'sent', 'viewed', 'accepted', 'rejected', 'counter', 'expired', 'converted')),
  currency         text NOT NULL DEFAULT 'EUR',
  total_value      numeric(14,2) DEFAULT 0,
  -- Compliance context
  sla_id           uuid REFERENCES slas(id) ON DELETE SET NULL,
  licensed_volume  integer,
  actual_volume    integer,
  -- Distribution
  company_id       uuid,            -- distributor company
  country          text,
  region           text,
  -- Negotiation
  counter_value    numeric(14,2),    -- distributor's counter-offer
  response_note    text,
  responded_at     timestamptz,
  accepted_at      timestamptz,
  -- Auto-generated deal
  deal_id          uuid REFERENCES deals(id) ON DELETE SET NULL,
  -- Metadata
  quotation_number text,
  validity_days    integer DEFAULT 30,
  notes            text,
  sent_at          timestamptz,
  created_by       uuid REFERENCES auth.users(id),
  created_by_name  text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Auto-generate quotation number
CREATE OR REPLACE FUNCTION generate_quotation_number()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.quotation_number IS NULL THEN
    NEW.quotation_number := 'Q-' || to_char(now(), 'YYMMDD') || '-' || substring(NEW.id::text, 1, 4);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_quotation_number ON quotations;
CREATE TRIGGER trg_quotation_number
  BEFORE INSERT ON quotations
  FOR EACH ROW EXECUTE FUNCTION generate_quotation_number();

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION quotation_set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_quotation_updated ON quotations;
CREATE TRIGGER trg_quotation_updated
  BEFORE UPDATE ON quotations
  FOR EACH ROW EXECUTE FUNCTION quotation_set_updated_at();

-- 3) Quotation items -------------------------------------------------------
CREATE TABLE IF NOT EXISTS quotation_items (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  quotation_id   uuid NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  product_id     uuid REFERENCES products(id) ON DELETE SET NULL,
  product_name   text NOT NULL,
  quantity       integer NOT NULL DEFAULT 1,
  unit_price     numeric(14,2) DEFAULT 0,
  total_price    numeric(14,2) DEFAULT 0,
  description    text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

-- 4) RLS -------------------------------------------------------------------
ALTER TABLE quotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE quotation_items ENABLE ROW LEVEL SECURITY;

-- Authenticated users: admins see all, others see own BU + distributor sees own company
DROP POLICY IF EXISTS "quotations_select" ON quotations;
CREATE POLICY "quotations_select" ON quotations FOR SELECT
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "quotations_insert" ON quotations;
CREATE POLICY "quotations_insert" ON quotations FOR INSERT
  WITH CHECK (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "quotations_update" ON quotations;
CREATE POLICY "quotations_update" ON quotations FOR UPDATE
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "quotations_delete" ON quotations;
CREATE POLICY "quotations_delete" ON quotations FOR DELETE
  USING (auth.role() = 'authenticated');

DROP POLICY IF EXISTS "quotation_items_all" ON quotation_items;
CREATE POLICY "quotation_items_all" ON quotation_items FOR ALL
  USING (auth.role() = 'authenticated');

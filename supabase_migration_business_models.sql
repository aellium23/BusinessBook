-- ─────────────────────────────────────────────────────────────────────────
-- Business-model simplification + contract period + revenue deferral  (v2)
--   5 canonical models: financed_project · pay_per_study · subscription
--                       · capex · one_shot
-- Run in Supabase SQL Editor. Idempotent / safe to re-run.
-- v2: drops & recreates the deals_business_model_check constraint so the new
--     values are accepted (old constraint only allowed the legacy taxonomy).
-- ─────────────────────────────────────────────────────────────────────────

-- 1) New columns -----------------------------------------------------------
ALTER TABLE deals ADD COLUMN IF NOT EXISTS contract_start date;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS contract_end   date;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS revenue_by_fy  jsonb;

ALTER TABLE slas ADD COLUMN IF NOT EXISTS includes_updates   boolean NOT NULL DEFAULT false;
ALTER TABLE slas ADD COLUMN IF NOT EXISTS support_hours      integer;        -- NULL = no hours limit
ALTER TABLE slas ADD COLUMN IF NOT EXISTS support_hours_note text;

-- 2) Drop the old CHECK constraint BEFORE normalising ----------------------
ALTER TABLE deals DROP CONSTRAINT IF EXISTS deals_business_model_check;

-- 3) Normalise legacy business_model values to the new taxonomy ------------
--    (UI also normalises on read — no data is lost, only the label is remapped;
--     all financial columns are untouched.)
UPDATE deals SET business_model = 'subscription' WHERE business_model IN ('opex', 'saas');
UPDATE deals SET business_model = 'capex'        WHERE business_model = 'hybrid';

-- 4) Recreate the constraint with the 5 canonical values (NULL allowed) -----
ALTER TABLE deals ADD CONSTRAINT deals_business_model_check
  CHECK (business_model IS NULL OR business_model IN
    ('financed_project', 'pay_per_study', 'subscription', 'capex', 'one_shot'));

-- 5) Backfill contract_start/contract_end from existing cs_*/ce_* parts -----
WITH m(name, idx) AS (
  VALUES ('Jan',1),('Feb',2),('Mar',3),('Apr',4),('May',5),('Jun',6),
         ('Jul',7),('Aug',8),('Sep',9),('Oct',10),('Nov',11),('Dec',12)
)
UPDATE deals d SET contract_start = make_date(d.cs_year, ms.idx, LEAST(GREATEST(COALESCE(d.cs_day,1),1),28))
FROM m ms
WHERE d.contract_start IS NULL AND d.cs_year IS NOT NULL AND d.cs_month = ms.name;

WITH m(name, idx) AS (
  VALUES ('Jan',1),('Feb',2),('Mar',3),('Apr',4),('May',5),('Jun',6),
         ('Jul',7),('Aug',8),('Sep',9),('Oct',10),('Nov',11),('Dec',12)
)
UPDATE deals d SET contract_end = make_date(d.ce_year, me.idx, LEAST(GREATEST(COALESCE(d.ce_day,28),1),28))
FROM m me
WHERE d.contract_end IS NULL AND d.ce_year IS NOT NULL AND d.ce_month = me.name;

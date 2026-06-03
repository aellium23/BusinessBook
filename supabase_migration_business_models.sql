-- ─────────────────────────────────────────────────────────────────────────
-- Business-model simplification + contract period + revenue deferral
--   5 canonical models: financed_project · pay_per_study · subscription
--                       · capex · one_shot
-- Run in Supabase SQL Editor. Safe to re-run (IF NOT EXISTS / idempotent).
-- ─────────────────────────────────────────────────────────────────────────

-- 1) Deals: canonical contract period (every model carries these) ----------
ALTER TABLE deals ADD COLUMN IF NOT EXISTS contract_start date;
ALTER TABLE deals ADD COLUMN IF NOT EXISTS contract_end   date;

-- 2) Deals: multi-year revenue recognition schedule (financed projects) ----
--    JSON e.g. { "FY26": 936200, "FY27": 237700, ... }
ALTER TABLE deals ADD COLUMN IF NOT EXISTS revenue_by_fy jsonb;

-- 3) SLAs: contract coverage (Scenario 4 — what the maintenance contract includes)
ALTER TABLE slas ADD COLUMN IF NOT EXISTS includes_updates   boolean NOT NULL DEFAULT false;
ALTER TABLE slas ADD COLUMN IF NOT EXISTS support_hours      integer;        -- NULL = no hours limit
ALTER TABLE slas ADD COLUMN IF NOT EXISTS support_hours_note text;

-- 4) Normalise legacy business_model values to the new taxonomy ------------
--    (UI also normalises on read, so this is a tidy-up — no data is lost,
--     only the model label is remapped; all financial columns are untouched.)
UPDATE deals SET business_model = 'subscription' WHERE business_model IN ('opex', 'saas');
UPDATE deals SET business_model = 'capex'        WHERE business_model = 'hybrid';

-- 5) Backfill contract_start/contract_end from existing cs_*/ce_* parts -----
--    so historical deals keep a contract period without manual re-entry.
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

-- VGT FY26 reconciliation (Apr+May) — SAP vs CRM deals
-- Conservative result: only clearly-new customers (no CRM match by name or value)
-- + 1 high-confidence flip. Ambiguous/likely-duplicate cases were excluded.
-- Run in Supabase SQL editor.

-- === 14 NEW deal cards (SAP customers with no matching CRM deal) ===
INSERT INTO public.deals (bu, sales_type, stage, client, country, deal_type, value_total, gm_pct, apr, may, currency, exchange_rate, invoice_date, rec_month, rec_year) VALUES
  ('VGT','External','Invoiced','SLICE DIMENSION LDA','Portugal','One-Shot', 15303.7, 0.9728, 15303.7, 0, 'EUR', 1.0, '2026-04-30', 'Apr', 2026),
  ('VGT','Internal','Invoiced','FUJIFILM MIDDLE EAST FZE','Portugal','One-Shot', 12865.03, 0.8601, 12865.03, 0, 'EUR', 1.0, '2026-04-30', 'Apr', 2026),
  ('VGT','External','Invoiced','Sindicato da Banca, Seguros e','Portugal','One-Shot', 3659.34, 0.8735, 3659.34, 0, 'EUR', 1.0, '2026-04-30', 'Apr', 2026),
  ('VGT','External','Invoiced','NEURON ARCADE, LDA','Portugal','One-Shot', 1500.0, 1.0, 1500.0, 0, 'EUR', 1.0, '2026-04-30', 'Apr', 2026),
  ('VGT','External','Invoiced','MCCARE, SERVIÇOS DE SAÚDE, S.A.','Portugal','One-Shot', 1143.34, 1.0, 1143.34, 0, 'EUR', 1.0, '2026-04-30', 'Apr', 2026),
  ('VGT','External','Invoiced','CIDIF - CENTRO DE IMAGIOLOGIA','Portugal','One-Shot', 500.0, 0.6575, 500.0, 0, 'EUR', 1.0, '2026-04-30', 'Apr', 2026),
  ('VGT','External','Invoiced','BANKINTER, S.A. – SUCURSAL EM PORTU','Portugal','One-Shot', 289.95, 0.0, 289.95, 0, 'EUR', 1.0, '2026-04-30', 'Apr', 2026),
  ('VGT','External','Invoiced','IMI - Imagens Médicas Integradas, S','Portugal','One-Shot', 161.66, 1.0, 161.66, 0, 'EUR', 1.0, '2026-04-30', 'Apr', 2026),
  ('VGT','Internal','Invoiced','FUJIFILM MIDDLE EAST FZE','Portugal','One-Shot', 44978.07, 0.9381, 0, 44978.07, 'EUR', 1.0, '2026-05-31', 'May', 2026),
  ('VGT','External','Invoiced','Sindicato da Banca, Seguros e','Portugal','One-Shot', 3781.32, 0.8775, 0, 3781.32, 'EUR', 1.0, '2026-05-31', 'May', 2026),
  ('VGT','External','Invoiced','NEURON ARCADE, LDA','Portugal','One-Shot', 1500.0, 1.0, 0, 1500.0, 'EUR', 1.0, '2026-05-31', 'May', 2026),
  ('VGT','External','Invoiced','MCCARE, SERVIÇOS DE SAÚDE, S.A.','Portugal','One-Shot', 1143.34, 1.0, 0, 1143.34, 'EUR', 1.0, '2026-05-31', 'May', 2026),
  ('VGT','External','Invoiced','CIDIF - CENTRO DE IMAGIOLOGIA','Portugal','One-Shot', 500.0, 0.6575, 0, 500.0, 'EUR', 1.0, '2026-05-31', 'May', 2026),
  ('VGT','External','Invoiced','IMI - Imagens Médicas Integradas, S','Portugal','One-Shot', 161.66, 1.0, 0, 161.66, 'EUR', 1.0, '2026-05-31', 'May', 2026);

-- === 1 high-confidence flip (BackLog → Invoiced) ===
-- 'Radelfe Licenciamento Datacenter PACS (NPL)' ← SAP 'Radelfe - Clínica de Radiologia de' 4093.53 (May)
UPDATE public.deals SET stage='Invoiced', may=4093.53, rec_month='May', rec_year=2026, updated_at=now()
WHERE id='e0590928-2700-46ec-a6e5-bb1d7da917c1';

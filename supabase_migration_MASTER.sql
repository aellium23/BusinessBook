-- ============================================================
-- BusinessBook FY26 — MASTER Migration
-- ============================================================
-- Date:        2026-06-02
-- Description: Consolidated, idempotent migration that creates
--              the complete BusinessBook schema from scratch on
--              a fresh Supabase project.
--
-- Instructions:
--   1. Open your Supabase Dashboard > SQL Editor > New query
--   2. Paste this entire file
--   3. Click "Run"
--   4. After your first login, promote yourself to admin:
--        UPDATE public.profiles
--        SET role = 'admin', full_name = 'Your Name'
--        WHERE email = 'your@email.here';
--
-- This file is fully idempotent — safe to re-run at any time.
-- It consolidates all 30 individual migration files and uses
-- the LATEST security fixes (20260602_security_rls_fix.sql).
--
-- Source files preserved (not deleted):
--   supabase_schema.sql
--   supabase_migration_20260414.sql  .. supabase_migration_20260602_security_rls_fix.sql
--   supabase_migration_ALL.sql
--   supabase_migration_fix_all_missing.sql
-- ============================================================


-- ████████████████████████████████████████████████████████████
-- §1  EXTENSIONS
-- ████████████████████████████████████████████████████████████

-- pgcrypto is enabled by default on Supabase (provides gen_random_uuid()).
-- If running on a self-hosted Postgres, uncomment:
-- CREATE EXTENSION IF NOT EXISTS pgcrypto;


-- ████████████████████████████████████████████████████████████
-- §2  HELPER FUNCTIONS
-- ████████████████████████████████████████████████████████████

-- Generic updated_at trigger (reused by many tables)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


-- ████████████████████████████████████████████████████████████
-- §3  TABLES  (dependency order)
-- ████████████████████████████████████████████████████████████

-- ────────────────────────────────────────────────────────────
-- 3.1  profiles
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id                  uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email               text,
  full_name           text,
  role                text NOT NULL DEFAULT 'viewer',
  bu                  text,
  active              boolean NOT NULL DEFAULT true,
  company_id          uuid,  -- FK added after companies table
  permission_set_id   uuid,  -- FK added after permission_sets table
  sales_owner_id      uuid,
  sales_owner_name    text,
  created_at          timestamptz DEFAULT now()
);

-- ────────────────────────────────────────────────────────────
-- 3.2  permission_sets
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.permission_sets (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  description text,
  color       text,
  pages       text,  -- JSON array stored as text
  can_edit    boolean DEFAULT false,
  edit_own    boolean DEFAULT false,
  can_delete  boolean DEFAULT false,
  see_all_bu  boolean DEFAULT false,
  is_system   boolean DEFAULT false,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

DROP TRIGGER IF EXISTS permission_sets_updated_at ON public.permission_sets;
CREATE TRIGGER permission_sets_updated_at
  BEFORE UPDATE ON public.permission_sets
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

ALTER TABLE public.permission_sets ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "permission_sets read" ON public.permission_sets;
CREATE POLICY "permission_sets read" ON public.permission_sets FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "permission_sets write" ON public.permission_sets;
CREATE POLICY "permission_sets write" ON public.permission_sets FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND active = true AND role = 'admin')
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND active = true AND role = 'admin')
);

-- ────────────────────────────────────────────────────────────
-- 3.3  regional_hubs
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.regional_hubs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  region      text,
  notes       text,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

DROP TRIGGER IF EXISTS regional_hubs_updated_at ON public.regional_hubs;
CREATE TRIGGER regional_hubs_updated_at
  BEFORE UPDATE ON public.regional_hubs
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

ALTER TABLE public.regional_hubs ENABLE ROW LEVEL SECURITY;

-- ────────────────────────────────────────────────────────────
-- 3.4  distributors
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.distributors (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  country     text,
  region      text,
  hub_id      uuid REFERENCES public.regional_hubs(id) ON DELETE SET NULL,
  sales_type  text DEFAULT 'external'
                CHECK (sales_type IN ('internal','external')),
  notes       text,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

DROP TRIGGER IF EXISTS distributors_updated_at ON public.distributors;
CREATE TRIGGER distributors_updated_at
  BEFORE UPDATE ON public.distributors
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

ALTER TABLE public.distributors ENABLE ROW LEVEL SECURITY;

-- ────────────────────────────────────────────────────────────
-- 3.5  companies
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.companies (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name             text NOT NULL,
  type             text,          -- 'distributor', 'internal_vgt', 'internal_ect', etc.
  bu               text,
  country          text,
  active           boolean DEFAULT true,
  default_currency text NOT NULL DEFAULT 'EUR',
  created_at       timestamptz DEFAULT now(),
  updated_at       timestamptz DEFAULT now()
);

DROP TRIGGER IF EXISTS companies_updated_at ON public.companies;
CREATE TRIGGER companies_updated_at
  BEFORE UPDATE ON public.companies
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "companies read" ON public.companies;
CREATE POLICY "companies read" ON public.companies FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND active = true));

DROP POLICY IF EXISTS "companies write" ON public.companies;
CREATE POLICY "companies write" ON public.companies FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND active = true AND role = 'admin')
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND active = true AND role = 'admin')
);

-- ── Add FK from profiles.company_id → companies.id ──
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_company_id_fkey'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_company_id_fkey
      FOREIGN KEY (company_id) REFERENCES public.companies(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ── Add FK from profiles.permission_set_id → permission_sets.id ──
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'profiles_permission_set_id_fkey'
  ) THEN
    ALTER TABLE public.profiles
      ADD CONSTRAINT profiles_permission_set_id_fkey
      FOREIGN KEY (permission_set_id) REFERENCES public.permission_sets(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- 3.6  accounts
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.accounts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bu              text NOT NULL CHECK (bu IN ('VGT','ECT')),
  name            text NOT NULL,
  parent_id       uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  country         text,
  region          text,
  client_type     text DEFAULT 'public'
                    CHECK (client_type IN ('public','private')),
  distributor_id  uuid REFERENCES public.distributors(id) ON DELETE SET NULL,
  active          boolean DEFAULT true,
  notes           text,
  created_by      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now()
);

DROP TRIGGER IF EXISTS accounts_updated_at ON public.accounts;
CREATE TRIGGER accounts_updated_at
  BEFORE UPDATE ON public.accounts
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;

-- ────────────────────────────────────────────────────────────
-- 3.7  deals
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.deals (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bu                    text NOT NULL CHECK (bu IN ('VGT','ECT')),
  sales_type            text DEFAULT 'External',
  stage                 text NOT NULL
                          CHECK (stage IN ('Lead','Pipeline','Offer Presented','BackLog','Invoiced','Lost')),
  forecast_category     text
                          CHECK (forecast_category IS NULL OR forecast_category IN ('commit','best_case','upside','omit')),
  client                text NOT NULL,
  region                text,
  country               text,
  sales_owner           text,
  deal_type             text DEFAULT 'One-Shot',
  description           text,
  product               text,
  business_model        text
                          CHECK (business_model IS NULL OR business_model IN ('capex','opex','saas','hybrid','pay_per_study')),
  warranty_months       int DEFAULT 36,
  value_total           numeric(14,2) DEFAULT 0,
  gm_pct                numeric(6,4) DEFAULT 0,
  -- Recognition / contract dates
  rec_month             text,
  rec_year              int,
  cs_day                int DEFAULT 1,
  cs_month              text,
  cs_year               int,
  ce_day                int DEFAULT 31,
  ce_month              text,
  ce_year               int,
  go_live_month         text,
  go_live_year          int,
  invoice_date          date,
  -- Monthly revenue (FY columns)
  apr numeric(12,2) DEFAULT 0, may numeric(12,2) DEFAULT 0,
  jun numeric(12,2) DEFAULT 0, jul numeric(12,2) DEFAULT 0,
  aug numeric(12,2) DEFAULT 0, sep numeric(12,2) DEFAULT 0,
  oct numeric(12,2) DEFAULT 0, nov numeric(12,2) DEFAULT 0,
  dec numeric(12,2) DEFAULT 0, jan numeric(12,2) DEFAULT 0,
  feb numeric(12,2) DEFAULT 0, mar numeric(12,2) DEFAULT 0,
  -- Currency
  currency              text DEFAULT 'EUR',
  exchange_rate         numeric(10,4) DEFAULT 1.0,
  -- SLA fields (legacy, kept for backward compat)
  is_sla                boolean DEFAULT false,
  sla_type              text,
  sla_owner             text,
  sla_annual_value      numeric(14,2),
  sla_billing_month     text,
  sla_billing_year      int,
  converted_to_sla      boolean DEFAULT false,
  -- Distribution chain (free-text legacy)
  end_customer          text,
  distributor           text,
  hub                   text,
  end_customer_value    numeric(14,2),
  -- Structured distribution network
  distribution_path     text
                          CHECK (distribution_path IS NULL OR distribution_path IN ('direct','hub_mediated')),
  distributor_id        uuid REFERENCES public.distributors(id) ON DELETE SET NULL,
  hub_id                uuid REFERENCES public.regional_hubs(id) ON DELETE SET NULL,
  vgt_cost              numeric(14,2),
  distributor_price     numeric(14,2),
  end_customer_price    numeric(14,2),
  -- Discount
  list_price            numeric(14,2),
  discount_requested    numeric(5,2),
  discount_note_dist    text,
  discount_note         text,
  discount_status       text,
  discount_approved     numeric(5,2),
  transfer_price        numeric(14,2),
  -- Win probability & lost reason
  win_probability       numeric(5,2),
  lost_reason           text,
  -- Equipment / volume
  equipment_count       int,
  annual_studies        int,
  annual_exams          int,
  -- Intercompany
  intercompany_value    numeric(14,2),
  linked_deal_id        uuid,
  is_intercompany_mirror boolean DEFAULT false,
  -- FK references
  account_id            uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  company_id            uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  created_by            uuid REFERENCES auth.users(id),
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

DROP TRIGGER IF EXISTS deals_updated_at ON public.deals;
CREATE TRIGGER deals_updated_at
  BEFORE UPDATE ON public.deals
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;

-- ────────────────────────────────────────────────────────────
-- 3.8  budget
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.budget (
  id       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bu       text NOT NULL CHECK (bu IN ('VGT','ECT')),
  cycle    text NOT NULL CHECK (cycle IN ('BUD','EST1','EST2')),
  pl_key   text NOT NULL,
  apr numeric(12,3) DEFAULT 0, may numeric(12,3) DEFAULT 0,
  jun numeric(12,3) DEFAULT 0, jul numeric(12,3) DEFAULT 0,
  aug numeric(12,3) DEFAULT 0, sep numeric(12,3) DEFAULT 0,
  oct numeric(12,3) DEFAULT 0, nov numeric(12,3) DEFAULT 0,
  dec numeric(12,3) DEFAULT 0, jan numeric(12,3) DEFAULT 0,
  feb numeric(12,3) DEFAULT 0, mar numeric(12,3) DEFAULT 0,
  updated_at timestamptz DEFAULT now(),
  UNIQUE (bu, cycle, pl_key)
);

ALTER TABLE public.budget ENABLE ROW LEVEL SECURITY;

-- ────────────────────────────────────────────────────────────
-- 3.9  pending_invites
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pending_invites (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email      text NOT NULL,
  role       text NOT NULL DEFAULT 'viewer',
  invited_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.pending_invites ENABLE ROW LEVEL SECURITY;

-- ────────────────────────────────────────────────────────────
-- 3.10  contacts
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.contacts (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bu           text NOT NULL CHECK (bu IN ('VGT','ECT')),
  client_name  text NOT NULL,
  full_name    text NOT NULL,
  role_type    text NOT NULL DEFAULT 'other'
                 CHECK (role_type IN ('decision_maker','champion','influencer','user','blocker','other')),
  job_title    text,
  email        text,
  phone        text,
  notes        text,
  is_primary   boolean NOT NULL DEFAULT false,
  country      text,
  created_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);

COMMENT ON COLUMN public.contacts.role_type IS
  'Stakeholder role in the decision-making unit: decision_maker | champion | influencer | user | blocker | other';

DROP TRIGGER IF EXISTS contacts_updated_at ON public.contacts;
CREATE TRIGGER contacts_updated_at
  BEFORE UPDATE ON public.contacts
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

-- ────────────────────────────────────────────────────────────
-- 3.11  quotas
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.quotas (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bu            text NOT NULL CHECK (bu IN ('VGT','ECT')),
  sales_owner   text NOT NULL,
  target_eur    numeric(14,2) DEFAULT 0,
  fiscal_year   int DEFAULT 2026,
  sub_targets   jsonb DEFAULT '{}'::jsonb,
  company_id    uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  created_at    timestamptz DEFAULT now(),
  updated_at    timestamptz DEFAULT now()
);

COMMENT ON COLUMN public.quotas.sub_targets IS
  'Breakdown of target_eur per product family, e.g. {"CWM Dose": 1000000, "AI Reporting": 500000}';

DROP TRIGGER IF EXISTS quotas_updated_at ON public.quotas;
CREATE TRIGGER quotas_updated_at
  BEFORE UPDATE ON public.quotas
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

ALTER TABLE public.quotas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "quotas read" ON public.quotas;
CREATE POLICY "quotas read" ON public.quotas FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND active = true));

DROP POLICY IF EXISTS "quotas write" ON public.quotas;
CREATE POLICY "quotas write" ON public.quotas FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND active = true AND role = 'admin')
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND active = true AND role = 'admin')
);

-- ────────────────────────────────────────────────────────────
-- 3.12  tenders
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tenders (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title               text NOT NULL,
  reference           text,
  description         text,
  status              text NOT NULL DEFAULT 'open',
  submission_deadline date,
  decision_date       date,
  estimated_value     numeric(14,2),
  currency            text DEFAULT 'EUR',
  bu                  text CHECK (bu IS NULL OR bu IN ('VGT','ECT')),
  deal_id             uuid REFERENCES public.deals(id) ON DELETE SET NULL,
  company_id          uuid REFERENCES public.companies(id) ON DELETE SET NULL,
  created_by          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

DROP TRIGGER IF EXISTS tenders_updated_at ON public.tenders;
CREATE TRIGGER tenders_updated_at
  BEFORE UPDATE ON public.tenders
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

ALTER TABLE public.tenders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tenders read" ON public.tenders;
CREATE POLICY "tenders read" ON public.tenders FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND active = true));

DROP POLICY IF EXISTS "tenders write" ON public.tenders;
CREATE POLICY "tenders write" ON public.tenders FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND active = true AND role IN ('admin','manager','member'))
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND active = true AND role IN ('admin','manager','member'))
);

-- ────────────────────────────────────────────────────────────
-- 3.13  tender_collaborators
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tender_collaborators (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tender_id   uuid NOT NULL REFERENCES public.tenders(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role        text DEFAULT 'member',
  created_at  timestamptz DEFAULT now(),
  UNIQUE(tender_id, user_id)
);

ALTER TABLE public.tender_collaborators ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tender_collaborators read" ON public.tender_collaborators;
CREATE POLICY "tender_collaborators read" ON public.tender_collaborators FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND active = true));

DROP POLICY IF EXISTS "tender_collaborators write" ON public.tender_collaborators;
CREATE POLICY "tender_collaborators write" ON public.tender_collaborators FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND active = true AND role IN ('admin','manager','member'))
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND active = true AND role IN ('admin','manager','member'))
);

-- ────────────────────────────────────────────────────────────
-- 3.14  tender_requirements
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tender_requirements (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tender_id    uuid NOT NULL REFERENCES public.tenders(id) ON DELETE CASCADE,
  title        text NOT NULL,
  description  text,
  category     text NOT NULL DEFAULT 'other'
                 CHECK (category IN ('regulatory','technical','commercial','administrative','other')),
  status       text NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending','in_progress','complete','na')),
  assignee_id  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  due_date     date,
  notes        text,
  sort_order   int NOT NULL DEFAULT 0,
  created_by   uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz DEFAULT now(),
  updated_at   timestamptz DEFAULT now()
);

DROP TRIGGER IF EXISTS tender_requirements_updated_at ON public.tender_requirements;
CREATE TRIGGER tender_requirements_updated_at
  BEFORE UPDATE ON public.tender_requirements
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

ALTER TABLE public.tender_requirements ENABLE ROW LEVEL SECURITY;

-- ────────────────────────────────────────────────────────────
-- 3.15  tender_requirement_templates
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tender_requirement_templates (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title        text NOT NULL,
  description  text,
  category     text NOT NULL DEFAULT 'other'
                 CHECK (category IN ('regulatory','technical','commercial','administrative','other')),
  sort_order   int NOT NULL DEFAULT 0,
  active       boolean NOT NULL DEFAULT true,
  created_at   timestamptz DEFAULT now()
);

ALTER TABLE public.tender_requirement_templates ENABLE ROW LEVEL SECURITY;

-- ────────────────────────────────────────────────────────────
-- 3.16  attachments
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.attachments (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type  text NOT NULL CHECK (entity_type IN ('deal','tender')),
  entity_id    uuid NOT NULL,
  storage_path text NOT NULL,
  file_name    text NOT NULL,
  size_bytes   bigint NOT NULL,
  mime_type    text,
  uploaded_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   timestamptz DEFAULT now()
);

ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;

-- ────────────────────────────────────────────────────────────
-- 3.17  products
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.products (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category              text NOT NULL,
  sku                   text,
  name                  text NOT NULL,
  description           text,
  license_fee           numeric(12,2) DEFAULT 0,
  annual_fee            numeric(12,2) DEFAULT 0,
  pricing_model         text DEFAULT 'license_plus_annual'
                          CHECK (pricing_model IN ('license_plus_annual','subscription','pay_per_study','saas')),
  bu                    text NOT NULL DEFAULT 'VGT' CHECK (bu IN ('VGT','ECT')),
  active                boolean DEFAULT true,
  distributor_visible   boolean DEFAULT true,
  sort_order            int DEFAULT 0,
  allowed_license_types  jsonb DEFAULT '["flat"]'::jsonb,
  allowed_pricing_models jsonb DEFAULT '["license_plus_annual"]'::jsonb,
  created_at            timestamptz DEFAULT now(),
  updated_at            timestamptz DEFAULT now()
);

DROP TRIGGER IF EXISTS products_updated_at ON public.products;
CREATE TRIGGER products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;

-- ────────────────────────────────────────────────────────────
-- 3.18  product_components
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.product_components (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id    uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  component_id  uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity      int DEFAULT 1,
  included      boolean DEFAULT true,
  notes         text,
  created_at    timestamptz DEFAULT now(),
  UNIQUE(product_id, component_id)
);

ALTER TABLE public.product_components ENABLE ROW LEVEL SECURITY;

-- ────────────────────────────────────────────────────────────
-- 3.19  deal_products
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.deal_products (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id       uuid NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  product_id    uuid REFERENCES public.products(id) ON DELETE SET NULL,
  product_name  text NOT NULL,
  quantity      int DEFAULT 1,
  unit_price    numeric(12,2) DEFAULT 0,
  discount_pct  numeric(5,2) DEFAULT 0,
  net_price     numeric(12,2) DEFAULT 0,
  annual_fee    numeric(12,2) DEFAULT 0,
  license_type  text DEFAULT 'flat'
                  CHECK (license_type IN ('per_equipment','per_volume','per_package','per_ccu','flat')),
  volume        int,
  package_size  int,
  cost_price    numeric(12,2) DEFAULT 0,
  margin_pct    numeric(5,2) DEFAULT 0,
  notes         text,
  created_at    timestamptz DEFAULT now()
);

ALTER TABLE public.deal_products ENABLE ROW LEVEL SECURITY;

-- ────────────────────────────────────────────────────────────
-- 3.20  tender_products
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tender_products (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tender_id     uuid NOT NULL REFERENCES public.tenders(id) ON DELETE CASCADE,
  product_id    uuid REFERENCES public.products(id) ON DELETE SET NULL,
  product_name  text NOT NULL,
  quantity      int DEFAULT 1,
  unit_price    numeric(12,2) DEFAULT 0,
  notes         text,
  created_at    timestamptz DEFAULT now()
);

ALTER TABLE public.tender_products ENABLE ROW LEVEL SECURITY;

-- ────────────────────────────────────────────────────────────
-- 3.21  slas (contracts)
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.slas (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id                uuid REFERENCES public.deals(id) ON DELETE SET NULL,
  bu                     text NOT NULL CHECK (bu IN ('VGT','ECT')),
  client                 text NOT NULL,
  description            text,
  sla_type               text,
  status                 text NOT NULL DEFAULT 'draft'
                           CHECK (status IN ('draft','waiting_po','warranty','active','pending_renewal','renewed','expired','cancelled')),
  sla_owner              text,
  deal_owner             text,
  annual_value           numeric(14,2) DEFAULT 0,
  currency               text DEFAULT 'EUR',
  exchange_rate          numeric(10,4) DEFAULT 1.0,
  warranty_months        int,
  warranty_end_date      date,
  start_date             date,
  end_date               date,
  contract_duration_years int DEFAULT 1,
  renewal_date           date,
  invoice_date           date,
  revenue_by_fy          jsonb DEFAULT '{}'::jsonb,
  billing_month          text,
  billing_year           int,
  billing_model          text DEFAULT 'fixed'
                           CHECK (billing_model IN ('fixed','pay_per_study_variable','pay_per_study_estimated')),
  billing_frequency      text DEFAULT 'annual'
                           CHECK (billing_frequency IN ('monthly','quarterly','semi_annual','annual')),
  price_per_study        numeric(10,2),
  estimated_annual_studies int,
  renewal_target_pct     numeric(5,2),
  renewal_notes          text,
  previous_value         numeric(14,2),
  change_reason          text,
  change_date            date,
  account_id             uuid REFERENCES public.accounts(id) ON DELETE SET NULL,
  country                text,
  region                 text,
  product                text,
  created_by             uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at             timestamptz DEFAULT now(),
  updated_at             timestamptz DEFAULT now()
);

DROP TRIGGER IF EXISTS slas_updated_at ON public.slas;
CREATE TRIGGER slas_updated_at
  BEFORE UPDATE ON public.slas
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

ALTER TABLE public.slas ENABLE ROW LEVEL SECURITY;

-- ────────────────────────────────────────────────────────────
-- 3.22  sla_products
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sla_products (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sla_id            uuid NOT NULL REFERENCES public.slas(id) ON DELETE CASCADE,
  product_id        uuid REFERENCES public.products(id) ON DELETE SET NULL,
  product_name      text,
  quantity          int DEFAULT 1,
  contracted_volume int,
  unit_price        numeric(12,2),
  annual_value      numeric(12,2),
  notes             text,
  created_at        timestamptz DEFAULT now()
);

ALTER TABLE public.sla_products ENABLE ROW LEVEL SECURITY;

-- ────────────────────────────────────────────────────────────
-- 3.23  sla_usage
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sla_usage (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sla_id            uuid NOT NULL REFERENCES public.slas(id) ON DELETE CASCADE,
  sla_product_id    uuid REFERENCES public.sla_products(id) ON DELETE SET NULL,
  period_start      date NOT NULL,
  period_end        date NOT NULL,
  contracted_volume int,
  actual_volume     int DEFAULT 0,
  overage           int GENERATED ALWAYS AS (GREATEST(actual_volume - COALESCE(contracted_volume, 0), 0)) STORED,
  overage_value     numeric(12,2),
  notes             text,
  recorded_by       uuid REFERENCES auth.users(id),
  created_at        timestamptz DEFAULT now()
);

ALTER TABLE public.sla_usage ENABLE ROW LEVEL SECURITY;

-- ────────────────────────────────────────────────────────────
-- 3.24  company_product_authorizations
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.company_product_authorizations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  product_id  uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  country     text NOT NULL,
  price       numeric(12,2),
  active      boolean DEFAULT true,
  created_at  timestamptz DEFAULT now(),
  UNIQUE(company_id, product_id, country)
);

ALTER TABLE public.company_product_authorizations ENABLE ROW LEVEL SECURITY;

-- ────────────────────────────────────────────────────────────
-- 3.25  forecast_snapshots
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.forecast_snapshots (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle       text NOT NULL CHECK (cycle IN ('BUD','EST1','EST2')),
  bu          text NOT NULL CHECK (bu IN ('VGT','ECT')),
  pl_key      text NOT NULL CHECK (pl_key IN ('ns_int','ns_ext')),
  apr numeric(12,3) DEFAULT 0, may numeric(12,3) DEFAULT 0,
  jun numeric(12,3) DEFAULT 0, jul numeric(12,3) DEFAULT 0,
  aug numeric(12,3) DEFAULT 0, sep numeric(12,3) DEFAULT 0,
  oct numeric(12,3) DEFAULT 0, nov numeric(12,3) DEFAULT 0,
  dec numeric(12,3) DEFAULT 0, jan numeric(12,3) DEFAULT 0,
  feb numeric(12,3) DEFAULT 0, mar numeric(12,3) DEFAULT 0,
  is_locked   boolean DEFAULT false,
  notes       text,
  created_by  uuid REFERENCES auth.users(id),
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE public.forecast_snapshots ENABLE ROW LEVEL SECURITY;

-- ────────────────────────────────────────────────────────────
-- 3.26  audit_log
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.audit_log (
  id           bigserial PRIMARY KEY,
  at           timestamptz NOT NULL DEFAULT now(),
  actor_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  actor_email  text,
  action       text NOT NULL CHECK (action IN ('insert','update','delete')),
  table_name   text NOT NULL,
  record_id    uuid,
  changed      jsonb,
  snapshot     jsonb
);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

-- ────────────────────────────────────────────────────────────
-- 3.27  tasks
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tasks (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text NOT NULL,
  notes       text,
  status      text NOT NULL DEFAULT 'open'
                CHECK (status IN ('open','done')),
  priority    text DEFAULT 'medium'
                CHECK (priority IN ('low','medium','high')),
  deadline    date,
  deal_id     uuid REFERENCES public.deals(id) ON DELETE SET NULL,
  owner_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_to uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at  timestamptz DEFAULT now(),
  updated_at  timestamptz DEFAULT now()
);

DROP TRIGGER IF EXISTS tasks_updated_at ON public.tasks;
CREATE TRIGGER tasks_updated_at
  BEFORE UPDATE ON public.tasks
  FOR EACH ROW EXECUTE PROCEDURE public.set_updated_at();

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tasks read" ON public.tasks;
CREATE POLICY "tasks read" ON public.tasks FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND active = true));

DROP POLICY IF EXISTS "tasks write" ON public.tasks;
CREATE POLICY "tasks write" ON public.tasks FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND active = true)
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND active = true)
);

-- ────────────────────────────────────────────────────────────
-- 3.28  notifications
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notifications (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type        text,
  title       text,
  body        text,
  link_type   text,
  link_id     uuid,
  read        boolean DEFAULT false,
  created_at  timestamptz DEFAULT now()
);

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications read" ON public.notifications;
CREATE POLICY "notifications read" ON public.notifications FOR SELECT
  USING (user_id = auth.uid());

DROP POLICY IF EXISTS "notifications write" ON public.notifications;
CREATE POLICY "notifications write" ON public.notifications FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND active = true)
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND active = true)
);

-- ────────────────────────────────────────────────────────────
-- 3.29  app_settings
-- ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.app_settings (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  config     jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;


-- ████████████████████████████████████████████████████████████
-- §4  INDEXES
-- ████████████████████████████████████████████████████████████

-- profiles
CREATE INDEX IF NOT EXISTS profiles_role_idx    ON public.profiles (role);
CREATE INDEX IF NOT EXISTS profiles_company_idx ON public.profiles (company_id);

-- accounts
CREATE INDEX IF NOT EXISTS accounts_bu_name_idx ON public.accounts (bu, lower(name));
CREATE INDEX IF NOT EXISTS accounts_parent_idx  ON public.accounts (parent_id);

-- deals
CREATE INDEX IF NOT EXISTS deals_bu_forecast_idx  ON public.deals (bu, forecast_category);
CREATE INDEX IF NOT EXISTS deals_account_idx      ON public.deals (account_id);
CREATE INDEX IF NOT EXISTS deals_distributor_idx   ON public.deals (distributor_id);
CREATE INDEX IF NOT EXISTS deals_hub_idx           ON public.deals (hub_id);
CREATE INDEX IF NOT EXISTS deals_company_idx       ON public.deals (company_id);

-- contacts
CREATE INDEX IF NOT EXISTS contacts_bu_client_idx ON public.contacts (bu, lower(client_name));
CREATE INDEX IF NOT EXISTS contacts_name_idx      ON public.contacts (lower(full_name));

-- attachments
CREATE INDEX IF NOT EXISTS attachments_entity_idx ON public.attachments (entity_type, entity_id);

-- tender_requirements
CREATE INDEX IF NOT EXISTS tender_requirements_tender_idx ON public.tender_requirements (tender_id);

-- products
CREATE INDEX IF NOT EXISTS products_category_idx ON public.products (category);
CREATE INDEX IF NOT EXISTS products_bu_idx       ON public.products (bu, active);
CREATE UNIQUE INDEX IF NOT EXISTS products_sku_unique ON public.products (sku) WHERE sku IS NOT NULL;

-- product_components
CREATE INDEX IF NOT EXISTS product_components_product_idx   ON public.product_components (product_id);
CREATE INDEX IF NOT EXISTS product_components_component_idx ON public.product_components (component_id);

-- deal_products
CREATE INDEX IF NOT EXISTS deal_products_deal_idx ON public.deal_products (deal_id);

-- tender_products
CREATE INDEX IF NOT EXISTS tender_products_tender_idx ON public.tender_products (tender_id);

-- slas
CREATE INDEX IF NOT EXISTS slas_deal_idx      ON public.slas (deal_id);
CREATE INDEX IF NOT EXISTS slas_bu_status_idx ON public.slas (bu, status);
CREATE INDEX IF NOT EXISTS slas_owner_idx     ON public.slas (lower(sla_owner));
CREATE INDEX IF NOT EXISTS slas_client_idx    ON public.slas (bu, lower(client));

-- sla_products
CREATE INDEX IF NOT EXISTS sla_products_sla_idx ON public.sla_products (sla_id);

-- sla_usage
CREATE INDEX IF NOT EXISTS sla_usage_sla_idx    ON public.sla_usage (sla_id);
CREATE INDEX IF NOT EXISTS sla_usage_period_idx ON public.sla_usage (period_start, period_end);

-- company_product_authorizations
CREATE INDEX IF NOT EXISTS cpa_company_idx ON public.company_product_authorizations (company_id);
CREATE INDEX IF NOT EXISTS cpa_product_idx ON public.company_product_authorizations (product_id);

-- forecast_snapshots
CREATE INDEX IF NOT EXISTS idx_fct_latest ON public.forecast_snapshots (cycle, bu, pl_key, created_at DESC);

-- audit_log
CREATE INDEX IF NOT EXISTS audit_log_time_idx   ON public.audit_log (at DESC);
CREATE INDEX IF NOT EXISTS audit_log_table_idx  ON public.audit_log (table_name, at DESC);
CREATE INDEX IF NOT EXISTS audit_log_actor_idx  ON public.audit_log (actor_id, at DESC);
CREATE INDEX IF NOT EXISTS audit_log_record_idx ON public.audit_log (record_id);

-- notifications
CREATE INDEX IF NOT EXISTS notifications_user_idx ON public.notifications (user_id, created_at DESC);

-- regional_hubs
CREATE UNIQUE INDEX IF NOT EXISTS regional_hubs_name_idx ON public.regional_hubs (lower(name));

-- distributors
CREATE INDEX IF NOT EXISTS distributors_country_idx      ON public.distributors (lower(country));
CREATE INDEX IF NOT EXISTS distributors_hub_idx           ON public.distributors (hub_id);
CREATE UNIQUE INDEX IF NOT EXISTS distributors_name_country_idx
  ON public.distributors (lower(name), COALESCE(lower(country),''));


-- ████████████████████████████████████████████████████████████
-- §5  RLS POLICIES
-- ████████████████████████████████████████████████████████████
-- Uses the LATEST security fixes from 20260602_security_rls_fix.sql
-- and 20260424_security_v2.sql.

-- ── 5.1  profiles ─────────────────────────────────────────
DROP POLICY IF EXISTS "own profile" ON public.profiles;
CREATE POLICY "own profile" ON public.profiles FOR SELECT
  USING (auth.uid() = id);

DROP POLICY IF EXISTS "admin see all" ON public.profiles;
CREATE POLICY "admin see all" ON public.profiles FOR SELECT
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

DROP POLICY IF EXISTS "admin update" ON public.profiles;
CREATE POLICY "admin update" ON public.profiles FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- ── 5.2  deals (SECURITY FIX 2026-06-02) ─────────────────
-- Supersedes all previous deals read policies.
-- Distributors are now scoped to their own company_id.
DROP POLICY IF EXISTS "admin all deals" ON public.deals;
DROP POLICY IF EXISTS "vgt select" ON public.deals;
DROP POLICY IF EXISTS "vgt insert" ON public.deals;
DROP POLICY IF EXISTS "vgt update" ON public.deals;
DROP POLICY IF EXISTS "vgt delete" ON public.deals;
DROP POLICY IF EXISTS "ect select" ON public.deals;
DROP POLICY IF EXISTS "ect insert" ON public.deals;
DROP POLICY IF EXISTS "ect update" ON public.deals;
DROP POLICY IF EXISTS "ect delete" ON public.deals;
DROP POLICY IF EXISTS "viewer read all" ON public.deals;
DROP POLICY IF EXISTS "viewer read own bu" ON public.deals;
DROP POLICY IF EXISTS "deals read" ON public.deals;

CREATE POLICY "deals read" ON public.deals FOR SELECT USING (
  -- Admin sees all
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND active = true AND role = 'admin'
  )
  -- Manager / member sees own BU
  OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND active = true
      AND role IN ('manager', 'member') AND bu = deals.bu
  )
  -- Distributor sees only own company's deals
  OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND active = true
      AND role = 'distributor'
      AND company_id = deals.company_id
      AND company_id IS NOT NULL
  )
  -- Viewer / partner sees own BU (read-only enforced elsewhere)
  OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND active = true
      AND role IN ('viewer', 'partner') AND bu = deals.bu
  )
);

DROP POLICY IF EXISTS "deals write" ON public.deals;
CREATE POLICY "deals write" ON public.deals FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND active = true AND role = 'admin')
  OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND active = true AND bu = deals.bu)
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND active = true AND role = 'admin')
  OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND active = true AND bu = deals.bu)
);

-- ── 5.3  budget ───────────────────────────────────────────
DROP POLICY IF EXISTS "admin manage budget" ON public.budget;
CREATE POLICY "admin manage budget" ON public.budget FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND active = true AND role = 'admin'));

DROP POLICY IF EXISTS "all read budget" ON public.budget;
DROP POLICY IF EXISTS "bu read budget" ON public.budget;
CREATE POLICY "bu read budget" ON public.budget FOR SELECT USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.active = true
      AND (p.role = 'admin' OR p.bu = budget.bu)
  )
);

-- ── 5.4  pending_invites ──────────────────────────────────
DROP POLICY IF EXISTS "admin manage invites" ON public.pending_invites;
CREATE POLICY "admin manage invites" ON public.pending_invites FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND active = true AND role = 'admin'));

-- ── 5.5  contacts ─────────────────────────────────────────
DROP POLICY IF EXISTS "contacts read" ON public.contacts;
CREATE POLICY "contacts read" ON public.contacts FOR SELECT USING (
  auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin')
  OR auth.uid() IN (SELECT id FROM public.profiles WHERE bu = contacts.bu)
);

DROP POLICY IF EXISTS "contacts write" ON public.contacts;
CREATE POLICY "contacts write" ON public.contacts FOR ALL USING (
  auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin')
  OR auth.uid() IN (SELECT id FROM public.profiles WHERE bu = contacts.bu)
) WITH CHECK (
  auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin')
  OR auth.uid() IN (SELECT id FROM public.profiles WHERE bu = contacts.bu)
);

-- ── 5.6  accounts ─────────────────────────────────────────
DROP POLICY IF EXISTS "accounts read" ON public.accounts;
CREATE POLICY "accounts read" ON public.accounts FOR SELECT USING (
  auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin')
  OR auth.uid() IN (SELECT id FROM public.profiles WHERE bu = accounts.bu)
);

DROP POLICY IF EXISTS "accounts write" ON public.accounts;
CREATE POLICY "accounts write" ON public.accounts FOR ALL USING (
  auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin')
  OR auth.uid() IN (SELECT id FROM public.profiles WHERE bu = accounts.bu)
) WITH CHECK (
  auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin')
  OR auth.uid() IN (SELECT id FROM public.profiles WHERE bu = accounts.bu)
);

-- ── 5.7  regional_hubs ────────────────────────────────────
DROP POLICY IF EXISTS "hubs read" ON public.regional_hubs;
CREATE POLICY "hubs read" ON public.regional_hubs FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "hubs admin write" ON public.regional_hubs;
CREATE POLICY "hubs admin write" ON public.regional_hubs FOR ALL USING (
  auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin')
) WITH CHECK (
  auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin')
);

-- ── 5.8  distributors ─────────────────────────────────────
DROP POLICY IF EXISTS "distributors read" ON public.distributors;
CREATE POLICY "distributors read" ON public.distributors FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "distributors write" ON public.distributors;
CREATE POLICY "distributors write" ON public.distributors FOR ALL USING (
  auth.uid() IN (SELECT id FROM public.profiles WHERE role IN ('admin'))
  OR auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'manager')
) WITH CHECK (
  auth.uid() IN (SELECT id FROM public.profiles WHERE role IN ('admin'))
  OR auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'manager')
);

-- ── 5.9  attachments ──────────────────────────────────────
DROP POLICY IF EXISTS "attachments read" ON public.attachments;
CREATE POLICY "attachments read" ON public.attachments FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  OR (entity_type = 'deal'   AND EXISTS (SELECT 1 FROM public.deals   d WHERE d.id = entity_id))
  OR (entity_type = 'tender' AND EXISTS (SELECT 1 FROM public.tenders t WHERE t.id = entity_id))
);

DROP POLICY IF EXISTS "attachments insert" ON public.attachments;
CREATE POLICY "attachments insert" ON public.attachments FOR INSERT
  WITH CHECK (auth.uid() IS NOT NULL AND uploaded_by = auth.uid());

DROP POLICY IF EXISTS "attachments delete" ON public.attachments;
CREATE POLICY "attachments delete" ON public.attachments FOR DELETE USING (
  uploaded_by = auth.uid()
  OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

-- ── 5.10  tender_requirements ─────────────────────────────
DROP POLICY IF EXISTS "tender_requirements read" ON public.tender_requirements;
CREATE POLICY "tender_requirements read" ON public.tender_requirements FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.tenders t WHERE t.id = tender_id)
);

DROP POLICY IF EXISTS "tender_requirements write" ON public.tender_requirements;
CREATE POLICY "tender_requirements write" ON public.tender_requirements FOR ALL USING (
  EXISTS (SELECT 1 FROM public.tenders t WHERE t.id = tender_id)
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.tenders t WHERE t.id = tender_id)
);

-- ── 5.11  tender_requirement_templates ────────────────────
DROP POLICY IF EXISTS "templates read" ON public.tender_requirement_templates;
CREATE POLICY "templates read" ON public.tender_requirement_templates FOR SELECT
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "templates admin write" ON public.tender_requirement_templates;
CREATE POLICY "templates admin write" ON public.tender_requirement_templates FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);

-- ── 5.12  products (SECURITY FIX — active=true) ──────────
DROP POLICY IF EXISTS "products read" ON public.products;
CREATE POLICY "products read" ON public.products FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND active = true)
);

DROP POLICY IF EXISTS "products write" ON public.products;
CREATE POLICY "products write" ON public.products FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND active = true AND role = 'admin')
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND active = true AND role = 'admin')
);

-- ── 5.13  product_components ──────────────────────────────
DROP POLICY IF EXISTS "product_components read" ON public.product_components;
CREATE POLICY "product_components read" ON public.product_components FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND active = true)
);

DROP POLICY IF EXISTS "product_components write" ON public.product_components;
CREATE POLICY "product_components write" ON public.product_components FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND active = true AND role = 'admin')
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND active = true AND role = 'admin')
);

-- ── 5.14  deal_products (SECURITY FIX 2026-06-02) ────────
-- Distributors scoped to their own company's deals.
DROP POLICY IF EXISTS "deal_products read" ON public.deal_products;
CREATE POLICY "deal_products read" ON public.deal_products FOR SELECT USING (
  -- Admin sees all
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND active = true AND role = 'admin'
  )
  -- Manager sees own BU
  OR EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND active = true AND role = 'manager'
      AND bu IN (SELECT bu FROM public.deals WHERE id = deal_products.deal_id)
  )
  -- Others see only deals linked to their company (distributors)
  -- or deals in their BU (members / viewers / partners)
  OR EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.active = true
      AND (
        -- Company-scoped access (distributors)
        (p.company_id IS NOT NULL AND EXISTS (
          SELECT 1 FROM public.deals d
          WHERE d.id = deal_products.deal_id AND d.company_id = p.company_id
        ))
        -- BU-scoped access (members, viewers, partners)
        OR (p.company_id IS NULL AND p.bu IN (
          SELECT bu FROM public.deals WHERE id = deal_products.deal_id
        ))
      )
  )
);

-- SECURITY FIX v2: active=true on write
DROP POLICY IF EXISTS "deal_products write" ON public.deal_products;
CREATE POLICY "deal_products write" ON public.deal_products FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND active = true AND role IN ('admin','manager'))
  OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND active = true AND bu IN (
    SELECT bu FROM public.deals WHERE id = deal_products.deal_id
  ))
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND active = true AND role IN ('admin','manager'))
  OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND active = true AND bu IN (
    SELECT bu FROM public.deals WHERE id = deal_products.deal_id
  ))
);

-- ── 5.14b deal_products_v (column-level security VIEW) ───
-- PostgreSQL RLS filters rows, not columns. This view hides
-- cost_price and margin_pct from non-admin/non-manager roles.
-- The app should query deal_products_v for SELECT operations
-- by distributors, members, viewers, and partners.
-- INSERT/UPDATE/DELETE should still target deal_products.
DROP VIEW IF EXISTS public.deal_products_v;

CREATE OR REPLACE VIEW public.deal_products_v AS
SELECT
  dp.id,
  dp.deal_id,
  dp.product_id,
  dp.product_name,
  dp.license_type,
  dp.quantity,
  dp.volume,
  dp.package_size,
  dp.unit_price,
  dp.net_price,
  dp.discount_pct,
  dp.annual_fee,
  dp.notes,
  dp.created_at,
  CASE WHEN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'manager')
  ) THEN dp.cost_price ELSE NULL END AS cost_price,
  CASE WHEN EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role IN ('admin', 'manager')
  ) THEN dp.margin_pct ELSE NULL END AS margin_pct
FROM public.deal_products dp;

GRANT SELECT ON public.deal_products_v TO authenticated;

COMMENT ON VIEW public.deal_products_v IS
  'Security view over deal_products. Hides cost_price and margin_pct for non-admin/non-manager roles.';

-- ── 5.15  tender_products (SECURITY FIX v2) ──────────────
DROP POLICY IF EXISTS "tender_products read" ON public.tender_products;
CREATE POLICY "tender_products read" ON public.tender_products FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND active = true)
);

DROP POLICY IF EXISTS "tender_products write" ON public.tender_products;
CREATE POLICY "tender_products write" ON public.tender_products FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND active = true AND role IN ('admin','manager','member'))
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND active = true AND role IN ('admin','manager','member'))
);

-- ── 5.16  slas (SECURITY FIX v2) ─────────────────────────
-- Only admin or manager of the same BU can write.
DROP POLICY IF EXISTS "slas read" ON public.slas;
CREATE POLICY "slas read" ON public.slas FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND active = true AND role = 'admin')
  OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND active = true AND bu = slas.bu)
);

DROP POLICY IF EXISTS "slas write" ON public.slas;
CREATE POLICY "slas write" ON public.slas FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND active = true AND role = 'admin')
  OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND active = true AND role = 'manager' AND bu = slas.bu)
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND active = true AND role = 'admin')
  OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND active = true AND role = 'manager' AND bu = slas.bu)
);

-- ── 5.17  sla_products (SECURITY FIX — active=true) ──────
DROP POLICY IF EXISTS "sla_products read" ON public.sla_products;
CREATE POLICY "sla_products read" ON public.sla_products FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND active = true AND role = 'admin')
  OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND active = true AND bu IN (
    SELECT bu FROM public.slas WHERE id = sla_products.sla_id
  ))
);

DROP POLICY IF EXISTS "sla_products write" ON public.sla_products;
CREATE POLICY "sla_products write" ON public.sla_products FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND active = true AND role IN ('admin','manager'))
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND active = true AND role IN ('admin','manager'))
);

-- ── 5.18  sla_usage (SECURITY FIX — active=true) ─────────
DROP POLICY IF EXISTS "sla_usage read" ON public.sla_usage;
CREATE POLICY "sla_usage read" ON public.sla_usage FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND active = true AND role = 'admin')
  OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND active = true AND bu IN (
    SELECT bu FROM public.slas WHERE id = sla_usage.sla_id
  ))
);

DROP POLICY IF EXISTS "sla_usage write" ON public.sla_usage;
CREATE POLICY "sla_usage write" ON public.sla_usage FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND active = true AND role IN ('admin','manager'))
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND active = true AND role IN ('admin','manager'))
);

-- ── 5.19  company_product_authorizations ──────────────────
DROP POLICY IF EXISTS "cpa read" ON public.company_product_authorizations;
CREATE POLICY "cpa read" ON public.company_product_authorizations FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND active = true)
);

DROP POLICY IF EXISTS "cpa write" ON public.company_product_authorizations;
CREATE POLICY "cpa write" ON public.company_product_authorizations FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND active = true AND role = 'admin')
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND active = true AND role = 'admin')
);

-- ── 5.20  forecast_snapshots ──────────────────────────────
DROP POLICY IF EXISTS "fct read" ON public.forecast_snapshots;
CREATE POLICY "fct read" ON public.forecast_snapshots FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND active = true)
);

DROP POLICY IF EXISTS "fct write" ON public.forecast_snapshots;
CREATE POLICY "fct write" ON public.forecast_snapshots FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND active = true AND role = 'admin')
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND active = true AND role = 'admin')
);

-- ── 5.21  audit_log ───────────────────────────────────────
DROP POLICY IF EXISTS "audit read admins" ON public.audit_log;
CREATE POLICY "audit read admins" ON public.audit_log FOR SELECT USING (
  auth.uid() IN (SELECT id FROM public.profiles WHERE role = 'admin')
);

-- ── 5.22  app_settings ────────────────────────────────────
DROP POLICY IF EXISTS "settings read" ON public.app_settings;
CREATE POLICY "settings read" ON public.app_settings FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND active = true)
);

DROP POLICY IF EXISTS "settings write" ON public.app_settings;
CREATE POLICY "settings write" ON public.app_settings FOR ALL USING (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND active = true AND role = 'admin')
) WITH CHECK (
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND active = true AND role = 'admin')
);


-- ████████████████████████████████████████████████████████████
-- §6  FUNCTIONS
-- ████████████████████████████████████████████████████████████

-- ── 6.1  handle_new_user (auto-create profile on sign-up) ─
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1))
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- ── 6.2  apply_pending_invite (auto-apply role from invite) ─
CREATE OR REPLACE FUNCTION public.apply_pending_invite()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  pending record;
BEGIN
  SELECT * INTO pending FROM public.pending_invites
  WHERE email = NEW.email ORDER BY created_at DESC LIMIT 1;
  IF FOUND THEN
    UPDATE public.profiles SET role = pending.role WHERE id = NEW.id;
    DELETE FROM public.pending_invites WHERE id = pending.id;
  END IF;
  RETURN NEW;
END;
$$;

-- ── 6.3  audit_trigger (generic audit log writer) ─────────
CREATE OR REPLACE FUNCTION public.audit_trigger()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_changed  jsonb;
  v_snapshot jsonb;
  v_rec_id   uuid;
  v_email    text;
BEGIN
  -- Try to record which user made the change; may be NULL in system contexts.
  SELECT email INTO v_email FROM auth.users WHERE id = auth.uid();

  IF (TG_OP = 'INSERT') THEN
    v_snapshot := to_jsonb(NEW);
    v_rec_id := nullif(v_snapshot->>'id', '')::uuid;
    INSERT INTO public.audit_log(actor_id, actor_email, action, table_name, record_id, snapshot)
    VALUES (auth.uid(), v_email, 'insert', TG_TABLE_NAME, v_rec_id, v_snapshot);
    RETURN NEW;

  ELSIF (TG_OP = 'UPDATE') THEN
    v_rec_id := nullif(to_jsonb(NEW)->>'id', '')::uuid;
    -- Diff: union of keys from old+new, keeping only those where the value
    -- actually changed. Skip noisy fields that change on every write.
    SELECT jsonb_object_agg(
      k.key,
      jsonb_build_object('old', to_jsonb(OLD) -> k.key, 'new', to_jsonb(NEW) -> k.key)
    )
    INTO v_changed
    FROM (
      SELECT jsonb_object_keys(to_jsonb(NEW)) AS key
      UNION
      SELECT jsonb_object_keys(to_jsonb(OLD)) AS key
    ) k
    WHERE (to_jsonb(OLD) -> k.key) IS DISTINCT FROM (to_jsonb(NEW) -> k.key)
      AND k.key NOT IN ('updated_at', 'stage_changed_at');

    -- If nothing changed in meaningful fields, don't write a log row.
    IF v_changed IS NOT NULL THEN
      INSERT INTO public.audit_log(actor_id, actor_email, action, table_name, record_id, changed)
      VALUES (auth.uid(), v_email, 'update', TG_TABLE_NAME, v_rec_id, v_changed);
    END IF;
    RETURN NEW;

  ELSIF (TG_OP = 'DELETE') THEN
    v_snapshot := to_jsonb(OLD);
    v_rec_id := nullif(v_snapshot->>'id', '')::uuid;
    INSERT INTO public.audit_log(actor_id, actor_email, action, table_name, record_id, snapshot)
    VALUES (auth.uid(), v_email, 'delete', TG_TABLE_NAME, v_rec_id, v_snapshot);
    RETURN OLD;
  END IF;

  RETURN NULL;
END;
$$;


-- ████████████████████████████████████████████████████████████
-- §7  TRIGGERS
-- ████████████████████████████████████████████████████████████

-- ── 7.1  Auth triggers ────────────────────────────────────
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

DROP TRIGGER IF EXISTS on_profile_created ON public.profiles;
CREATE TRIGGER on_profile_created
  AFTER INSERT ON public.profiles
  FOR EACH ROW EXECUTE PROCEDURE public.apply_pending_invite();

-- ── 7.2  Audit triggers ──────────────────────────────────
DROP TRIGGER IF EXISTS audit_deals ON public.deals;
CREATE TRIGGER audit_deals
  AFTER INSERT OR UPDATE OR DELETE ON public.deals
  FOR EACH ROW EXECUTE PROCEDURE public.audit_trigger();

DROP TRIGGER IF EXISTS audit_contacts ON public.contacts;
CREATE TRIGGER audit_contacts
  AFTER INSERT OR UPDATE OR DELETE ON public.contacts
  FOR EACH ROW EXECUTE PROCEDURE public.audit_trigger();

DROP TRIGGER IF EXISTS audit_tenders ON public.tenders;
CREATE TRIGGER audit_tenders
  AFTER INSERT OR UPDATE OR DELETE ON public.tenders
  FOR EACH ROW EXECUTE PROCEDURE public.audit_trigger();

DROP TRIGGER IF EXISTS audit_tender_requirements ON public.tender_requirements;
CREATE TRIGGER audit_tender_requirements
  AFTER INSERT OR UPDATE OR DELETE ON public.tender_requirements
  FOR EACH ROW EXECUTE PROCEDURE public.audit_trigger();

DROP TRIGGER IF EXISTS audit_quotas ON public.quotas;
CREATE TRIGGER audit_quotas
  AFTER INSERT OR UPDATE OR DELETE ON public.quotas
  FOR EACH ROW EXECUTE PROCEDURE public.audit_trigger();

DROP TRIGGER IF EXISTS audit_attachments ON public.attachments;
CREATE TRIGGER audit_attachments
  AFTER INSERT OR UPDATE OR DELETE ON public.attachments
  FOR EACH ROW EXECUTE PROCEDURE public.audit_trigger();

DROP TRIGGER IF EXISTS audit_products ON public.products;
CREATE TRIGGER audit_products
  AFTER INSERT OR UPDATE OR DELETE ON public.products
  FOR EACH ROW EXECUTE PROCEDURE public.audit_trigger();

DROP TRIGGER IF EXISTS audit_slas ON public.slas;
CREATE TRIGGER audit_slas
  AFTER INSERT OR UPDATE OR DELETE ON public.slas
  FOR EACH ROW EXECUTE PROCEDURE public.audit_trigger();

DROP TRIGGER IF EXISTS audit_sla_products ON public.sla_products;
CREATE TRIGGER audit_sla_products
  AFTER INSERT OR UPDATE OR DELETE ON public.sla_products
  FOR EACH ROW EXECUTE PROCEDURE public.audit_trigger();

DROP TRIGGER IF EXISTS audit_sla_usage ON public.sla_usage;
CREATE TRIGGER audit_sla_usage
  AFTER INSERT OR UPDATE OR DELETE ON public.sla_usage
  FOR EACH ROW EXECUTE PROCEDURE public.audit_trigger();

DROP TRIGGER IF EXISTS audit_deal_products ON public.deal_products;
CREATE TRIGGER audit_deal_products
  AFTER INSERT OR UPDATE OR DELETE ON public.deal_products
  FOR EACH ROW EXECUTE PROCEDURE public.audit_trigger();


-- ████████████████████████████████████████████████████████████
-- §8  STORAGE (Supabase Storage bucket + policies)
-- ████████████████████████████████████████████████████████████

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'attachments',
  'attachments',
  false,
  26214400, -- 25 MB
  ARRAY[
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'image/png',
    'image/jpeg',
    'image/webp'
  ]
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "authenticated read attachments" ON storage.objects;
CREATE POLICY "authenticated read attachments"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'attachments' AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "authenticated write attachments" ON storage.objects;
CREATE POLICY "authenticated write attachments"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'attachments' AND auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "authenticated delete attachments" ON storage.objects;
CREATE POLICY "authenticated delete attachments"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'attachments' AND auth.uid() IS NOT NULL);


-- ████████████████████████████████████████████████████████████
-- §9  SEED DATA
-- ████████████████████████████████████████████████████████████

-- ── 9.1  Default app settings ─────────────────────────────
INSERT INTO public.app_settings (config) VALUES ('{
  "company_name": "Business Book",
  "company_subtitle": "by Elio Santos · Powered by AI",
  "primary_color": "#0D2137",
  "fy_start_month": 4,
  "business_units": [
    {"id": "VGT", "label": "VGT · Portugal", "color": "#1D9E75"},
    {"id": "ECT", "label": "ECT · Spain", "color": "#D85A30"}
  ],
  "budget_cycles": ["BUD", "EST1", "EST2"],
  "default_currency": "EUR",
  "available_currencies": ["EUR", "USD", "GBP"]
}'::jsonb)
ON CONFLICT DO NOTHING;

-- ── 9.2  VGT Budget FY26 (from Excel, K EUR) ─────────────
INSERT INTO public.budget (bu, cycle, pl_key, apr, may, jun, jul, aug, sep, oct, nov, dec, jan, feb, mar)
VALUES
  ('VGT','BUD','ns_int',   222.583,222.583,222.583,222.583,222.583,222.583,222.583,222.583,222.583,222.583,222.583,222.583),
  ('VGT','BUD','ns_ext',   278.467,278.467,278.467,278.467,278.467,278.467,278.467,278.467,278.467,278.467,278.467,278.467),
  ('VGT','BUD','cogs_var', 154.779,154.779,154.779,154.779,154.779,154.779,154.779,154.779,154.779,154.779,154.779,154.779),
  ('VGT','BUD','cogs_fix',  84.159, 84.159, 84.159, 84.159, 84.159, 84.159, 84.159, 84.139, 84.139, 84.141, 84.142, 84.031),
  ('VGT','BUD','rd',       136.437,136.437,136.437,136.437,136.437,136.437,136.437,136.437,136.437,136.437,136.437,136.437),
  ('VGT','BUD','sgas',      83.655, 83.655, 83.655, 83.655, 83.655, 83.655, 83.655, 83.655, 83.655, 83.655, 83.655, 83.655),
  ('VGT','BUD','bapa',       0,      0,      0,      0,      0,      0,      0,      0,      0,      0,      0,     93.5),
  -- EST1 (default = same as BUD; update as needed)
  ('VGT','EST1','ns_int',  222.583,222.583,222.583,222.583,222.583,222.583,222.583,222.583,222.583,222.583,222.583,222.583),
  ('VGT','EST1','ns_ext',  278.467,278.467,278.467,278.467,278.467,278.467,278.467,278.467,278.467,278.467,278.467,278.467),
  ('VGT','EST1','cogs_var',154.779,154.779,154.779,154.779,154.779,154.779,154.779,154.779,154.779,154.779,154.779,154.779),
  ('VGT','EST1','cogs_fix', 84.159, 84.159, 84.159, 84.159, 84.159, 84.159, 84.159, 84.139, 84.139, 84.141, 84.142, 84.031),
  ('VGT','EST1','rd',      136.437,136.437,136.437,136.437,136.437,136.437,136.437,136.437,136.437,136.437,136.437,136.437),
  ('VGT','EST1','sgas',     83.655, 83.655, 83.655, 83.655, 83.655, 83.655, 83.655, 83.655, 83.655, 83.655, 83.655, 83.655),
  ('VGT','EST1','bapa',      0,      0,      0,      0,      0,      0,      0,      0,      0,      0,      0,     93.5),
  -- EST2
  ('VGT','EST2','ns_int',  222.583,222.583,222.583,222.583,222.583,222.583,222.583,222.583,222.583,222.583,222.583,222.583),
  ('VGT','EST2','ns_ext',  278.467,278.467,278.467,278.467,278.467,278.467,278.467,278.467,278.467,278.467,278.467,278.467),
  ('VGT','EST2','cogs_var',154.779,154.779,154.779,154.779,154.779,154.779,154.779,154.779,154.779,154.779,154.779,154.779),
  ('VGT','EST2','cogs_fix', 84.159, 84.159, 84.159, 84.159, 84.159, 84.159, 84.159, 84.139, 84.139, 84.141, 84.142, 84.031),
  ('VGT','EST2','rd',      136.437,136.437,136.437,136.437,136.437,136.437,136.437,136.437,136.437,136.437,136.437,136.437),
  ('VGT','EST2','sgas',     83.655, 83.655, 83.655, 83.655, 83.655, 83.655, 83.655, 83.655, 83.655, 83.655, 83.655, 83.655),
  ('VGT','EST2','bapa',      0,      0,      0,      0,      0,      0,      0,      0,      0,      0,      0,     93.5)
ON CONFLICT (bu, cycle, pl_key) DO UPDATE SET
  apr=EXCLUDED.apr, may=EXCLUDED.may, jun=EXCLUDED.jun, jul=EXCLUDED.jul,
  aug=EXCLUDED.aug, sep=EXCLUDED.sep, oct=EXCLUDED.oct, nov=EXCLUDED.nov,
  dec=EXCLUDED.dec, jan=EXCLUDED.jan, feb=EXCLUDED.feb, mar=EXCLUDED.mar;

-- ── 9.3  Tender requirement templates (medical imaging) ──
INSERT INTO public.tender_requirement_templates (title, description, category, sort_order)
SELECT * FROM (VALUES
  -- Regulatory
  ('CE Marking (MDR 2017/745)',       'Provide current CE Declaration of Conformity under the Medical Device Regulation.', 'regulatory', 10),
  ('ISO 13485 Certificate',           'Current ISO 13485 certificate for the manufacturer / vendor.',                      'regulatory', 20),
  ('ISO 9001 Certificate',            'Current ISO 9001 quality-management certificate.',                                   'regulatory', 30),
  ('GDPR / Data Protection',          'Data-processing agreement and GDPR compliance statement.',                           'regulatory', 40),
  ('DICOM Conformance Statement',     'Official DICOM conformance statement for the proposed system.',                      'regulatory', 50),
  ('HL7 / FHIR Interoperability',     'Supported HL7 v2 / FHIR resources and integration profiles.',                        'regulatory', 60),
  ('Cybersecurity (IEC 62443 / NIS2)','Security architecture statement, patch policy, incident response plan.',             'regulatory', 70),
  -- Technical
  ('System Architecture Document',    'High-level architecture, components, hosting (on-prem / cloud / hybrid).',           'technical', 110),
  ('Hardware Requirements',           'Minimum and recommended hardware specs for each deployment tier.',                   'technical', 120),
  ('PACS / RIS / HIS Integration',    'Supported integration patterns and tested vendor matrix.',                           'technical', 130),
  ('AI Model Validation',             'Clinical validation evidence for AI components (if applicable).',                    'technical', 140),
  ('Performance & SLA',               'Expected throughput, latency, uptime targets and measurement method.',               'technical', 150),
  ('Backup & Disaster Recovery',      'RPO / RTO targets and backup strategy.',                                             'technical', 160),
  ('Training Plan',                   'On-site / remote training package and hand-off deliverables.',                       'technical', 170),
  -- Commercial
  ('Pricing Breakdown',               'Itemised pricing: licenses, services, hardware, maintenance.',                       'commercial', 210),
  ('Payment Terms',                   'Milestones, invoicing schedule, currency.',                                          'commercial', 220),
  ('Warranty Period',                 'Warranty scope and duration.',                                                       'commercial', 230),
  ('Maintenance Plan',                'Scope, response times, included vs billable work.',                                  'commercial', 240),
  ('Reference Clients',               'At least 3 comparable customer references with contact details.',                   'commercial', 250),
  ('Financial Statements',            'Last 3 audited financial statements.',                                               'commercial', 260),
  ('Bank Guarantee',                  'Bid bond / performance bond if required by the tender.',                             'commercial', 270),
  -- Administrative
  ('Company Registration',            'Commercial registry extract / certificate of incorporation.',                        'administrative', 310),
  ('Tax Compliance Certificate',      'Up-to-date certificate of no tax arrears.',                                          'administrative', 320),
  ('Social Security Compliance',      'Up-to-date social security clearance.',                                              'administrative', 330),
  ('Insurance Coverage',              'Professional liability and product liability insurance certificates.',                'administrative', 340),
  ('NDA Signed',                      'Non-disclosure agreement countersigned by both parties.',                            'administrative', 350),
  ('Subcontractor Disclosure',        'List of subcontractors and their roles, if any.',                                    'administrative', 360)
) AS seed(title, description, category, sort_order)
WHERE NOT EXISTS (SELECT 1 FROM public.tender_requirement_templates);

-- ── 9.4  Product Catalog (VGT Pricelist) ─────────────────
INSERT INTO public.products (category, sku, name, description, license_fee, annual_fee, pricing_model, bu, sort_order)
VALUES
-- Synapse 3D Packages
('Synapse 3D', 'S3D-BASE-1CCU',   'S3D Base Standalone 1CCU',          'Base package (Standalone)',         6494,  1042, 'license_plus_annual', 'VGT', 10),
('Synapse 3D', 'S3D-BASE-3CCU',   'S3D Base Server 3CCU',              'Base package (Server) 3CCU',      11213,  1631, 'license_plus_annual', 'VGT', 11),
('Synapse 3D', 'S3D-BASE-10CCU',  'S3D Base Server 10CCU',             'Base package (Server) 10CCU',     17250,  2538, 'license_plus_annual', 'VGT', 12),
('Synapse 3D', 'S3D-RAD-3CCU',    'S3D Radiology 3CCU',                'Radiology package 3CCU',          11360,  1631, 'license_plus_annual', 'VGT', 13),
('Synapse 3D', 'S3D-RAD-10CCU',   'S3D Radiology 10CCU',               'Radiology package 10CCU',         20352,  2538, 'license_plus_annual', 'VGT', 14),
('Synapse 3D', 'S3D-RADENT-3CCU', 'S3D Radiology Enterprise 3CCU',     'Radiology Enterprise 3CCU',       42393,  6061, 'license_plus_annual', 'VGT', 15),
('Synapse 3D', 'S3D-RADENT-10CCU','S3D Radiology Enterprise 10CCU',    'Radiology Enterprise 10CCU',      67461,  9525, 'license_plus_annual', 'VGT', 16),
('Synapse 3D', 'S3D-CARDCT-1CCU', 'S3D Cardiology CT 1CCU',            'Cardiology CT package',           15114,  1893, 'license_plus_annual', 'VGT', 17),
('Synapse 3D', 'S3D-CARDMR-1CCU', 'S3D Cardiology MR 1CCU',            'Cardiology MR package',           12606,  1013, 'license_plus_annual', 'VGT', 18),
('Synapse 3D', 'S3D-HPB-1CCU',    'S3D HPB Surgery 1CCU',              'HPB Surgery package',             14457,  1308, 'license_plus_annual', 'VGT', 19),
('Synapse 3D', 'S3D-THOR-1CCU',   'S3D Thoracic Surgery 1CCU',         'Thoracic Surgery package',        15523,  1308, 'license_plus_annual', 'VGT', 20),
('Synapse 3D', 'S3D-URO-1CCU',    'S3D Urology 1CCU',                  'Urology package',                 12650,  1308, 'license_plus_annual', 'VGT', 21),
('Synapse 3D', 'S3D-FULL-3CCU',   'S3D Full Package 3CCU',             'Full Enterprise 3CCU',            86450, 12968, 'license_plus_annual', 'VGT', 22),
('Synapse 3D', 'S3D-FULL-10CCU',  'S3D Full Package 10CCU',            'Full Enterprise 10CCU',          172500, 25316, 'license_plus_annual', 'VGT', 23),
-- S3D Standalone Packages
('Synapse 3D', 'S3D-HPB-SA',      'S3D Standalone HPB Surgery',        'HPB Package w/o Base MI',         21012,  1882, 'license_plus_annual', 'VGT', 30),
('Synapse 3D', 'S3D-THOR-SA',     'S3D Standalone Thoracic',           'Thoracic Pack w/o Base MI',       21002,  1882, 'license_plus_annual', 'VGT', 31),
('Synapse 3D', 'S3D-URO-SA',      'S3D Standalone Urology',            'Urology Package w/o Base MI',    16812,  1600, 'license_plus_annual', 'VGT', 32),
('Synapse 3D', 'S3D-BRONCH-SA',   'S3D Standalone Bronchoscopist',     'Bronchoscopist',                   8000,  1123, 'license_plus_annual', 'VGT', 33),
-- S3D Upgrade
('Synapse 3D', 'S3D-UPG-BASE',    'S3D Upgrade Base V6.1',             'Upgrade Base Package',             5587,  1218, 'license_plus_annual', 'VGT', 40),
('Synapse 3D', 'S3D-UPG-OPT',     'S3D Upgrade Option V6.1',           'Upgrade Option Package',           5131,   866, 'license_plus_annual', 'VGT', 41),
('Synapse 3D', 'S3D-UPG-FULL',    'S3D Upgrade Full V6.1',             'Upgrade Full Package',            36000,  5185, 'license_plus_annual', 'VGT', 42),
-- S3D A La Carte Options
('Synapse 3D', 'S3D-IVR',         'IVR Simulator',                     NULL,                               4505,   721, 'license_plus_annual', 'VGT', 50),
('Synapse 3D', 'S3D-BONE',        'Bone Viewer Per CCU',               NULL,                               2806,   601, 'license_plus_annual', 'VGT', 51),
('Synapse 3D', 'S3D-MITRAL',      'Mitral Valve Analysis',             NULL,                               3903,   721, 'license_plus_annual', 'VGT', 52),
('Synapse 3D', 'S3D-ONCO',        'Oncology Viewer',                   NULL,                               4505,   721, 'license_plus_annual', 'VGT', 53),
('Synapse 3D', 'S3D-SURFACE',     'Surface Viewer',                    NULL,                               4505,   721, 'license_plus_annual', 'VGT', 54),
('Synapse 3D', 'S3D-PROSTATE',    'Prostate Viewer',                   NULL,                               2806,   601, 'license_plus_annual', 'VGT', 55),
('Synapse 3D', 'S3D-4DFLOW',      '4D Flow',                           NULL,                               4505,   721, 'license_plus_annual', 'VGT', 56),
('Synapse 3D', 'S3D-CARDTX',      'Cardiac Tx Map Per CCU',            NULL,                               4505,   721, 'license_plus_annual', 'VGT', 57),
('Synapse 3D', 'S3D-4DVIEW',      '4D Viewer',                         NULL,                               1703,   601, 'license_plus_annual', 'VGT', 58),
('Synapse 3D', 'S3D-3DCOMP',      '3D Comparison',                     NULL,                               1703,   601, 'license_plus_annual', 'VGT', 59),
('Synapse 3D', 'S3D-DYNAMIC',     'Dynamic Data',                      NULL,                               1703,   601, 'license_plus_annual', 'VGT', 60),
('Synapse 3D', 'S3D-SLICER',      'Slicer',                            NULL,                               1703,   601, 'license_plus_annual', 'VGT', 61),
('Synapse 3D', 'S3D-VESSEL',      'Vessel Extraction',                 NULL,                               1703,   601, 'license_plus_annual', 'VGT', 62),
('Synapse 3D', 'S3D-FUSION',      '3D Fusion',                         NULL,                               1703,   601, 'license_plus_annual', 'VGT', 63),
('Synapse 3D', 'S3D-CORCT',       'Coronary Analysis CT',              NULL,                               4509,   721, 'license_plus_annual', 'VGT', 64),
('Synapse 3D', 'S3D-CARDFCT',     'Cardiac Function CT',               NULL,                               4509,   721, 'license_plus_annual', 'VGT', 65),
('Synapse 3D', 'S3D-CALCIUM',     'Calcium Scoring',                   NULL,                               2806,   601, 'license_plus_annual', 'VGT', 66),
('Synapse 3D', 'S3D-CARDFUS',     'Cardiac Fusion',                    NULL,                               2806,   601, 'license_plus_annual', 'VGT', 67),
('Synapse 3D', 'S3D-CORMR',       'Coronary Analysis MR',              NULL,                               4509,   721, 'license_plus_annual', 'VGT', 68),
('Synapse 3D', 'S3D-CARDFMR',     'Cardiac Function MR',               NULL,                               2806,   601, 'license_plus_annual', 'VGT', 69),
('Synapse 3D', 'S3D-DELAYED',     'Delayed Enhancement',               NULL,                               4509,   721, 'license_plus_annual', 'VGT', 70),
('Synapse 3D', 'S3D-LUNGAIR',     'Lung Analysis/Airway',              NULL,                               5018,  1283, 'license_plus_annual', 'VGT', 71),
('Synapse 3D', 'S3D-LUNGSCOPE',   'Lung Analysis Scope Per CCU',       NULL,                               5018,  1283, 'license_plus_annual', 'VGT', 72),
('Synapse 3D', 'S3D-LUNGRES',     'Lung Analysis Resection',           NULL,                              15653,  1283, 'license_plus_annual', 'VGT', 73),
('Synapse 3D', 'S3D-NUCMED',      'Nuclear Medicine Viewer',           NULL,                               2806,   601, 'license_plus_annual', 'VGT', 74),
('Synapse 3D', 'S3D-DENTAL',      'Dental MPR',                        NULL,                               2806,   601, 'license_plus_annual', 'VGT', 75),
('Synapse 3D', 'S3D-SECTOR',      'Sector MPR',                        NULL,                               2806,   601, 'license_plus_annual', 'VGT', 76),
('Synapse 3D', 'S3D-ADC',         'ADC Viewer',                        NULL,                               2806,   601, 'license_plus_annual', 'VGT', 77),
('Synapse 3D', 'S3D-COMBO',       'Combination',                       NULL,                               2806,   601, 'license_plus_annual', 'VGT', 78),
('Synapse 3D', 'S3D-BRPCT',       'Brain Perfusion CT',                NULL,                               2806,   601, 'license_plus_annual', 'VGT', 79),
('Synapse 3D', 'S3D-BRPMR',       'Brain Perfusion MR',                NULL,                               2806,   601, 'license_plus_annual', 'VGT', 80),
('Synapse 3D', 'S3D-4DPERF',      '4D Perfusion',                      NULL,                               3903,   601, 'license_plus_annual', 'VGT', 81),
('Synapse 3D', 'S3D-3DFAT',       '3D Fat Analysis',                   NULL,                               3903,   601, 'license_plus_annual', 'VGT', 82),
('Synapse 3D', 'S3D-COLON',       'Colon Analysis Per CCU',            NULL,                               4807,   721, 'license_plus_annual', 'VGT', 83),
('Synapse 3D', 'S3D-LIVERCT',     'Liver Analysis CT',                 NULL,                              13240,  1523, 'license_plus_annual', 'VGT', 84),
('Synapse 3D', 'S3D-LIVERMR',     'Liver Analysis MR',                 NULL,                               2806,   601, 'license_plus_annual', 'VGT', 85),
('Synapse 3D', 'S3D-AORTIC',      'Aortic Valve Analysis',             NULL,                               3903,   601, 'license_plus_annual', 'VGT', 86),
('Synapse 3D', 'S3D-STL',         'STL Output (incl Surface)',         NULL,                               5612,   601, 'license_plus_annual', 'VGT', 87),
('Synapse 3D', 'S3D-VR',          'Offline VR',                        NULL,                               2004,   601, 'license_plus_annual', 'VGT', 88),
('Synapse 3D', 'S3D-MRFLOW',      'MR Flow Analysis',                  NULL,                               3903,   601, 'license_plus_annual', 'VGT', 89),
('Synapse 3D', 'S3D-KIDNEY',      'Kidney Analysis',                   NULL,                               9516,  1348, 'license_plus_annual', 'VGT', 90),
('Synapse 3D', 'S3D-4CHAMBER',    '4-Chamber Analysis',                NULL,                               5612,   937, 'license_plus_annual', 'VGT', 91),
('Synapse 3D', 'S3D-ABLATION',    'Cardiac Ablation Analysis',         NULL,                               5612,   937, 'license_plus_annual', 'VGT', 92),
('Synapse 3D', 'S3D-TENSOR',      'Craniotomy/Tensor Analysis',        NULL,                               3815,  1283, 'license_plus_annual', 'VGT', 93),
('Synapse 3D', 'S3D-TXMAP',       'Tx Map',                            NULL,                               4505,   721, 'license_plus_annual', 'VGT', 94),
('Synapse 3D', 'S3D-IVIM',        'IVIM',                              NULL,                               1874,   601, 'license_plus_annual', 'VGT', 95),
('Synapse 3D', 'S3D-BREAST',      'Breast Analysis',                   NULL,                               1874,   601, 'license_plus_annual', 'VGT', 96),
('Synapse 3D', 'S3D-ENDO',        'Endoscopic Simulator',              NULL,                               6685,   601, 'license_plus_annual', 'VGT', 97),
('Synapse 3D', 'S3D-KIDVOL',      'Kidney Volumetry',                  NULL,                               2430,   601, 'license_plus_annual', 'VGT', 98),
('Synapse 3D', 'S3D-CPCT',        'Cardiac Perfusion CT',              'A la carte only',                  4505,   451, 'license_plus_annual', 'VGT', 99),
('Synapse 3D', 'S3D-CPMR',        'Cardiac Perfusion MR',              'A la carte only',                  4505,   451, 'license_plus_annual', 'VGT', 100),
('Synapse 3D', 'S3D-ABDOPERF',    'Abdominal Perfusion',               'A la carte only',                  4505,   451, 'license_plus_annual', 'VGT', 101),
('Synapse 3D', 'S3D-MOBILE',      'Mobile License',                    NULL,                               1003,   601, 'license_plus_annual', 'VGT', 102),
('Synapse 3D', 'S3D-DUALENERGY',  'Dual Energy',                       'A la carte only',                  4571,   601, 'license_plus_annual', 'VGT', 103),
('Synapse 3D', 'S3D-PANCREAS',    'Pancreas Analysis',                 'A la carte only',                 13600,   600, 'license_plus_annual', 'VGT', 104),
('Synapse 3D', 'S3D-RECTAL',      'Rectal Analysis',                   'A la carte only',                 15200,  1000, 'license_plus_annual', 'VGT', 105),
('Synapse 3D', 'S3D-KNEE',        'Knee Joint Analysis',               'A la carte only',                 11925,  1000, 'license_plus_annual', 'VGT', 106),
('Synapse 3D', 'S3D-PIXELSHINE',  'PixelShine 1CCU',                   'A la carte only',                  3000,  1440, 'license_plus_annual', 'VGT', 107),
('Synapse 3D', 'S3D-QSM',         'QSM Analysis 1CCU',                 'A la carte only',                  3000,  1440, 'license_plus_annual', 'VGT', 108),
('Synapse 3D', 'S3D-BRAINSUB',    'Brain Subregion',                   NULL,                               6857,  1440, 'license_plus_annual', 'VGT', 109),
-- AI REiLI
('AI REiLI',   'REILI-CHEST',     'REiLI Chest X-ray AI',              'AI detection chest X-ray',            0,  4500, 'subscription', 'VGT', 200),
('AI REiLI',   'REILI-MAMMO',     'REiLI Mammography AI',              'AI detection mammography',            0,  6000, 'subscription', 'VGT', 201),
('AI REiLI',   'REILI-CT-LUNG',   'REiLI CT Lung AI',                  'AI lung nodule detection',            0,  5500, 'subscription', 'VGT', 202),
('AI REiLI',   'REILI-BONE',      'REiLI Bone Fracture AI',            'AI bone fracture detection',          0,  4500, 'subscription', 'VGT', 203),
-- Avicenna
('Avicenna',   'AVI-ANALYTICS',   'Avicenna Analytics',                'AI radiology analytics',              0,  8000, 'subscription', 'VGT', 210),
-- SYN Pathology
('SYN Pathology','SYNPATH-BASE',  'Synapse Pathology Base',            'Digital pathology platform',      25000,  5000, 'license_plus_annual', 'VGT', 220),
('SYN Pathology','SYNPATH-AI',    'Synapse Pathology AI',              'AI-assisted pathology',               0,  8000, 'subscription', 'VGT', 221),
-- Contextflow
('Contextflow','CF-SEARCH',       'Contextflow SEARCH Lung CT',        'AI search engine radiology',          0,  6000, 'subscription', 'VGT', 230),
-- Gleamer
('Gleamer',    'GLEAM-BONEVIEW',  'Gleamer BoneView',                  'AI bone fracture X-ray',              0,  5000, 'subscription', 'VGT', 240),
('Gleamer',    'GLEAM-CHESTVIEW', 'Gleamer ChestView',                 'AI chest X-ray screening',            0,  5000, 'subscription', 'VGT', 241),
-- Lunit
('Lunit',      'LUNIT-CXR',      'Lunit INSIGHT CXR',                 'AI chest X-ray',                      0,  5500, 'subscription', 'VGT', 250),
('Lunit',      'LUNIT-MMG',      'Lunit INSIGHT MMG',                 'AI mammography',                      0,  7000, 'subscription', 'VGT', 251),
-- IBEX
('IBEX',       'IBEX-PROSTATE',   'IBEX Galen Prostate',              'AI pathology prostate',               0,  9000, 'subscription', 'VGT', 260),
('IBEX',       'IBEX-BREAST',     'IBEX Galen Breast',                'AI pathology breast',                 0,  9000, 'subscription', 'VGT', 261),
-- AI Gateway
('AI Gateway', 'AIGW-BASE',       'AI Gateway Platform',               'AI orchestration platform',       15000,  3000, 'license_plus_annual', 'VGT', 270),
-- DP Extential
('DP Extential','DPE-SCANNER',    'DP Extential Scanner Integration',  'Digital pathology scanner',            0,  4000, 'subscription', 'VGT', 280),
-- PACS / VNA
('PACS',       'SYN-PACS',        'Synapse PACS',                      'Enterprise PACS',                 50000, 10000, 'license_plus_annual', 'VGT', 300),
('PACS',       'SYN-VNA',         'Synapse VNA',                       'Vendor Neutral Archive',          30000,  6000, 'license_plus_annual', 'VGT', 301),
('PACS',       'SYN-MOBILITY',    'Synapse Mobility',                  'Mobile access to PACS',           10000,  2000, 'license_plus_annual', 'VGT', 302),
-- CWM
('CWM',        'CWM-RISBI',       'CWM RIS/BI',                       'Radiology Info System + BI',      40000,  8000, 'license_plus_annual', 'VGT', 400),
('CWM',        'CWM-TELE',        'CWM Teleradiology',                'Teleradiology module',            15000,  3000, 'license_plus_annual', 'VGT', 401),
('CWM',        'CWM-IVD',         'CWM IVD Connectivity',             'IVD PayPerSlide',                     0,     0, 'pay_per_study',       'VGT', 402),
('CWM',        'CWM-ES-SILVER',   'CWM ES Silver',                    'Enterprise Silver',               20000,  4000, 'license_plus_annual', 'VGT', 403),
('CWM',        'CWM-ES-DIAMOND',  'CWM ES Diamond',                   'Enterprise Diamond',              35000,  7000, 'license_plus_annual', 'VGT', 404),
('CWM',        'CWM-DOSE',        'CWM Dose',                         'Dose management',                 12000,  2400, 'license_plus_annual', 'VGT', 405),
-- MedSky
('MedSky',     'MEDSKY-PORTAL',   'MedPortal',                        'Patient portal',                  10000,  2000, 'license_plus_annual', 'VGT', 410),
('MedSky',     'MEDSKY-SETUP',    'MedSky Setup',                     'Implementation & setup',           5000,     0, 'license_plus_annual', 'VGT', 411),
('MedSky',     'MEDSKY-SUPPORT',  'MedSky Support',                   'Annual support',                      0,  3000, 'subscription',        'VGT', 412),
-- VMWare
('VMWare',     'VMW-STD',         'VMWare Standard License',           'Virtualization standard',          5000,  1200, 'license_plus_annual', 'VGT', 500),
('VMWare',     'VMW-ENT',         'VMWare Enterprise License',         'Virtualization enterprise',       12000,  2400, 'license_plus_annual', 'VGT', 501)
ON CONFLICT (sku) DO NOTHING;

-- Backfill allowed_license_types by category
UPDATE public.products SET allowed_license_types = '["per_ccu"]' WHERE category = 'Synapse 3D';
UPDATE public.products SET allowed_license_types = '["per_package","per_volume"]' WHERE category = 'PACS';
UPDATE public.products SET allowed_license_types = '["per_equipment"]' WHERE category = 'CWM' AND sku != 'CWM-IVD';
UPDATE public.products SET allowed_license_types = '["per_volume"]' WHERE sku = 'CWM-IVD';
UPDATE public.products SET allowed_license_types = '["per_volume","flat"]' WHERE category IN ('AI REiLI','Gleamer','Lunit','IBEX','SYN Pathology');
UPDATE public.products SET allowed_license_types = '["flat"]' WHERE category IN ('Avicenna','Contextflow','AI Gateway','DP Extential','MedSky','VMWare');


-- ████████████████████████████████████████████████████████████
-- §10  COMMENTS
-- ████████████████████████████████████████████████████████████

COMMENT ON COLUMN public.deals.forecast_category IS
  'Sales-owner forecast call for this deal: commit | best_case | upside | omit. NULL means "derive from stage" on the client side.';
COMMENT ON COLUMN public.deals.distribution_path IS
  'direct = VGT -> Distributor -> Client; hub_mediated = VGT -> Hub -> Distributor -> Client';
COMMENT ON COLUMN public.deals.vgt_cost IS
  'What this deal costs VGT to produce (cost of goods). value_total - vgt_cost = VGT margin.';
COMMENT ON COLUMN public.deals.distributor_price IS
  'hub_mediated: price the hub charges the distributor. direct: same as value_total (redundant).';
COMMENT ON COLUMN public.deals.end_customer_price IS
  'What the distributor charges the end customer. Used to compute distributor margin.';
COMMENT ON COLUMN public.quotas.sub_targets IS
  'Breakdown of target_eur per product family, e.g. {"CWM Dose": 1000000, "AI Reporting": 500000}';


-- ============================================================
-- DONE. After first login, promote yourself to admin:
--
--   UPDATE public.profiles
--   SET role = 'admin', full_name = 'Your Name'
--   WHERE email = 'your@email.here';
-- ============================================================

-- Add default_currency column to companies table
-- Distributors like TIMED use USD; this lets each company specify its preferred currency.
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS default_currency TEXT NOT NULL DEFAULT 'EUR';

-- Backfill: all existing companies default to EUR (already done by DEFAULT above)

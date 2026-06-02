-- ============================================================
-- BusinessBook — Discount approval columns
-- ============================================================
-- Date:        2026-06-02
-- Description: Adds the columns the discount approval workflow writes
--              (discount_approved, transfer_price). Without these, the
--              admin "Save" on a discount decision fails silently and the
--              button hangs on "Saving…".
--
-- Run in: Supabase Dashboard > SQL Editor
-- ============================================================

ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS discount_approved numeric(5,2),
  ADD COLUMN IF NOT EXISTS transfer_price    numeric(14,2);

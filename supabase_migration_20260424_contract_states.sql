-- ============================================================
-- BusinessBook — Contract lifecycle states update
-- Migrate from old states to new states
-- Run in: Supabase Dashboard > SQL Editor
-- ============================================================

-- 1. Drop old check constraint and add new one
alter table public.slas drop constraint if exists slas_status_check;
alter table public.slas add constraint slas_status_check
  check (status in ('draft','waiting_po','warranty','active','pending_renewal','renewed','expired','cancelled'));

-- 2. Migrate existing data to new states
update public.slas set status = 'draft' where status = 'pipeline';
update public.slas set status = 'active' where status = 'negotiation';
update public.slas set status = 'active' where status = 'invoiced';
update public.slas set status = 'expired' where status = 'reduced';

-- 3. Update default
alter table public.slas alter column status set default 'draft';

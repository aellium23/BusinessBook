-- ============================================================
-- BusinessBook — Enhance Accounts (unify with clients)
-- Add client_type, distributor_id, active to accounts
-- + Distributor sales_type
-- Run in: Supabase Dashboard > SQL Editor
-- ============================================================

do $$ begin
  if not exists (select 1 from information_schema.columns where table_name='accounts' and column_name='client_type') then
    alter table public.accounts add column client_type text default 'public' check (client_type in ('public','private'));
  end if;
  if not exists (select 1 from information_schema.columns where table_name='accounts' and column_name='distributor_id') then
    alter table public.accounts add column distributor_id uuid references public.distributors(id) on delete set null;
  end if;
  if not exists (select 1 from information_schema.columns where table_name='accounts' and column_name='active') then
    alter table public.accounts add column active boolean default true;
  end if;
  if not exists (select 1 from information_schema.columns where table_name='distributors' and column_name='sales_type') then
    alter table public.distributors add column sales_type text default 'external' check (sales_type in ('internal','external'));
  end if;
end $$;

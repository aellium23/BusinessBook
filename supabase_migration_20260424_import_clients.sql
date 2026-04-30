-- ============================================================
-- BusinessBook — Import clients from deals/SLAs to accounts
-- Creates accounts for unique client names that don't exist yet
-- Run in: Supabase Dashboard > SQL Editor
-- ============================================================

-- 1. Import from deals (unique clients not yet in accounts)
insert into public.accounts (name, bu, country, region)
select distinct on (d.client)
  d.client,
  d.bu,
  d.country,
  d.region
from public.deals d
where d.client is not null
  and d.client != ''
  and not exists (
    select 1 from public.accounts a
    where lower(a.name) = lower(d.client)
  )
order by d.client, d.created_at desc;

-- 2. Import from SLAs (unique clients not yet in accounts after step 1)
insert into public.accounts (name, bu, country, region)
select distinct on (s.client)
  s.client,
  s.bu,
  s.country,
  s.region
from public.slas s
where s.client is not null
  and s.client != ''
  and not exists (
    select 1 from public.accounts a
    where lower(a.name) = lower(s.client)
  )
order by s.client, s.created_at desc;

-- 3. Link deals to their matching accounts (where account_id is null)
update public.deals d
set account_id = a.id
from public.accounts a
where d.account_id is null
  and d.client is not null
  and lower(d.client) = lower(a.name);

-- 4. Link SLAs to their matching accounts (where account_id is null)
update public.slas s
set account_id = a.id
from public.accounts a
where s.account_id is null
  and s.client is not null
  and lower(s.client) = lower(a.name);

-- A partner could not see a client list, or add a client to it.
--
-- Same shape as the deals fault, one table over: `accounts` is filtered by
-- business unit, and a distributor has no business unit — they have a company.
-- So the account picker came back empty, which reads on screen as "the client
-- name was lost", and "New client" inserted nothing at all, silently, because
-- the write policy refused it and nobody was checking the error.
--
-- The first attempt at this scoped accounts through `distributors.company_id`.
-- That column does not exist: `distributors` was never linked to `companies` at
-- all. Which also explains something older — the full form looks a distributor
-- up that way before creating a client, so that path has been failing since it
-- was written, for everyone, in silence.
--
-- So the link is made where it belongs, on the account itself: an account
-- created by a partner carries their company, and that is what the policy reads.
-- Accounts that exist today keep a null company and stay ours — a partner
-- should not inherit a client list they never built.
--
-- Safe to run more than once.

alter table public.accounts
  add column if not exists company_id uuid references public.companies(id) on delete set null;

comment on column public.accounts.company_id is
  'The partner company this account belongs to, when a partner created it. Null = ours.';

create index if not exists accounts_company_idx on public.accounts(company_id);

-- Their own company's accounts, and only those.
drop policy if exists "accounts partner read" on public.accounts;
create policy "accounts partner read" on public.accounts for select using (
  accounts.company_id is not null
  and accounts.company_id = (select p.company_id from public.profiles p where p.id = auth.uid())
);

drop policy if exists "accounts partner insert" on public.accounts;
create policy "accounts partner insert" on public.accounts for insert with check (
  accounts.company_id is not null
  and accounts.company_id = (select p.company_id from public.profiles p
                             where p.id = auth.uid() and p.active = true
                               and p.role in ('distributor','partner'))
);

-- They correct a name or a country on their own accounts. Deleting stays with
-- us: an account is referenced by deals, and a partner removing one takes the
-- history of somebody else's deal with it.
drop policy if exists "accounts partner update" on public.accounts;
create policy "accounts partner update" on public.accounts for update using (
  accounts.company_id is not null
  and accounts.company_id = (select p.company_id from public.profiles p
                             where p.id = auth.uid() and p.active = true
                               and p.role in ('distributor','partner'))
) with check (
  accounts.company_id is not null
  and accounts.company_id = (select p.company_id from public.profiles p
                             where p.id = auth.uid() and p.active = true
                               and p.role in ('distributor','partner'))
);

-- Signed in as the partner, this returns their own accounts and no others.
-- Signed in as yourself, it returns everything as before.
select id, name, bu, country, company_id from public.accounts order by name limit 20;

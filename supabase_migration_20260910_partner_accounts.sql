-- A partner could not see a client list, or add a client to it.
--
-- Same shape as the deals fault, one table over: `accounts` is filtered by
-- business unit, and a distributor has no business unit — they have a company.
-- So the account picker came back empty, which reads on screen as "the client
-- name was lost", and "New client" inserted nothing at all, silently, because
-- the write policy refused it and nobody was checking the error.
--
-- Scoped to their own distributor record: the accounts they created and the
-- ones assigned to them. Not every account in the country — a partner has no
-- business browsing another partner's client list.
--
-- Safe to run more than once.

-- The link from a profile to its distributor, used by both policies below.
create or replace function public.my_distributor_ids()
returns setof uuid language sql stable security definer set search_path = public as $$
  select d.id
  from public.distributors d
  join public.profiles p on p.id = auth.uid()
  where p.active = true
    and p.role in ('distributor', 'partner')
    and d.company_id is not null
    and d.company_id = p.company_id;
$$;

revoke all on function public.my_distributor_ids() from anon;
grant execute on function public.my_distributor_ids() to authenticated;

drop policy if exists "accounts partner read" on public.accounts;
create policy "accounts partner read" on public.accounts for select using (
  accounts.distributor_id in (select public.my_distributor_ids())
);

drop policy if exists "accounts partner insert" on public.accounts;
create policy "accounts partner insert" on public.accounts for insert with check (
  accounts.distributor_id in (select public.my_distributor_ids())
);

-- They correct a name or a country on their own accounts. Deleting stays with
-- us: an account is referenced by deals, and a partner removing one takes the
-- history of somebody else's deal with it.
drop policy if exists "accounts partner update" on public.accounts;
create policy "accounts partner update" on public.accounts for update using (
  accounts.distributor_id in (select public.my_distributor_ids())
) with check (
  accounts.distributor_id in (select public.my_distributor_ids())
);

-- Signed in as the partner, this must return their own accounts and no others.
select id, name, bu, country, distributor_id from public.accounts order by name limit 20;

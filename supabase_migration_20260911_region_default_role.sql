-- A channel role a region can lend, so most partners need no setting at all.
--
-- Setting the role on every company is right and tedious. Most partners in a
-- pricing region sell the same way — that is largely why they are in the same
-- region — so the region can carry a default and the company only has to say
-- something when it differs.
--
-- What this is NOT: deriving the role from the country. R3 is a PRICE region:
-- it says what the list is worth in Chile, and it applies to whoever sells
-- there. A channel role says what a partner DOES for us, which is a contract
-- and not a geography. Two distributors in the same Chile can hold different
-- roles, and a rule that forbids that is a rule somebody will have to work
-- around within the year.
--
-- So it is a default and not a derivation. The precedence is:
--
--     the company's own channel_role       explicit, and wins
--     the region's default_channel_role    where the company says nothing
--     direct                               where neither says anything
--
-- The column starts null everywhere on purpose. Nobody has stated these, and a
-- default invented here would be a commercial policy chosen by a migration.
-- Set them in Permissions → Companies.
--
-- Requires supabase_migration_20260911_company_channel_role.sql.
--
-- Safe to run more than once.

alter table public.pricing_regions
  add column if not exists default_channel_role text;

alter table public.pricing_regions
  drop constraint if exists pricing_regions_default_role_check;

alter table public.pricing_regions
  add constraint pricing_regions_default_role_check
  check (default_channel_role is null or default_channel_role in
         ('direct', 'full_var', 'reseller', 'renewal', 'referral'));

comment on column public.pricing_regions.default_channel_role is
  'The channel role a partner in this region takes when their own company does not state one. A default, not a derivation: the region decides the price list, the agreement decides the role, and a company that says something overrides this.';

-- The regions, their list discount, and what role they lend.
select code, name, discount_pct,
       coalesce(default_channel_role, '— por definir —') as papel_por_omissao
from public.pricing_regions
order by code;

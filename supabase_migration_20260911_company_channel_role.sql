-- A partner's channel role, on the partner.
--
-- The quick deal asks "sold through" and offers five answers, and it defaults to
-- Direct. On a deal that belongs to TIMED Chile that default is wrong twice
-- over: it is not direct, and while it says direct the whole partner economics
-- panel stays hidden — so the person approving a discount cannot see the end
-- customer price, the transfer price, or what the partner makes. The panel was
-- built. It was waiting on an answer nobody could give.
--
-- Nobody could give it because the answer is not a property of the deal. It is a
-- property of the relationship: TIMED Chile is a Full VAR whatever they are
-- selling this week. Asking it per deal is asking the rep to remember a
-- commercial agreement they had no part in signing, and to remember it
-- identically every time.
--
-- So it goes on the company, once, set by an admin in Permissions → Companies,
-- and the quote reads it. It stays overridable per deal: a one-off really can
-- be direct, and a rule that cannot be broken on purpose gets worked around by
-- accident.
--
-- Null means "not set". It is left null rather than defaulted to anything,
-- because a company with no role stated should read as a question nobody has
-- answered, not as a Full VAR nobody chose.
--
-- Safe to run more than once.

alter table public.companies
  add column if not exists channel_role text;

alter table public.companies
  drop constraint if exists companies_channel_role_check;

alter table public.companies
  add constraint companies_channel_role_check
  check (channel_role is null or channel_role in
         ('direct', 'full_var', 'reseller', 'renewal', 'referral'));

comment on column public.companies.channel_role is
  'How this partner sells for us: full_var 40% · reseller 28% · renewal 25% · referral 15% · direct 0%. Read by the quote to work out the transfer price and the partner margin. Null means nobody has stated it — which is a question, not a default.';

-- Every distributor, and whether anybody has said how they sell.
select c.name, c.country, c.type, coalesce(c.channel_role, '— por definir —') as papel
from public.companies c
where c.type = 'distributor' and c.active is not false
order by c.name;

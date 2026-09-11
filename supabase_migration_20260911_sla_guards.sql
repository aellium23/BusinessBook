-- SEC-07: the other half of what June's item #7 asked for.
--
-- It said "no state transition validation (deals AND contracts)". SEC-03 closed
-- the deals on 11-09 and the contracts were left, which nobody had written down
-- until the assessment was dated. `canTransition('sla', …)` runs in the
-- SlaFormModal and there is nothing behind it, so a direct call:
--
--   supabase.from('slas').update({ status: 'active' }).eq('id', '<own>')
--
-- moves a contract from `draft` straight to active without a PO. From there it
-- counts towards the recurring revenue on the dashboard and towards the EST1.
--
-- Same shape as the deals, deliberately: the rule as data, a trigger that reads
-- it, admin exempt, and a test that diffs the two copies on every `npm run
-- test`. A second mechanism for the same kind of rule is a second mechanism to
-- get wrong.
--
-- ⚠ RUN SECTION 0 FIRST, ON ITS OWN, AND READ IT.
--
-- The eight statuses in `src/constants.js` are draft, waiting_po, warranty,
-- active, pending_renewal, renewed, expired and cancelled. But three screens
-- filter on `status = 'pipeline'`, which is not among them — and if any row
-- actually carries a status this machine has never heard of, that row must be
-- known about before a trigger starts refusing to move it.
--
-- Safe to run more than once.

-- ── 0. What is actually in there ────────────────────────────────────────────
-- Expect only the eight. Anything else, stop and say so before going on.

select status, count(*) as contratos, sum(annual_value) as valor
from public.slas
group by status
order by contratos desc;

-- ── 1. The lifecycle, as data ───────────────────────────────────────────────
-- Mirrors SLA_TRANSITIONS in src/lib/stateMachine.js, and the test in
-- src/lib/__tests__/writeGuards.test.js reads these pairs out of this file and
-- fails the build if the two ever disagree.

create table if not exists public.sla_status_transitions (
  from_status text not null,
  to_status   text not null,
  primary key (from_status, to_status)
);

comment on table public.sla_status_transitions is
  'Allowed contract status moves. Mirrors SLA_TRANSITIONS in src/lib/stateMachine.js; the trigger below is what enforces it.';

delete from public.sla_status_transitions;
insert into public.sla_status_transitions (from_status, to_status) values
  ('draft',           'waiting_po'),
  ('draft',           'cancelled'),
  -- A PO can arrive on a contract that starts inside its warranty, or on one
  -- that starts billing immediately.
  ('waiting_po',      'warranty'),
  ('waiting_po',      'active'),
  ('waiting_po',      'cancelled'),
  ('warranty',        'active'),
  ('warranty',        'cancelled'),
  ('active',          'pending_renewal'),
  ('active',          'cancelled'),
  ('active',          'expired'),
  ('pending_renewal', 'renewed'),
  ('pending_renewal', 'expired'),
  ('pending_renewal', 'cancelled'),
  ('renewed',         'active'),
  ('renewed',         'pending_renewal'),
  -- Expired reactivates, and cancelled goes back to the drawing board.
  ('expired',         'active'),
  ('cancelled',       'draft');

alter table public.sla_status_transitions enable row level security;

drop policy if exists "sla_status_transitions read" on public.sla_status_transitions;
create policy "sla_status_transitions read" on public.sla_status_transitions
  for select using (auth.uid() is not null);

drop policy if exists "sla_status_transitions write" on public.sla_status_transitions;
create policy "sla_status_transitions write" on public.sla_status_transitions
  for all using (public.is_admin_profile()) with check (public.is_admin_profile());

grant select on public.sla_status_transitions to authenticated;

-- ── 2. The guard ────────────────────────────────────────────────────────────

create or replace function public.slas_status_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status is not distinct from old.status then
    return new;
  end if;

  if public.is_admin_profile() then
    return new;
  end if;

  -- A contract carrying a status the machine has never heard of is a contract
  -- nobody can move, and freezing it helps no one. The move out is allowed; the
  -- move must still land somewhere real. Same escape hatch as the deals.
  if not exists (select 1 from public.sla_status_transitions where from_status = old.status) then
    if not exists (select 1 from public.sla_status_transitions
                   where from_status = new.status or to_status = new.status) then
      raise exception 'Status "%" is not a contract status.', new.status
        using errcode = 'check_violation';
    end if;
    return new;
  end if;

  if not exists (
    select 1 from public.sla_status_transitions
    where from_status = old.status and to_status = new.status
  ) then
    raise exception 'A contract cannot go from "%" to "%". Allowed: %.',
      old.status, new.status,
      coalesce((
        select string_agg(to_status, ', ' order by to_status)
        from public.sla_status_transitions where from_status = old.status
      ), 'nothing')
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists slas_status_guard on public.slas;
create trigger slas_status_guard
  before update of status on public.slas
  for each row execute function public.slas_status_guard();

-- INSERT is not guarded, for the same reason as the deals: a contract may
-- legitimately be created at any status — an import, or one that reaches us
-- already active. The machine governs movement.

-- ── Verification ────────────────────────────────────────────────────────────
-- Seventeen rows and one trigger. The SQL editor is exempt from the guard by
-- design, so trying a bad move here proves nothing.
select
  (select count(*) from public.sla_status_transitions) as transicoes,
  (select count(*) from pg_trigger
     where tgname = 'slas_status_guard' and not tgisinternal) as triggers;

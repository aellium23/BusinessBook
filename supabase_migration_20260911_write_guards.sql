-- Two rules that only existed in the browser, moved to where they hold.
--
-- SEC-03 — the deal stage machine. `src/lib/stateMachine.js` says a Lead goes to
-- Pipeline or to Lost and nowhere else, and the select on the form offers only
-- those. The policy on `deals` checks the company and nothing else, so:
--
--   supabase.from('deals').update({ stage: 'Invoiced' }).eq('id', '<own deal>')
--
-- moves a Lead straight to invoiced. That counts for the funnel, for sales by
-- client and for the SAP reconciliation — a partner can inflate revenue we
-- report, and so can our own reps.
--
-- SEC-04 — cost on `deal_products`. Closing SEC-01 took SELECT off `cost_price`
-- and `margin_pct` and left INSERT and UPDATE, because the quote writes cost.
-- But the write policy lets a partner change any line of their own company's
-- deals, those columns included. They cannot read our cost. They can overwrite
-- it, and our margins come off it.
--
-- A grant cannot separate them: at the Postgres level a rep of ours and a
-- distributor are both `authenticated`, and a column grant does not know the
-- difference. It has to be RLS or a trigger, and a trigger is what expresses
-- "the value you may not read is the value you may not change".
--
-- WHO IS EXEMPT, because a rule with no exit gets worked around by accident:
-- admins, for data corrections and imports. Managers are not exempt — nobody
-- fixing history should be doing it without meaning to. Neither is the SQL
-- editor blocked: it runs as the superuser with no `auth.uid()`, and an account
-- that owns the database is not a threat this can address.
--
-- Safe to run more than once.

-- ── 1. Who may go round the rules ───────────────────────────────────────────
-- First, because the policies below already ask it.

create or replace function public.is_admin_profile()
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is null or exists (
    select 1 from public.profiles
    where id = auth.uid() and active = true and role = 'admin'
  );
$$;

comment on function public.is_admin_profile is
  'True for an active admin, and true when there is no authenticated user at all — the SQL editor and the service role, which own the database and are not a threat a trigger can address.';

revoke all on function public.is_admin_profile() from anon;
grant execute on function public.is_admin_profile() to authenticated;

-- ── 2. The stage machine, as data ───────────────────────────────────────────
--
-- A table rather than a CASE inside the function, so the rule can be read,
-- queried and compared against `DEAL_TRANSITIONS` in the app. Two copies of a
-- rule is one more than anybody wants; two copies that can be diffed is the
-- best available answer while the client still has to draw the select.

create table if not exists public.deal_stage_transitions (
  from_stage text not null,
  to_stage   text not null,
  primary key (from_stage, to_stage)
);

comment on table public.deal_stage_transitions is
  'Allowed deal stage moves. Mirrors DEAL_TRANSITIONS in src/lib/stateMachine.js; the trigger below is what enforces it.';

-- Rewritten every run, so the table is the file and never drifts from it.
delete from public.deal_stage_transitions;
insert into public.deal_stage_transitions (from_stage, to_stage) values
  ('Lead',            'Pipeline'),
  -- Skipping Pipeline is ordinary, and a distributor has no Pipeline at all: the
  -- form intersects their four stages with the allowed moves, and from a Lead
  -- that intersection was "Lost" and nothing else. See stateMachine.js.
  ('Lead',            'Offer Presented'),
  ('Lead',            'Lost'),
  ('Pipeline',        'Offer Presented'),
  ('Pipeline',        'Lead'),
  ('Pipeline',        'Lost'),
  ('Offer Presented', 'BackLog'),
  ('Offer Presented', 'Pipeline'),
  ('Offer Presented', 'Lost'),
  ('BackLog',         'Invoiced'),
  ('BackLog',         'Offer Presented'),
  ('BackLog',         'Lost'),
  -- Invoiced is terminal except for a correction, and Lost reopens as a Lead.
  ('Invoiced',        'Lost'),
  ('Lost',            'Lead');

alter table public.deal_stage_transitions enable row level security;

drop policy if exists "deal_stage_transitions read" on public.deal_stage_transitions;
create policy "deal_stage_transitions read" on public.deal_stage_transitions
  for select using (auth.uid() is not null);

drop policy if exists "deal_stage_transitions write" on public.deal_stage_transitions;
create policy "deal_stage_transitions write" on public.deal_stage_transitions
  for all using (public.is_admin_profile()) with check (public.is_admin_profile());

grant select on public.deal_stage_transitions to authenticated;

-- ── 3. SEC-03: the stage may only move where the machine says ───────────────

create or replace function public.deals_stage_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.stage is not distinct from old.stage then
    return new;
  end if;

  if public.is_admin_profile() then
    return new;
  end if;

  -- A deal carrying a stage the machine has never heard of is a deal nobody can
  -- move, and freezing it helps no one. The move out is allowed; the move must
  -- still land somewhere real.
  if not exists (select 1 from public.deal_stage_transitions where from_stage = old.stage) then
    if not exists (select 1 from public.deal_stage_transitions where from_stage = new.stage or to_stage = new.stage) then
      raise exception 'Stage "%" is not a stage.', new.stage
        using errcode = 'check_violation';
    end if;
    return new;
  end if;

  if not exists (
    select 1 from public.deal_stage_transitions
    where from_stage = old.stage and to_stage = new.stage
  ) then
    raise exception 'A deal cannot go from "%" to "%". Allowed: %.',
      old.stage, new.stage,
      coalesce((
        select string_agg(to_stage, ', ' order by to_stage)
        from public.deal_stage_transitions where from_stage = old.stage
      ), 'nothing')
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

drop trigger if exists deals_stage_guard on public.deals;
create trigger deals_stage_guard
  before update of stage on public.deals
  for each row execute function public.deals_stage_guard();

-- INSERT is deliberately not guarded: a deal may legitimately be created at any
-- stage — an import, or a deal that reaches us already won. The machine governs
-- movement, and a deal that starts at Invoiced started there.

-- ── 4. SEC-04: the value you cannot read is the value you cannot change ─────

create or replace function public.deal_products_cost_guard()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if public.sees_internal_economics() then
    return new;
  end if;

  -- Coerced, not rejected. A partner's quote sends these columns on every save
  -- and sends them empty, which is not an attempt at anything — raising here
  -- would break every legitimate save to punish a case that does not happen on
  -- the way in. What it must never do is let a value through.
  if tg_op = 'INSERT' then
    new.cost_price := null;
    new.margin_pct := null;
  else
    new.cost_price := old.cost_price;
    new.margin_pct := old.margin_pct;
  end if;

  return new;
end;
$$;

drop trigger if exists deal_products_cost_guard on public.deal_products;
create trigger deal_products_cost_guard
  before insert or update on public.deal_products
  for each row execute function public.deal_products_cost_guard();

-- ── 5. What this leaves open — and how it was closed ────────────────────────
--
-- As written, this did not stop a partner destroying our cost by another route:
-- `saveDealProducts` deleted every line of a deal and reinserted it, so the cost
-- went with the deleted row and the reinserted line came back null.
--
-- Closed later the same day (SEC-06), and by this very trigger. The UPDATE
-- branch below puts the old cost back, so the fix was to stop deleting: the save
-- now updates lines in place and deletes only what was taken off the quote. See
-- `src/lib/reconcileLines.js`.
--
-- The question underneath it — whether a partner may edit a deal we created at
-- all — was answered on 11-09: yes. Whoever runs the deal day to day is the
-- partner, and a deal nobody on the ground can update is worse than one they can.

-- ── Verification ────────────────────────────────────────────────────────────
-- Fourteen rows, and the two triggers present. Everything else this migration
-- does can only be proved from an actual session — the SQL editor is exempt from
-- both guards by design, so trying them here proves nothing.
select
  (select count(*) from public.deal_stage_transitions) as transicoes,
  (select count(*) from pg_trigger
     where tgname in ('deals_stage_guard', 'deal_products_cost_guard')
       and not tgisinternal) as triggers;

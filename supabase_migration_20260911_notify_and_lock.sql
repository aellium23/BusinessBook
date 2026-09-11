-- Two things about notifications: one nobody sends, and one anybody can forge.
--
-- 1. A counter-offer that comes back the other way tells nobody.
--
-- Every other step in a discount negotiation ends in a notification. An
-- approver answers and the requester is told; the requester accepts a counter
-- and the approver is told. But when the requester counters BACK — a second
-- round, at a new percentage, with a new reason — the row is inserted by the
-- client and the approver hears nothing. They find out by happening to open
-- Approvals. A negotiation where one side has to keep checking is a negotiation
-- that stalls, and it stalls on our side of a partner's deal.
--
-- So asking again becomes a function, which can both write the row and tell the
-- person who answered the last round. It carries the value at risk across per
-- point of discount, so a second ask at 15% against a first at 20% is worth
-- three quarters of it and the approval card is right without anybody
-- recomputing anything.
--
-- 2. `notifications` is writable by anybody, for anybody.
--
-- The policy is FOR ALL with "any active profile" on both sides. That is not
-- just an open insert — USING covers UPDATE and DELETE too, and it names no
-- owner. Any signed-in user can write a notification addressed to anyone, mark
-- somebody else's as read, or delete them. Defensible when only our own people
-- had profiles; not now that partners do.
--
-- Reading was already correct (`user_id = auth.uid()`) and is left alone. What
-- replaces the write policy is: you may mark your own read, and you may delete
-- your own.
--
-- INSERT is deliberately left as it was, and this is a judgement rather than an
-- oversight. Three screens raise a notification addressed to somebody else —
-- sending a quotation, answering one, raising a discount request — and all
-- three swallow the error if the write fails. Closing insert today would
-- silence them without a word to anybody, which is a worse failure than the one
-- being fixed: a partner could still not change any data, only send a message.
-- The way to close it is to move those three onto definer functions, one at a
-- time, each verified. `ask_discount_again` below is the first of them.
--
-- Requires supabase_migration_20260910_apply_partner_discount.sql.
--
-- Safe to run more than once.

drop function if exists public.ask_discount_again(uuid, numeric, text);

create or replace function public.ask_discount_again(
  p_request_id uuid,
  p_pct        numeric,
  p_note       text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old    public.deal_discount_requests%rowtype;
  v_new_id uuid;
  v_client text;
  v_risk   numeric;
begin
  select * into v_old from public.deal_discount_requests where id = p_request_id;
  if not found then raise exception 'Request not found'; end if;

  -- Only the person who asked may ask again. An approver who wants to move
  -- their own number answers the request instead.
  if v_old.requested_by <> auth.uid() then
    raise exception 'Only the requester can ask again';
  end if;
  if v_old.status <> 'counter' then
    raise exception 'There is no counter-offer to answer';
  end if;
  if coalesce(p_pct, 0) <= 0 then
    raise exception 'A new request needs a percentage';
  end if;

  -- What this ask is worth, carried across per point of the last one. Null
  -- stays null: a figure nobody knows is not zero.
  v_risk := case
    when coalesce(v_old.requested_pct, 0) > 0 and v_old.value_at_risk is not null
    then round(v_old.value_at_risk * p_pct / v_old.requested_pct, 2)
    else null
  end;

  -- A new row rather than an edit of the old one, so the negotiation keeps its
  -- history: what was asked, what came back, what was asked next.
  insert into public.deal_discount_requests (
    deal_id, product_id, requested_by, requested_pct, brand, supplier_code,
    route, channel, status, scope, value_at_risk, justification
  ) values (
    v_old.deal_id, v_old.product_id, auth.uid(), p_pct, v_old.brand,
    v_old.supplier_code, v_old.route, v_old.channel, 'pending', v_old.scope,
    v_risk, p_note
  )
  returning id into v_new_id;

  select client into v_client from public.deals where id = v_old.deal_id;

  -- Tell whoever answered the last round. Without this the ball is in our court
  -- and nothing says so.
  if v_old.responded_by is not null then
    insert into public.notifications (user_id, type, title, body, link_type, link_id)
    values (
      v_old.responded_by,
      'discount_request',
      'Counter answered: ' || coalesce(v_client, 'Deal'),
      'They came back at ' || p_pct || '% against your ' ||
        coalesce(v_old.approved_pct::text, '—') || '%.',
      'deal',
      v_old.deal_id
    );
  end if;

  return v_new_id;
end $$;

revoke all on function public.ask_discount_again(uuid, numeric, text) from anon;
grant execute on function public.ask_discount_again(uuid, numeric, text) to authenticated;

-- ── notifications: yours to read, yours to clear, nobody's to forge ──────────

drop policy if exists "notifications write" on public.notifications;

-- Unchanged in effect, narrowed in scope: this now covers INSERT only, where
-- the old FOR ALL also handed out UPDATE and DELETE on everybody's rows.
drop policy if exists "notifications insert" on public.notifications;
create policy "notifications insert" on public.notifications for insert with check (
  exists (select 1 from public.profiles where id = auth.uid() and active = true)
);

drop policy if exists "notifications update own" on public.notifications;
create policy "notifications update own" on public.notifications for update
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "notifications delete own" on public.notifications;
create policy "notifications delete own" on public.notifications for delete
  using (user_id = auth.uid());

-- Signed in as anyone, this returns their own notifications and nobody else's.
select id, type, title, read, created_at
from public.notifications order by created_at desc limit 10;

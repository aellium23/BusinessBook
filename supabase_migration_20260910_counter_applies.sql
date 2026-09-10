-- A counter-offer that is accepted must move the money too.
--
-- Granting a discount lowers what the partner pays us, and that arithmetic
-- lives in respond_discount_request. But a counter-offer is not a grant: it
-- waits for the partner to accept, and acceptance goes through
-- accept_counter_offer, which sets the request to approved and never touched
-- the transfer price.
--
-- So the moment the screen started turning a lowered approval into a counter —
-- which is what it is — every countered discount stopped being applied. The
-- request said approved, the partner believed it, and what they pay us stayed
-- where it was.
--
-- Same arithmetic, same guard: the money is taken off at the percentage that
-- was actually agreed, and `applied_at` stops it being taken off twice if the
-- request is answered again.
--
-- Requires supabase_migration_20260910_apply_partner_discount.sql, which adds
-- applied_at and the matching logic on the approval side.
--
-- Safe to run more than once.

drop function if exists public.accept_counter_offer(uuid);

create or replace function public.accept_counter_offer(p_request_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req    public.deal_discount_requests%rowtype;
  v_client text;
  v_relief numeric;
begin
  select * into v_req from public.deal_discount_requests where id = p_request_id;
  if not found then raise exception 'Request not found'; end if;

  -- Only the original requester can accept the counter
  if v_req.requested_by <> auth.uid() then
    raise exception 'Only the requester can accept this counter-offer';
  end if;
  if v_req.status <> 'counter' then
    raise exception 'Request is not a counter-offer';
  end if;

  update public.deal_discount_requests set
    status        = 'approved',
    response_note = coalesce(response_note, '') || ' · Accepted by distributor',
    responded_at  = now()
  where id = p_request_id;

  update public.deals set
    discount_status   = 'approved',
    discount_approved = v_req.approved_pct
  where id = v_req.deal_id
  returning client into v_client;

  -- The countered percentage is the one that was agreed, so it is the one the
  -- money follows.
  if v_req.applied_at is null
     and coalesce(v_req.requested_pct, 0) > 0
     and coalesce(v_req.value_at_risk, 0) > 0
     and coalesce(v_req.approved_pct, 0) > 0
  then
    v_relief := round(v_req.value_at_risk * v_req.approved_pct / v_req.requested_pct, 2);

    update public.deal_channel
      set partner_transfer = greatest(0, coalesce(partner_transfer, 0) - v_relief),
          updated_at = now()
    where deal_id = v_req.deal_id;

    if found then
      update public.deal_discount_requests
        set applied_at = now() where id = p_request_id;
    end if;
  end if;

  -- Notify the approver who made the counter
  if v_req.responded_by is not null then
    insert into public.notifications (user_id, type, title, body, link_type, link_id)
    values (
      v_req.responded_by,
      'discount_response',
      'Counter accepted: ' || coalesce(v_client, 'Deal'),
      'Distributor accepted the ' || coalesce(v_req.approved_pct::text, '—') || '% counter-offer.',
      'deal',
      v_req.deal_id
    );
  end if;
end $$;

revoke all on function public.accept_counter_offer(uuid) from anon;
grant execute on function public.accept_counter_offer(uuid) to authenticated;

select id, status, requested_pct, approved_pct, value_at_risk, applied_at
from public.deal_discount_requests
order by created_at desc limit 10;

-- An approved discount moves the figure it was asked about.
--
-- A partner's discount comes off what they pay us. Until now, approving one
-- recorded the answer and left the stored transfer price where it was, so the
-- approval card kept showing the pre-approval position and the partner's margin
-- never actually improved anywhere but on their own screen.
--
-- The obstacle looked bigger than it is. Requests are per product line and
-- `deal_channel.partner_transfer` is one figure for the whole deal, so a
-- percentage cannot simply be applied to the total — 20% off the Dose line is
-- not 20% off the deal. But the request already carries `value_at_risk`: the
-- money that request is worth at the percentage it asked for. From that, the
-- line's own cost is recoverable, and the relief at whatever percentage is
-- actually granted is exact:
--
--   line cost = value_at_risk × 100 / requested_pct
--   relief    = line cost × approved_pct / 100
--             = value_at_risk × approved_pct / requested_pct
--
-- No proportional guessing, and a counter-offer at half the ask takes off
-- exactly half.
--
-- Applied once. A request answered twice — countered, then approved — must not
-- take the money off twice, so the moment of application is stamped on the row
-- and checked before doing it again.
--
-- Safe to run more than once.

alter table public.deal_discount_requests
  add column if not exists applied_at timestamptz;

comment on column public.deal_discount_requests.applied_at is
  'When this response was applied to the stored figures. Null = never applied. Stops a re-answered request being subtracted twice.';

drop function if exists public.respond_discount_request(uuid, text, numeric, text);

create or replace function public.respond_discount_request(
  p_request_id uuid,
  p_status     text,
  p_approved_pct numeric,
  p_note       text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req    public.deal_discount_requests%rowtype;
  v_client text;
  v_can    boolean;
  v_body   text;
  v_relief numeric;
begin
  select * into v_req from public.deal_discount_requests where id = p_request_id;
  if not found then raise exception 'Request not found'; end if;

  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.active = true
      and (
        p.role in ('admin','manager')
        or (v_req.brand is not null and p.approves_brands ? v_req.brand)
      )
  ) into v_can;
  if not v_can then raise exception 'Not authorized to respond to this request'; end if;

  if p_status not in ('approved','rejected','counter') then
    raise exception 'Invalid status %', p_status;
  end if;

  update public.deal_discount_requests set
    status        = p_status,
    approved_pct  = case when p_status in ('approved','counter') then p_approved_pct else null end,
    response_note = p_note,
    responded_by  = auth.uid(),
    responded_at  = now()
  where id = p_request_id;

  update public.deals set
    discount_status   = p_status,
    discount_approved = case when p_status in ('approved','counter') then p_approved_pct else null end
  where id = v_req.deal_id
  returning client into v_client;

  -- The money comes off what the partner pays us, once, at the percentage
  -- actually granted rather than the one that was asked for.
  if p_status = 'approved'
     and v_req.applied_at is null
     and coalesce(v_req.requested_pct, 0) > 0
     and coalesce(v_req.value_at_risk, 0) > 0
  then
    v_relief := round(v_req.value_at_risk * coalesce(p_approved_pct, v_req.requested_pct)
                      / v_req.requested_pct, 2);

    update public.deal_channel
      set partner_transfer = greatest(0, coalesce(partner_transfer, 0) - v_relief),
          updated_at = now()
    where deal_id = v_req.deal_id;

    if found then
      update public.deal_discount_requests
        set applied_at = now() where id = p_request_id;
    end if;
  end if;

  -- Notify the requester
  if v_req.requested_by is not null then
    v_body := case
      when p_status = 'approved' then 'Your ' || v_req.requested_pct || '% discount was approved.'
      when p_status = 'counter'  then 'Counter-offer: ' || coalesce(p_approved_pct::text,'—') || '%.'
      else 'Your discount request was rejected.'
    end;
    insert into public.notifications (user_id, type, title, body, link_type, link_id)
    values (
      v_req.requested_by,
      'discount_response',
      'Discount ' || p_status || ': ' || coalesce(v_client, 'Deal'),
      v_body,
      'deal',
      v_req.deal_id
    );
  end if;
end $$;

revoke all on function public.respond_discount_request(uuid, text, numeric, text) from anon;
grant execute on function public.respond_discount_request(uuid, text, numeric, text) to authenticated;

select id, status, requested_pct, approved_pct, value_at_risk, applied_at
from public.deal_discount_requests
order by created_at desc limit 10;

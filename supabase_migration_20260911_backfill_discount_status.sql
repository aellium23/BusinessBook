-- Deals with a live discount request and nothing on the deal to say so.
--
-- The quick deal filed its requests and never touched the deal's own
-- discount_status: that column was only ever written when somebody *answered*.
-- So between asking and being answered, a deal carried an open question with no
-- sign of it — no chip on the card, no bucket in the banner on Deals, nothing
-- for the partner who raised it.
--
-- The code no longer leaves it blank. This repairs the ones already in that
-- state: the newest request still open on each deal decides what the deal says.
-- Deals that already carry a status are left exactly as they are, because the
-- answer is more recent than anything this could infer.
--
-- Safe to run more than once — after the first run there is nothing left to
-- match.

update public.deals d
set discount_status    = r.status,
    discount_requested = coalesce(d.discount_requested, r.requested_pct)
from (
  select distinct on (deal_id) deal_id, status, requested_pct
  from public.deal_discount_requests
  where status in ('pending', 'counter')
  order by deal_id, created_at desc
) r
where r.deal_id = d.id
  and d.discount_status is null;

-- Every deal that has a request, and what each of them now says. A row here
-- with a blank status is a deal whose requests are all settled, which is right.
select d.client,
       d.discount_status,
       d.discount_requested,
       count(r.id) as requests,
       max(r.created_at) as latest_request
from public.deals d
join public.deal_discount_requests r on r.deal_id = d.id
group by d.id, d.client, d.discount_status, d.discount_requested
order by latest_request desc;

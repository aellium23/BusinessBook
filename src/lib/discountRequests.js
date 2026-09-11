// Answering a discount, from either end.
//
// The same two actions are needed in two places — on the approvals list, where
// a partner sees every reply, and inside the quote itself, where they are
// actually working — and a negotiation whose rules live in two copies drifts
// into two negotiations. So they live here.
//
// Accepting is a definer function: the money comes off what the partner pays us
// and a partner cannot write that themselves. Asking again is an ordinary
// insert, because a request is theirs to make.

import { supabase } from './supabase'

/**
 * What every read of a discount request brings back.
 *
 * `deal_id` is first in the list and it is the reason the list exists. The
 * per-deal query filtered on deal_id and did not select it, so every row it
 * returned carried `deal_id: undefined` — which looked harmless until a
 * distributor answered a counter-offer and the new request was written with a
 * null deal. The database refused it, correctly, and the partner was told
 * "null value in column deal_id violates not-null constraint" for the crime of
 * negotiating.
 *
 * A column you filter on is a column you use. One list, shared by both queries,
 * so the next reader cannot be handed a row missing the field they are about
 * to read.
 */
const REQUEST_COLUMNS =
  'deal_id, id, product_id, requested_pct, approved_pct, status, justification, ' +
  'response_note, requested_by, brand, supplier_code, route, channel, scope, ' +
  'value_at_risk, created_at, responded_at'

/** Take the counter-offer as it stands. */
export async function acceptCounter(requestId) {
  return supabase.rpc('accept_counter_offer', { p_request_id: requestId })
}

/**
 * Another round.
 *
 * A NEW request rather than an edit of the old one, so the negotiation keeps
 * its history: what was asked, what came back, what was asked next. Each round
 * carries its own reason, and the approver reads the reason for THIS ask rather
 * than the one that was already answered.
 *
 * It is a definer function and not an insert, for the notification. Every other
 * step in this negotiation ends in one — an approver answers and the requester
 * is told, a requester accepts and the approver is told — but a counter coming
 * back the other way told nobody, and the approver found out by happening to
 * open Approvals. A negotiation where one side has to keep checking stalls, and
 * it stalled on our side of a partner's deal.
 *
 * The arithmetic went with it: what the new ask is worth is carried across per
 * point of discount, so a second request at 15 % against a first at 20 % is
 * worth three quarters of it.
 */
export async function askAgain(req, pct, note) {
  return supabase.rpc('ask_discount_again', {
    p_request_id: req.id,
    p_pct: parseFloat(pct) || 0,
    p_note: note || null,
  })
}

/** Everything still open or answered on one deal, newest first. */
export async function requestsForDeal(dealId) {
  return supabase.from('deal_discount_requests')
    .select(REQUEST_COLUMNS)
    .eq('deal_id', dealId)
    .order('created_at', { ascending: false })
}

/**
 * Everything of mine that has not finished, newest first.
 *
 * Two states qualify and they point in opposite directions: `counter` is
 * waiting on the person who asked, `pending` is waiting on us. A dashboard that
 * lumps them together tells a distributor there are four things outstanding
 * when only one of them is theirs to move, so the caller is given both and
 * splits them.
 *
 * The client comes back with each row because "a counter-offer on a deal" is
 * not something anybody can act on, and "20% countered on Hospital de Braga"
 * is. The embedded read is filtered by the deals policy in its own right, so a
 * partner sees their own company's and nothing else.
 */
export async function openRequestsFor(userId) {
  return supabase.from('deal_discount_requests')
    .select(`${REQUEST_COLUMNS}, deals!inner(client, stage)`)
    .in('status', ['pending', 'counter'])
    .eq('requested_by', userId)
    .order('created_at', { ascending: false })
}

/** What a request is waiting for, in one word the screen can colour. */
export function requestState(req) {
  if (req.status === 'counter') return 'counter'
  if (req.status === 'approved') return 'approved'
  if (req.status === 'rejected') return 'rejected'
  if (req.status === 'to_request') return 'unfiled'
  return 'pending'
}

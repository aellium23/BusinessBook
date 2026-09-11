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
 * What the new ask is worth in money is carried across per point of discount,
 * so a second request at 15 % against a first at 20 % is worth three quarters
 * of it — and the approval card is right without anybody recomputing anything.
 */
export async function askAgain(req, pct, note, requestedBy) {
  const asked = parseFloat(pct) || 0
  const perPoint = Number(req.requested_pct) > 0 && req.value_at_risk
    ? Number(req.value_at_risk) / Number(req.requested_pct)
    : null

  return supabase.from('deal_discount_requests').insert({
    deal_id: req.deal_id,
    product_id: req.product_id,
    requested_by: requestedBy || null,
    requested_pct: asked,
    brand: req.brand,
    supplier_code: req.supplier_code,
    route: req.route,
    channel: req.channel,
    status: 'pending',
    scope: req.scope,
    value_at_risk: perPoint ? Math.round(perPoint * asked * 100) / 100 : null,
    justification: note,
  })
}

/** Everything still open or answered on one deal, newest first. */
export async function requestsForDeal(dealId) {
  return supabase.from('deal_discount_requests')
    .select('id, product_id, requested_pct, approved_pct, status, justification, response_note, ' +
            'requested_by, brand, supplier_code, route, channel, scope, value_at_risk, ' +
            'created_at, responded_at')
    .eq('deal_id', dealId)
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

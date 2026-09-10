// Where a discount goes, and what it does to the numbers.
//
// Two things are called a discount and they are opposites.
//
// On a product we make — CWM, sold by VGT — a discount comes off the CUSTOMER
// price. It costs us margin, so somebody has to approve it, and the Approvals
// module already routes that by brand.
//
// On a product we buy — Synapse, the partner AI, anything from HCUS or Medsky —
// a discount comes off OUR COST, because it is something we ask the supplier
// for. It improves margin, nobody here approves it, and it does not exist until
// a rep files it: a case in HCUS's Salesforce, an email to Medsky. What that
// needs is not an approver's queue but a reminder, and a record of whether the
// request was ever actually made.
//
// Treating the second as if it were the first is how a quote comes to depend on
// a supplier discount that no one ever asked for.

const num = v => (v === null || v === undefined || v === '' ? null : Number(v))

export const ROUTE_INTERNAL = 'internal'
export const ROUTE_EXTERNAL = 'external'

/**
 * How a discount on this product has to be handled.
 *
 * @param {object} supplier  a row from `suppliers`, or null when unassigned
 * @returns {{route, channel, initialStatus, appliesTo}}
 */
export function routeFor(supplier) {
  // No supplier set yet: treat it as ours and send it for approval. Approval is
  // the safe default — the worst case is a question asked needlessly, where the
  // other way round is a discount granted that nobody sanctioned.
  if (!supplier || supplier.kind === 'internal') {
    return {
      route: ROUTE_INTERNAL,
      channel: supplier?.request_channel || 'Approvals',
      initialStatus: 'pending',
      appliesTo: 'price',
    }
  }
  return {
    route: ROUTE_EXTERNAL,
    channel: supplier.request_channel || 'Email',
    initialStatus: 'to_request',
    appliesTo: 'cost',
  }
}

/**
 * The line's numbers once a discount is taken into account.
 *
 * An internal discount comes off the price and is applied as quoted — the rep
 * has committed to it and is asking permission. An external one comes off the
 * cost but is only a request, so `granted` says whether it may be counted on;
 * until the supplier answers, the honest figure is the undiscounted cost.
 */
export function applyDiscount({ appliesTo, pct, cost, pvp, granted = false }) {
  const p = Math.min(100, Math.max(0, num(pct) ?? 0))
  const c = num(cost) ?? 0
  const v = num(pvp) ?? 0
  if (p === 0) return { cost: r(c), pvp: r(v), speculative: false }

  if (appliesTo === 'cost') {
    return {
      cost: r(granted ? c * (1 - p / 100) : c),
      pvp: r(v),
      // Asked for but not yet granted: the margin on screen is the one we have,
      // not the one we hope for.
      speculative: !granted,
    }
  }
  return { cost: r(c), pvp: r(v * (1 - p / 100)), speculative: false }
}

/** Statuses an external request moves through, in order. */
export const EXTERNAL_FLOW = ['to_request', 'requested', 'approved', 'rejected']

/** Still waiting on somebody. */
export function isOpen(status) {
  return ['pending', 'counter', 'to_request', 'requested'].includes(status)
}

/** Days a request has been sitting, for the worklist to sort and shame by. */
export function daysWaiting(since, now = Date.now()) {
  const t = since ? new Date(since).getTime() : NaN
  if (!Number.isFinite(t)) return 0
  return Math.max(0, Math.floor((now - t) / 86400000))
}

function r(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

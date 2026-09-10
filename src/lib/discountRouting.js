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

/**
 * The same quote seen two ways.
 *
 * `actual` counts only what we have: a supplier discount that has been asked
 * for but not granted changes nothing. `ifApproved` counts the pending ones as
 * if they had landed. The distance between them is not decoration — it is the
 * part of this deal's margin that depends on somebody else saying yes, and it
 * belongs on the card next to the margin itself.
 *
 * A discount on our own price needs no view: it is already in the quote,
 * because offering it is the rep's decision and they have made it.
 *
 * @param lines  [{ cost, pvp, pendingCostRelief }] — relief is what our cost
 *               would fall by if every unanswered supplier discount landed.
 */
export function discountViews(lines) {
  const rows = lines || []
  const cost = rows.reduce((s, l) => s + (num(l.cost) ?? 0), 0)
  const pvp = rows.reduce((s, l) => s + (num(l.pvp) ?? 0), 0)
  const relief = rows.reduce((s, l) => s + (num(l.pendingCostRelief) ?? 0), 0)

  return {
    actual: totals(cost, pvp),
    ifApproved: totals(Math.max(0, cost - relief), pvp),
    atRisk: r(relief),
    hasPending: relief > 0,
  }
}

function totals(cost, pvp) {
  const gm = pvp - cost
  return {
    cost: r(cost), pvp: r(pvp), grossMargin: r(gm),
    marginPct: pvp > 0 ? Math.round((gm / pvp) * 1000) / 10 : 0,
  }
}

// The fiscal year runs April to March, so Q1 is Apr-Jun and Q4 is Jan-Mar.
const FY_MONTHS = ['apr','may','jun','jul','aug','sep','oct','nov','dec','jan','feb','mar']

/** Fiscal quarter (1-4) for a month key, or null if it is not a month. */
export function fiscalQuarter(monthKey) {
  const i = FY_MONTHS.indexOf(String(monthKey || '').slice(0, 3).toLowerCase())
  return i < 0 ? null : Math.floor(i / 3) + 1
}

/**
 * Margin waiting on somebody else, grouped so it can be acted on.
 *
 * Split by who has the ball, because the two halves need different things from
 * whoever reads this. `unfiled` is ours: a discount promised to a customer that
 * nobody has asked the supplier for, and every day it sits there is a day of
 * our own making. `awaiting` is theirs, and all we can do is chase.
 *
 * @param rows  from the deal_open_discounts view
 */
export function riskSummary(rows, { bu = '' } = {}) {
  const list = (rows || []).filter(r => !bu || r.bu === bu)
  const sum = (f) => r2(list.filter(f).reduce((s, x) => s + (num(x.value_at_risk) ?? 0), 0))

  const byQuarter = {}
  for (const row of list) {
    const q = fiscalQuarter(row.rec_month)
    const key = q ? `Q${q}` : 'unscheduled'
    byQuarter[key] = r2((byQuarter[key] || 0) + (num(row.value_at_risk) ?? 0))
  }

  return {
    total: sum(() => true),
    unfiled: sum(r => Number(r.unfiled) > 0),
    awaiting: sum(r => !(Number(r.unfiled) > 0)),
    deals: list.length,
    unfiledDeals: list.filter(r => Number(r.unfiled) > 0).length,
    oldestDays: list.reduce((m, r) => Math.max(m, Number(r.oldest_days) || 0), 0),
    byQuarter,
  }
}

function r2(n) { return Math.round((n + Number.EPSILON) * 100) / 100 }

function r(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

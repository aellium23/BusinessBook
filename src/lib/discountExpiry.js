// Discounts expire, and one of them is taken back.
//
// A discount is bought with a reason, and the reason has a life. The tender is
// over. An incumbent can only be displaced once — at the renewal we ARE the
// incumbent. A five-year term that was signed is not signed again by being
// mentioned. So nothing carries forward on its own:
//
//   1. No discount carries into renewal automatically. Each is re-tested
//      against its own evidence, and the renewal quote starts from the REGIONAL
//      LIST PRICE, not from last year's net. Starting from last year's net is
//      how a one-off concession becomes the price forever.
//
//   2. The lighthouse discount is clawed back if the reference is not delivered
//      within twelve months — named champion, site visits, published case
//      study. Without the clawback it is a 10 % price cut with a story attached.
//
//   3. The bundle discount dies with the bundle. Drop a product at renewal and
//      three-product 15 % becomes two-product 10 %.
//
// The renewal rule is the one that costs real money and the one nobody enforces,
// because the easy thing at renewal is to open last year's quote.

import { bundlePct } from './dealDiscounts'

const num = v => (v === null || v === undefined || v === '' ? null : Number(v))
const DAY = 86400000

/** The reference has a year to arrive. */
export const LIGHTHOUSE_CLAWBACK_MONTHS = 12

/** When a reason has to have proved itself, or be taken back. */
export function dueAt(createdAt, { months = LIGHTHOUSE_CLAWBACK_MONTHS } = {}) {
  const t = createdAt ? new Date(createdAt) : null
  if (!t || Number.isNaN(t.getTime())) return null
  const d = new Date(t)
  d.setMonth(d.getMonth() + months)
  return d
}

/** Days past due, or 0 while there is still time. */
export function daysOverdue(due, now = Date.now()) {
  const t = due ? new Date(due).getTime() : NaN
  if (!Number.isFinite(t)) return 0
  return Math.max(0, Math.floor((now - t) / DAY))
}

/**
 * What is owed and by when, for the lighthouse discounts on the books.
 *
 * @param rows  from the discount_reason_clawbacks view
 */
export function clawbackSummary(rows, { bu = '', now = Date.now() } = {}) {
  const list = (rows || []).filter(r => !bu || r.bu === bu)
  const overdue = list.filter(r => daysOverdue(r.due_at, now) > 0)
  return {
    deals: overdue.length,
    value: round(overdue.reduce((s, r) => s + (num(r.value_at_risk) ?? 0), 0)),
    oldestDays: overdue.reduce((m, r) => Math.max(m, daysOverdue(r.due_at, now)), 0),
    // Still inside the twelve months: worth chasing before it becomes a
    // conversation about taking money back.
    dueSoon: list.filter(r => daysOverdue(r.due_at, now) === 0).length,
  }
}

/**
 * What last year's discounts are worth at renewal, before anybody re-earns them.
 *
 * The answer is nothing, and that is the point. Each reason comes back as a
 * claim to be re-tested, never as a figure to be carried across — and the base
 * price is the regional list, not the net the customer paid last year.
 *
 * The bundle is the one that changes shape rather than simply lapsing: it is
 * re-measured against the products actually on the renewal.
 *
 * @param previous       reason rows from the expiring deal
 * @param productCount   CWM products on the RENEWAL, not on the old deal
 */
export function renewalReasons(previous, { productCount = 0, years = 0 } = {}) {
  return (previous || []).map(p => {
    const wasBundle = p.reason === 'bundle'
    const now = wasBundle ? bundlePct(productCount, { years }) : 0
    return {
      reason: p.reason,
      wasPct: num(p.pct) ?? 0,
      // Nothing is granted here. A bundle that still holds gets its recomputed
      // figure as a proposal; everything else starts at zero and is re-earned.
      proposedPct: now,
      carries: false,
      // The bundle shrank because a product left, which is a fact the renewal
      // should state rather than discover in the total.
      shrank: wasBundle && now < (num(p.pct) ?? 0),
      retest: true,
    }
  })
}

/**
 * The price a renewal is quoted from.
 *
 * Not last year's net. This function exists to be the only answer to that
 * question anywhere in the app, because the natural thing to do at renewal is
 * open last year's quote, and doing that turns one concession into the price
 * forever.
 */
export function renewalBase({ regionalList, lastNet }) {
  const list = num(regionalList) ?? 0
  const last = num(lastNet) ?? 0
  return {
    base: round(list),
    lastNet: round(last),
    // How much of a rise the customer sees if nothing is re-earned. Real, and
    // better known before the meeting than during it.
    stepUp: round(Math.max(0, list - last)),
    stepUpPct: last > 0 ? Math.round((list - last) / last * 1000) / 10 : 0,
  }
}

function round(n) { return Math.round((n + Number.EPSILON) * 100) / 100 }

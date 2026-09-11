// What one deal is worth, in euros. One definition, because there were four.
//
// The project's rule is written down: a deal's value is the sum of its monthly
// columns, falling back to value_total for a deal with no monthly spread, in
// the currency it was written in at the rate stored on it. Five screens
// implemented some part of that and no two of them the same:
//
//   stageFunnel, salesByClient        the rule, in full
//   TopClients                        the fallback, no conversion
//   ProductFunnel, SalesRepFunnel     the fallback for backlog and invoiced,
//                                     value_total alone for pipeline, no
//                                     conversion
//   DealsMapView                      value_total alone, no conversion
//
// So a deal quoted in dollars with a monthly schedule was worth four different
// numbers depending on which dashboard pill the reader had clicked, and every
// one of them was labelled in euros.
//
// The rate is the one stored on the deal, not today's: a rate is a snapshot, and
// a rate change tomorrow must not silently reprice what was quoted today.

import { MONTHS_K } from '../constants'

const num = v => (v === null || v === undefined || v === '' ? null : Number(v))

function round(n) { return Math.round((n + Number.EPSILON) * 100) / 100 }

/** The rate to apply. A euro deal, or one with no rate recorded, is itself. */
export function rateOf(deal) {
  if (!deal?.currency || deal.currency === 'EUR') return 1
  return num(deal.exchange_rate) ?? 1
}

/**
 * The full-year value of one deal, in euros.
 *
 * Note what this is NOT: it is not a period figure. Inside a period the monthly
 * columns are the only honest source and the fallback has to be dropped, or a
 * deal with no schedule lands its whole value in every month it is asked about.
 * `salesByClient` does that separately and on purpose.
 */
export function dealValue(deal) {
  if (!deal) return 0
  const fy = MONTHS_K.reduce((s, m) => s + (num(deal[m]) ?? 0), 0)
  const raw = fy || (num(deal.value_total) ?? 0)
  return round(raw * rateOf(deal))
}

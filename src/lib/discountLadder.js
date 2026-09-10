// How far below the regional list a CWM deal may go, and who signs for it.
//
// On a product we buy, the discount comes off our cost and the supplier's
// answer is the control. On a product we make there is no meaningful direct
// cost — the R&D, the support team, the datacentre and every other SG&A line
// exist whether or not one more deal closes, and imputing a share of them onto
// a quote line would make gross margin stop meaning gross margin and would
// double-count against the Budget's own SG&A line.
//
// So the control is the price. A CWM deal is measured as a percentage of the
// published regional list, and how far it falls decides who has to sign:
//
//   100%  the published ask — anyone may quote it
//    90%  standard target — distributor or country sales
//    80%  country manager floor
//    70%  strategic floor — the P&L owner, and the last stop
//
// Below 70% is not a bigger discount, it is a different thing: a named
// programme, with its own terms. The 30% cap and the 70% floor are the same
// rule stated twice.

const num = v => (v === null || v === undefined || v === '' ? null : Number(v))

/** Total deal-discount cap. Below this is a named programme, not a discount. */
export const DISCOUNT_CAP_PCT = 30

/** Who signs, by how far below list the price has fallen. */
export const APPROVAL_LADDER = [
  { upTo: 10, level: 'none',            requiresApproval: false },
  { upTo: 20, level: 'country_manager', requiresApproval: true },
  { upTo: 30, level: 'pnl_owner',       requiresApproval: true },
  { upTo: null, level: 'named_programme', requiresApproval: true, overCap: true },
]

/** The named rungs of the ladder, for showing the rep where they are. */
export const RUNGS = [
  { pctOfList: 100, key: 'list' },
  { pctOfList: 90,  key: 'target' },
  { pctOfList: 80,  key: 'cm_floor' },
  { pctOfList: 70,  key: 'strategic_floor' },
]

/**
 * How far below the published list a quoted price actually is.
 *
 * Derived from the price rather than read off the discount field, because a rep
 * can also type over the price directly — and then the discount box says zero
 * while the deal is 40% off. The number that governs is the one the customer
 * will pay.
 */
export function pctOffList(listPrice, quotedPrice) {
  const list = num(listPrice) ?? 0
  const quoted = num(quotedPrice) ?? 0
  if (list <= 0) return 0
  const off = ((list - quoted) / list) * 100
  return Math.round(off * 10) / 10
}

/** Who has to sign for a discount of this size. */
export function approvalFor(pctOff) {
  const p = num(pctOff) ?? 0
  if (p <= 0) return { ...APPROVAL_LADDER[0], pctOff: 0 }
  const band = APPROVAL_LADDER.find(b => b.upTo === null || p <= b.upTo)
  return { ...band, pctOff: Math.round(p * 10) / 10 }
}

/**
 * The rung a price sits on, as a percentage of list.
 *
 * Reported as the rung reached, not the nearest one: a deal at 71.7% of list
 * is above the strategic floor and inside the cap — which is precisely what
 * made the two Portuguese Dose deals legitimate without a named programme.
 */
export function rungFor(pctOfList) {
  const p = num(pctOfList) ?? 100
  return RUNGS.find(r => p >= r.pctOfList) ?? { pctOfList: 0, key: 'below_floor' }
}

/** The price at a given rung, for showing the rep the next step down. */
export function priceAtRung(listPrice, pctOfList) {
  const list = num(listPrice) ?? 0
  return Math.round(list * ((num(pctOfList) ?? 100) / 100) * 100) / 100
}

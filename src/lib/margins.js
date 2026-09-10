// Minimum margins, and the sell price they imply.
//
// A deal with a licence and a support contract has two different economics in
// it, and pricing them at one blended margin is what makes a support contract
// quietly unprofitable. The licence is sold once; the annual fee is a service
// we have to staff for as long as the contract runs, so it carries the higher
// floor.
//
// The support floor rises with the size of the contract. Two figures anchor it,
// both given as commercial policy:
//
//   an annual fee costing  4,000 must sell for at least 10,000  → 60 % margin
//   an annual fee costing 15,000 must sell for at least 40,000  → 62.5 % margin
//
// Those are exact, which is why this is expressed as a margin floor rather than
// a multiple: a bigger installed base costs more to support per year, but it
// also carries more fixed support capacity per euro of fee, so the share we
// keep grows. The band above 15,000 continues that progression and is the one
// figure here NOT taken from policy — it is an extrapolation, flagged as such.

const num = v => (v === null || v === undefined || v === '' ? null : Number(v))

/** Licence, hardware, one-off services: sold once, floor of 35 %. */
export const CAPEX_MIN_MARGIN_PCT = 35

/** Support / SLA floors by what the annual fee costs us per year. */
export const SLA_MARGIN_BANDS = [
  { upTo: 4000,  marginPct: 60,   source: 'policy' },
  { upTo: 15000, marginPct: 62.5, source: 'policy' },
  { upTo: null,  marginPct: 65,   source: 'extrapolated' },
]

/** No support contract is worth staffing below this, whatever it costs us. */
export const SLA_MIN_ANNUAL_PVP = 10000

/** The band a yearly support cost falls in. */
export function slaBandFor(annualCost) {
  const c = num(annualCost) ?? 0
  return SLA_MARGIN_BANDS.find(b => b.upTo === null || c <= b.upTo) ?? SLA_MARGIN_BANDS.at(-1)
}

/** Sell price that yields a given gross margin on a given cost. */
function priceAtMargin(cost, marginPct) {
  const c = num(cost) ?? 0
  const m = num(marginPct) ?? 0
  if (m >= 100) return null
  return round(c / (1 - m / 100))
}

/** Recommended licence price: cost carried to the CAPEX floor. */
export function recommendedCapexPvp(cost) {
  const c = num(cost) ?? 0
  if (c <= 0) return 0
  return priceAtMargin(c, CAPEX_MIN_MARGIN_PCT) ?? 0
}

/**
 * Recommended annual support price: the band's floor, but never below the
 * minimum a support contract has to be worth to be worth having. The floor is
 * what makes a 2,000 annual fee quote at 10,000 rather than 5,000 — a small
 * contract still consumes a support engineer's attention.
 */
export function recommendedSlaPvp(annualCost) {
  const c = num(annualCost) ?? 0
  if (c <= 0) return 0
  return Math.max(SLA_MIN_ANNUAL_PVP, priceAtMargin(c, slaBandFor(c).marginPct) ?? 0)
}

/**
 * Whether a quoted price clears its floor. Returned rather than enforced: the
 * rep can go below it, but should be told, and the deal should carry the fact.
 */
export function belowFloor({ kind, cost, pvp }) {
  const c = num(cost) ?? 0
  const p = num(pvp) ?? 0
  if (c <= 0 || p <= 0) return false
  const floor = kind === 'sla' ? recommendedSlaPvp(c) : recommendedCapexPvp(c)
  return p < floor - 0.005
}

/**
 * One line's economics over the life of the contract.
 *
 * The annual fee is multiplied by the contract term, because that is what the
 * customer signs and what the forecast has to carry — a five-year PACS is five
 * years of support revenue and five years of support cost, not one.
 */
export function lineOverTerm({ capexCost = 0, capexPvp = 0, annualCost = 0, annualPvp = 0, years = 1 }) {
  const y = Math.max(0, Math.round(num(years) ?? 0))
  const cost = round((num(capexCost) ?? 0) + (num(annualCost) ?? 0) * y)
  const pvp = round((num(capexPvp) ?? 0) + (num(annualPvp) ?? 0) * y)
  const gm = round(pvp - cost)
  return {
    years: y,
    cost, pvp,
    grossMargin: gm,
    marginPct: pvp > 0 ? Math.round((gm / pvp) * 1000) / 10 : 0,
  }
}

function round(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

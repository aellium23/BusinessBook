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

/**
 * Implementation services: our own people, sold at a 70 % target margin.
 *
 * Higher than the capex floor because there is no third party in it — the cost
 * is a day of our own engineer, and the price is what that day is worth to the
 * customer, which is the project going live rather than a licence sitting on a
 * server. It is a target, not a floor: the rep can quote under it, and the
 * screen says so.
 */
export const SERVICES_TARGET_MARGIN_PCT = 70

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

/** Recommended services price: the effort carried to the services target. */
export function recommendedServicesPvp(cost) {
  const c = num(cost) ?? 0
  if (c <= 0) return 0
  return priceAtMargin(c, SERVICES_TARGET_MARGIN_PCT) ?? 0
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
 * Two things happen in the warranty year and they pull in opposite directions.
 *
 * The supplier charges us nothing — a licence bought from HCUS carries a year
 * of warranty, so the annual fee starts in year two. Multiplying it by the full
 * term inflates our cost by a year and hides margin that is really there.
 *
 * But our own support team works that year regardless, and a warranty that
 * bills the customer nothing leaves that work unpaid. So the year is sold as
 * implementation services, priced at one year of the support fee: the customer
 * pays the same total they would for five years of support, the first year is
 * called what it actually is, and the team that answers the phone during the
 * warranty is funded.
 *
 * A term shorter than the warranty is not an error — a one-year PACS is a
 * capex line plus the services year, with no support billed at all.
 */
export function lineOverTerm({
  capexCost = 0, capexPvp = 0, annualCost = 0, annualPvp = 0,
  years = 1, warrantyYears = 0, servicesCost = 0,
}) {
  const y = Math.max(0, Math.round(num(years) ?? 0))
  const w = Math.min(y, Math.max(0, Math.round(num(warrantyYears) ?? 0)))
  const billedYears = y - w

  const aCost = num(annualCost) ?? 0
  const aPvp = num(annualPvp) ?? 0
  // One year of the support fee, whatever the warranty length: the work being
  // paid for is the implementation, not a multiple of the free years.
  const servicesPvp = w > 0 ? round(aPvp) : 0
  const sCost = w > 0 ? (num(servicesCost) ?? 0) : 0

  const cost = round((num(capexCost) ?? 0) + aCost * billedYears + sCost)
  const pvp = round((num(capexPvp) ?? 0) + aPvp * billedYears + servicesPvp)
  const gm = round(pvp - cost)
  return {
    years: y,
    warrantyYears: w,
    billedYears,
    servicesPvp,
    servicesCost: round(sCost),
    cost, pvp,
    grossMargin: gm,
    marginPct: pvp > 0 ? Math.round((gm / pvp) * 1000) / 10 : 0,
  }
}

/**
 * The implementation effort, costed.
 *
 * Effort varies by project in a way no percentage captures: two PACS of the
 * same value can be a fortnight apart in work. So the rep enters man-days —
 * which is the thing they can actually estimate — and the cost comes from the
 * company's own day rate.
 *
 * This is a real, causal, per-project cost and belongs in gross margin, which
 * is exactly what separates it from an allocation of R&D or rent: those exist
 * whether or not this deal happens, and these days do not.
 *
 * `rateKnown` is false when no day rate is configured. The cost is then zero
 * and the caller is expected to say so — an unpriced services line reads as
 * pure margin, which is the same trap as a licence with no cost.
 */
/**
 * What a set of deal lines costs us, when some of them will not say.
 *
 * The one definition, because there were two and they disagreed by the whole
 * margin. `DealForm` summed the cost column raw, so a line with no cost counted
 * as zero and the deal came out at 100 % margin. `ProductLineItems` did
 * `cost_price || unit_price`, so the same line counted at its own selling price
 * and the deal came out at 0 %. The same deal, two screens, two opposite
 * answers, and neither of them the true one — which is that we do not know.
 *
 * So: unknown lines are left out of the sum and counted separately. A total
 * built from part of the lines is a total nobody may quote a margin from, and
 * `complete` is what says so.
 *
 * A zero that somebody typed is kept. It is an answer.
 *
 * @param lines       deal product rows, as they come back from the view
 * @param costOf      how to read the cost off a row (default: `cost_price`)
 * @param quantityOf  how many of it (default: 1 — the quote already extends)
 */
export function lineCostTotals(lines, {
  costOf = l => l?.cost_price,
  quantityOf = () => 1,
} = {}) {
  let cost = 0
  let known = 0
  let unknown = 0

  for (const l of lines || []) {
    const c = costOf(l)
    if (c === null || c === undefined || c === '' || !Number.isFinite(Number(c))) {
      unknown += 1
      continue
    }
    cost += Number(c) * (Number(quantityOf(l)) || 1)
    known += 1
  }

  return {
    cost: Math.round((cost + Number.EPSILON) * 100) / 100,
    known,
    unknown,
    // Every line answered. Only then is a margin off this total a real margin.
    complete: unknown === 0 && known > 0,
  }
}

/**
 * Gross margin on a total, or null when the cost behind it is incomplete.
 *
 * Null, not zero and not a hundred. BR-014: a margin nobody can compute is a
 * dash on the screen, and the two readings this replaces were each a confident
 * number standing where a dash belonged.
 */
export function marginFromTotals(pvp, totals) {
  const p = Number(pvp) || 0
  if (!totals?.complete || p <= 0) return null
  const gm = Math.round((p - totals.cost + Number.EPSILON) * 100) / 100
  return { gm, pct: Math.round((gm / p) * 1000) / 10 }
}

export function servicesEconomics({ manDays = 0, manDayCost = null, servicesPvp = 0 }) {
  const days = Math.max(0, num(manDays) ?? 0)
  const rate = num(manDayCost)
  const rateKnown = rate !== null && rate > 0
  const cost = rateKnown ? round(days * rate) : 0
  const pvp = round(num(servicesPvp) ?? 0)
  const gm = round(pvp - cost)
  return {
    days,
    rate: rateKnown ? rate : null,
    rateKnown,
    cost,
    pvp,
    grossMargin: gm,
    marginPct: pvp > 0 ? Math.round((gm / pvp) * 1000) / 10 : 0,
  }
}

function round(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

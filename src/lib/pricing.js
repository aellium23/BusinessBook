// CWM FY26 pricing model.
//
// There is exactly one price list in the world: the Global List Price. Every
// region is a *published* discount off it, so a regional price is always
// derived and never stored twice. Tiers are flat-rate, not marginal — the rate
// of the band a quantity lands in applies to the whole quantity. (Confirmed
// against the published figures: a three-room Iberian unit at 3 x $4,480 =
// $13,440, the number the FY26 brief itself quotes.)
//
// This mirrors the cwm_price() SQL function. Both are asserted against the
// published price list in src/lib/__tests__/pricing.test.js — if one drifts,
// those tests fail.

function round(n, dp) {
  const f = 10 ** dp
  return Math.round((n + Number.EPSILON) * f) / f
}

// Supabase returns numerics as strings; coerce everything at the boundary.
const num = v => (v === null || v === undefined || v === '' ? null : Number(v))

/** Pricing region (R1–R4) for a country. Distinct from the sales territory —
 *  Brazil prices in R3 but sits outside the LATAM distribution territory. */
export function pricingRegionForCountry(countryMap, country) {
  if (!country) return null
  return countryMap?.[country] ?? null
}

/** The tier a quantity lands in, or a named tier for categorical bands
 *  (Command Center is banded by organisation size, not by volume). */
export function resolveTier(tiers, quantity, tierLabel = null) {
  if (!Array.isArray(tiers) || tiers.length === 0) return null
  if (tierLabel) return tiers.find(t => t.tier_label === tierLabel) || null

  const q = num(quantity)
  if (q === null) return null
  return tiers.find(t => {
    const from = num(t.tier_from)
    const to = num(t.tier_to)
    if (from === null) return false          // categorical band: needs a label
    return q >= from && (to === null || q <= to)
  }) || null
}

/**
 * Resolve the annual price for one product line.
 *
 * `per_unit`   — the tier rate multiplies the quantity (Dose, VR, AI Reporting, CWM ES).
 * `flat_band`  — the band price *is* the annual price (RIS/BI, Command Center);
 *                quantity only selects the band.
 *
 * The minimum annual commitment and the site cap are held at global-list level
 * and discounted by the same regional factor, so they move with the price list.
 * The site cap is the commercial device that answers "a per-study model costs
 * more than a site licence" — it is quoted alongside the rate, not hidden.
 *
 * Returns null when the product is not on the new model, so callers can fall
 * back to the legacy license_fee / annual_fee path.
 */
export function resolvePrice({ product, tiers, discountPct, quantity, tierLabel = null }) {
  if (!product?.price_basis) return null

  const tier = resolveTier(tiers, quantity, tierLabel)
  if (!tier) return null

  const factor = 1 - (num(discountPct) ?? 0) / 100
  const unitPrice = round((num(tier.global_list_price) ?? 0) * factor, 4)

  const qty = num(quantity) ?? 0
  const gross = product.price_basis === 'per_unit' ? unitPrice * qty : unitPrice

  const minCommit = num(product.min_annual_commitment)
  const siteCap = num(product.site_cap_annual)
  const floor = minCommit === null ? null : minCommit * factor
  const cap = siteCap === null ? null : siteCap * factor

  let net = gross
  let boundBy = 'tier'
  if (floor !== null && net < floor) { net = floor; boundBy = 'minimum' }
  if (cap !== null && net > cap) { net = cap; boundBy = 'site cap' }

  return {
    tierLabel: tier.tier_label,
    unitPrice,
    gross: round(gross, 2),
    floor: floor === null ? null : round(floor, 2),
    cap: cap === null ? null : round(cap, 2),
    net: round(net, 2),
    boundBy,
  }
}

/** Prepaid subscription: the annual price times an annuity-due factor at 8%.
 *  This is time value of money, not a negotiated concession — which is why it
 *  can be published. Do NOT stack the 5% prepayment discount on top of it. */
export const PREPAY_FACTORS = { 3: 2.7833, 5: 4.3121, 7: 5.6229, 10: 7.2469 }

export function prepaidTotal(annualNet, years) {
  const factor = PREPAY_FACTORS[years]
  if (!factor || !annualNet) return null
  const total = annualNet * factor
  return {
    years,
    factor,
    total: round(total, 2),
    savingPct: round((1 - factor / years) * 100, 1),
  }
}

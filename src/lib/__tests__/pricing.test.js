import { describe, it, expect } from 'vitest'
import {
  resolvePrice, resolveTier, pricingRegionForCountry,
  prepaidTotal, PREPAY_FACTORS,
  lineEconomics, pvpForMargin, quoteTotals,
} from '../pricing'

// Regional discounts off the Global List Price, as published in the FY26 list.
const R1 = 8, R2 = 20, R3 = 36, R4 = 48

// Fixtures mirror the seeded rows, including Supabase's habit of returning
// numerics as strings — that coercion is part of what these tests cover.
// CWM Dose, as corrected on 10 September 2026. The unit is the exam, never the
// study, and there is NO site cap — the $28,000 one was withdrawn entirely. It
// was the most damaging figure in the price list: it flattened every deal above
// roughly 140,000 exams to the same number, so a 200,000-exam hospital and an
// 8,000,000-exam network were quoted alike.
const DOSE = {
  price_basis: 'per_unit', price_unit: 'exam',
  min_annual_commitment: '9500.00', site_cap_annual: null,
}
const DOSE_TIERS = [
  { tier_label: 'Up to 15,000 exams',          tier_from: '0',       tier_to: '15000',   global_list_price: '1.3000' },
  { tier_label: '15,001 – 30,000 exams',       tier_from: '15001',   tier_to: '30000',   global_list_price: '1.1900' },
  { tier_label: '30,001 – 60,000 exams',       tier_from: '30001',   tier_to: '60000',   global_list_price: '1.0600' },
  { tier_label: '60,001 – 100,000 exams',      tier_from: '60001',   tier_to: '100000',  global_list_price: '0.9200' },
  { tier_label: '100,001 – 250,000 exams',     tier_from: '100001',  tier_to: '250000',  global_list_price: '0.7700' },
  { tier_label: '250,001 – 500,000 exams',     tier_from: '250001',  tier_to: '500000',  global_list_price: '0.7000' },
  { tier_label: '500,001 – 1,000,000 exams',   tier_from: '500001',  tier_to: '1000000', global_list_price: '0.6200' },
  { tier_label: '1,000,001 – 5,000,000 exams', tier_from: '1000001', tier_to: '5000000', global_list_price: '0.5500' },
  { tier_label: 'Over 5,000,000 exams',        tier_from: '5000001', tier_to: null,      global_list_price: '0.4600' },
]

// A product that legitimately has a cap, so the mechanism stays covered after
// CWM Dose stopped using it.
const CAPPED = { price_basis: 'per_unit', price_unit: 'exam', min_annual_commitment: null, site_cap_annual: '28000.00' }

const ES = { price_basis: 'per_unit', price_unit: 'procedure_room', min_annual_commitment: null, site_cap_annual: null }
const ES_TIERS = [
  { tier_label: '1 procedure room', tier_from: '1',  tier_to: '1',  global_list_price: '6500.00' },
  { tier_label: '2 – 4 rooms',      tier_from: '2',  tier_to: '4',  global_list_price: '5600.00' },
  { tier_label: '20 or more rooms', tier_from: '20', tier_to: null, global_list_price: '3500.00' },
]

const RISBI = { price_basis: 'flat_band', price_unit: 'study', min_annual_commitment: null, site_cap_annual: null }
const RISBI_TIERS = [
  { tier_label: 'Up to 10,000 studies', tier_from: '0',     tier_to: '10000', global_list_price: '8000.00' },
  { tier_label: '10,001 – 25,000',      tier_from: '10001', tier_to: '25000', global_list_price: '13500.00' },
]

const CMD = { price_basis: 'flat_band', price_unit: 'organisation', min_annual_commitment: null, site_cap_annual: null }
const CMD_TIERS = [
  { tier_label: 'Single hospital or imaging centre', tier_from: null, tier_to: null, global_list_price: '37500.00' },
  { tier_label: 'Enterprise, 25+ sites',             tier_from: null, tier_to: null, global_list_price: '595000.00' },
]

describe('published price list', () => {
  it('reproduces the CWM ES rate card in Iberia (R2)', () => {
    expect(resolvePrice({ product: ES, tiers: ES_TIERS, discountPct: R2, quantity: 1 }).unitPrice).toBe(5200)
    expect(resolvePrice({ product: ES, tiers: ES_TIERS, discountPct: R2, quantity: 3 }).unitPrice).toBe(4480)
    expect(resolvePrice({ product: ES, tiers: ES_TIERS, discountPct: R2, quantity: 25 }).unitPrice).toBe(2800)
  })

  it('reproduces the published Dose rate card in R2 and R3', () => {
    const at = (q, d) => resolvePrice({ product: DOSE, tiers: DOSE_TIERS, discountPct: d, quantity: q }).unitPrice
    // The R2 and R3 columns of the price list, derived from one global list.
    expect(at(10000, R2)).toBe(1.04)        // $1.30 band
    expect(at(10000, R3)).toBe(0.832)
    expect(at(200000, R2)).toBe(0.616)      // the anchor band, $0.77
    expect(at(200000, R3)).toBe(0.4928)     // published as 0.493, rounded to 3dp
    expect(at(2_000_000, R3)).toBe(0.352)   // $0.55 band
    expect(at(9_000_000, R2)).toBe(0.368)   // $0.46, the band that did not exist
  })

  it('reproduces the RIS/BI band price in R3', () => {
    expect(resolvePrice({ product: RISBI, tiers: RISBI_TIERS, discountPct: R3, quantity: 8000 }).net).toBe(5120)
  })
})

describe('the three-room Iberian unit', () => {
  // The figure the FY26 brief quotes against Olympus ENDOBASE maintenance.
  it('prices at $13,440 a year — and only flat-rate tiering produces it', () => {
    const r = resolvePrice({ product: ES, tiers: ES_TIERS, discountPct: R2, quantity: 3 })
    expect(r.tierLabel).toBe('2 – 4 rooms')
    expect(r.net).toBe(13440)
    expect(r.boundBy).toBe('tier')
  })
})

describe('the anchor — the deal that set the list', () => {
  // Two Portuguese deals of 200,000 exams a year. EUR 0.53 was PRESENTED and
  // the customer engaged with it; EUR 0.38 was the close, 71.7% of list and
  // inside the 30% cap. The list price is the ask, not the close.
  it('reconstructs EUR 0.53 per exam in Iberia', () => {
    const r = resolvePrice({ product: DOSE, tiers: DOSE_TIERS, discountPct: R2, quantity: 200000 })
    expect(r.tierLabel).toBe('100,001 – 250,000 exams')
    expect(r.unitPrice).toBe(0.616)              // $0.77 less 20%
    expect(r.net).toBe(123200)                   // = EUR 106,070 at 1.1615
    expect(r.boundBy).toBe('tier')
  })

  it('is 71.7% of list at the price the deals actually closed at', () => {
    const list = resolvePrice({ product: DOSE, tiers: DOSE_TIERS, discountPct: R2, quantity: 200000 }).net
    const closed = 200000 * 0.38 * 1.1615        // EUR 0.38 back into USD
    expect(Math.round((closed / list) * 1000) / 10).toBe(71.7)
  })
})

describe('minimum commitment', () => {
  it('lifts a small site to the regional minimum', () => {
    // 5,000 exams x 1.30 x 0.64 = 4,160, below the R3 minimum of 9,500 x 0.64.
    const r = resolvePrice({ product: DOSE, tiers: DOSE_TIERS, discountPct: R3, quantity: 5000 })
    expect(r.gross).toBe(4160)
    expect(r.net).toBe(6080)
    expect(r.boundBy).toBe('minimum')
  })
})

describe('CWM Dose has no site cap', () => {
  it('lets the largest network price on volume, not on a ceiling', () => {
    // The withdrawn $28,000 cap would have returned 22,400 here — 131x less.
    const r = resolvePrice({ product: DOSE, tiers: DOSE_TIERS, discountPct: R2, quantity: 8000000 })
    expect(r.net).toBe(2944000)                  // = EUR 2,534,653 at 1.1615
    expect(r.cap).toBeNull()
    expect(r.boundBy).toBe('tier')
  })

  it('still caps a product that genuinely has one', () => {
    // The mechanism stays in pricing.js for products that carry a cap; only
    // CWM Dose stopped carrying a value.
    const r = resolvePrice({ product: CAPPED, tiers: DOSE_TIERS, discountPct: R2, quantity: 8000000 })
    expect(r.net).toBe(22400)
    expect(r.boundBy).toBe('site cap')
  })
})

describe('flat_band never multiplies by quantity', () => {
  it('returns the band price for RIS/BI regardless of study count', () => {
    const a = resolvePrice({ product: RISBI, tiers: RISBI_TIERS, discountPct: R2, quantity: 9000 })
    const b = resolvePrice({ product: RISBI, tiers: RISBI_TIERS, discountPct: R2, quantity: 1 })
    expect(a.net).toBe(6400)
    expect(b.net).toBe(6400)
  })
})

describe('categorical bands', () => {
  it('selects Command Center by label, not by quantity', () => {
    expect(resolveTier(CMD_TIERS, 5)).toBeNull()
    const r = resolvePrice({
      product: CMD, tiers: CMD_TIERS, discountPct: R3,
      quantity: null, tierLabel: 'Single hospital or imaging centre',
    })
    expect(r.net).toBe(24000)   // 37,500 x 0.64, as published
  })
})

describe('guards', () => {
  it('returns null for a product not on the new model', () => {
    expect(resolvePrice({ product: { price_basis: null }, tiers: ES_TIERS, discountPct: R2, quantity: 3 })).toBeNull()
  })

  it('returns null when no tier covers the quantity', () => {
    expect(resolvePrice({ product: ES, tiers: ES_TIERS, discountPct: R2, quantity: 0 })).toBeNull()
  })

  it('applies R1 and R4 factors', () => {
    expect(resolvePrice({ product: ES, tiers: ES_TIERS, discountPct: R1, quantity: 1 }).unitPrice).toBe(5980)
    expect(resolvePrice({ product: ES, tiers: ES_TIERS, discountPct: R4, quantity: 1 }).unitPrice).toBe(3380)
  })
})

describe('pricing region is not the sales territory', () => {
  const map = { Brazil: 'R3', Portugal: 'R2', Germany: 'R1', India: 'R4' }
  it('places Brazil in R3 even though it sits outside the LATAM territory', () => {
    expect(pricingRegionForCountry(map, 'Brazil')).toBe('R3')
  })
  it('returns null for an unmapped country rather than guessing', () => {
    expect(pricingRegionForCountry(map, 'Morocco')).toBeNull()
    expect(pricingRegionForCountry(map, '')).toBeNull()
  })
})

describe('prepaid subscription', () => {
  it('uses the published annuity-due factors at 8%', () => {
    expect(PREPAY_FACTORS[5]).toBe(4.3121)
    expect(prepaidTotal(10000, 5).total).toBe(43121)
  })

  it('reports the effective saving the brief publishes', () => {
    expect(prepaidTotal(10000, 3).savingPct).toBe(7.2)
    expect(prepaidTotal(10000, 5).savingPct).toBe(13.8)
    expect(prepaidTotal(10000, 7).savingPct).toBe(19.7)
    expect(prepaidTotal(10000, 10).savingPct).toBe(27.5)
  })

  it('refuses a term with no published factor', () => {
    expect(prepaidTotal(10000, 4)).toBeNull()
  })
})

describe('quote economics — gross margin, not markup', () => {
  it('reports margin on the sell price', () => {
    const e = lineEconomics(12000, 18462)
    expect(e.grossMargin).toBe(6462)
    expect(e.marginPct).toBe(35)
  })

  it('derives the sell price from a target gross margin', () => {
    expect(pvpForMargin(12000, 35)).toBe(18461.54)
    // A 35% markup would give 16,200 — materially different, and wrong here.
    expect(pvpForMargin(12000, 35)).not.toBe(16200)
  })

  it('refuses 100% margin, which implies zero cost', () => {
    expect(pvpForMargin(12000, 100)).toBeNull()
  })

  it('blends the margin across lines by value, not by average', () => {
    // 30% on a large line and 40% on a small one blend nearer to 30%.
    const t = quoteTotals([
      { cost: 70000, pvp: 100000 },   // 30%
      { cost: 6000,  pvp: 10000 },    // 40%
    ])
    expect(t.cost).toBe(76000)
    expect(t.pvp).toBe(110000)
    expect(t.grossMargin).toBe(34000)
    expect(t.marginPct).toBe(30.9)
  })

  it('handles a zero sell price without dividing by zero', () => {
    expect(lineEconomics(0, 0).marginPct).toBe(0)
  })
})

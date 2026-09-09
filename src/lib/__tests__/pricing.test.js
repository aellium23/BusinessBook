import { describe, it, expect } from 'vitest'
import {
  resolvePrice, resolveTier, pricingRegionForCountry,
  prepaidTotal, PREPAY_FACTORS,
} from '../pricing'

// Regional discounts off the Global List Price, as published in the FY26 list.
const R1 = 8, R2 = 20, R3 = 36, R4 = 48

// Fixtures mirror the seeded rows, including Supabase's habit of returning
// numerics as strings — that coercion is part of what these tests cover.
const DOSE = {
  price_basis: 'per_unit', price_unit: 'study',
  min_annual_commitment: '8000.00', site_cap_annual: '28000.00',
}
const DOSE_TIERS = [
  { tier_label: 'Up to 15,000 studies', tier_from: '0',       tier_to: '15000',   global_list_price: '0.8000' },
  { tier_label: '15,001 – 30,000',      tier_from: '15001',   tier_to: '30000',   global_list_price: '0.6000' },
  { tier_label: '125,001 – 250,000',    tier_from: '125001',  tier_to: '250000',  global_list_price: '0.2000' },
  { tier_label: 'Over 1,000,000',       tier_from: '1000001', tier_to: null,      global_list_price: '0.0900' },
]

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

  it('reproduces the Dose rate card in R2 and R3', () => {
    expect(resolvePrice({ product: DOSE, tiers: DOSE_TIERS, discountPct: R2, quantity: 10000 }).unitPrice).toBe(0.64)
    expect(resolvePrice({ product: DOSE, tiers: DOSE_TIERS, discountPct: R3, quantity: 10000 }).unitPrice).toBe(0.512)
    expect(resolvePrice({ product: DOSE, tiers: DOSE_TIERS, discountPct: R3, quantity: 2_000_000 }).unitPrice).toBe(0.0576)
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

describe('minimum commitment and site cap', () => {
  it('lifts a small site to the regional minimum', () => {
    // 5,000 studies x 0.512 = 2,560, below the R3 minimum of 8,000 x 0.64.
    const r = resolvePrice({ product: DOSE, tiers: DOSE_TIERS, discountPct: R3, quantity: 5000 })
    expect(r.gross).toBe(2560)
    expect(r.net).toBe(5120)
    expect(r.boundBy).toBe('minimum')
  })

  it('caps a large site — the answer to "per-study costs more than a site licence"', () => {
    // 250,000 x 0.160 = 40,000 gross, capped at 28,000 x 0.80.
    const r = resolvePrice({ product: DOSE, tiers: DOSE_TIERS, discountPct: R2, quantity: 250000 })
    expect(r.gross).toBe(40000)
    expect(r.net).toBe(22400)
    expect(r.boundBy).toBe('site cap')
  })

  it('scales the cap with the region', () => {
    const r = resolvePrice({ product: DOSE, tiers: DOSE_TIERS, discountPct: R3, quantity: 250000 })
    expect(r.cap).toBe(17920)   // 28,000 x 0.64, as published
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

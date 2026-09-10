import { describe, it, expect } from 'vitest'
import {
  CAPEX_MIN_MARGIN_PCT, SLA_MIN_ANNUAL_PVP, SLA_MARGIN_BANDS,
  slaBandFor, recommendedCapexPvp, recommendedSlaPvp, belowFloor, lineOverTerm,
  servicesEconomics,
} from '../margins'

describe('the two policy anchors', () => {
  it('an annual fee costing 4,000 must sell for at least 10,000', () => {
    expect(recommendedSlaPvp(4000)).toBe(10000)
  })

  it('an annual fee costing 15,000 must sell for at least 40,000', () => {
    expect(recommendedSlaPvp(15000)).toBe(40000)
  })

  it('states those as margins, which is what makes them exact', () => {
    expect(slaBandFor(4000).marginPct).toBe(60)
    expect(slaBandFor(15000).marginPct).toBe(62.5)
    // (10000 - 4000) / 10000 and (40000 - 15000) / 40000.
  })
})

describe('recommendedSlaPvp', () => {
  it('never quotes a support contract below the minimum worth staffing', () => {
    // 2,000 at 60% would be 5,000; a contract that small still consumes an
    // engineer, so the floor wins.
    expect(recommendedSlaPvp(2000)).toBe(SLA_MIN_ANNUAL_PVP)
    expect(recommendedSlaPvp(1)).toBe(SLA_MIN_ANNUAL_PVP)
  })

  it('moves up a band as the contract grows', () => {
    expect(slaBandFor(4000).marginPct).toBe(60)      // inclusive upper bound
    expect(slaBandFor(4001).marginPct).toBe(62.5)
    expect(slaBandFor(15001).marginPct).toBe(65)
  })

  it('marks the top band as extrapolated, not policy', () => {
    expect(SLA_MARGIN_BANDS.filter(b => b.source === 'policy')).toHaveLength(2)
    expect(slaBandFor(50000).source).toBe('extrapolated')
  })

  it('is zero for no cost rather than the floor', () => {
    expect(recommendedSlaPvp(0)).toBe(0)
    expect(recommendedSlaPvp(null)).toBe(0)
  })
})

describe('recommendedCapexPvp', () => {
  it('carries a licence to the 35% floor', () => {
    expect(CAPEX_MIN_MARGIN_PCT).toBe(35)
    // The Synapse PACS base licence, five 10k blocks at 6,320.40.
    expect(recommendedCapexPvp(31602)).toBe(48618.46)
    expect(recommendedCapexPvp(6500)).toBe(10000)
  })

  it('does not apply the SLA floor to a licence', () => {
    // 1,000 of licence is a 1,538 quote, not a 10,000 one.
    expect(recommendedCapexPvp(1000)).toBe(1538.46)
  })

  it('is zero for no cost', () => {
    expect(recommendedCapexPvp(0)).toBe(0)
  })
})

describe('belowFloor', () => {
  it('flags a licence quoted under 35%', () => {
    expect(belowFloor({ kind: 'capex', cost: 10000, pvp: 14000 })).toBe(true)
    expect(belowFloor({ kind: 'capex', cost: 10000, pvp: 15385 })).toBe(false)
  })

  it('flags a support contract under its band', () => {
    expect(belowFloor({ kind: 'sla', cost: 15000, pvp: 39000 })).toBe(true)
    expect(belowFloor({ kind: 'sla', cost: 15000, pvp: 40000 })).toBe(false)
  })

  it('says nothing when there is no cost or no price to judge', () => {
    expect(belowFloor({ kind: 'sla', cost: 0, pvp: 5000 })).toBe(false)
    expect(belowFloor({ kind: 'capex', cost: 5000, pvp: 0 })).toBe(false)
  })
})

describe('lineOverTerm', () => {
  it('counts the annual fee once per contract year when there is no warranty', () => {
    const r = lineOverTerm({
      capexCost: 31602, capexPvp: 48618.46,
      annualCost: 2386.25, annualPvp: 10000,
      years: 5,
    })
    expect(r.cost).toBe(round(31602 + 2386.25 * 5))
    expect(r.pvp).toBe(round(48618.46 + 50000))
    expect(r.grossMargin).toBe(round(r.pvp - r.cost))
    expect(r.marginPct).toBeGreaterThan(50)
  })

  it('does not pay the supplier for the warranty year', () => {
    // A five-year PACS with one year of warranty is four years of support cost.
    const r = lineOverTerm({
      capexCost: 31602, capexPvp: 48618.46,
      annualCost: 2386.25, annualPvp: 10000,
      years: 5, warrantyYears: 1,
    })
    expect(r.billedYears).toBe(4)
    expect(r.cost).toBe(round(31602 + 2386.25 * 4))
  })

  it('sells the warranty year as implementation services at one year of the fee', () => {
    const r = lineOverTerm({
      capexCost: 31602, capexPvp: 48618.46,
      annualCost: 2386.25, annualPvp: 10000,
      years: 5, warrantyYears: 1,
    })
    // The customer still pays five years' worth; the first is named for what
    // it is, and it funds the support team during the warranty.
    expect(r.servicesPvp).toBe(10000)
    expect(r.pvp).toBe(round(48618.46 + 10000 * 4 + 10000))
  })

  it('earns more margin than the same deal without a warranty, on the same price', () => {
    const args = {
      capexCost: 31602, capexPvp: 48618.46,
      annualCost: 2386.25, annualPvp: 10000, years: 5,
    }
    const without = lineOverTerm(args)
    const withWarranty = lineOverTerm({ ...args, warrantyYears: 1 })
    expect(withWarranty.pvp).toBe(without.pvp)
    expect(withWarranty.grossMargin).toBe(round(without.grossMargin + 2386.25))
  })

  it('handles a term no longer than the warranty', () => {
    // A one-year PACS: the capex, the services year, and no support billed.
    const r = lineOverTerm({
      capexCost: 31602, capexPvp: 48618.46,
      annualCost: 2386.25, annualPvp: 10000,
      years: 1, warrantyYears: 1,
    })
    expect(r.billedYears).toBe(0)
    expect(r.cost).toBe(31602)
    expect(r.pvp).toBe(round(48618.46 + 10000))
  })

  it('never lets the warranty exceed the term', () => {
    const r = lineOverTerm({ annualCost: 100, annualPvp: 300, years: 1, warrantyYears: 3 })
    expect(r.warrantyYears).toBe(1)
    expect(r.billedYears).toBe(0)
  })

  it('carries a services cost when one is known', () => {
    const r = lineOverTerm({
      annualCost: 1000, annualPvp: 5000, years: 3, warrantyYears: 1, servicesCost: 800,
    })
    expect(r.servicesCost).toBe(800)
    expect(r.cost).toBe(1000 * 2 + 800)
  })

  it('treats a one-year term as a single annual fee', () => {
    const r = lineOverTerm({ capexCost: 0, capexPvp: 0, annualCost: 1000, annualPvp: 3000, years: 1 })
    expect(r).toMatchObject({ cost: 1000, pvp: 3000, grossMargin: 2000 })
  })

  it('drops the annual fee entirely at a zero term', () => {
    const r = lineOverTerm({ capexCost: 500, capexPvp: 1000, annualCost: 900, annualPvp: 5000, years: 0 })
    expect(r).toMatchObject({ cost: 500, pvp: 1000 })
  })

  it('coerces the string numerics Supabase returns', () => {
    const r = lineOverTerm({ capexCost: '100', capexPvp: '200', annualCost: '10', annualPvp: '30', years: '3' })
    expect(r).toMatchObject({ cost: 130, pvp: 290 })
  })
})

function round(n) { return Math.round((n + Number.EPSILON) * 100) / 100 }

describe('servicesEconomics', () => {
  it('costs the effort the rep estimated at the company day rate', () => {
    const r = servicesEconomics({ manDays: 12, manDayCost: 450, servicesPvp: 10000 })
    expect(r.cost).toBe(5400)
    expect(r.grossMargin).toBe(4600)
    expect(r.marginPct).toBe(46)
  })

  it('says when no day rate is configured rather than costing it at zero silently', () => {
    // An unpriced services line reads as pure margin — the same trap as a
    // licence with no cost.
    const r = servicesEconomics({ manDays: 12, manDayCost: null, servicesPvp: 10000 })
    expect(r.rateKnown).toBe(false)
    expect(r.cost).toBe(0)
    expect(r.rate).toBeNull()
  })

  it('treats a zero or negative rate as unconfigured', () => {
    expect(servicesEconomics({ manDays: 5, manDayCost: 0 }).rateKnown).toBe(false)
    expect(servicesEconomics({ manDays: 5, manDayCost: -100 }).rateKnown).toBe(false)
  })

  it('is zero-cost at no effort, whatever the rate', () => {
    const r = servicesEconomics({ manDays: 0, manDayCost: 450, servicesPvp: 10000 })
    expect(r.cost).toBe(0)
    expect(r.marginPct).toBe(100)
  })

  it('never takes negative days', () => {
    expect(servicesEconomics({ manDays: -5, manDayCost: 450 }).days).toBe(0)
  })

  it('coerces the string numerics a form produces', () => {
    expect(servicesEconomics({ manDays: '12', manDayCost: '450', servicesPvp: '10000' }).cost).toBe(5400)
  })
})

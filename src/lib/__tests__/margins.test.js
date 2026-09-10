import { describe, it, expect } from 'vitest'
import {
  CAPEX_MIN_MARGIN_PCT, SLA_MIN_ANNUAL_PVP, SLA_MARGIN_BANDS,
  slaBandFor, recommendedCapexPvp, recommendedSlaPvp, belowFloor, lineOverTerm,
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
  it('counts the annual fee once per contract year', () => {
    // A five-year PACS: licence plus five years of support, both sides.
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

import { describe, it, expect } from 'vitest'
import {
  DEAL_DISCOUNT_CAP_PCT, DISCOUNT_REASONS, NOT_EVIDENCE,
  bundlePct, reasonAvailable, discountPlan, unjustifiedPp,
} from '../dealDiscounts'

const evid = e => ({ on: true, evidence: e })

describe('bundlePct', () => {
  it('pays nothing for a single product', () => {
    expect(bundlePct(0)).toBe(0)
    expect(bundlePct(1)).toBe(0)
  })

  it('is 10 for two, 15 for three', () => {
    expect(bundlePct(2)).toBe(10)
    expect(bundlePct(3)).toBe(15)
  })

  it('only pays the Suite rate when the term supports it', () => {
    expect(bundlePct(4, { years: 5 })).toBe(20)
    // Four products on a three-year term is a three-product bundle with a
    // Suite label on it.
    expect(bundlePct(4, { years: 3 })).toBe(15)
  })

  it('does not grow past the Suite', () => {
    expect(bundlePct(9, { years: 5 })).toBe(20)
  })
})

describe('reasonAvailable', () => {
  const term5 = DISCOUNT_REASONS.find(r => r.key === 'term5')
  const tender = DISCOUNT_REASONS.find(r => r.key === 'tender')

  it('refuses a five-year discount on a shorter term', () => {
    expect(reasonAvailable(term5, { years: 3 })).toBe(false)
    expect(reasonAvailable(term5, { years: 5 })).toBe(true)
  })

  it('refuses a tender discount below three bidders', () => {
    expect(reasonAvailable(tender, { bidders: 2 })).toBe(false)
    expect(reasonAvailable(tender, { bidders: 3 })).toBe(true)
  })
})

describe('discountPlan — evidence is the control', () => {
  it('counts a reason that carries its proof', () => {
    const p = discountPlan({ displacement: { on: true, pct: 15, evidence: 'Nuance contract 2024' } })
    expect(p.justifiedPct).toBe(15)
    expect(p.stop).toBe(false)
  })

  it('counts a ticked reason with no evidence as worth nothing', () => {
    const p = discountPlan({ displacement: { on: true, pct: 15 } })
    expect(p.claimedPct).toBe(15)
    expect(p.justifiedPct).toBe(0)
    expect(p.missingEvidence).toEqual(['displacement'])
    expect(p.stop).toBe(true)
  })

  it('caps what the rep may propose for displacement at 15', () => {
    const p = discountPlan({ displacement: { on: true, pct: 40, evidence: 'contract' } })
    expect(p.justifiedPct).toBe(15)
  })

  it('proves the bundle from the order form rather than asking for a note', () => {
    const p = discountPlan({ bundle: { on: true } }, { productCount: 3 })
    expect(p.justifiedPct).toBe(15)
    expect(p.stop).toBe(false)
  })

  it('stops a five-year discount on a three-year deal', () => {
    const p = discountPlan({ term5: evid('order form') }, { years: 3 })
    expect(p.justifiedPct).toBe(0)
    expect(p.unavailable).toEqual(['term5'])
    expect(p.stop).toBe(true)
  })

  it('stops a tender discount with two bidders', () => {
    const p = discountPlan({ tender: { on: true, evidence: 'CP 12/2026', bidders: 2 } })
    expect(p.justifiedPct).toBe(0)
    expect(p.stop).toBe(true)
  })

  it('allows it at three', () => {
    const p = discountPlan({ tender: { on: true, evidence: 'CP 12/2026', bidders: 3 } })
    expect(p.justifiedPct).toBe(10)
  })
})

describe('discountPlan — the cap', () => {
  it('holds the total at 30 even when the reasons are all real', () => {
    // Displacement 15 + tender 10 + five-year 8 + prepayment 5 = 38.
    const p = discountPlan({
      displacement: { on: true, pct: 15, evidence: 'incumbent contract' },
      tender: { on: true, evidence: 'CP 12/2026', bidders: 4 },
      term5: evid('order form clause 3'),
      prepay: evid('payment terms'),
    }, { years: 5 })
    expect(p.earnedPct).toBe(38)
    expect(p.justifiedPct).toBe(DEAL_DISCOUNT_CAP_PCT)
    expect(p.capped).toBe(true)
  })

  it('adds the bundle in from the products themselves', () => {
    const p = discountPlan({
      bundle: { on: true },
      lighthouse: evid('reference clause, Dr X'),
    }, { productCount: 2, years: 5 })
    expect(p.justifiedPct).toBe(20)
  })
})

describe('unjustifiedPp', () => {
  it('names the points nobody wrote a reason for', () => {
    expect(unjustifiedPp(25, 15)).toBe(10)
  })

  it('is zero when the quote is inside what was earned', () => {
    expect(unjustifiedPp(10, 15)).toBe(0)
    expect(unjustifiedPp(0, 0)).toBe(0)
  })
})

describe('the list of things that are not evidence', () => {
  it('names all seven, because they are the ones that get offered', () => {
    expect(NOT_EVIDENCE).toHaveLength(7)
  })
})

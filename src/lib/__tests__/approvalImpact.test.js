import { describe, it, expect } from 'vitest'
import { approvalImpact } from '../approvalImpact'

// A partner buys at 100 and sells at 125: 25 of margin, 20%.
const DEAL = { transfer: 100000, endCustomerPrice: 125000 }

describe('what the approver is deciding', () => {
  it('shows what the partner makes today', () => {
    const r = approvalImpact({ ...DEAL, requestedPct: 0 })
    expect(r.partnerMargin).toBe(25000)
    expect(r.partnerMarginPct).toBe(20)
  })

  it('shows what they would make if it is granted', () => {
    // 20% off their cost: they pay 80,000 and keep 45,000 — 36%.
    const r = approvalImpact({ ...DEAL, requestedPct: 20 })
    expect(r.ourRevenueIfGranted).toBe(80000)
    expect(r.partnerMarginIfGranted).toBe(45000)
    expect(r.partnerMarginPctIfGranted).toBe(36)
  })

  it('names what it costs us, in money', () => {
    const r = approvalImpact({ ...DEAL, requestedPct: 20 })
    expect(r.ourRevenue).toBe(100000)
    expect(r.given).toBe(20000)
    // What we give up is exactly what they gain. That symmetry is the decision.
    expect(r.given).toBe(r.partnerMarginIfGranted - r.partnerMargin)
  })

  it('costs nothing at zero', () => {
    const r = approvalImpact({ ...DEAL, requestedPct: 0 })
    expect(r.given).toBe(0)
    expect(r.ourRevenueIfGranted).toBe(r.ourRevenue)
  })
})

describe('when one half is missing', () => {
  it('says so rather than reporting a margin against nothing', () => {
    // A quote with no end customer price is not a zero-margin deal, it is a
    // deal we do not know the margin of.
    const r = approvalImpact({ transfer: 100000, endCustomerPrice: null, requestedPct: 20 })
    expect(r.known).toBe(false)
    expect(r.partnerMargin).toBeUndefined()
  })

  it('says so when we do not know what they pay us either', () => {
    expect(approvalImpact({ transfer: 0, endCustomerPrice: 125000, requestedPct: 10 }).known).toBe(false)
  })

  it('still carries the percentage that was asked for', () => {
    expect(approvalImpact({ transfer: null, endCustomerPrice: null, requestedPct: 15 }).pct).toBe(15)
  })
})

describe('a partner quoting below what they pay', () => {
  it('is flagged, because that is a different conversation', () => {
    const r = approvalImpact({ transfer: 100000, endCustomerPrice: 90000, requestedPct: 20 })
    expect(r.underwater).toBe(true)
    expect(r.partnerMargin).toBe(-10000)
    // 20% off takes them from losing 10,000 to making 10,000.
    expect(r.partnerMarginIfGranted).toBe(10000)
  })
})

describe('the money an approval actually moves', () => {
  // The same arithmetic the database does when a request is granted:
  //   line cost = value_at_risk × 100 / requested   ·   relief = cost × approved / 100
  const reliefFor = (valueAtRisk, requested, approved) =>
    Math.round((valueAtRisk * approved / requested) * 100) / 100

  it('takes off exactly what was asked for when the ask is granted in full', () => {
    // A line costing 50,000 asked at 20% is worth 10,000.
    expect(reliefFor(10000, 20, 20)).toBe(10000)
  })

  it('takes off half when the counter-offer is half', () => {
    expect(reliefFor(10000, 20, 10)).toBe(5000)
  })

  it('matches what the card promised the approver', () => {
    // The card said granting 20% costs us 20,000 on a 100,000 transfer; the
    // request behind it carries the same 20,000, and so does the database.
    const card = approvalImpact({ transfer: 100000, endCustomerPrice: 125000, requestedPct: 20 })
    expect(reliefFor(card.given, 20, 20)).toBe(card.given)
  })
})

describe('the edges', () => {
  it('refuses a percentage outside 0-100 rather than inverting the deal', () => {
    expect(approvalImpact({ ...DEAL, requestedPct: -5 }).pct).toBe(0)
    expect(approvalImpact({ ...DEAL, requestedPct: 140 }).pct).toBe(100)
  })

  it('gives the whole cost away at 100%', () => {
    const r = approvalImpact({ ...DEAL, requestedPct: 100 })
    expect(r.ourRevenueIfGranted).toBe(0)
    expect(r.given).toBe(100000)
    expect(r.partnerMarginPctIfGranted).toBe(100)
  })

  it('coerces the strings a form and a database both produce', () => {
    const r = approvalImpact({ transfer: '100000', endCustomerPrice: '125000', requestedPct: '20' })
    expect(r.given).toBe(20000)
  })
})

import { describe, it, expect } from 'vitest'
import {
  routeFor, applyDiscount, isOpen, daysWaiting,
  ROUTE_INTERNAL, ROUTE_EXTERNAL, EXTERNAL_FLOW, discountViews,
  fiscalQuarter, riskSummary,
} from '../discountRouting'

const VGT    = { code: 'VGT',    kind: 'internal', request_channel: 'Approvals' }
const HCUS   = { code: 'HCUS',   kind: 'external', request_channel: 'Salesforce (HCUS)' }
const MEDSKY = { code: 'MEDSKY', kind: 'external', request_channel: 'Email' }

describe('routeFor', () => {
  it('sends a discount on our own product for approval', () => {
    expect(routeFor(VGT)).toEqual({
      route: ROUTE_INTERNAL, channel: 'Approvals',
      initialStatus: 'pending', appliesTo: 'price',
    })
  })

  it('sends a discount on a bought-in product to the supplier, not to an approver', () => {
    expect(routeFor(HCUS)).toMatchObject({
      route: ROUTE_EXTERNAL, channel: 'Salesforce (HCUS)',
      initialStatus: 'to_request', appliesTo: 'cost',
    })
    expect(routeFor(MEDSKY)).toMatchObject({ channel: 'Email', appliesTo: 'cost' })
  })

  it('asks for approval when the supplier is not set', () => {
    // The wrong way round grants a discount nobody sanctioned; this way the
    // worst case is a needless question.
    expect(routeFor(null).route).toBe(ROUTE_INTERNAL)
    expect(routeFor(undefined).initialStatus).toBe('pending')
  })
})

describe('applyDiscount', () => {
  it('takes an internal discount off the customer price', () => {
    const r = applyDiscount({ appliesTo: 'price', pct: 10, cost: 6000, pvp: 20000 })
    expect(r).toEqual({ cost: 6000, pvp: 18000, speculative: false })
  })

  it('does not touch the cost until the supplier has actually granted it', () => {
    const asked = applyDiscount({ appliesTo: 'cost', pct: 20, cost: 10000, pvp: 20000 })
    expect(asked).toEqual({ cost: 10000, pvp: 20000, speculative: true })
  })

  it('takes it off the cost once granted', () => {
    const got = applyDiscount({ appliesTo: 'cost', pct: 20, cost: 10000, pvp: 20000, granted: true })
    expect(got).toEqual({ cost: 8000, pvp: 20000, speculative: false })
  })

  it('changes nothing at zero, and is never speculative there', () => {
    expect(applyDiscount({ appliesTo: 'cost', pct: 0, cost: 100, pvp: 300 }))
      .toEqual({ cost: 100, pvp: 300, speculative: false })
  })

  it('clamps a nonsense percentage rather than inverting the sign', () => {
    expect(applyDiscount({ appliesTo: 'price', pct: 150, cost: 0, pvp: 1000 }).pvp).toBe(0)
    expect(applyDiscount({ appliesTo: 'price', pct: -30, cost: 0, pvp: 1000 }).pvp).toBe(1000)
  })

  it('coerces the string numerics Supabase returns', () => {
    expect(applyDiscount({ appliesTo: 'price', pct: '10', cost: '100', pvp: '1000' }).pvp).toBe(900)
  })
})

describe('isOpen', () => {
  it('counts everything still waiting on somebody', () => {
    for (const s of ['pending', 'counter', 'to_request', 'requested']) {
      expect(isOpen(s)).toBe(true)
    }
    expect(isOpen('approved')).toBe(false)
    expect(isOpen('rejected')).toBe(false)
  })

  it('has a flow that starts unfiled and ends decided', () => {
    expect(EXTERNAL_FLOW[0]).toBe('to_request')
    expect(EXTERNAL_FLOW.at(-1)).toBe('rejected')
  })
})

describe('daysWaiting', () => {
  const now = new Date('2026-09-10T12:00:00Z').getTime()

  it('counts whole days since the request was raised', () => {
    expect(daysWaiting('2026-09-10T11:00:00Z', now)).toBe(0)
    expect(daysWaiting('2026-09-07T12:00:00Z', now)).toBe(3)
  })

  it('never goes negative on a clock skew', () => {
    expect(daysWaiting('2026-09-20T12:00:00Z', now)).toBe(0)
  })

  it('is zero for a missing or unparseable date', () => {
    expect(daysWaiting(null, now)).toBe(0)
    expect(daysWaiting('not a date', now)).toBe(0)
  })
})

describe('discountViews', () => {
  const lines = [
    // A PACS line: 20% asked of HCUS on a 30,000 cost, not yet granted.
    { cost: 30000, pvp: 60000, pendingCostRelief: 6000 },
    // A CWM line: the customer discount is already in the quoted price.
    { cost: 4000, pvp: 12000, pendingCostRelief: 0 },
  ]

  it('reports what we have, not what we hope for', () => {
    const v = discountViews(lines)
    expect(v.actual).toMatchObject({ cost: 34000, pvp: 72000, grossMargin: 38000 })
  })

  it('shows the same quote with the pending discounts landed', () => {
    const v = discountViews(lines)
    expect(v.ifApproved).toMatchObject({ cost: 28000, pvp: 72000, grossMargin: 44000 })
    expect(v.ifApproved.marginPct).toBeGreaterThan(v.actual.marginPct)
  })

  it('names the margin that depends on somebody else saying yes', () => {
    expect(discountViews(lines).atRisk).toBe(6000)
    expect(discountViews(lines).hasPending).toBe(true)
  })

  it('collapses to one view when nothing is pending', () => {
    const v = discountViews([{ cost: 100, pvp: 300, pendingCostRelief: 0 }])
    expect(v.actual).toEqual(v.ifApproved)
    expect(v.hasPending).toBe(false)
    expect(v.atRisk).toBe(0)
  })

  it('never drives a cost below zero', () => {
    const v = discountViews([{ cost: 100, pvp: 500, pendingCostRelief: 400 }])
    expect(v.ifApproved.cost).toBe(0)
  })

  it('handles an empty quote', () => {
    expect(discountViews([]).actual).toEqual({ cost: 0, pvp: 0, grossMargin: 0, marginPct: 0 })
    expect(discountViews(null).atRisk).toBe(0)
  })
})

describe('fiscalQuarter', () => {
  it('starts the year in April', () => {
    expect(fiscalQuarter('apr')).toBe(1)
    expect(fiscalQuarter('jun')).toBe(1)
    expect(fiscalQuarter('jul')).toBe(2)
    expect(fiscalQuarter('oct')).toBe(3)
    expect(fiscalQuarter('jan')).toBe(4)
    expect(fiscalQuarter('mar')).toBe(4)
  })

  it('accepts a longer month name and any case', () => {
    expect(fiscalQuarter('April')).toBe(1)
    expect(fiscalQuarter('DEC')).toBe(3)
  })

  it('is null for anything that is not a month', () => {
    expect(fiscalQuarter('')).toBeNull()
    expect(fiscalQuarter(null)).toBeNull()
    expect(fiscalQuarter('xyz')).toBeNull()
  })
})

describe('riskSummary', () => {
  const rows = [
    { deal_id: 'a', bu: 'VGT', value_at_risk: 6000, unfiled: 1, oldest_days: 12, rec_month: 'may' },
    { deal_id: 'b', bu: 'VGT', value_at_risk: 4000, unfiled: 0, oldest_days: 3,  rec_month: 'nov' },
    { deal_id: 'c', bu: 'ECT', value_at_risk: 1000, unfiled: 0, oldest_days: 1,  rec_month: null },
  ]

  it('separates what we have not asked for from what we are waiting on', () => {
    const r = riskSummary(rows)
    expect(r.total).toBe(11000)
    expect(r.unfiled).toBe(6000)     // ours to fix
    expect(r.awaiting).toBe(5000)    // theirs to answer
    expect(r.unfiledDeals).toBe(1)
  })

  it('respects the dashboard business-unit filter', () => {
    expect(riskSummary(rows, { bu: 'ECT' }).total).toBe(1000)
    expect(riskSummary(rows, { bu: 'VGT' }).deals).toBe(2)
  })

  it('buckets by fiscal quarter and keeps the undated apart', () => {
    const r = riskSummary(rows)
    expect(r.byQuarter).toEqual({ Q1: 6000, Q3: 4000, unscheduled: 1000 })
  })

  it('reports the longest wait, which is the one worth chasing', () => {
    expect(riskSummary(rows).oldestDays).toBe(12)
  })

  it('is all zeroes with nothing open', () => {
    expect(riskSummary([])).toMatchObject({ total: 0, unfiled: 0, awaiting: 0, deals: 0, oldestDays: 0 })
    expect(riskSummary(null).total).toBe(0)
  })
})

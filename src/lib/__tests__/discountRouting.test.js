import { describe, it, expect } from 'vitest'
import {
  routeFor, applyDiscount, isOpen, daysWaiting,
  ROUTE_INTERNAL, ROUTE_EXTERNAL, EXTERNAL_FLOW,
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

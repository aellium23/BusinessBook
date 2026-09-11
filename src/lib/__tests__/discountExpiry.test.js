import { describe, it, expect } from 'vitest'
import {
  LIGHTHOUSE_CLAWBACK_MONTHS, dueAt, daysOverdue,
  clawbackSummary, renewalReasons, renewalBase,
} from '../discountExpiry'


describe('the lighthouse clock', () => {
  it('gives the reference twelve months', () => {
    expect(LIGHTHOUSE_CLAWBACK_MONTHS).toBe(12)
    expect(dueAt('2026-03-01T00:00:00Z').toISOString().slice(0, 10)).toBe('2027-03-01')
  })

  it('is not overdue while there is still time', () => {
    const now = Date.parse('2026-09-10T00:00:00Z')
    expect(daysOverdue('2027-03-01T00:00:00Z', now)).toBe(0)
  })

  it('counts the days once it is', () => {
    const now = Date.parse('2026-09-10T00:00:00Z')
    expect(daysOverdue('2026-08-31T00:00:00Z', now)).toBe(10)
  })

  it('says nothing rather than guessing when there is no date', () => {
    expect(dueAt(null)).toBeNull()
    expect(daysOverdue(null)).toBe(0)
  })
})

describe('clawbackSummary', () => {
  const now = Date.parse('2026-09-10T00:00:00Z')
  const rows = [
    { bu: 'VGT', due_at: '2026-06-10T00:00:00Z', value_at_risk: 7600 },   // 92 days over
    { bu: 'VGT', due_at: '2026-09-01T00:00:00Z', value_at_risk: 2400 },   // 9 days over
    { bu: 'ECT', due_at: '2026-08-10T00:00:00Z', value_at_risk: 5000 },   // 31 days over
    { bu: 'VGT', due_at: '2027-01-01T00:00:00Z', value_at_risk: 9000 },   // still running
  ]

  it('totals only what is actually overdue', () => {
    const s = clawbackSummary(rows, { now })
    expect(s.deals).toBe(3)
    expect(s.value).toBe(15000)
    expect(s.oldestDays).toBe(92)
  })

  it('counts the ones still inside their year separately', () => {
    // Worth chasing before it becomes a conversation about taking money back.
    expect(clawbackSummary(rows, { now }).dueSoon).toBe(1)
  })

  it('filters by business unit', () => {
    const s = clawbackSummary(rows, { bu: 'ECT', now })
    expect(s.deals).toBe(1)
    expect(s.value).toBe(5000)
  })

  it('is empty on no rows', () => {
    expect(clawbackSummary([], { now })).toMatchObject({ deals: 0, value: 0 })
  })
})

describe('renewalReasons — nothing carries', () => {
  const previous = [
    { reason: 'displacement', pct: 15 },
    { reason: 'tender', pct: 10 },
    { reason: 'bundle', pct: 15 },
  ]

  it('brings every reason back to zero to be re-earned', () => {
    const rows = renewalReasons(previous, { productCount: 3, years: 5 })
    expect(rows.every(r => r.carries === false)).toBe(true)
    expect(rows.every(r => r.retest === true)).toBe(true)
    expect(rows.find(r => r.reason === 'displacement').proposedPct).toBe(0)
    expect(rows.find(r => r.reason === 'tender').proposedPct).toBe(0)
  })

  it('re-measures the bundle against the products actually renewing', () => {
    const same = renewalReasons(previous, { productCount: 3, years: 5 })
    expect(same.find(r => r.reason === 'bundle').proposedPct).toBe(15)
    expect(same.find(r => r.reason === 'bundle').shrank).toBe(false)

    // A product left: three-product 15% becomes two-product 10%.
    const smaller = renewalReasons(previous, { productCount: 2, years: 5 })
    const bundle = smaller.find(r => r.reason === 'bundle')
    expect(bundle.proposedPct).toBe(10)
    expect(bundle.shrank).toBe(true)
  })

  it('keeps what was given last time, for the conversation', () => {
    expect(renewalReasons(previous, { productCount: 2 })
      .find(r => r.reason === 'displacement').wasPct).toBe(15)
  })
})

describe('renewalBase — the renewal is quoted from the list', () => {
  it('starts from the regional list, never from last year net', () => {
    const r = renewalBase({ regionalList: 106070, lastNet: 76000 })
    expect(r.base).toBe(106070)
    expect(r.lastNet).toBe(76000)
  })

  it('names the step-up the customer will see if nothing is re-earned', () => {
    // The two Portuguese Dose deals: €0.38 closed against a €0.53 list.
    const r = renewalBase({ regionalList: 106070, lastNet: 76000 })
    expect(r.stepUp).toBe(30070)
    expect(r.stepUpPct).toBe(39.6)
  })

  it('is no step-up when last year was already at list', () => {
    expect(renewalBase({ regionalList: 100, lastNet: 100 }).stepUp).toBe(0)
    expect(renewalBase({ regionalList: 100, lastNet: 120 }).stepUp).toBe(0)
  })
})

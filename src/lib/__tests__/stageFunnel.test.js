import { describe, it, expect } from 'vitest'
import { FUNNEL_STAGES, dealValue, stageFunnel, conversion } from '../stageFunnel'

const deal = (o = {}) => ({ stage: 'Lead', bu: 'VGT', currency: 'EUR', exchange_rate: 1, ...o })

describe('what a deal is worth', () => {
  it('is the sum of its months', () => {
    expect(dealValue(deal({ apr: 1000, may: 2000 }))).toBe(3000)
  })

  it('falls back to the total for a deal with no monthly spread', () => {
    // Unlike a period view, the funnel is the whole year, so the fallback is
    // the right one — it is how every other screen values a deal.
    expect(dealValue(deal({ value_total: 50000 }))).toBe(50000)
  })

  it('prefers the months when both exist, because they are the schedule', () => {
    expect(dealValue(deal({ apr: 1000, value_total: 90000 }))).toBe(1000)
  })

  it('converts at the rate stored on the deal', () => {
    expect(dealValue(deal({ apr: 1000, currency: 'USD', exchange_rate: 0.861 }))).toBe(861)
  })
})

describe('the five frames', () => {
  const DEALS = [
    deal({ stage: 'Lead', apr: 10000 }),
    deal({ stage: 'Lead', apr: 5000 }),
    deal({ stage: 'Pipeline', apr: 20000 }),
    deal({ stage: 'Offer Presented', apr: 30000 }),
    deal({ stage: 'BackLog', apr: 40000 }),
    deal({ stage: 'Invoiced', apr: 50000 }),
    deal({ stage: 'Lost', apr: 99000 }),
    deal({ stage: 'Invoiced', apr: 70000, is_intercompany_mirror: true }),
    deal({ stage: 'Lead', apr: 8000, bu: 'ECT' }),
  ]

  it('draws five stages and Lost is not one of them', () => {
    expect(FUNNEL_STAGES).toEqual(['Lead', 'Pipeline', 'Offer Presented', 'BackLog', 'Invoiced'])
    const { stages } = stageFunnel(DEALS)
    expect(stages.map(s => s.stage)).toEqual(FUNNEL_STAGES)
  })

  it('reports Lost on its own, because it is the exit and not a step', () => {
    const { lost } = stageFunnel(DEALS)
    expect(lost.count).toBe(1)
    expect(lost.value).toBe(99000)
  })

  it('counts and values each stage', () => {
    const { stages } = stageFunnel(DEALS, { bu: 'VGT' })
    const lead = stages.find(s => s.stage === 'Lead')
    expect(lead.count).toBe(2)
    expect(lead.value).toBe(15000)
  })

  it('never counts an intercompany mirror', () => {
    const { stages } = stageFunnel(DEALS)
    expect(stages.find(s => s.stage === 'Invoiced').value).toBe(50000)
  })

  it('scopes to a business unit when asked', () => {
    expect(stageFunnel(DEALS, { bu: 'ECT' }).stages.find(s => s.stage === 'Lead').count).toBe(1)
    expect(stageFunnel(DEALS, { bu: 'VGT' }).stages.find(s => s.stage === 'Lead').count).toBe(2)
  })
})

describe('the weighted figure', () => {
  it('applies the forecast weights, not the face value', () => {
    const { stages } = stageFunnel([
      deal({ stage: 'Lead', apr: 100000 }),
      deal({ stage: 'Pipeline', apr: 100000 }),
      deal({ stage: 'Offer Presented', apr: 100000 }),
      deal({ stage: 'BackLog', apr: 100000 }),
    ])
    expect(stages.find(s => s.stage === 'Lead').weighted).toBe(10000)
    expect(stages.find(s => s.stage === 'Pipeline').weighted).toBe(30000)
    expect(stages.find(s => s.stage === 'Offer Presented').weighted).toBe(60000)
    expect(stages.find(s => s.stage === 'BackLog').weighted).toBe(100000)
  })

  it('sums the open pipeline without the invoiced, which is already money', () => {
    const { total } = stageFunnel([
      deal({ stage: 'Pipeline', apr: 100000 }),
      deal({ stage: 'Invoiced', apr: 500000 }),
    ])
    expect(total.openValue).toBe(100000)
    expect(total.weighted).toBe(30000)
    expect(total.invoiced).toBe(500000)
  })
})

describe('conversion between frames', () => {
  it('counts deals rather than money, so one big deal cannot flatter a month', () => {
    const { stages } = stageFunnel([
      deal({ stage: 'Lead', apr: 1 }), deal({ stage: 'Lead', apr: 1 }),
      deal({ stage: 'Lead', apr: 1 }), deal({ stage: 'Lead', apr: 1 }),
      deal({ stage: 'Pipeline', apr: 1000000 }),
    ])
    const c = conversion(stages)
    expect(c.find(s => s.stage === 'Pipeline').fromPrevious).toBe(25)
  })

  it('says nothing for the first frame, which has nothing before it', () => {
    expect(conversion(stageFunnel([]).stages)[0].fromPrevious).toBeNull()
  })

  it('says unknown rather than zero when the stage before is empty', () => {
    // A rate out of nothing is not 0%, and printing 0% would read as a funnel
    // that is failing rather than one that is empty.
    const { stages } = stageFunnel([deal({ stage: 'Pipeline', apr: 100 })])
    expect(conversion(stages).find(s => s.stage === 'Pipeline').fromPrevious).toBeNull()
  })
})

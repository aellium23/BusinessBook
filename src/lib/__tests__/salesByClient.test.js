import { describe, it, expect } from 'vitest'
import { PERIODS, monthsFor, fyMonthsElapsed, dealNetInPeriod, salesByClient, sortRows } from '../salesByClient'

const deal = (o = {}) => ({
  id: o.id || Math.random().toString(36).slice(2),
  stage: 'Invoiced', bu: 'VGT', client: 'Hospital A', gm_pct: 0.3,
  currency: 'EUR', exchange_rate: 1, ...o,
})

describe('the periods a year is read in', () => {
  it('offers the year, the quarters, the halves, year to date and each month', () => {
    expect(monthsFor('fy')).toHaveLength(12)
    expect(monthsFor('q1')).toEqual(['apr', 'may', 'jun'])
    expect(monthsFor('q4')).toEqual(['jan', 'feb', 'mar'])
    expect(monthsFor('h2')).toEqual(['oct', 'nov', 'dec', 'jan', 'feb', 'mar'])
    expect(monthsFor('aug')).toEqual(['aug'])
    expect(PERIODS.filter(p => p.months?.length === 1)).toHaveLength(12)
  })

  it('counts year to date from April, which is where this fiscal year starts', () => {
    expect(fyMonthsElapsed(new Date('2026-04-15'))).toBe(1)
    expect(fyMonthsElapsed(new Date('2026-09-11'))).toBe(6)
    expect(fyMonthsElapsed(new Date('2027-03-31'))).toBe(12)
    expect(monthsFor('ytd', new Date('2026-09-11'))).toEqual(['apr', 'may', 'jun', 'jul', 'aug', 'sep'])
  })

  it('reads an unknown period as the whole year rather than as nothing', () => {
    // Nothing selected must never look like "we sold nothing".
    expect(monthsFor('nonsense')).toHaveLength(12)
  })
})

describe('what a deal invoiced in a window', () => {
  it('sums only the months asked for', () => {
    const d = deal({ apr: 1000, may: 2000, jun: 500 })
    expect(dealNetInPeriod(d, ['apr', 'may'])).toBe(3000)
    expect(dealNetInPeriod(d, ['jun'])).toBe(500)
  })

  it('converts at the rate stored on the deal, not at today rate', () => {
    // A quote signed at 1.16 stays at 1.16 — otherwise last year is rewritten
    // every morning.
    const d = deal({ apr: 1000, currency: 'USD', exchange_rate: 0.861 })
    expect(dealNetInPeriod(d, ['apr'])).toBe(861)
  })

  it('coerces the strings Supabase returns', () => {
    expect(dealNetInPeriod(deal({ apr: '1500.50' }), ['apr'])).toBe(1500.5)
  })

  it('never falls back to value_total inside a period', () => {
    // The fallback exists for a deal with no monthly spread. Applied to a month
    // subset it would book a whole year into whatever window is selected.
    const d = deal({ value_total: 90000 })
    expect(dealNetInPeriod(d, ['apr'])).toBe(0)
  })
})

describe('sales by client', () => {
  const DEALS = [
    deal({ id: 'a', client: 'Hospital A', apr: 10000, gm_pct: 0.4 }),
    deal({ id: 'b', client: 'hospital a ', may: 5000, gm_pct: 0.2 }),   // same client
    deal({ id: 'c', client: 'Clinica B', apr: 8000, gm_pct: 0.5 }),
    deal({ id: 'd', client: 'Hospital A', apr: 99999, stage: 'BackLog' }),
    deal({ id: 'e', client: 'Mirror Co', apr: 50000, is_intercompany_mirror: true }),
    deal({ id: 'f', client: 'ECT Client', apr: 7000, bu: 'ECT' }),
  ]

  it('counts invoiced deals and nothing else', () => {
    const { rows } = salesByClient(DEALS, { months: ['apr', 'may'] })
    expect(rows.find(r => r.name === 'Hospital A').net).toBe(15000)  // not the BackLog 99,999
  })

  it('never counts an intercompany mirror, which would double the house', () => {
    const { rows } = salesByClient(DEALS, { months: ['apr'] })
    expect(rows.find(r => r.name === 'Mirror Co')).toBeUndefined()
  })

  it('groups the same client written differently', () => {
    const { rows } = salesByClient(DEALS, { months: ['apr', 'may'] })
    const a = rows.find(r => r.key === 'hospital a')
    expect(a.deals).toHaveLength(2)
    expect(a.name).toBe('Hospital A')   // the first spelling seen, trimmed
  })

  it('scopes to a business unit when asked', () => {
    const vgt = salesByClient(DEALS, { months: ['apr'], bu: 'VGT' })
    expect(vgt.rows.find(r => r.name === 'ECT Client')).toBeUndefined()
    const ect = salesByClient(DEALS, { months: ['apr'], bu: 'ECT' })
    expect(ect.rows.map(r => r.name)).toEqual(['ECT Client'])
  })

  it('drops a client with nothing in the window rather than showing a zero row', () => {
    const { rows } = salesByClient(DEALS, { months: ['dec'] })
    expect(rows).toEqual([])
  })
})

describe('gross margin', () => {
  it('is the revenue times the margin recorded on the deal', () => {
    const { rows } = salesByClient([deal({ apr: 10000, gm_pct: 0.35 })], { months: ['apr'] })
    expect(rows[0].margin).toBe(3500)
    expect(rows[0].marginPct).toBe(35)
  })

  it('blends by weight, so a small deal does not move a big client', () => {
    // 40,000 of margin plus 100, over 101,000 of revenue, is 39.7% — where a
    // straight average of the two percentages would say 25%.
    const { rows } = salesByClient([
      deal({ client: 'X', apr: 100000, gm_pct: 0.4 }),
      deal({ client: 'X', apr: 1000, gm_pct: 0.1 }),
    ], { months: ['apr'] })
    expect(rows[0].marginPct).toBe(39.7)
    expect(rows[0].margin).toBe(40100)
  })

  it('says nothing rather than 0% when no margin was ever recorded', () => {
    // Legacy rows default gm_pct to 0, and a client shown at 0% margin reads as
    // sold at cost when it means nobody filled the field in.
    const { rows, total } = salesByClient([deal({ apr: 5000, gm_pct: 0 })], { months: ['apr'] })
    expect(rows[0].net).toBe(5000)
    expect(rows[0].marginPct).toBeNull()
    expect(total.marginPct).toBeNull()
  })

  it('keeps an unmargined deal in revenue but out of the blend', () => {
    const { rows } = salesByClient([
      deal({ client: 'X', apr: 10000, gm_pct: 0.4 }),
      deal({ client: 'X', apr: 10000, gm_pct: 0 }),
    ], { months: ['apr'] })
    expect(rows[0].net).toBe(20000)
    expect(rows[0].margin).toBe(4000)
    expect(rows[0].marginPct).toBe(40)   // not 20
  })
})

describe('the total', () => {
  it('is the sum of the rows, which is the only property this table must keep', () => {
    const { rows, total } = salesByClient([
      deal({ client: 'A', apr: 10000, gm_pct: 0.3 }),
      deal({ client: 'B', apr: 5000, gm_pct: 0.5 }),
    ], { months: ['apr'] })
    expect(total.net).toBe(rows.reduce((s, r) => s + r.net, 0))
    expect(total.margin).toBe(rows.reduce((s, r) => s + r.margin, 0))
    expect(total.clients).toBe(2)
    expect(total.deals).toBe(2)
  })
})

describe('sorting', () => {
  const { rows } = salesByClient([
    deal({ client: 'Big', apr: 100000, gm_pct: 0.1 }),
    deal({ client: 'Small', apr: 1000, gm_pct: 0.9 }),
    deal({ client: 'Unknown', apr: 5000, gm_pct: 0 }),
  ], { months: ['apr'] })

  it('leads with the biggest, because that is the question being asked', () => {
    expect(sortRows(rows, 'net', 'desc').map(r => r.name)).toEqual(['Big', 'Unknown', 'Small'])
  })

  it('turns around', () => {
    expect(sortRows(rows, 'net', 'asc')[0].name).toBe('Small')
  })

  it('sorts by margin percentage, and puts the unknown last either way', () => {
    expect(sortRows(rows, 'marginPct', 'desc').map(r => r.name)).toEqual(['Small', 'Big', 'Unknown'])
    expect(sortRows(rows, 'marginPct', 'asc').map(r => r.name)).toEqual(['Big', 'Small', 'Unknown'])
  })

  it('sorts by name for the times somebody is looking one up', () => {
    expect(sortRows(rows, 'name', 'asc').map(r => r.name)).toEqual(['Big', 'Small', 'Unknown'])
  })
})

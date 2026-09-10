import { describe, it, expect } from 'vitest'
import {
  QUOTE_STATE_VERSION, toQuoteState, fromQuoteState, rebuildFrom,
} from '../quoteState'

const INPUTS = {
  picked: ['p1', 'p2'],
  volumes: { exam: '200000', radiologist: '40' },
  overrides: { p1: { capexPvp: 48618.46, discountNote: 'Nuance contract' }, p2: {} },
  famSel: { p1: { users: '13', itemIds: ['i1'] } },
  years: 5,
  manDays: '12',
  servicesOn: true,
  servicesPvp: '15000',
  channelRole: 'full_var',
  programme: '',
  country: 'Portugal',
}

describe('a quote reopens exactly as it was written', () => {
  it('carries every input back', () => {
    const back = fromQuoteState(toQuoteState(INPUTS))
    expect(back.picked).toEqual(['p1', 'p2'])
    expect(back.volumes).toEqual({ exam: '200000', radiologist: '40' })
    expect(back.years).toBe(5)
    expect(back.manDays).toBe('12')
    expect(back.servicesOn).toBe(true)
    expect(back.servicesPvp).toBe('15000')
    expect(back.channelRole).toBe('full_var')
    expect(back.country).toBe('Portugal')
    expect(back.rebuilt).toBe(false)
  })

  it('keeps what the rep typed over, and drops what they did not', () => {
    // An accepted recommendation is not an input. Storing it would freeze a
    // price that should follow the price list.
    const state = toQuoteState(INPUTS)
    expect(state.overrides).toEqual({ p1: { capexPvp: 48618.46, discountNote: 'Nuance contract' } })
    expect(state.overrides.p2).toBeUndefined()
  })

  it('stores no figures, only inputs', () => {
    const state = toQuoteState(INPUTS)
    for (const key of ['total', 'pvp', 'cost', 'grossMargin', 'marginPct']) {
      expect(state[key]).toBeUndefined()
    }
  })

  it('is versioned', () => {
    expect(toQuoteState(INPUTS).v).toBe(QUOTE_STATE_VERSION)
  })
})

describe('reading a state that cannot be trusted', () => {
  it('refuses one written by a newer version rather than half-reading it', () => {
    expect(fromQuoteState({ ...toQuoteState(INPUTS), v: QUOTE_STATE_VERSION + 1 })).toBeNull()
  })

  it('returns nothing for nothing', () => {
    expect(fromQuoteState(null)).toBeNull()
    expect(fromQuoteState('{}')).toBeNull()
  })

  it('fills a missing field with the screen default, not with undefined', () => {
    const back = fromQuoteState({ v: 1, picked: ['p1'] })
    expect(back.years).toBe(5)
    expect(back.volumes).toEqual({})
    expect(back.channelRole).toBe('direct')
    expect(back.servicesOn).toBe(false)
  })

  it('survives a state whose fields are the wrong shape', () => {
    const back = fromQuoteState({ v: 1, picked: 'p1', volumes: 7, overrides: null })
    expect(back.picked).toEqual([])
    expect(back.volumes).toEqual({})
    expect(back.overrides).toEqual({})
  })
})

describe('a deal that predates stored inputs', () => {
  const LINES = [
    { product_id: 'p1', volume: 200000, unit_price: 48618, net_price: 48618, annual_fee: 10000, cost_price: 31602 },
    { product_id: 'p2', volume: 200000, unit_price: 0, net_price: 0, annual_fee: 106070, cost_price: 0 },
    { product_id: null, product_name: 'Free text line', net_price: 500 },
  ]

  it('takes its products and the volume they were priced on', () => {
    const s = rebuildFrom(LINES)
    expect(s.picked).toEqual(['p1', 'p2'])
    expect(s.volumes).toEqual({ exam: '200000' })
  })

  it('carries the prices back as typed-over values, because they were agreed', () => {
    const s = rebuildFrom(LINES)
    expect(s.overrides.p1).toEqual({ capexPvp: 48618, annualPvp: 10000, capexCost: 31602 })
    expect(s.overrides.p2).toEqual({ annualPvp: 106070 })
  })

  it('does not write back a cost it was not allowed to see', () => {
    // cost_price comes back null through the security view for anyone who may
    // not see it, and a zero we did not measure is not a zero.
    const s = rebuildFrom([{ product_id: 'p1', net_price: 100, cost_price: null }])
    expect(s.overrides.p1.capexCost).toBeUndefined()
  })

  it('ignores a line with no product behind it', () => {
    expect(rebuildFrom(LINES).picked).not.toContain(null)
  })

  it('says what it cannot know instead of presenting a default as a fact', () => {
    const s = rebuildFrom(LINES)
    expect(s.rebuilt).toBe(true)
    expect(s.unknown).toEqual(['years', 'manDays', 'discounts'])
    expect(s.years).toBe(5)
  })

  it('handles a deal with no product lines at all', () => {
    const s = rebuildFrom([])
    expect(s.picked).toEqual([])
    expect(s.rebuilt).toBe(true)
  })
})

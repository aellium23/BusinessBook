import { describe, it, expect } from 'vitest'
import { dealValue, rateOf } from '../dealValue'

/**
 * The rule five screens disagreed about.
 *
 * A deal's value is the sum of its monthly columns, falling back to
 * `value_total` where there is no monthly spread, converted at the rate stored
 * ON THE DEAL. Every part of that sentence was implemented somewhere and no two
 * screens the same — a dollar deal with a schedule was worth four different
 * numbers depending on which dashboard pill you had clicked, and all four were
 * labelled in euros.
 *
 * It had no test of its own until 12-09: it was exercised sideways through
 * `stageFunnel`, which is not the same as being pinned down.
 */

/** A deal with a monthly spread, in euros. */
const scheduled = (over = {}) => ({
  apr: 1000, may: 2000, jun: 0, jul: 0, aug: 0, sep: 0,
  oct: 0, nov: 0, dec: 0, jan: 0, feb: 0, mar: 3000,
  value_total: 99999,
  ...over,
})

describe('the one valuation rule', () => {
  it('sums the months, and ignores value_total when there are any', () => {
    // 99,999 is deliberately absurd: if the fallback leaks in, it shows.
    expect(dealValue(scheduled())).toBe(6000)
  })

  it('falls back to value_total only when the year is empty', () => {
    const flat = Object.fromEntries(
      ['apr','may','jun','jul','aug','sep','oct','nov','dec','jan','feb','mar'].map(m => [m, 0]))
    expect(dealValue({ ...flat, value_total: 42000 })).toBe(42000)
  })

  it('is zero for a deal with neither, rather than a guess', () => {
    expect(dealValue({ value_total: null })).toBe(0)
    expect(dealValue({})).toBe(0)
    expect(dealValue(null)).toBe(0)
  })

  /** Supabase returns numerics as strings. Summing without coercing concatenates. */
  it('coerces the strings Supabase returns', () => {
    expect(dealValue(scheduled({ apr: '1000', may: '2000', mar: '3000' }))).toBe(6000)
    expect(dealValue({ value_total: '42000' })).toBe(42000)
  })
})

describe('the rate is the one stored on the deal', () => {
  it('converts at the stored rate and not at anybody else’s', () => {
    // 6,000 USD at the 0.861 the deal was quoted at.
    expect(dealValue(scheduled({ currency: 'USD', exchange_rate: 0.861 }))).toBe(5166)
  })

  /**
   * A rate is a snapshot. A currency move tomorrow must not silently reprice
   * what was quoted today — which is why the rate lives on the deal and this
   * function never reaches for a live one.
   */
  it('leaves a euro deal alone', () => {
    expect(rateOf({ currency: 'EUR', exchange_rate: 0.5 })).toBe(1)
    expect(rateOf({ exchange_rate: 0.5 })).toBe(1)
    expect(dealValue(scheduled({ currency: 'EUR', exchange_rate: 0.5 }))).toBe(6000)
  })

  it('treats a foreign deal with no rate recorded as one-to-one', () => {
    // Wrong, but visibly wrong and stable. Inventing a rate would be worse.
    expect(rateOf({ currency: 'USD' })).toBe(1)
    expect(rateOf({ currency: 'USD', exchange_rate: null })).toBe(1)
  })

  it('applies the rate to the fallback too, which two screens did not', () => {
    expect(dealValue({ value_total: 10000, currency: 'USD', exchange_rate: 0.9 })).toBe(9000)
  })
})

describe('what this function is deliberately not', () => {
  /**
   * Not a period figure. Inside a month or a quarter the monthly columns are
   * the only honest source, and the fallback has to be dropped — otherwise a
   * deal with no schedule lands its whole value in every month it is asked
   * about. `salesByClient` does that separately, on purpose.
   */
  it('is a full-year figure, and the fallback is the proof', () => {
    const noSchedule = { value_total: 12000 }
    expect(dealValue(noSchedule)).toBe(12000)
    // Twelve months of it would be 144,000. Nobody may read it that way.
    expect(dealValue(noSchedule)).not.toBe(1000)
  })

  it('rounds to the cent, so two screens adding the same deals agree', () => {
    expect(dealValue({ value_total: 10000, currency: 'USD', exchange_rate: 0.8615 })).toBe(8615)
    expect(dealValue({ value_total: 3333.333, currency: 'EUR' })).toBe(3333.33)
  })
})

import { describe, it, expect } from 'vitest'
import { toEur, rateLabel } from '../fx'

// EUR/USD 1.1615 (ECB, 3 September 2026) expressed the way the project stores
// it: rate_to_eur, so one dollar is 1 / 1.1615 euros.
const RATES = { USD: 0.8610, GBP: 1.1621 }

describe('toEur', () => {
  it('converts the CWM Dose anchor deal into euros', () => {
    // 200,000 exams at $0.616 in R2 is $123,200 of list.
    const r = toEur(123200, 'USD', RATES)
    expect(r.value).toBe(106075.2)      // the published EUR 106,070, at this rate
    expect(r.converted).toBe(true)
    expect(r.rate).toBe(0.861)
  })

  it('leaves euros alone', () => {
    expect(toEur(5000, 'EUR', RATES)).toEqual({ value: 5000, rate: 1, currency: 'EUR', converted: true })
    expect(toEur(5000, null, RATES).converted).toBe(true)
  })

  it('returns the amount unchanged and says so when the rate is missing', () => {
    // The alternative is printing dollars with a euro sign, which is the bug.
    const r = toEur(123200, 'JPY', RATES)
    expect(r.value).toBe(123200)
    expect(r.converted).toBe(false)
    expect(r.rate).toBeNull()
  })

  it('treats a zero or negative rate as missing, not as a multiplier', () => {
    expect(toEur(100, 'USD', { USD: 0 }).converted).toBe(false)
    expect(toEur(100, 'USD', { USD: -1 }).converted).toBe(false)
  })

  it('coerces string numerics and is case-insensitive on the currency', () => {
    expect(toEur('123200', 'usd', RATES).value).toBe(106075.2)
  })

  it('is zero-safe', () => {
    expect(toEur(0, 'USD', RATES).value).toBe(0)
    expect(toEur(null, 'USD', RATES).value).toBe(0)
  })
})

describe('rateLabel', () => {
  it('publishes the rate the way a person reads it', () => {
    expect(rateLabel('USD', 0.8610)).toBe('1 EUR = 1.1614 USD')
  })

  it('says nothing when there was no conversion to disclose', () => {
    expect(rateLabel('EUR', 1)).toBeNull()
    expect(rateLabel('USD', null)).toBeNull()
  })
})

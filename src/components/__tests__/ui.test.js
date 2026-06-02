import { describe, it, expect } from 'vitest'
import { formatK, toEUR, currencySymbol } from '../ui.jsx'

// ── formatK ─────────────────────────────────────────────────────────────

describe('formatK', () => {
  it('returns dash for null', () => {
    expect(formatK(null)).toBe('—')
  })

  it('returns dash for undefined', () => {
    expect(formatK(undefined)).toBe('—')
  })

  it('formats 0 as euro zero', () => {
    expect(formatK(0)).toBe('€0')
  })

  it('formats small numbers without suffix', () => {
    expect(formatK(500)).toBe('€500')
    expect(formatK(42)).toBe('€42')
  })

  it('formats thousands with K suffix', () => {
    expect(formatK(1000)).toBe('€1.0K')
    expect(formatK(1500)).toBe('€1.5K')
    expect(formatK(25000)).toBe('€25.0K')
    expect(formatK(999999)).toBe('€1000.0K')
  })

  it('formats millions with M suffix', () => {
    expect(formatK(1000000)).toBe('€1.0M')
    expect(formatK(2500000)).toBe('€2.5M')
    expect(formatK(10000000)).toBe('€10.0M')
  })

  it('handles negative numbers', () => {
    expect(formatK(-500)).toBe('€-500')
    expect(formatK(-5000)).toBe('€-5.0K')
    expect(formatK(-2000000)).toBe('€-2.0M')
  })

  it('rounds small numbers to nearest integer', () => {
    expect(formatK(99.7)).toBe('€100')
    expect(formatK(0.4)).toBe('€0')
  })
})

// ── toEUR ───────────────────────────────────────────────────────────────

describe('toEUR', () => {
  it('returns 0 for falsy value', () => {
    expect(toEUR(0, 'USD', 1.1)).toBe(0)
    expect(toEUR(null, 'USD', 1.1)).toBe(0)
    expect(toEUR(undefined, 'USD', 1.1)).toBe(0)
  })

  it('returns the value as-is for EUR currency', () => {
    expect(toEUR(1000, 'EUR', 1.0)).toBe(1000)
  })

  it('returns the value as-is when no currency', () => {
    expect(toEUR(1000, null, 1.0)).toBe(1000)
    expect(toEUR(1000, undefined, 1.0)).toBe(1000)
  })

  it('multiplies by exchange rate for non-EUR currencies', () => {
    expect(toEUR(100, 'USD', 0.85)).toBeCloseTo(85)
    expect(toEUR(200, 'GBP', 1.15)).toBeCloseTo(230)
  })

  it('defaults to rate=1 when rate is invalid', () => {
    expect(toEUR(100, 'USD', null)).toBe(100)
    expect(toEUR(100, 'USD', undefined)).toBe(100)
    expect(toEUR(100, 'USD', 'abc')).toBe(100)
  })
})

// ── currencySymbol ──────────────────────────────────────────────────────

describe('currencySymbol', () => {
  it('returns $ for USD', () => {
    expect(currencySymbol('USD')).toBe('$')
  })

  it('returns pound sign for GBP', () => {
    expect(currencySymbol('GBP')).toBe('£')
  })

  it('returns euro sign for EUR', () => {
    expect(currencySymbol('EUR')).toBe('€')
  })

  it('returns euro sign for unknown currencies', () => {
    expect(currencySymbol('CHF')).toBe('€')
    expect(currencySymbol(null)).toBe('€')
  })
})

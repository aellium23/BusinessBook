import { describe, it, expect } from 'vitest'
import { validateTiers } from '../priceLadder'

// The corrected CWM Dose ladder, as the pricing brief defines it.
const DOSE = [
  { tier_label: 'Up to 15,000 exams',        tier_from: 0,       tier_to: 15000,   global_list_price: 1.30 },
  { tier_label: '15,001 – 30,000 exams',     tier_from: 15001,   tier_to: 30000,   global_list_price: 1.19 },
  { tier_label: '30,001 – 60,000 exams',     tier_from: 30001,   tier_to: 60000,   global_list_price: 1.06 },
  { tier_label: '60,001 – 100,000 exams',    tier_from: 60001,   tier_to: 100000,  global_list_price: 0.92 },
  { tier_label: '100,001 – 250,000 exams',   tier_from: 100001,  tier_to: 250000,  global_list_price: 0.77 },
  { tier_label: 'Over 250,000 exams',        tier_from: 250001,  tier_to: null,    global_list_price: 0.70 },
]

describe('validateTiers', () => {
  it('passes a well-formed ladder', () => {
    expect(validateTiers(DOSE)).toEqual([])
  })

  it('catches a gap, which is how a price list goes quietly wrong', () => {
    // The band that used to end at 125,000 against one that now starts at
    // 100,001 leaves nothing priced in between.
    const gapped = [
      { tier_label: 'a', tier_from: 0,      tier_to: 60000, global_list_price: 1 },
      { tier_label: 'b', tier_from: 100001, tier_to: null,  global_list_price: 0.7 },
    ]
    expect(validateTiers(gapped)).toContain('Between bands 1 and 2: 60001–100000 has no price')
  })

  it('catches an overlap', () => {
    const overlap = [
      { tier_label: 'a', tier_from: 0,     tier_to: 100000, global_list_price: 1 },
      { tier_label: 'b', tier_from: 60001, tier_to: null,   global_list_price: 0.7 },
    ]
    expect(validateTiers(overlap).some(p => p.includes('overlap'))).toBe(true)
  })

  it('catches a band that ends before it starts', () => {
    const backwards = [{ tier_label: 'a', tier_from: 5000, tier_to: 100, global_list_price: 1 }]
    expect(validateTiers(backwards).some(p => p.includes('ends'))).toBe(true)
  })

  it('insists something is open-ended', () => {
    const closed = DOSE.map(r => (r.tier_to === null ? { ...r, tier_to: 5000000 } : r))
    expect(validateTiers(closed))
      .toContain('No band is open-ended — the largest customers price at nothing')
  })

  it('refuses two open-ended bands', () => {
    const two = [
      { tier_label: 'a', tier_from: 0,      tier_to: null, global_list_price: 1 },
      { tier_label: 'b', tier_from: 100001, tier_to: null, global_list_price: 0.7 },
    ]
    expect(validateTiers(two)).toContain('More than one band is open-ended')
  })

  it('catches a missing price', () => {
    const noPrice = [{ tier_label: 'a', tier_from: 0, tier_to: null, global_list_price: '' }]
    expect(validateTiers(noPrice)).toContain('Band 1: price is missing')
  })

  it('ignores the blank row an editor always has at the bottom', () => {
    expect(validateTiers([...DOSE, { tier_label: '', tier_from: '', tier_to: '', global_list_price: '' }]))
      .toEqual([])
  })

  it('says nothing about an empty ladder', () => {
    expect(validateTiers([])).toEqual([])
    expect(validateTiers(null)).toEqual([])
  })
})

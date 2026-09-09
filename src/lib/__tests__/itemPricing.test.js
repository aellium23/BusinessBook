import { describe, it, expect } from 'vitest'
import { blocksOf, bandFor, itemCost, itemTotals } from '../itemPricing'

// Real lines from the HCUS "MI Product Price List SUB 2026 V7.5".
const PACS_BASE = { name: 'PACS BASE LIC FOR EACH 10K STUDIES', unit: 'block_10k', transfer_price: 6320.4, annual_support: 477.25 }
const RIS       = { name: 'PACS RIS-PACS INTERFACE', unit: 'unit', transfer_price: 5417.65, annual_support: 409.4 }
const LUNIT_CXR = [
  { name: 'Tier 1 - 1K',   unit: 'study', tier_from: 0,     tier_to: 1000,   transfer_price: 0.78 },
  { name: 'Tier 2 - 9K',   unit: 'study', tier_from: 1001,  tier_to: 9000,   transfer_price: 0.63 },
  { name: 'Tier 3 - 90K',  unit: 'study', tier_from: 9001,  tier_to: 90000,  transfer_price: 0.47 },
  { name: 'Tier 4 - 900K', unit: 'study', tier_from: 90001, tier_to: 900000, transfer_price: 0.24 },
]
const AVICENNA_OPEN = { name: 'ICH (100K+)', unit: 'study', tier_from: 100000, tier_to: null, transfer_price: 0.18 }

describe('blocksOf', () => {
  it('rounds a partial block up — you cannot buy half a licence', () => {
    expect(blocksOf(45000)).toBe(5)
    expect(blocksOf(40001)).toBe(5)
    expect(blocksOf(40000)).toBe(4)
  })

  it('is zero for no volume, not one', () => {
    expect(blocksOf(0)).toBe(0)
    expect(blocksOf(null)).toBe(0)
  })
})

describe('bandFor', () => {
  it('picks the band containing the volume', () => {
    expect(bandFor(LUNIT_CXR, 500).transfer_price).toBe(0.78)
    expect(bandFor(LUNIT_CXR, 1001).transfer_price).toBe(0.63)
    expect(bandFor(LUNIT_CXR, 45000).transfer_price).toBe(0.47)
    expect(bandFor(LUNIT_CXR, 90000).transfer_price).toBe(0.47)
    expect(bandFor(LUNIT_CXR, 90001).transfer_price).toBe(0.24)
  })

  it('treats a null ceiling as open-ended', () => {
    expect(bandFor([AVICENNA_OPEN], 250000)).toBe(AVICENNA_OPEN)
  })

  it('returns null when the volume falls outside every band', () => {
    expect(bandFor([AVICENNA_OPEN], 5000)).toBeNull()
  })

  it('falls back to the only item when nothing is banded', () => {
    expect(bandFor([RIS], 45000)).toBe(RIS)
  })
})

describe('itemCost', () => {
  it('bills a 10k block by volume, not by the quantity asked for', () => {
    // 45,000 studies is five blocks even if the caller passes quantity 3.
    const r = itemCost(PACS_BASE, { studies: 45000, quantity: 3 })
    expect(r.quantity).toBe(5)
    expect(r.cost).toBe(31602)
    expect(r.annualSupport).toBe(2386.25)
  })

  it('bills a flat licence by quantity', () => {
    expect(itemCost(RIS, { studies: 45000, quantity: 2 })).toEqual({
      quantity: 2, cost: 10835.3, annualSupport: 818.8,
    })
  })

  it('bills a per-study rate across the whole volume', () => {
    const r = itemCost(bandFor(LUNIT_CXR, 45000), { studies: 45000 })
    expect(r.quantity).toBe(45000)
    expect(r.cost).toBe(21150)
    // Per-study lines carry no separate annual support in this price list.
    expect(r.annualSupport).toBe(0)
  })

  it('coerces the string numerics Supabase returns', () => {
    const asStrings = { ...PACS_BASE, transfer_price: '6320.4', annual_support: '477.25' }
    expect(itemCost(asStrings, { studies: '45000' }).cost).toBe(31602)
  })

  it('returns zeroes rather than NaN for a missing item', () => {
    expect(itemCost(null, { studies: 45000 })).toEqual({ quantity: 0, cost: 0, annualSupport: 0 })
  })

  it('costs nothing when there is no volume yet', () => {
    expect(itemCost(PACS_BASE, { studies: 0 }).cost).toBe(0)
  })
})

describe('itemTotals', () => {
  it('sums cost and support separately', () => {
    const lines = [
      itemCost(PACS_BASE, { studies: 45000 }),
      itemCost(RIS, { quantity: 1 }),
    ]
    expect(itemTotals(lines)).toEqual({ cost: 37019.65, annualSupport: 2795.65 })
  })

  it('handles an empty quote', () => {
    expect(itemTotals([])).toEqual({ cost: 0, annualSupport: 0 })
    expect(itemTotals(null)).toEqual({ cost: 0, annualSupport: 0 })
  })
})

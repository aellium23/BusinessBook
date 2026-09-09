import { describe, it, expect } from 'vitest'
import { cheapestCcuCombination, groupItems } from '../ccu'

// The real Synapse 3D base packages, transfer price to FEN, from the HCUS
// "MI Product Price List SUB 2026 V7.5" price list.
const BASE = [
  { id: 'b1',  name: 'Base package (Standalone) 1 CCU', ccu: 1,  transfer_price: 5520,  annual_support: 885.5 },
  { id: 'b3',  name: 'Base package (Server) 3 CCU',     ccu: 3,  transfer_price: 8970,  annual_support: 1437.5 },
  { id: 'b10', name: 'Base package (Server) 10 CCU',    ccu: 10, transfer_price: 13800, annual_support: 2208 },
]

describe('cheapestCcuCombination', () => {
  it('answers the 13-user case with a 10 plus a 3', () => {
    const r = cheapestCcuCombination(BASE, 13)
    expect(r.lines.map(l => [l.ccu, l.quantity])).toEqual([[10, 1], [3, 1]])
    expect(r.ccu).toBe(13)
    expect(r.cost).toBe(22770)
    expect(r.annualSupport).toBe(3645.5)
  })

  it('does not buy singles when a bigger package is cheaper', () => {
    // Ten 1 CCU packages cost 55,200; one 10 CCU package costs 13,800.
    expect(cheapestCcuCombination(BASE, 10).cost).toBe(13800)
  })

  it('overshoots rather than under-licensing', () => {
    // 8 users: 3+3+3 is 26,910, while a single 10 CCU is 13,800 and covers it.
    const r = cheapestCcuCombination(BASE, 8)
    expect(r.cost).toBe(13800)
    expect(r.ccu).toBe(10)
  })

  it('scales past the largest package', () => {
    const r = cheapestCcuCombination(BASE, 23)
    expect(r.ccu).toBeGreaterThanOrEqual(23)
    expect(r.cost).toBe(13800 * 2 + 8970)   // 10 + 10 + 3
  })

  it('prefers fewer licences when two combinations cost the same', () => {
    const flat = [
      { id: 'a', ccu: 1, transfer_price: 1000 },
      { id: 'b', ccu: 2, transfer_price: 2000 },
    ]
    const r = cheapestCcuCombination(flat, 4)
    expect(r.cost).toBe(4000)
    expect(r.lines).toHaveLength(1)
    expect(r.lines[0].quantity).toBe(2)
  })

  it('returns null rather than guessing on empty input', () => {
    expect(cheapestCcuCombination([], 5)).toBeNull()
    expect(cheapestCcuCombination(BASE, 0)).toBeNull()
    expect(cheapestCcuCombination(BASE, null)).toBeNull()
  })

  it('ignores items that carry no capacity or no price', () => {
    const mixed = [...BASE, { id: 'x', ccu: null, transfer_price: 1 }, { id: 'y', ccu: 5, transfer_price: 0 }]
    expect(cheapestCcuCombination(mixed, 13).cost).toBe(22770)
  })

  it('coerces the string numerics Supabase returns', () => {
    const asStrings = BASE.map(p => ({ ...p, ccu: String(p.ccu), transfer_price: String(p.transfer_price) }))
    expect(cheapestCcuCombination(asStrings, 13).cost).toBe(22770)
  })
})

describe('groupItems', () => {
  it('separates packages from the a-la-carte modules', () => {
    const g = groupItems([
      { kind: 'package', name: 'Radiology 3 CCU' },
      { kind: 'module',  name: '4D Flow' },
      { kind: 'module',  name: 'Calcium Scoring' },
      { kind: 'upgrade', name: 'Upgrade-Base Package' },
      { kind: 'hardware', name: '3D dongle' },
    ])
    expect(g.packages).toHaveLength(1)
    expect(g.modules).toHaveLength(2)
    expect(g.upgrades).toHaveLength(1)
    expect(g.hardware).toHaveLength(1)
    expect(g.services).toHaveLength(0)
  })
})

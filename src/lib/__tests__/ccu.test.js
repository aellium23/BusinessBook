import { describe, it, expect } from 'vitest'
import { cheapestCcuCombination, groupItems, packageLines } from '../ccu'
import { resolveVariant, hasBundleVariant, familyEconomics, discountCeiling } from '../familyEconomics'

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

// The real capacity packages, as loaded from the HCUS price list.
const S3D_PACKAGES = [
  { id: 'p1',  name: '3D - INT SYN 3D BASE PKG STANDALONE 1 CCU V6', description: 'Base package(Standalone)',   kind: 'package', ccu: 1,  transfer_price: 5520 },
  { id: 'p2',  name: '3D - INT SYN 3D BASE PKG SERVER 3 CCU V6',     description: 'Base package(Server) 3CCU',  kind: 'package', ccu: 3,  transfer_price: 8970 },
  { id: 'p3',  name: '3D - INT SYN 3D BASE PKG SERVER 10 CCU V6',    description: 'Base package(Server) 10CCU', kind: 'package', ccu: 10, transfer_price: 13800 },
  { id: 'p4',  name: '3D - INT SYN 3D RADIOLOGY PKG 3 CCU V6',       description: 'Radiology package 3CCU',     kind: 'package', ccu: 3,  transfer_price: 8970 },
  { id: 'p5',  name: '3D - INT SYN 3D RADIOLOGY PKG 10 CCU V6',      description: 'Radiology package 10CCU',    kind: 'package', ccu: 10, transfer_price: 15249 },
  { id: 'p6',  name: '3D - INT SYN 3D CARDIO CT PKG 1 CCU V6',       description: 'Cardiology CT package',      kind: 'package', ccu: 1,  transfer_price: 10580 },
  { id: 'm1',  name: '3D - INT SYN 3D BONE VIEWER PER CCU',          description: 'Rib Viewer',                 kind: 'module',  ccu: null, transfer_price: 2385.1 },
]
const MOB_PACKAGES = [
  { id: 'b1', name: 'INT SYN MOB 2D LIC WITH COLLABO PER 2CCU', description: 'Mobility - 2D only license', kind: 'package', ccu: 2,  transfer_price: 5796 },
  { id: 'b2', name: 'INT SYN MOB 3D FULL LIC PER 2CCU',  description: 'Full Version license', kind: 'package', ccu: 2,  transfer_price: 7969.5 },
  { id: 'b3', name: 'INT SYN MOB 3D FULL LIC PER 10CCU', description: 'Full Version license', kind: 'package', ccu: 10, transfer_price: 35190 },
  { id: 'b4', name: 'INT SYN MOB 3D FULL LIC PER 20CCU', description: 'Full Version license', kind: 'package', ccu: 20, transfer_price: 62100 },
]

describe('packageLines', () => {
  it('collapses one ladder but keeps different products apart', () => {
    const lines = packageLines(S3D_PACKAGES)
    const sizes = lines.map(l => l.packages.map(p => p.ccu)).sort((a, b) => b.length - a.length)
    // Base Server has a 3 and a 10; Standalone, Radiology and Cardiology are
    // separate lines of their own.
    expect(sizes[0]).toEqual([3, 10])
    expect(lines).toHaveLength(4)
  })

  it('never mixes two products to reach a user count', () => {
    const base = packageLines(S3D_PACKAGES).find(l => /server/i.test(l.key))
    const r = cheapestCcuCombination(base.packages, 11)
    // 10 + 3 of Base, not 10 of Base plus a 1 CCU Cardiology package at 10,580.
    expect(r.cost).toBe(22770)
    expect(r.lines.every(l => /BASE/.test(l.name))).toBe(true)
  })

  it('excludes modules that are priced per CCU but grant no capacity', () => {
    const all = packageLines(S3D_PACKAGES).flatMap(l => l.packages.map(p => p.id))
    expect(all).not.toContain('m1')
  })

  it('keeps the Mobility 2D and 3D ladders separate', () => {
    const lines = packageLines(MOB_PACKAGES)
    expect(lines).toHaveLength(2)
    const full = lines.find(l => /3D FULL/.test(l.key))
    expect(full.packages.map(p => p.ccu)).toEqual([2, 10, 20])
    const r = cheapestCcuCombination(full.packages, 13)
    expect(r.lines.every(l => /3D FULL/.test(l.name))).toBe(true)
  })

  it('labels a line without its capacity token', () => {
    const full = packageLines(MOB_PACKAGES).find(l => /3D FULL/.test(l.key))
    expect(full.label).toBe('Full Version license')
  })

  it('returns nothing for a family with no capacity packages', () => {
    expect(packageLines([{ kind: 'module', ccu: null }])).toEqual([])
    expect(packageLines([])).toEqual([])
  })
})

// The VNA licence at both its prices, as the HCUS list publishes them.
const VNA = [
  { id: 'v1', name: 'VNA DICOM LIC 10K STUDIES',  kind: 'module', unit: 'block_10k',
    variant_group: 'VNA-DICOM-10K', variant: 'standalone', transfer_price: 4168.75, annual_support: 417.45 },
  { id: 'v2', name: 'VNA DICOM LIC FOR 10K PACS', kind: 'package', unit: 'block_10k',
    variant_group: 'VNA-DICOM-10K', variant: 'bundle', transfer_price: 2084.95, annual_support: 208.15 },
  { id: 'x',  name: 'VNA NON-DICOM LIC PER DEPARTMENT', kind: 'module', unit: 'unit',
    transfer_price: 2518.5, annual_support: 417.45 },
]

describe('resolveVariant', () => {
  it('swaps the standalone licence for the bundled one', () => {
    expect(resolveVariant(VNA, VNA[0], true).id).toBe('v2')
    expect(resolveVariant(VNA, VNA[0], false).id).toBe('v1')
  })

  it('swaps back, so unticking the box restores the standalone price', () => {
    expect(resolveVariant(VNA, VNA[1], false).id).toBe('v1')
  })

  it('leaves an item with no conditional price alone', () => {
    expect(resolveVariant(VNA, VNA[2], true).id).toBe('x')
  })

  it('keeps the item when the group has no such variant', () => {
    const orphan = { id: 'o', variant_group: 'NOPE', variant: 'standalone' }
    expect(resolveVariant(VNA, orphan, true).id).toBe('o')
  })

  it('recognises a family that has a bundle price at all', () => {
    expect(hasBundleVariant(VNA)).toBe(true)
    expect(hasBundleVariant([VNA[2]])).toBe(false)
    expect(hasBundleVariant([])).toBe(false)
  })
})

describe('familyEconomics with the bundle', () => {
  it('halves the VNA cost when Synapse PACS is present', () => {
    const sel = { itemIds: ['v1'] }
    const alone = familyEconomics(VNA, { ...sel, bundle: false }, 45000)
    const withPacs = familyEconomics(VNA, { ...sel, bundle: true }, 45000)
    // Five 10k blocks either way; only the rate changes.
    expect(alone.capex).toBe(4168.75 * 5)
    expect(withPacs.capex).toBe(2084.95 * 5)
    expect(alone.annual).toBe(417.45 * 5)
    expect(withPacs.annual).toBe(208.15 * 5)
  })

  it('keeps capex and annual support apart', () => {
    const r = familyEconomics(VNA, { itemIds: ['x'] }, 45000)
    expect(r).toMatchObject({ capex: 2518.5, annual: 417.45, reliefCapex: 0, reliefAnnual: 0 })
  })
})

// A Synapse PACS quote: the licence and the Oracle behind it are separate
// negotiations with HCUS, and the price list carries what each normally allows.
const PACS_ITEMS = [
  { id: 'lic', name: 'PACS BASE LIC FOR EACH 10K STUDIES', kind: 'module', unit: 'block_10k',
    transfer_price: 6320.4, annual_support: 477.25, max_discount_pct: 80 },
  { id: 'ora', name: 'COMPUTE STD 10K LIC FTYO', kind: 'module', unit: 'block_10k',
    transfer_price: 1150, annual_support: 184, max_discount_pct: 20 },
]

describe('familyEconomics with per-SKU discounts', () => {
  const sel = { itemIds: ['lic', 'ora'] }

  it('costs five 10k blocks of each', () => {
    const r = familyEconomics(PACS_ITEMS, sel, 45000)
    expect(r.capex).toBe(round2((6320.4 + 1150) * 5))
    expect(r.annual).toBe(round2((477.25 + 184) * 5))
  })

  it('takes 70% off the licence and 20% off the Oracle, not one rate across both', () => {
    const r = familyEconomics(PACS_ITEMS, { ...sel, discounts: { lic: 70, ora: 20 } }, 45000)
    expect(r.reliefCapex).toBe(round2(6320.4 * 5 * 0.7 + 1150 * 5 * 0.2))
    expect(r.discounted).toHaveLength(2)
    expect(r.discounted.find(d => d.item.id === 'ora').pct).toBe(20)
  })

  it('never subtracts the relief from the cost — it was asked for, not granted', () => {
    const plain = familyEconomics(PACS_ITEMS, sel, 45000)
    const asked = familyEconomics(PACS_ITEMS, { ...sel, discounts: { lic: 70 } }, 45000)
    expect(asked.capex).toBe(plain.capex)
    expect(asked.reliefCapex).toBeGreaterThan(0)
  })

  it('reports relief on the support side separately', () => {
    const r = familyEconomics(PACS_ITEMS, { ...sel, discounts: { ora: 20 } }, 45000)
    expect(r.reliefAnnual).toBe(round2(184 * 5 * 0.2))
    expect(r.reliefCapex).toBe(round2(1150 * 5 * 0.2))
  })

  it('lists no discount at zero, so nothing is raised needlessly', () => {
    expect(familyEconomics(PACS_ITEMS, { ...sel, discounts: { lic: 0 } }, 45000).discounted).toEqual([])
  })

  it('clamps a nonsense percentage rather than inverting the price', () => {
    const r = familyEconomics(PACS_ITEMS, { itemIds: ['ora'], discounts: { ora: 150 } }, 45000)
    expect(r.reliefCapex).toBe(round2(1150 * 5))
    const neg = familyEconomics(PACS_ITEMS, { itemIds: ['ora'], discounts: { ora: -20 } }, 45000)
    expect(neg.reliefCapex).toBe(0)
  })
})

describe('discountCeiling', () => {
  it('reports what the supplier normally allows on this SKU', () => {
    expect(discountCeiling(PACS_ITEMS[0])).toBe(80)
    expect(discountCeiling(PACS_ITEMS[1])).toBe(20)
  })

  it('is null where nothing is known, rather than a guessed number', () => {
    expect(discountCeiling({})).toBeNull()
    expect(discountCeiling({ max_discount_pct: 0 })).toBeNull()
    expect(discountCeiling(null)).toBeNull()
  })
})

function round2(n) { return Math.round((n + Number.EPSILON) * 100) / 100 }

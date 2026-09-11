import { describe, it, expect } from 'vitest'
import { lineCostTotals, marginFromTotals } from '../margins'

/**
 * Margins are written in three different units in this app, and two of them
 * live in columns whose name does not say which.
 *
 *   deals.gm_pct            a FRACTION       0.35 is 35%
 *   deal_products.margin_pct a MARKUP ON COST, in percent  53.8 is 53.8%
 *   the quote's own marginPct a MARGIN ON PRICE, in percent 35.0 is 35%
 *
 * The quick deal wrote its own percentage straight into both columns. Into
 * `gm_pct` that is a hundred times too large, and nothing validates that a
 * margin is at most 1, so every deal it saved carried a gross margin of 3520%
 * to every screen that reads it — the card, the client table, the SAP
 * reconciliation. Into `margin_pct` it was the right unit and the wrong
 * definition, so reopening the line in the full editor recomputed the price
 * from a markup reading of a margin and dropped it.
 *
 * These are the two conversions, held here where a change to either has to
 * pass them.
 */

/** What the quote computes: gross margin on the sell price, as a percentage. */
const marginOnPrice = (cost, price) =>
  price > 0 ? Math.round(((price - cost) / price) * 1000) / 10 : 0

/** What `deals.gm_pct` stores: the same thing as a fraction. */
const toFraction = pct => Math.round((pct / 100 + Number.EPSILON) * 10000) / 10000

/** What `deal_products.margin_pct` stores: the markup on cost, as a percentage. */
function markupOnCost(cost, price) {
  const c = Number(cost) || 0
  const p = Number(price) || 0
  if (c <= 0 || p <= 0) return null
  return Math.round(((p / c) - 1) * 1000) / 10
}

describe('what deals.gm_pct holds', () => {
  it('is a fraction, because every reader multiplies it by 100', () => {
    expect(toFraction(marginOnPrice(65, 100))).toBe(0.35)
  })

  it('never leaves a margin above one', () => {
    // 3520% on a deal card was what the unmixed percentage looked like.
    for (const [cost, price] of [[65, 100], [1, 1000], [999, 1000], [0, 100]]) {
      const stored = toFraction(marginOnPrice(cost, price))
      expect(stored).toBeLessThanOrEqual(1)
      expect(stored).toBeGreaterThanOrEqual(0)
    }
  })

  it('reads back as the percentage it was written from', () => {
    const pct = marginOnPrice(65, 100)
    expect(Number((toFraction(pct) * 100).toFixed(1))).toBe(pct)
  })
})

describe('what deal_products.margin_pct holds', () => {
  it('is the markup, which is not the margin', () => {
    // The difference is the whole point: 35% margin, 53.8% markup, one line.
    expect(marginOnPrice(65, 100)).toBe(35)
    expect(markupOnCost(65, 100)).toBe(53.8)
  })

  it('reproduces the price the quote sold at, which is what the editor does', () => {
    const cost = 65, price = 100
    const markup = markupOnCost(cost, price)
    expect(Math.round(cost * (1 + markup / 100) * 100) / 100).toBeCloseTo(price, 1)
  })

  it('says nothing rather than infinity when the cost is unknown', () => {
    expect(markupOnCost(0, 100)).toBeNull()
    expect(markupOnCost(null, 100)).toBeNull()
    expect(markupOnCost(65, 0)).toBeNull()
  })
})

/**
 * One deal, two screens, two opposite margins.
 *
 * `DealForm` summed the cost column raw: a line nobody had costed counted as
 * zero, and the deal reported 100% margin. `ProductLineItems` did
 * `cost_price || unit_price`: the same line counted at its own selling price,
 * and the deal reported 0%. Both confident, both wrong, and the true answer —
 * that we do not know — was the one neither of them could say.
 */
describe('a line nobody has costed', () => {
  const LINES = [
    { cost_price: 6000, net_price: 10000 },
    { cost_price: null, net_price: 10000 },
  ]

  it('is left out of the cost, not counted as zero and not as the sell price', () => {
    const t = lineCostTotals(LINES)
    expect(t.cost).toBe(6000)
    expect(t.known).toBe(1)
    expect(t.unknown).toBe(1)
    expect(t.complete).toBe(false)
  })

  it('makes the margin unknown rather than 100% or 0%', () => {
    const t = lineCostTotals(LINES)
    expect(marginFromTotals(20000, t)).toBe(null)
    // The two readings this replaces, named so the regression is recognisable.
    const asZero = (20000 - 6000) / 20000 * 100
    const asSellPrice = (20000 - 16000) / 20000 * 100
    expect(Math.round(asZero)).toBe(70)
    expect(Math.round(asSellPrice)).toBe(20)
  })

  it('gives a real margin once every line has answered', () => {
    const t = lineCostTotals([{ cost_price: 6000, net_price: 10000 }, { cost_price: 7000, net_price: 10000 }])
    expect(t.complete).toBe(true)
    expect(marginFromTotals(20000, t)).toEqual({ gm: 7000, pct: 35 })
  })

  it('keeps a zero somebody typed, because that is an answer', () => {
    const t = lineCostTotals([{ cost_price: 0, net_price: 10000 }])
    expect(t.complete).toBe(true)
    expect(t.cost).toBe(0)
    expect(marginFromTotals(10000, t)).toEqual({ gm: 10000, pct: 100 })
  })

  it('extends by quantity where the caller says the lines are per-unit', () => {
    const t = lineCostTotals([{ cost_price: 100, quantity: 3 }], { quantityOf: l => l.quantity })
    expect(t.cost).toBe(300)
  })

  it('has no margin to report when there are no lines at all', () => {
    const t = lineCostTotals([])
    expect(t.complete).toBe(false)
    expect(marginFromTotals(1000, t)).toBe(null)
  })
})

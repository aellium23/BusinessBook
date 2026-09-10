import { describe, it, expect } from 'vitest'
import {
  pctOffList, approvalFor, rungFor, priceAtRung,
  DISCOUNT_CAP_PCT, APPROVAL_LADDER,
} from '../discountLadder'

describe('pctOffList', () => {
  it('measures the price, not the discount box', () => {
    // A rep who types over the price leaves the discount field at zero while
    // the deal is 40% off. The customer pays the price, so the price governs.
    expect(pctOffList(106070, 63642)).toBe(40)
    expect(pctOffList(106070, 106070)).toBe(0)
  })

  it('reproduces the closed Portuguese deal', () => {
    // EUR 0.53 list, EUR 0.38 close, at 200,000 exams.
    expect(pctOffList(200000 * 0.53, 200000 * 0.38)).toBe(28.3)
  })

  it('is zero when there is no list to measure against', () => {
    expect(pctOffList(0, 5000)).toBe(0)
    expect(pctOffList(null, 5000)).toBe(0)
  })
})

describe('approvalFor', () => {
  it('needs nobody up to ten points', () => {
    expect(approvalFor(0).requiresApproval).toBe(false)
    expect(approvalFor(10).level).toBe('none')
  })

  it('walks up the ladder as the price falls', () => {
    expect(approvalFor(10.1).level).toBe('country_manager')
    expect(approvalFor(20).level).toBe('country_manager')
    expect(approvalFor(20.1).level).toBe('pnl_owner')
    expect(approvalFor(30).level).toBe('pnl_owner')
  })

  it('treats anything past the cap as a named programme, not a bigger discount', () => {
    const r = approvalFor(30.1)
    expect(r.level).toBe('named_programme')
    expect(r.overCap).toBe(true)
    expect(DISCOUNT_CAP_PCT).toBe(30)
  })

  it('puts the closed Portuguese deal with the P&L owner, inside the cap', () => {
    // 28.3% off: the P&L owner signs, and no named programme was needed.
    const r = approvalFor(28.3)
    expect(r.level).toBe('pnl_owner')
    expect(r.overCap).toBeUndefined()
  })

  it('has exactly one rung that needs no approval', () => {
    expect(APPROVAL_LADDER.filter(b => !b.requiresApproval)).toHaveLength(1)
  })
})

describe('rungFor', () => {
  it('reports the rung reached, not the nearest one', () => {
    expect(rungFor(100).key).toBe('list')
    expect(rungFor(95).key).toBe('target')      // has cleared 90, not 100
    expect(rungFor(90).key).toBe('target')
    expect(rungFor(71.7).key).toBe('strategic_floor')
    expect(rungFor(70).key).toBe('strategic_floor')
  })

  it('names what sits below the last rung', () => {
    expect(rungFor(69.9).key).toBe('below_floor')
  })
})

describe('priceAtRung', () => {
  it('gives the rep the next step down in money', () => {
    // The published ladder for the 200,000-exam deal.
    expect(priceAtRung(106070, 90)).toBe(95463)
    expect(priceAtRung(106070, 80)).toBe(84856)
    expect(priceAtRung(106070, 70)).toBe(74249)
  })
})

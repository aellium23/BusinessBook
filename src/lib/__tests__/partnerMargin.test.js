import { describe, it, expect } from 'vitest'
import {
  CHANNEL_ROLES, PROTECTED_MARGIN, NAMED_PROGRAMMES,
  protectedMarginPct, partnerEconomics,
} from '../partnerMargin'

/** The published Full VAR ladder, on a list price of 100. */
const varAt = net => partnerEconomics({ listPrice: 100, netPrice: net, role: 'full_var' })

describe('the Full VAR ladder, reproduced from the discount architecture', () => {
  it('keeps the full 40% at list — protection raises nobody above their rate', () => {
    const r = varAt(100)
    expect(r.transfer).toBe(60)
    expect(r.partnerMarginPct).toBe(40)
    expect(r.givenUp).toBe(0)
  })

  it('holds 35% at the standard target, and costs us 1.5', () => {
    const r = varAt(90)
    expect(r.transfer).toBe(58.5)
    expect(r.partnerMarginPct).toBe(35)
    expect(r.givenUp).toBe(1.5)
  })

  it('holds 35% at the Country Manager floor, and costs us 8', () => {
    const r = varAt(80)
    expect(r.transfer).toBe(52)
    expect(r.partnerMarginPct).toBe(35)
    expect(r.givenUp).toBe(8)
  })

  it('holds 35% at the strategic floor, and costs us 14.5', () => {
    const r = varAt(70)
    expect(r.transfer).toBe(45.5)
    expect(r.partnerMarginPct).toBe(35)
    expect(r.givenUp).toBe(14.5)
  })

  it('drops to the 20% floor above the cap, and costs us 22.4', () => {
    // A named programme at 53% off: the deal is already an exception.
    const r = varAt(47)
    expect(r.overCap).toBe(true)
    expect(r.transfer).toBe(37.6)
    expect(r.partnerMarginPct).toBe(20)
    expect(r.givenUp).toBe(22.4)
  })
})

describe('what the old fixed transfer did, and why this exists', () => {
  it('would have left the partner at 14.3% at the cap', () => {
    // The error being corrected: transfer fixed at 60 while the customer pays 70.
    const fixed = (100 - 60) / 100
    expect(Math.round((70 - 60) / 70 * 1000) / 10).toBe(14.3)
    expect(Math.round(fixed * 100)).toBe(40)
    // With protection, the same deal keeps the partner whole.
    expect(varAt(70).partnerMarginPct).toBe(35)
  })
})

describe('a role entitled to less than 35% keeps its own rate', () => {
  it('pays a Referral 15%, at list and discounted', () => {
    const atList = partnerEconomics({ listPrice: 100, netPrice: 100, role: 'referral' })
    expect(atList.transfer).toBe(85)
    expect(atList.partnerMarginPct).toBe(15)

    const discounted = partnerEconomics({ listPrice: 100, netPrice: 70, role: 'referral' })
    expect(discounted.transfer).toBe(59.5)
    expect(discounted.partnerMarginPct).toBe(15)
    // Protection is not a raise: we fund the difference, they keep their rate.
    expect(discounted.givenUp).toBe(25.5)
  })

  it('pays a Reseller 28% and a Renewal 25%', () => {
    expect(partnerEconomics({ listPrice: 100, netPrice: 80, role: 'reseller' }).partnerMarginPct).toBe(28)
    expect(partnerEconomics({ listPrice: 100, netPrice: 80, role: 'renewal' }).partnerMarginPct).toBe(25)
  })

  it('never protects below fifteen points, whatever the role', () => {
    expect(PROTECTED_MARGIN.floor).toBe(15)
    expect(protectedMarginPct(10)).toBe(15)
    expect(protectedMarginPct(40)).toBe(35)
    expect(protectedMarginPct(40, { overCap: true })).toBe(20)
    expect(protectedMarginPct(15, { overCap: true })).toBe(15)
  })
})

describe('the named programmes keep their own transfer', () => {
  it('prices VR Competitive Displacement at 42 against a net of 60', () => {
    const r = partnerEconomics({
      listPrice: 100, netPrice: 60, role: 'full_var', programme: 'vr_displacement',
    })
    expect(r.transfer).toBe(42)
    expect(r.partnerMarginPct).toBe(30)
    // Deliberately between the 35% target and the 20% above-cap floor.
    expect(r.partnerMarginPct).toBeGreaterThan(PROTECTED_MARGIN.aboveCap)
    expect(r.partnerMarginPct).toBeLessThan(PROTECTED_MARGIN.target)
  })

  it('prices Lighthouse Reference at 45 against a net of 65', () => {
    const r = partnerEconomics({
      listPrice: 100, netPrice: 65, role: 'full_var', programme: 'lighthouse',
    })
    expect(r.transfer).toBe(45)
    expect(r.partnerMarginPct).toBe(30.8)
  })

  it('names exactly two, because there are exactly two', () => {
    expect(NAMED_PROGRAMMES).toHaveLength(2)
  })
})

describe('what the deal costs each side', () => {
  it('splits the concession between what we fund and what the partner carries', () => {
    const r = varAt(70)
    // 30 of concession: we give up 14.5 of revenue, the partner 15.5 of gross.
    expect(r.givenUp + r.partnerAbsorbs).toBe(30)
    expect(r.partnerAbsorbs).toBe(15.5)
  })

  it('reports our revenue as the transfer, because the partner bills the customer', () => {
    expect(varAt(80).cwmRevenue).toBe(52)
    expect(varAt(80).cwmRevenueAtList).toBe(60)
  })
})

describe('a direct deal has no partner in it', () => {
  it('applies nothing and keeps the whole net as ours', () => {
    const r = partnerEconomics({ listPrice: 100, netPrice: 80, role: 'direct' })
    expect(r.applies).toBe(false)
    expect(r.cwmRevenue).toBe(80)
    expect(r.givenUp).toBe(0)
  })

  it('says nothing when there is no list price to measure against', () => {
    expect(partnerEconomics({ listPrice: 0, netPrice: 80, role: 'full_var' }).applies).toBe(false)
  })

  it('offers direct plus the four channel roles', () => {
    expect(CHANNEL_ROLES.map(r => r.key))
      .toEqual(['direct', 'full_var', 'reseller', 'renewal', 'referral'])
  })
})

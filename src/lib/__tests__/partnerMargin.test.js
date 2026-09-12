import { describe, it, expect } from 'vitest'
import {
  CHANNEL_ROLES, PROTECTED_MARGIN, NAMED_PROGRAMMES,
  protectedMarginPct, partnerEconomics, partnerTargetPrice, roleFor,
  channelEconomics, programmeMarginPct,
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

  it('holds a target of 35, a discount floor of 20 and an absolute floor of 15', () => {
    expect(PROTECTED_MARGIN).toEqual({ target: 35, discountFloor: 20, absoluteFloor: 15 })
    expect(protectedMarginPct(40)).toBe(35)
    expect(protectedMarginPct(40, { overCap: true })).toBe(20)
    // Nothing reaches the absolute floor by the generic rule; it is a backstop.
    expect(protectedMarginPct(10)).toBe(15)
  })

  it('does not pay a role more than its rate to reach the floor', () => {
    // A Referral discounted deal that returned 20% would be worth more to them
    // than an undiscounted one, which is not protection, it is an incentive to
    // discount.
    expect(protectedMarginPct(15, { overCap: true })).toBe(15)
    const r = partnerEconomics({ listPrice: 100, netPrice: 47, role: 'referral' })
    expect(r.partnerMarginPct).toBe(15)
    expect(r.roleUnderFloor).toBe(true)
    expect(r.belowFloor).toBe(false)
  })
})

describe('no discount takes a partner under 20%, and nothing goes under 15%', () => {
  const roles = ['full_var', 'reseller', 'renewal']

  it('holds every role that earns 20 or more, at every price down to half list', () => {
    for (const role of roles) {
      for (let net = 100; net >= 50; net -= 1) {
        const r = partnerEconomics({ listPrice: 100, netPrice: net, role })
        expect(r.partnerMarginPct).toBeGreaterThanOrEqual(20)
        expect(r.belowFloor).toBe(false)
        expect(r.belowAbsolute).toBe(false)
      }
    }
  })

  it('keeps a Referral above the absolute floor at every price', () => {
    for (let net = 100; net >= 40; net -= 1) {
      const r = partnerEconomics({ listPrice: 100, netPrice: net, role: 'referral' })
      expect(r.partnerMarginPct).toBeGreaterThanOrEqual(15)
      expect(r.belowAbsolute).toBe(false)
    }
  })

  it('says when a deep discount has pulled a Full VAR off the 35% target', () => {
    const onTarget = partnerEconomics({ listPrice: 100, netPrice: 75, role: 'full_var' })
    expect(onTarget.onTarget).toBe(true)
    expect(onTarget.atFloor).toBe(false)

    const deep = partnerEconomics({ listPrice: 100, netPrice: 60, role: 'full_var' })
    expect(deep.partnerMarginPct).toBe(20)
    expect(deep.onTarget).toBe(false)
    expect(deep.atFloor).toBe(true)
  })
})

describe('the price a partner starts from', () => {
  it('is the one that puts them on the 35% target', () => {
    // R3 CWM Dose at 20,000 exams: 9,180.32 of cost.
    const price = partnerTargetPrice(9180.32)
    expect(price).toBe(14123.57)
    expect(Math.round((price - 9180.32) / price * 100)).toBe(35)
  })

  it('is gross margin on the sell price, not a markup on cost', () => {
    // The trap this app has to keep avoiding: 9,180 marked up 35% is 12,393,
    // and that quote lands on 26% margin, not 35%.
    expect(partnerTargetPrice(9180.32)).not.toBe(9180.32 * 1.35)
  })

  it('follows whatever margin is asked of it', () => {
    expect(partnerTargetPrice(100, 20)).toBe(125)
    expect(partnerTargetPrice(100, 0)).toBe(100)
  })

  it('is zero for no cost, rather than a price out of nowhere', () => {
    expect(partnerTargetPrice(0)).toBe(0)
    expect(partnerTargetPrice(null)).toBe(0)
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
    expect(r.partnerMarginPct).toBeGreaterThan(PROTECTED_MARGIN.discountFloor)
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

})

describe('the two arrangements, and the three that were retired', () => {
  it('offers only what this business actually has', () => {
    expect(CHANNEL_ROLES.map(r => r.key)).toEqual(['direct', 'full_var'])
  })

  it('still prices a quote saved at a retired role, at the rate it was saved at', () => {
    // A deal quoted as a reseller was quoted at 28%. Repricing it to 40%
    // because a dropdown lost an option would move money nobody agreed to.
    expect(roleFor('reseller').channelPct).toBe(28)
    expect(roleFor('renewal').channelPct).toBe(25)
    expect(roleFor('referral').channelPct).toBe(15)
  })

  it('falls back to direct for a key it has never heard of', () => {
    expect(roleFor('something_new').key).toBe('direct')
    expect(roleFor(null).key).toBe('direct')
  })
})

/**
 * The channel read from our side, which is the only side we hold.
 *
 * R1–R4 is the transfer price: the list a distributor buys at, and the list a
 * Fujifilm subsidiary buys at. It is nobody's selling price. Everything here is
 * the consequence of that, and it is the correction to a screen that called the
 * transfer "customer pays" and then took another 40% off it.
 */
describe('a channel deal, from the transfer list down', () => {
  // The "test chile" deal: CWM Dose R3, 13,114.75 a year, five years.
  const LIST = 65573.75

  it('reports our revenue as what we quoted, with nothing deducted twice', () => {
    const r = channelEconomics({ listPrice: LIST, transferPrice: LIST, role: 'full_var' })
    expect(r.transfer).toBe(LIST)
    expect(r.cwmRevenue).toBe(LIST)
    expect(r.givenUp).toBe(0)
    // The number the old reading printed, which existed on neither screen.
    expect(r.transfer).not.toBe(39344.25)
  })

  /**
   * The rate the agreement gives them, not the floor a discount must not break.
   *
   * BR-031, decided on 12-09: the Full VAR's 40 % IS the margin the partner is
   * expected to earn. So it is the number the estimate uses here AND the number
   * their own quote opens at — one number in two screens. Before that decision
   * the estimate used the 35 % protected target and their quote opened at 35 %
   * too, which was coherent but answered a question nobody had asked: 35 is the
   * floor a discount may not break through, not the starting point.
   */
  it('estimates the customer price at the rate the agreement gives them', () => {
    const r = channelEconomics({ listPrice: LIST, transferPrice: LIST, role: 'full_var' })
    // 65,573.75 / 0.60 — a Full VAR keeping their 40 %.
    expect(r.customerPrice).toBe(109289.58)
    expect(r.partnerMargin).toBe(43715.83)
    expect(r.partnerMarginPct).toBe(40)
    // And says it is a guess, because the partner sets that price, not us.
    expect(r.customerEstimated).toBe(true)
  })

  it('falls back to the protected target for a role with no rate of its own', () => {
    // A retired role still prices at what it was quoted at; a role at zero has
    // nothing to fall back ON, so the target stands in rather than a zero
    // margin, which would put the customer price equal to the transfer.
    expect(channelEconomics({ listPrice: LIST, transferPrice: LIST, role: 'referral' })
      .partnerMarginPct).toBe(15)
  })

  it('counts a discount off the transfer list as ours, in full', () => {
    // 10% off what they pay us is 10% off our revenue. There is no customer
    // concession here at all: we do not set the customer's price.
    const r = channelEconomics({ listPrice: 100, transferPrice: 90, role: 'full_var' })
    expect(r.discountPct).toBe(10)
    expect(r.givenUp).toBe(10)
    expect(r.cwmRevenue).toBe(90)
    expect(r.overCap).toBe(false)
  })

  it('calls anything past the 30% cap an exception', () => {
    expect(channelEconomics({ listPrice: 100, transferPrice: 69, role: 'full_var' }).overCap).toBe(true)
    expect(channelEconomics({ listPrice: 100, transferPrice: 70, role: 'full_var' }).overCap).toBe(false)
  })

  it('takes a named programme\'s margin, which is a ratio and survives the basis', () => {
    // 60 net / 42 transfer is 30% between them whatever the 100 is.
    expect(programmeMarginPct('vr_displacement')).toBe(30)
    expect(programmeMarginPct('lighthouse')).toBe(30.8)
    const r = channelEconomics({
      listPrice: 100, transferPrice: 100, role: 'full_var', programme: 'vr_displacement',
    })
    expect(r.partnerMarginPct).toBe(30)
    expect(r.customerPrice).toBe(142.86)
  })

  it('is silent on a direct deal, where there is no partner to estimate for', () => {
    const r = channelEconomics({ listPrice: 100, transferPrice: 100, role: 'direct' })
    expect(r.applies).toBe(false)
    expect(r.customerPrice).toBe(0)
    expect(r.partnerMargin).toBe(0)
  })

  it('does not price a quote that has no prices in it', () => {
    expect(channelEconomics({ listPrice: 0, transferPrice: 0, role: 'full_var' }).applies).toBe(false)
  })
})

/**
 * A price we were told, against a price we assumed.
 *
 * The difference is the whole point of the box. Assumed, the partner's margin is
 * the assumption read back to itself and cannot breach anything — the floors are
 * policy the screen can recite and not check. Told, it is a measurement, and
 * 35/20/15 become something this screen can actually test.
 */
describe('when the partner tells us what they will charge', () => {
  const LIST = 65573.75

  it('measures the margin instead of assuming it', () => {
    const r = channelEconomics({
      listPrice: LIST, transferPrice: LIST, customerPrice: 120000, role: 'full_var',
    })
    expect(r.customerEstimated).toBe(false)
    expect(r.customerPrice).toBe(120000)
    expect(r.partnerMargin).toBe(54426.25)
    expect(r.partnerMarginPct).toBe(45.4)
    // Their agreement says 40; they are above it, which is their business.
    expect(r.roleRatePct).toBe(40)
    expect(r.onRoleRate).toBe(true)
  })

  it('says when a discount has taken them under the floor', () => {
    // 78,000 against a 65,574 transfer is 15.9% — under 20, over 15.
    const r = channelEconomics({
      listPrice: LIST, transferPrice: LIST, customerPrice: 78000, role: 'full_var',
    })
    expect(r.partnerMarginPct).toBe(15.9)
    expect(r.belowFloor).toBe(true)
    expect(r.belowAbsolute).toBe(false)
    expect(r.onRoleRate).toBe(false)
  })

  it('says when they are under the absolute floor', () => {
    const r = channelEconomics({
      listPrice: LIST, transferPrice: LIST, customerPrice: 70000, role: 'full_var',
    })
    expect(r.partnerMarginPct).toBe(6.3)
    expect(r.belowAbsolute).toBe(true)
  })

  /** Not a thin margin. A different conversation, and it needs different words. */
  it('says when they are selling under what they pay us', () => {
    const r = channelEconomics({
      listPrice: LIST, transferPrice: LIST, customerPrice: 60000, role: 'full_var',
    })
    expect(r.underTransfer).toBe(true)
    expect(r.partnerMargin).toBeLessThan(0)
  })
})

describe('when nobody has told us', () => {
  const LIST = 65573.75

  /**
   * The trap this avoids. An assumed margin equals the assumption, so a floor
   * check against it always passes — and a check that cannot fail reads like a
   * check that passed.
   */
  it('breaches nothing, because an assumption cannot breach a floor', () => {
    for (const transfer of [LIST, LIST * 0.5, LIST * 0.1]) {
      const r = channelEconomics({ listPrice: LIST, transferPrice: transfer, role: 'full_var' })
      expect(r.customerEstimated).toBe(true)
      expect(r.belowFloor).toBe(false)
      expect(r.belowAbsolute).toBe(false)
      expect(r.underTransfer).toBe(false)
      expect(r.onRoleRate).toBe(false)
      expect(r.partnerMarginPct).toBe(40)
    }
  })

  it('treats an empty box and a zero the same way, as nothing said', () => {
    for (const told of [null, undefined, '', 0]) {
      const r = channelEconomics({
        listPrice: LIST, transferPrice: LIST, customerPrice: told, role: 'full_var',
      })
      expect(r.customerEstimated).toBe(true)
    }
  })
})

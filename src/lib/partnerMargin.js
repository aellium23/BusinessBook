// What the partner keeps, and what protecting it costs us.
//
// The error this corrects is arithmetical and it broke the channel exactly
// where the discount policy said "yes". The transfer price was a fixed share of
// the regional list, so an authorised discount moved the customer's price and
// left the transfer where it was — and the whole concession came out of the
// partner:
//
//   no discount        transfer 60, customer pays 100   partner margin 40.0 %
//   28 % discount      transfer 60, customer pays  72   partner margin 16.7 %
//   at the 30 % cap    transfer 60, customer pays  70   partner margin 14.3 %
//   named programme    transfer 60, customer pays  47   partner margin  6.2 %
//
// No partner runs those deals. And the governing principle is the P&L owner's:
// if the deal is not attractive to the partner, the partner does not sell it,
// and then we do not sell either.
//
// So the margin is protected and the transfer steps down to protect it:
//
//   transfer = MIN[ regional list × (1 − channel discount),
//                   customer net  × (1 − protected margin) ]
//
// Target 35 % inside the 30 % cap, floor 20 % above it, never below 15 %.
//
// The MIN is what keeps a role from being paid more than it earns: a Referral
// at 15 % keeps 15 %, a Reseller 28 %, and a Full VAR keeps its full 40 % at
// list — protection raises nobody above their own rate, it only stops the
// discount eating into it.
//
// The consequence is that we fund the concession, and that has to be on the
// quote rather than buried in the channel: `CWM revenue given up to fund the
// discount` is its own line, because at the strategic floor our revenue on the
// deal falls from 60 to 45.5 and nobody should have to derive that.

import { DEAL_DISCOUNT_CAP_PCT } from './dealDiscounts'

const num = v => (v === null || v === undefined || v === '' ? null : Number(v))

/** What each channel role earns off the regional list, at list. */
export const CHANNEL_ROLES = [
  { key: 'direct',   channelPct: 0 },
  { key: 'full_var', channelPct: 40 },
  { key: 'reseller', channelPct: 28 },
  { key: 'renewal',  channelPct: 25 },
  { key: 'referral', channelPct: 15 },
]

/** The protected margin, by whether the deal is inside the discount cap. */
export const PROTECTED_MARGIN = { target: 35, aboveCap: 20, floor: 15 }

/**
 * The two named programmes, which keep their own explicit transfer prices.
 *
 * These sit deliberately between the 35 % target and the 20 % above-cap floor,
 * because we are asking the partner to do something strategic. The generic rule
 * must not overwrite them.
 */
export const NAMED_PROGRAMMES = [
  { key: 'vr_displacement', netPctOfList: 60, transferPctOfList: 42 },
  { key: 'lighthouse',      netPctOfList: 65, transferPctOfList: 45 },
]

export function roleFor(key) {
  return CHANNEL_ROLES.find(r => r.key === key) || CHANNEL_ROLES[0]
}

/**
 * The margin this deal protects for this partner.
 *
 * Capped by the role's own rate — protection never pays a partner more than
 * their role earns — and never below fifteen points whatever the role.
 */
export function protectedMarginPct(channelPct, { overCap = false } = {}) {
  const c = num(channelPct) ?? 0
  const ceiling = overCap ? PROTECTED_MARGIN.aboveCap : PROTECTED_MARGIN.target
  return Math.max(PROTECTED_MARGIN.floor, Math.min(c, ceiling))
}

/**
 * One partner deal, end to end.
 *
 * @param listPrice  the published regional list, before any deal discount
 * @param netPrice   what the customer actually pays
 * @param role       channel role key; 'direct' means there is no partner
 * @param programme  a named-programme key, which overrides the transfer
 */
export function partnerEconomics({ listPrice, netPrice, role = 'direct', programme = null }) {
  const list = num(listPrice) ?? 0
  const net = num(netPrice) ?? 0
  const r = roleFor(role)

  if (list <= 0 || net <= 0 || r.key === 'direct') {
    return {
      role: r.key, channelPct: r.channelPct, applies: false,
      discountPct: 0, protectedPct: 0,
      transfer: 0, partnerMargin: 0, partnerMarginPct: 0,
      cwmRevenue: money(net), cwmRevenueAtList: money(net), givenUp: 0,
      partnerAbsorbs: 0, overCap: false, programme: null,
    }
  }

  const discountPct = pct((list - net) / list * 100)
  const overCap = discountPct > DEAL_DISCOUNT_CAP_PCT
  const prog = programme ? NAMED_PROGRAMMES.find(p => p.key === programme) : null

  const protectedPct = protectedMarginPct(r.channelPct, { overCap })
  // The named programme states its own transfer; the generic rule does not get
  // to overwrite a number somebody negotiated deliberately.
  const transfer = prog
    ? money(list * prog.transferPctOfList / 100)
    : money(Math.min(list * (1 - r.channelPct / 100), net * (1 - protectedPct / 100)))

  const cwmRevenueAtList = money(list * (1 - r.channelPct / 100))
  const partnerMargin = money(net - transfer)

  return {
    role: r.key,
    channelPct: r.channelPct,
    applies: true,
    programme: prog?.key || null,
    discountPct,
    protectedPct,
    transfer,
    partnerMargin,
    partnerMarginPct: net > 0 ? pct(partnerMargin / net * 100) : 0,
    // Our revenue on this deal IS the transfer: the partner bills the customer.
    cwmRevenue: transfer,
    cwmRevenueAtList,
    // The line the quote has to print. This is what protecting the margin costs
    // us, and it is the intended allocation — we authorise the concession and
    // own the strategic reason for it — but it must be visible.
    givenUp: money(cwmRevenueAtList - transfer),
    // The rest of the concession, which the partner still carries in euros even
    // though their margin percentage is held.
    partnerAbsorbs: money(Math.max(0, (list - net) - (cwmRevenueAtList - transfer))),
    overCap,
  }
}

function money(n) { return Math.round((n + Number.EPSILON) * 100) / 100 }
function pct(n) { return Math.round((n + Number.EPSILON) * 10) / 10 }

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
// NOTE — the P&L owner's policy is three-tiered and the middle tier is theirs,
// not the brief's: target 35 %, discounts must avoid taking a partner under
// 20 %, and 15 % is the absolute never-below the brief states. A Referral's own
// 15 % rate is the one place the absolute floor is reached in normal trading.
//
// The consequence is that we fund the concession, and that has to be on the
// quote rather than buried in the channel: `CWM revenue given up to fund the
// discount` is its own line, because at the strategic floor our revenue on the
// deal falls from 60 to 45.5 and nobody should have to derive that.

import { DEAL_DISCOUNT_CAP_PCT } from './dealDiscounts'

const num = v => (v === null || v === undefined || v === '' ? null : Number(v))

/** What each channel role earns off the regional list, at list. */
/**
 * The two arrangements this business actually has.
 *
 * A distributor is always a Full VAR: they sell, they implement, and they carry
 * first-line support — that is what being a distributor means here, and it is
 * why the role never needed asking. Anything we sell ourselves is direct.
 *
 * Three more once existed — reseller 28, renewal 25, referral 15 — inherited
 * from the pricing spreadsheet and never used. They are gone from the choices
 * rather than left as five answers to a question with two, because a menu of
 * options nobody picks teaches the reader that the field does not matter.
 */
export const CHANNEL_ROLES = [
  { key: 'direct',   channelPct: 0 },
  { key: 'full_var', channelPct: 40 },
]

/**
 * Roles that were once offered, so a quote saved at one still prices correctly.
 *
 * A deal quoted as a reseller was quoted at 28 %, and reopening it must show
 * what it was quoted at rather than silently repricing to something else. The
 * lesson is one this app learned the hard way in the same week: a select whose
 * value is not among its options renders empty, and a figure that changes
 * because a list changed is a figure nobody can trust.
 */
export const RETIRED_CHANNEL_ROLES = [
  { key: 'reseller', channelPct: 28 },
  { key: 'renewal',  channelPct: 25 },
  { key: 'referral', channelPct: 15 },
]

/** Every role the arithmetic still understands, current or retired. */
export const ALL_CHANNEL_ROLES = [...CHANNEL_ROLES, ...RETIRED_CHANNEL_ROLES]

/**
 * The protected margin, as policy. Three numbers doing three different jobs.
 *
 *   target 35 %         where a partner should land on a normal discounted deal
 *   discountFloor 20 %  the most a discount may cost them, above the 30 % cap
 *   absoluteFloor 15 %  never below this, whatever the role or the programme
 *
 * The middle one is the live constraint: "with the discounts, avoid dropping
 * the partner under 20 %". The 15 is the backstop underneath it.
 *
 * A Referral sits at 15 % by its own rate, and that is not a breach of
 * anything: protection stops a discount eating a partner's rate, and cannot pay
 * anybody above it — otherwise a discounted deal would be worth more to them
 * than an undiscounted one.
 */
export const PROTECTED_MARGIN = { target: 35, discountFloor: 20, absoluteFloor: 15 }

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

/**
 * The price that puts a partner on the target margin.
 *
 * The same 35% the transfer price protects on our own deals, used here as the
 * starting point for theirs: a quote that opens at the number they should be
 * landing on is one less decision on a screen meant to take seconds, and it is
 * a target rather than a rule — the price is theirs to change.
 *
 * Gross margin on the sell price, like every other margin in this app, not a
 * markup on cost: 9,180 of cost is a 14,124 price, not 12,393.
 */
export function partnerTargetPrice(cost, marginPct = PROTECTED_MARGIN.target) {
  const c = num(cost) ?? 0
  const m = num(marginPct) ?? 0
  if (c <= 0 || m >= 100) return 0
  return money(c / (1 - m / 100))
}

/**
 * The arrangement behind a key, retired ones included.
 *
 * A quote saved as a reseller was saved at 28 %, and it has to keep pricing at
 * 28 % — a figure that moves because a list of options changed is a figure
 * nobody can trust.
 */
export function roleFor(key) {
  return ALL_CHANNEL_ROLES.find(r => r.key === key) || CHANNEL_ROLES[0]
}

/**
 * The margin this deal protects for this partner.
 *
 * Capped by the role's own rate — protection never pays a partner more than
 * their role earns — and never below fifteen points whatever the role.
 */
export function protectedMarginPct(channelPct, { overCap = false } = {}) {
  const c = num(channelPct) ?? 0
  const ceiling = overCap ? PROTECTED_MARGIN.discountFloor : PROTECTED_MARGIN.target
  return Math.max(PROTECTED_MARGIN.absoluteFloor, Math.min(c, ceiling))
}

/**
 * The margin a partner keeps, where that is a ratio and not a basis.
 *
 * A named programme states a net and a transfer as percentages of a list. The
 * two percentages are expressed against the same list, so the margin between
 * them survives whatever that list turns out to be: 60 and 42 is 30 %, whether
 * the 100 is a customer price or a transfer price. That is why the programmes
 * still say something usable after the correction below.
 */
export function programmeMarginPct(key) {
  const p = key ? NAMED_PROGRAMMES.find(x => x.key === key) : null
  if (!p || !p.netPctOfList) return null
  return pct((p.netPctOfList - p.transferPctOfList) / p.netPctOfList * 100)
}

/**
 * A channel deal read from OUR side, which is the only side we hold.
 *
 * The correction this exists for. R1–R4 is the transfer price: the list a
 * distributor buys at, and the same list a Fujifilm subsidiary buys at. It is
 * nobody's selling price. So on a TIMED deal the figure our quote produces is
 * already what they pay us — and the version before this called that "customer
 * pays", took another 40 % off it for a "transfer", and printed a number that
 * existed on neither screen:
 *
 *   quoted 65,574   →  said: customer 65,574, transfer 39,344, partner 26,229
 *                      is:   partner pays 65,574, and sells it on at their own
 *                            price, which we do not hold
 *
 * What we know is the left-hand side: our transfer list, what we actually
 * quoted off it, and therefore what the discount cost us. What the customer
 * pays is the partner's decision — estimated here at the protected target so
 * the screen can say something, and flagged as an estimate so nobody reports
 * it. Where the partner has saved their own quote, `deal_channel` holds the
 * real number and it should be preferred; that is not wired yet.
 *
 * @param listPrice      our published transfer list for these lines
 * @param transferPrice  what we are actually quoting the partner
 * @param role           channel role key; 'direct' means there is no partner
 * @param programme      a named-programme key, which sets the partner's margin
 */
export function channelEconomics({ listPrice, transferPrice, role = 'direct', programme = null }) {
  const list = num(listPrice) ?? 0
  const transfer = num(transferPrice) ?? 0
  const r = roleFor(role)

  if (list <= 0 || transfer <= 0 || r.key === 'direct') {
    return {
      role: r.key, channelPct: r.channelPct, applies: false, programme: null,
      discountPct: 0, overCap: false,
      transfer: money(transfer), cwmRevenue: money(transfer),
      cwmRevenueAtList: money(list), givenUp: 0,
      customerPrice: 0, customerEstimated: false,
      partnerMargin: 0, partnerMarginPct: 0, assumedMarginPct: 0,
    }
  }

  // The only discount on this screen that is ours to give: off our own transfer
  // list, straight out of our own revenue. Nothing here is a concession to the
  // customer — we do not set the customer's price on a channel deal.
  const discountPct = pct((list - transfer) / list * 100)
  const prog = programmeMarginPct(programme)
  const assumedMarginPct = prog ?? PROTECTED_MARGIN.target
  // What the partner sells it for, if they take the margin we protect for them.
  // An estimate, and the caller has to say so: a partner who quotes 10 % above
  // this has not broken a rule, they have priced their own deal.
  const customerPrice = money(transfer / (1 - assumedMarginPct / 100))

  return {
    role: r.key,
    channelPct: r.channelPct,
    applies: true,
    programme: prog !== null ? programme : null,
    discountPct,
    overCap: discountPct > DEAL_DISCOUNT_CAP_PCT,
    // Our revenue IS the transfer, and on this model the transfer is simply
    // what we quoted. No second deduction.
    transfer: money(transfer),
    cwmRevenue: money(transfer),
    cwmRevenueAtList: money(list),
    givenUp: money(Math.max(0, list - transfer)),
    customerPrice,
    customerEstimated: true,
    partnerMargin: money(customerPrice - transfer),
    partnerMarginPct: assumedMarginPct,
    assumedMarginPct,
  }
}

/**
 * One partner deal read from a CUSTOMER-facing list, end to end.
 *
 * ⚠ Not wired to the quick deal, and it cannot be until somebody says where a
 * customer list price lives. This models the discount architecture as briefed —
 * the customer pays `netPrice` off a published list, and the transfer steps
 * down beneath it to protect the partner's margin — and every number in it is
 * measured against a list that is the CUSTOMER's. R1–R4 is not that list; it is
 * the transfer price a distributor or a Fujifilm subsidiary buys at. Feeding it
 * the regional list is what produced a transfer 40 % below a figure that was
 * already the transfer.
 *
 * Kept, rather than deleted, because the policy it encodes is real and the
 * tests below are the record of it. See BIZ-05 in docs/BACKLOG.md.
 *
 * @param listPrice  the published CUSTOMER list, before any deal discount
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
      onTarget: false, atFloor: false, belowFloor: false, belowAbsolute: false,
      roleUnderFloor: false,
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
  const marginPct = net > 0 ? pct(partnerMargin / net * 100) : 0
  // A role whose own rate is under 20 is not a breach of the discount floor — a
  // Referral earns 15 %, discount or no discount. Anything else under 20 is.
  const roleUnderFloor = r.channelPct < PROTECTED_MARGIN.discountFloor
  const belowFloor = !roleUnderFloor && marginPct < PROTECTED_MARGIN.discountFloor - 0.05
  const belowAbsolute = marginPct < PROTECTED_MARGIN.absoluteFloor - 0.05

  return {
    role: r.key,
    channelPct: r.channelPct,
    applies: true,
    programme: prog?.key || null,
    discountPct,
    protectedPct,
    transfer,
    partnerMargin,
    partnerMarginPct: marginPct,
    // Where this sits against policy: on target, held at the floor by a deep
    // discount, or — which should not happen — under it.
    onTarget: marginPct >= PROTECTED_MARGIN.target - 0.05,
    atFloor: !belowFloor && !roleUnderFloor && marginPct < PROTECTED_MARGIN.target - 0.05,
    belowFloor,
    belowAbsolute,
    roleUnderFloor,
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

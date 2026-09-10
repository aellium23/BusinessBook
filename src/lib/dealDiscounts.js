// Why a CWM deal is discounted, and what each reason is worth.
//
// The ladder in discountLadder.js answers "how far below list is this, and who
// signs?". It does not answer "why". Without the why, a discount is a number a
// rep typed, and every number a rep types is defensible after the fact.
//
// These are the reasons that carry a price, from the CWM discount architecture:
//
//   competitive displacement  up to 15 %   documented incumbent
//   bundle                    10 / 15 / 20 two / three / the four-product Suite
//   five-year term             8 %         signed in the order form
//   prepayment                 5 %         one year in advance, never multi-year
//   open public tender        10 %         three or more bidders
//   lighthouse reference      10 %         max two per country per year
//
// Two things about this list matter more than the percentages.
//
// The first is the cap. They add up, and the total is still capped at 30 %:
// past that it stops being a discount and becomes a named programme with its
// own transfer price. Displacement plus bundle plus tender is already 35 % on
// paper, and the cap is what stops that quietly becoming policy.
//
// The second is evidence. Under a protected partner margin the partner no
// longer pays for the discount out of their own margin, so asking for one costs
// them nothing — which removes the only brake the old model had. The evidence
// requirement is not one control among several any more. It is the one left.
// So a reason with nothing attached is worth zero here, not "worth it pending
// paperwork".

const num = v => (v === null || v === undefined || v === '' ? null : Number(v))

/** Everything together still cannot pass this. Above it is a named programme. */
export const DEAL_DISCOUNT_CAP_PCT = 30

/** How many CWM products make a bundle, and what each step is worth. */
export const BUNDLE_STEPS = [
  { products: 4, pct: 20, key: 'suite' },
  { products: 3, pct: 15, key: 'three' },
  { products: 2, pct: 10, key: 'two' },
]

/** The Suite rate is conditional; without the conditions it is the three rate. */
export const SUITE_MIN_YEARS = 5

/**
 * The reasons, in the order a rep meets them.
 *
 * `pct` is fixed; `maxPct` means the rep proposes a figure up to it. `evidence`
 * names what has to be attached — reproduced from the discount architecture,
 * because "the incumbent is cheaper" and "here is the incumbent's contract" are
 * not the same claim.
 */
export const DISCOUNT_REASONS = [
  { key: 'displacement', maxPct: 15 },
  { key: 'bundle', maxPct: 20, computed: true },
  { key: 'term5', maxPct: 8, requiresYears: 5 },
  { key: 'prepay', maxPct: 5 },
  { key: 'tender', maxPct: 10, requiresBidders: 3 },
  { key: 'lighthouse', maxPct: 10, clawbackMonths: 12 },
]

/** The reasons that will be offered instead of evidence, and are not evidence. */
export const NOT_EVIDENCE = [
  'strategic', 'important', 'cheaper', 'years', 'more_later', 'quarter_end', 'partner_needs',
]

/** What a bundle of this many CWM products is worth. */
export function bundlePct(productCount, { years = 0 } = {}) {
  const n = Math.max(0, Math.round(num(productCount) ?? 0))
  const step = BUNDLE_STEPS.find(s => n >= s.products)
  if (!step) return 0
  // The Suite rate buys a five-year term, a master agreement and an executive
  // sponsor. Without the term — the one condition this screen can actually
  // check — it is a three-product bundle wearing a Suite label.
  if (step.key === 'suite' && (num(years) ?? 0) < SUITE_MIN_YEARS) return 15
  return step.pct
}

/**
 * Whether a reason may be claimed at all, before any evidence question.
 *
 * A five-year discount on a three-year term is not a paperwork problem, it is
 * a false statement, and the difference is worth keeping.
 */
export function reasonAvailable(reason, { years = 0, bidders = 0 } = {}) {
  if (reason.requiresYears && (num(years) ?? 0) < reason.requiresYears) return false
  if (reason.requiresBidders && (num(bidders) ?? 0) < reason.requiresBidders) return false
  return true
}

/**
 * The most this deal could claim for a reason, before the rep proposes a figure.
 *
 * Every reason is a ceiling, not a fixed price — a tender is worth up to ten
 * points, and a rep who only needs five should quote five. The bundle is the
 * one whose ceiling the deal itself sets: two products cannot claim the Suite
 * rate however anybody feels about it.
 */
export function entitlementFor(reason, { productCount = 0, years = 0 } = {}) {
  return reason.computed ? bundlePct(productCount, { years }) : reason.maxPct
}

/**
 * The discount this deal has actually earned, reason by reason.
 *
 * @param selected  { [key]: { on, pct, evidence, bidders } }
 * @param context   { productCount, years }
 * @returns {{rows, justifiedPct, claimedPct, capped, overCap, missingEvidence, stop}}
 *
 * `justifiedPct` counts only reasons that are available AND carry evidence.
 * `claimedPct` counts everything ticked. When they differ, somebody is quoting
 * a discount the deal has not earned yet, and the gap is the whole point of
 * showing both.
 */
export function discountPlan(selected, { productCount = 0, years = 0 } = {}) {
  const sel = selected || {}
  const rows = DISCOUNT_REASONS.map(reason => {
    const s = sel[reason.key] || {}
    const on = Boolean(s.on)
    const bidders = num(s.bidders) ?? 0
    const available = reasonAvailable(reason, { years, bidders })

    // Proposed, then held to the ceiling. An empty box asks for the whole
    // entitlement, which is what a rep ticking the row means by ticking it.
    const ceiling = entitlementFor(reason, { productCount, years })
    const asked = num(s.pct)
    const value = Math.min(ceiling, Math.max(0, asked === null ? ceiling : asked))

    // Every discount names its proof, the bundle included: the products on THIS
    // order form, not an intention to buy them later.
    const evidence = String(s.evidence || '').trim()
    const hasEvidence = evidence.length > 0

    return {
      key: reason.key,
      reason,
      on,
      available,
      ceiling,
      pct: value,
      evidence,
      bidders,
      hasEvidence,
      counts: on && available && hasEvidence && value > 0,
      status: !on ? 'off'
        : !available ? 'not_available'
        : !hasEvidence ? 'no_evidence'
        : value > 0 ? 'valid' : 'zero',
    }
  })

  const claimedPct = round(rows.filter(r => r.on && r.available).reduce((s, r) => s + r.pct, 0))
  const earned = round(rows.filter(r => r.counts).reduce((s, r) => s + r.pct, 0))
  const justifiedPct = Math.min(DEAL_DISCOUNT_CAP_PCT, earned)

  const stop = rows.some(r => r.on && (!r.available || !r.hasEvidence))

  return {
    rows,
    claimedPct,
    earnedPct: earned,
    justifiedPct,
    // The one-line verdict the quote builder prints under the total.
    verdict: stop ? 'stop' : earned > DEAL_DISCOUNT_CAP_PCT ? 'capped' : 'ok',
    // The reasons add up to more than the cap allows: real, but not all of it
    // can be given here.
    capped: earned > DEAL_DISCOUNT_CAP_PCT,
    overCap: claimedPct > DEAL_DISCOUNT_CAP_PCT,
    missingEvidence: rows.filter(r => r.on && r.available && !r.hasEvidence).map(r => r.key),
    unavailable: rows.filter(r => r.on && !r.available).map(r => r.key),
    stop,
  }
}

/**
 * How much of a quoted discount no reason accounts for.
 *
 * The rep can always type over the price, and this is the number that says so:
 * 25 % quoted against 15 % of reasons is 10 points of margin given away for
 * nothing anybody wrote down.
 */
export function unjustifiedPp(quotedPct, justifiedPct) {
  const q = num(quotedPct) ?? 0
  const j = num(justifiedPct) ?? 0
  return Math.max(0, round(q - j))
}

function round(n) { return Math.round((n + Number.EPSILON) * 10) / 10 }

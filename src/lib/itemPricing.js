// Working out what a price-list line actually costs on a given deal.
//
// The HCUS list prices the same way the products are sold, which is four
// different ways: a flat licence, a block of ten thousand studies, a per-study
// or per-case rate inside a volume band, and a per-user seat. The unit column
// says which, and getting it wrong is not a rounding error — a per-study rate
// billed as a flat fee is out by four orders of magnitude.
//
// Every figure here is cost. The sell price is cost carried to the margin the
// rep sets on the deal.

const num = v => (v === null || v === undefined || v === '' ? null : Number(v))

/**
 * How many 10k-study blocks a volume needs. Blocks are indivisible, and a site
 * doing 45,000 studies buys five, not four and a half.
 */
export function blocksOf(studies, per = 10000) {
  const s = num(studies) ?? 0
  const p = num(per) || 10000
  if (s <= 0) return 0
  return Math.ceil(s / p)
}

/**
 * The band whose range covers this volume. `tier_to` of null means the band is
 * open-ended (the "100K+" rows), and a list with no band at all returns the
 * single item rather than nothing.
 */
export function bandFor(items, studies) {
  const s = num(studies) ?? 0
  const banded = (items || []).filter(i => num(i.tier_from) !== null)
  if (!banded.length) return (items || [])[0] ?? null
  return banded.find(i => {
    const from = num(i.tier_from) ?? 0
    const to = num(i.tier_to)
    return s >= from && (to === null || s <= to)
  }) ?? null
}

/**
 * What one price-list item costs, given the deal's drivers.
 *
 * `quantity` means different things per unit and that is deliberate: for a flat
 * licence it is how many you buy, for a per-user line how many seats. Where the
 * volume drives it — blocks and per-study rates — the study count is used and
 * quantity is ignored, because a rep should not be able to quote three blocks
 * for a 45,000-study site by mistake.
 */
export function itemCost(item, { studies = 0, quantity = 1 } = {}) {
  if (!item) return { quantity: 0, cost: 0, annualSupport: 0 }
  const unit = item.unit || 'unit'
  const price = num(item.transfer_price) ?? 0
  const support = num(item.annual_support) ?? 0

  let qty
  if (unit === 'block_10k') qty = blocksOf(studies)
  else if (unit === 'study') qty = num(studies) ?? 0
  else qty = Math.max(0, num(quantity) ?? 0)

  return {
    quantity: qty,
    cost: round(price * qty),
    // Support is quoted per licence, not per study: a per-study line carries no
    // separate support fee in this list.
    annualSupport: round(unit === 'study' ? 0 : support * qty),
  }
}

/** Sum a set of costed lines. */
export function itemTotals(lines) {
  const rows = lines || []
  return {
    cost: round(rows.reduce((s, l) => s + (num(l.cost) ?? 0), 0)),
    annualSupport: round(rows.reduce((s, l) => s + (num(l.annualSupport) ?? 0), 0)),
  }
}

function round(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

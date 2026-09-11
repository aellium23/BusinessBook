// How a quote was built, so it can be opened again.
//
// The deal stores the ANSWER — a value, a margin, product lines with prices.
// It does not store the QUESTION: which products were picked, the exam volume
// they were priced on, the contract term, the man-days, the price typed over a
// recommendation, the reason written next to a discount. Reopening a deal in
// the quick deal without those means guessing at them, and a screen that
// guesses is a screen that quietly rewrites a quote somebody sent to a customer.
//
// So the inputs are stored with the deal, versioned, and read back verbatim.
// The figures are NOT stored here: they are derived from the inputs every time,
// which is what keeps this from becoming a second source of truth that drifts
// from the first.
//
// For a deal created before this existed, `rebuildFrom` makes the closest
// honest approximation out of its product lines and says which parts it could
// not know. Approximate and labelled beats exact-looking and wrong.

export const QUOTE_STATE_VERSION = 1

const num = v => (v === null || v === undefined || v === '' ? null : Number(v))

/** The quick deal's inputs, as stored. */
export function toQuoteState({
  picked = [], volumes = {}, overrides = {}, famSel = {}, years = 5,
  manDays = '', servicesOn = false, servicesPvp = '',
  channelRole = 'direct', programme = '', country = '', customerPrice = '',
}) {
  return {
    v: QUOTE_STATE_VERSION,
    picked: [...picked],
    volumes: { ...volumes },
    // Only what the rep actually typed over. A recommendation that was accepted
    // is not an input, and storing it would freeze a price that should follow
    // the price list.
    overrides: Object.fromEntries(
      Object.entries(overrides).filter(([, v]) => v && Object.keys(v).length)
    ),
    famSel: { ...famSel },
    years: num(years) ?? 5,
    manDays: String(manDays ?? ''),
    servicesOn: Boolean(servicesOn),
    servicesPvp: String(servicesPvp ?? ''),
    channelRole: channelRole || 'direct',
    programme: programme || '',
    country: country || '',
    // What the partner told us they will charge, when they told us. Empty is
    // the normal state, and empty must stay empty: a stored estimate is an
    // estimate that stops looking like one.
    customerPrice: String(customerPrice ?? ''),
  }
}

/**
 * Read a stored state back.
 *
 * Anything missing comes back as the same default the screen would have used,
 * and a state from a future version is refused rather than half-read: a quote
 * half-restored is worse than one the rep rebuilds knowingly.
 */
export function fromQuoteState(state) {
  if (!state || typeof state !== 'object') return null
  if (num(state.v) !== null && num(state.v) > QUOTE_STATE_VERSION) return null
  return {
    picked: Array.isArray(state.picked) ? state.picked : [],
    volumes: state.volumes && typeof state.volumes === 'object' ? state.volumes : {},
    overrides: state.overrides && typeof state.overrides === 'object' ? state.overrides : {},
    famSel: state.famSel && typeof state.famSel === 'object' ? state.famSel : {},
    years: num(state.years) ?? 5,
    manDays: state.manDays ?? '',
    servicesOn: Boolean(state.servicesOn),
    servicesPvp: state.servicesPvp ?? '',
    channelRole: state.channelRole || 'direct',
    programme: state.programme || '',
    country: state.country || '',
    customerPrice: state.customerPrice ?? '',
    rebuilt: false,
  }
}

/**
 * The best that can be made of a deal that predates stored inputs.
 *
 * The product lines give the products, the volume they were priced on and the
 * prices themselves — enough to reopen the quote without inventing anything.
 * What they cannot give is the contract term, the implementation effort or the
 * discount reasons, and `unknown` names those so the screen can say so instead
 * of presenting a default as a fact.
 *
 * @param lines  rows from deal_products_v
 */
export function rebuildFrom(lines, { years = 5 } = {}) {
  const rows = (lines || []).filter(l => l.product_id)
  const overrides = {}
  for (const l of rows) {
    const capexPvp = num(l.net_price) ?? num(l.unit_price) ?? 0
    const annualPvp = num(l.annual_fee) ?? 0
    const o = {}
    if (capexPvp) o.capexPvp = capexPvp
    if (annualPvp) o.annualPvp = annualPvp
    // cost_price comes back null for anyone who may not see it, and a zero we
    // did not measure must not be written back as if we had.
    const cost = num(l.cost_price)
    if (cost !== null && cost > 0) o.capexCost = cost
    if (Object.keys(o).length) overrides[l.product_id] = o
  }

  const volume = rows.map(l => num(l.volume)).find(v => v !== null && v > 0)

  return {
    picked: rows.map(l => l.product_id),
    volumes: volume ? { exam: String(volume) } : {},
    overrides,
    famSel: {},
    years,
    manDays: '',
    servicesOn: false,
    servicesPvp: '',
    channelRole: 'direct',
    programme: '',
    country: '',
    customerPrice: '',
    rebuilt: true,
    // What this deal cannot tell us, named so the screen can pass it on.
    unknown: ['years', 'manDays', 'discounts'],
  }
}

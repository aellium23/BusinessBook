// What a partner is allowed to sell, and at what price.
//
// A distributor does not see the catalogue; they see their catalogue. TIMED
// sells CWM Dose, CWM AI Reporting, CWM VR and Medportal — and nothing else,
// in the countries they were authorised for. The list is set by an admin in
// Permissions → Companies, one row per product per country, and this is the
// only place that reads it into a product list.
//
// Authorisation is per COUNTRY, not per company: the same partner can be
// authorised for Chile and not for Peru, and a deal in the wrong country must
// come back with an empty catalogue rather than the whole one. Empty is the
// safe answer here and the code says so explicitly, because "no rows yet" and
// "everything" are one typo apart.
//
// Where the authorisation carries a price, that price IS the list price for
// that partner in that country. It replaces the regional list, because it is
// what was agreed with them — and it is the only price of ours they should
// ever see.

const num = v => (v === null || v === undefined || v === '' ? null : Number(v))
const round = n => Math.round((n + Number.EPSILON) * 100) / 100

/** One authorisation, keyed the way the rows are looked up. */
export function authKey(productId, country) {
  return `${productId}_${country || ''}`
}

/** The live authorisations, as a map. Inactive rows are not authorisations. */
export function authMapOf(rows) {
  const map = {}
  for (const a of rows || []) {
    if (a.active === false) continue
    map[authKey(a.product_id, a.country)] = a
  }
  return map
}

/**
 * The products this partner may quote in this country, priced as agreed.
 *
 * @param products  the full catalogue
 * @param authMap   from authMapOf()
 * @param country   the deal's country
 */
export function authorisedProducts(products, authMap, country) {
  if (!country) return []
  const map = authMap || {}
  return (products || [])
    .filter(p => map[authKey(p.id, country)])
    .map(p => {
      const price = num(map[authKey(p.id, country)].price)
      // A price of zero is a price somebody has not filled in, not a free
      // product. Falling back to the regional list is the safer reading.
      return price !== null && price > 0 ? { ...p, license_fee: price, partner_price: price } : p
    })
}

/**
 * What a partner pays us for one line.
 *
 * The ladder is the regional price list — R1, R2, R3 — at whatever tier the
 * volume reaches, and a partner in R3 walks the same ladder anybody else does.
 * But that ladder is the CUSTOMER's price: it is what our own quote puts in
 * front of an end customer on a direct deal, straight out of `resolvePrice`.
 * The partner buys BELOW it, by their channel rate — a Full VAR's 40 %.
 *
 * This is the correction, and it was a 54 % error on the customer's side. The
 * version before it handed the partner the regional list as their cost, and the
 * partner's quote then opened at a margin on top of that:
 *
 *   R3 CWM Dose, 5 years   list 65,573   partner cost 65,573 → sells 100,882
 *
 * So the same hospital paid 100,882 through TIMED and 65,573 from us — a
 * channel that prices itself out of every deal it touches, and a number nobody
 * could reconcile with the transfer price on our own screen. With the rate
 * applied, the two agree: the partner buys at 39,344, sells at our list, and
 * keeps the 40 % their agreement says.
 *
 * An authorisation may pin a price for one product in one country. A pinned
 * price IS a transfer price — somebody negotiated it with them — so the rate
 * does not come off it a second time.
 *
 * @param product     the catalogue row, for its price_basis
 * @param pinnedUnit  the authorised price per unit, or 0/null when none
 * @param listedNet   the regional list for this volume, already converted
 * @param quantity    the volume the line is priced on
 * @param channelPct  the partner's channel rate; 0 for an unknown arrangement,
 *                    which buys at list rather than inventing a discount
 */
export function partnerLineCost({ product, pinnedUnit, listedNet, quantity, channelPct = 0 }) {
  const pinned = num(pinnedUnit) ?? 0
  if (pinned > 0) {
    return product?.price_basis === 'per_unit'
      ? round(pinned * (num(quantity) ?? 0))
      : round(pinned)
  }
  // No pinned price is not "free": it is the regional ladder less the rate, and
  // where the ladder is unknown too the caller has to say so rather than quote
  // a zero cost.
  const rate = Math.min(100, Math.max(0, num(channelPct) ?? 0))
  return round((num(listedNet) ?? 0) * (1 - rate / 100))
}

/** Whether this partner has any authorisation at all, anywhere. */
export function hasAuthorisations(authMap) {
  return Object.keys(authMap || {}).length > 0
}

/** The countries a partner is authorised in, for telling them where they can sell. */
export function authorisedCountries(authMap) {
  return [...new Set(Object.values(authMap || {}).map(a => a.country).filter(Boolean))].sort()
}

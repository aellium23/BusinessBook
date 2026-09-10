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

/** Whether this partner has any authorisation at all, anywhere. */
export function hasAuthorisations(authMap) {
  return Object.keys(authMap || {}).length > 0
}

/** The countries a partner is authorised in, for telling them where they can sell. */
export function authorisedCountries(authMap) {
  return [...new Set(Object.values(authMap || {}).map(a => a.country).filter(Boolean))].sort()
}

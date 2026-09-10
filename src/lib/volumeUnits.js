// Which number a product is priced on.
//
// A quote for one hospital carries several different volumes and they are not
// interchangeable: CWM Dose counts exams a year, CWM AI Reporting counts
// finalised reports a year, CWM VR counts radiologists on the roster, CWM ES
// counts procedure rooms. Feeding one figure to all of them is not a rounding
// error — a 200,000-exam hospital looked up against the VR ladder lands on the
// 500-or-more band, three orders of magnitude out, and nothing on screen says
// anything is wrong.
//
// The unit is already on every product as `price_unit`. This maps it to the
// field that answers it.

/** Units that mean "how many exams a year", however the row spells it. */
const EXAM_ALIASES = ['exam', 'exams', 'study', 'studies']

export const VOLUME_UNITS = [
  { key: 'exam',           labelKey: 'vu_exam',      placeholder: '45000',  primary: true },
  { key: 'report',         labelKey: 'vu_report',    placeholder: '120000' },
  { key: 'radiologist',    labelKey: 'vu_radiologist', placeholder: '20' },
  { key: 'procedure_room', labelKey: 'vu_room',      placeholder: '4' },
  { key: 'organisation',   labelKey: 'vu_org',       placeholder: '1' },
]

/**
 * The volume field a product is priced against.
 *
 * `study` and `exam` are the same question — the price list renames it to
 * `exam`, and until every row has been renamed both have to resolve to the same
 * field or a half-migrated database would quietly split one number in two.
 */
export function volumeKeyFor(priceUnit) {
  const u = String(priceUnit || '').toLowerCase()
  if (!u) return null
  if (EXAM_ALIASES.includes(u)) return 'exam'
  return VOLUME_UNITS.some(v => v.key === u) ? u : null
}

/**
 * The volume fields a quote has to ask for, given what has been picked.
 *
 * The exam count is always asked: it drives the CWM Dose ladder, the per-10k
 * blocks of Synapse PACS and Compute, and — per the pricing brief — it is the
 * single auditable figure a committed report volume is negotiated from. The
 * rest appear only when something on the quote is priced on them.
 */
export function unitsNeeded(products) {
  const keys = new Set(['exam'])
  for (const p of products || []) {
    const k = volumeKeyFor(p?.price_unit)
    if (k) keys.add(k)
  }
  return VOLUME_UNITS.filter(v => keys.has(v.key))
}

/** The quantity to price this product on, from the volumes the rep entered. */
export function quantityFor(product, volumes) {
  const k = volumeKeyFor(product?.price_unit)
  if (!k) return 0
  const v = parseFloat((volumes || {})[k])
  return Number.isFinite(v) && v > 0 ? v : 0
}

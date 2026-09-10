// Turning a list price into the currency the deal is written in.
//
// The CWM global list is published in USD and every deal here is quoted in
// euros. Nothing converted between the two, so a quote read 123,200 off the
// price list and printed it with a euro sign — 16% too high, and plausible
// enough that nobody would question it.
//
// The rule the project already follows for deals applies here too: a rate is a
// snapshot. It is read once, stored on the deal, and never re-applied later,
// so a rate change tomorrow cannot silently reprice a quote sent today.

const num = v => (v === null || v === undefined || v === '' ? null : Number(v))

/**
 * Convert a list amount into euros.
 *
 * `rates` is the project's existing shape: currency -> rate_to_eur, so USD at
 * 0.8610 means one dollar is 0.8610 euros.
 *
 * When the rate is missing the amount comes back UNCHANGED and `converted` is
 * false. That matters: the alternative is printing a dollar figure with a euro
 * sign, which is exactly the bug this exists to fix. The caller is expected to
 * say so on screen rather than pretend.
 */
export function toEur(amount, currency, rates) {
  const a = num(amount) ?? 0
  const cur = String(currency || 'EUR').toUpperCase()
  if (cur === 'EUR') return { value: round(a), rate: 1, currency: cur, converted: true }

  const rate = num((rates || {})[cur])
  if (rate === null || rate <= 0) {
    return { value: round(a), rate: null, currency: cur, converted: false }
  }
  return { value: round(a * rate), rate, currency: cur, converted: true }
}

/** How the rate should be shown, because a conversion without its rate is not
 *  auditable — and the pricing brief asks for exactly that. */
export function rateLabel(currency, rate) {
  if (!rate || String(currency).toUpperCase() === 'EUR') return null
  // Published the way a person reads it: 1 EUR = 1.1615 USD.
  const inverse = Math.round((1 / rate) * 10000) / 10000
  return `1 EUR = ${inverse} ${String(currency).toUpperCase()}`
}

function round(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

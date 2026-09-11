// Invoiced sales, by client, over a period you choose.
//
// The question this answers is the one a P&L owner asks at the end of a month:
// who did we actually invoice, how much of it was margin, and which deals were
// behind it. The Power BI report it replaces reads from SAP; this reads from the
// deals, because SAP has no client dimension in this app — the budget table is
// keyed on business unit and P&L line, and stops there.
//
// Four rules, each of which is somebody's mistake made once already:
//
//   1. Only `stage = 'Invoiced'` counts. There is no invoice-date logic in this
//      codebase and inventing one here would disagree with every other screen.
//
//   2. A period is a set of months, and inside one the `|| value_total`
//      fallback is dropped. That fallback exists for a deal with no monthly
//      spread at all; applied to a month subset it would book a whole year's
//      value into whatever window happened to be selected.
//
//   3. Everything is converted to euros with the rate stored on the deal, not
//      today's rate. A quote signed at 1.16 stays at 1.16.
//
//   4. Intercompany mirrors never count. They exist so a deal shows on both
//      sides of the house; summing them doubles the house.
//
// Gross margin is `net × gm_pct`, the reported definition — gross margin on the
// sell price, not a markup on cost — and a client's percentage is the weighted
// blend, sum(margin) / sum(net). Averaging the percentages would give a small
// deal the same weight as a large one.

import { MONTHS_K, MONTHS } from '../constants'

const num = v => (v === null || v === undefined || v === '' ? null : Number(v))

/** The periods worth offering, in the order a year is read. */
export const PERIODS = [
  { key: 'fy',   months: MONTHS_K },
  { key: 'q1',   months: ['apr', 'may', 'jun'] },
  { key: 'q2',   months: ['jul', 'aug', 'sep'] },
  { key: 'q3',   months: ['oct', 'nov', 'dec'] },
  { key: 'q4',   months: ['jan', 'feb', 'mar'] },
  { key: 'h1',   months: ['apr', 'may', 'jun', 'jul', 'aug', 'sep'] },
  { key: 'h2',   months: ['oct', 'nov', 'dec', 'jan', 'feb', 'mar'] },
  { key: 'ytd',  months: null },   // resolved against today
  ...MONTHS_K.map((m, i) => ({ key: m, months: [m], label: MONTHS[i] })),
]

/** Months elapsed in the fiscal year, April being the first. */
export function fyMonthsElapsed(now = new Date()) {
  return ((now.getMonth() + 1 - 4 + 12) % 12) + 1
}

/** The months a period covers. Unknown periods are the whole year, not none. */
export function monthsFor(periodKey, now = new Date()) {
  if (periodKey === 'ytd') return MONTHS_K.slice(0, fyMonthsElapsed(now))
  const p = PERIODS.find(x => x.key === periodKey)
  return p?.months ? [...p.months] : [...MONTHS_K]
}

/** What a deal invoiced inside these months, in euros. */
export function dealNetInPeriod(deal, months) {
  // A rate is a snapshot taken when the deal was written. Re-converting at
  // today's rate would rewrite history every morning.
  const rate = !deal.currency || deal.currency === 'EUR'
    ? 1
    : (num(deal.exchange_rate) ?? 1)
  const raw = (months || []).reduce((s, m) => s + (num(deal[m]) ?? 0), 0)
  return round(raw * rate)
}

/**
 * One row per client, with the deals behind it.
 *
 * @param deals    rows from `deals`
 * @param months   month keys the period covers
 * @param bu       optional business unit filter
 */
export function salesByClient(deals, { months, bu = '' } = {}) {
  const period = months?.length ? months : MONTHS_K
  const by = new Map()

  for (const d of deals || []) {
    if (d.stage !== 'Invoiced') continue
    if (d.is_intercompany_mirror) continue
    if (bu && d.bu !== bu) continue

    const net = dealNetInPeriod(d, period)
    if (net === 0) continue   // nothing invoiced in this window

    const name = (d.client || '(no client)').trim()
    const key = name.toLowerCase()
    // gm_pct is a fraction on this table: 0.35 is 35%.
    const pct = num(d.gm_pct)
    const margin = pct === null ? 0 : round(net * pct)

    if (!by.has(key)) by.set(key, { key, name, net: 0, margin: 0, knownMargin: 0, deals: [] })
    const row = by.get(key)
    row.net = round(row.net + net)
    row.margin = round(row.margin + margin)
    // A deal with no margin recorded — a legacy row, or an intercompany one
    // written at zero — must not drag a client's percentage down as if it had
    // been sold at cost. It counts towards revenue and not towards the blend.
    if (pct !== null && pct !== 0) row.knownMargin = round(row.knownMargin + net)
    row.deals.push({
      id: d.id,
      client: name,
      stage: d.stage,
      owner: d.sales_owner || null,
      country: d.country || null,
      net,
      margin,
      marginPct: pct === null || pct === 0 ? null : pct1(pct * 100),
      description: d.description || null,
    })
  }

  const rows = [...by.values()].map(r => ({
    ...r,
    // Weighted, over the revenue whose margin we actually know.
    marginPct: r.knownMargin > 0 ? pct1((r.margin / r.knownMargin) * 100) : null,
    deals: r.deals.sort((a, b) => b.net - a.net),
  }))

  return { rows, total: totalsOf(rows), months: period }
}

function totalsOf(rows) {
  const net = round(rows.reduce((s, r) => s + r.net, 0))
  const margin = round(rows.reduce((s, r) => s + r.margin, 0))
  const known = round(rows.reduce((s, r) => s + r.knownMargin, 0))
  return {
    net, margin,
    marginPct: known > 0 ? pct1((margin / known) * 100) : null,
    clients: rows.length,
    deals: rows.reduce((s, r) => s + r.deals.length, 0),
  }
}

/**
 * Sorted for reading, which is by revenue descending — the question is always
 * "who is the biggest", never "who is alphabetically first".
 */
export function sortRows(rows, by = 'net', dir = 'desc') {
  const sign = dir === 'asc' ? 1 : -1
  return [...(rows || [])].sort((a, b) => {
    if (by === 'name') return sign * a.name.localeCompare(b.name)
    // A client whose margin is unknown sorts last in either direction rather
    // than pretending to be zero.
    const av = a[by], bv = b[by]
    if (av === null && bv === null) return 0
    if (av === null) return 1
    if (bv === null) return -1
    return sign === 1 ? av - bv : bv - av
  })
}

function round(n) { return Math.round((n + Number.EPSILON) * 100) / 100 }
function pct1(n) { return Math.round((n + Number.EPSILON) * 10) / 10 }

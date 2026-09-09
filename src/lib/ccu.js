// Synapse 3D licence packages are sold in fixed concurrent-user capacities —
// 1, 3 and 10 CCU depending on the family — and they are additive, not
// alternatives: 13 concurrent users is a 10 CCU package plus a 3 CCU package.
// That combination is not obvious from a price list (a 10 + 3 costs 22,770
// while ten singles cost 55,200), so the rep asks for a number of users and
// this works out what to buy.
//
// Prices here are always the HCUS transfer price — our cost — because that is
// what the price list publishes. The sell price is set by the margin on the
// deal, not by this file.

const num = v => (v === null || v === undefined || v === '' ? null : Number(v))

/**
 * Cheapest multiset of packages covering `wanted` concurrent users.
 *
 * Unbounded knapsack over the capacities on offer, minimising total cost and,
 * where two combinations cost the same, preferring the one with fewer licences
 * to administer. Capacity may be exceeded — you cannot buy half a package, and
 * 13 users on a 10 + 3 leaves nothing spare, while 11 users needs 10 + 3 too.
 *
 * @param {Array} packages  [{ id, name, ccu, transfer_price, annual_support }]
 * @param {number} wanted   concurrent users required
 * @returns {{lines: Array, ccu: number, cost: number, annualSupport: number}|null}
 */
export function cheapestCcuCombination(packages, wanted) {
  const want = Math.ceil(num(wanted) ?? 0)
  if (!Array.isArray(packages) || want <= 0) return null

  const opts = packages
    .map(p => ({ ...p, ccu: num(p.ccu) ?? 0, cost: num(p.transfer_price) ?? 0 }))
    .filter(p => p.ccu > 0 && p.cost > 0)
  if (!opts.length) return null

  // best[c] = cheapest way to cover at least c users. Solved up to `want`; any
  // package larger than the shortfall still covers it, which is how a 10 CCU
  // package wins for 8 users when three 3 CCU packages would cost more.
  const best = Array(want + 1).fill(null)
  best[0] = { cost: 0, count: 0, picks: [] }

  for (let c = 1; c <= want; c++) {
    for (const p of opts) {
      const prev = best[Math.max(0, c - p.ccu)]
      if (!prev) continue
      const cand = { cost: prev.cost + p.cost, count: prev.count + 1, picks: [...prev.picks, p] }
      const cur = best[c]
      if (!cur || cand.cost < cur.cost || (cand.cost === cur.cost && cand.count < cur.count)) {
        best[c] = cand
      }
    }
  }

  const win = best[want]
  if (!win) return null

  // Collapse the picks into quantities so the quote reads "10 CCU x1, 3 CCU x1".
  const byId = new Map()
  for (const p of win.picks) {
    const row = byId.get(p.id) || { ...p, quantity: 0 }
    row.quantity += 1
    byId.set(p.id, row)
  }
  const lines = [...byId.values()].sort((a, b) => b.ccu - a.ccu)

  return {
    lines,
    ccu: lines.reduce((s, l) => s + l.ccu * l.quantity, 0),
    cost: round(lines.reduce((s, l) => s + l.cost * l.quantity, 0)),
    annualSupport: round(lines.reduce((s, l) => s + (num(l.annual_support) ?? 0) * l.quantity, 0)),
  }
}

function round(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

/**
 * The distinct package lines in a family, each with its own capacity ladder.
 *
 * Capacities are only interchangeable within one line. A Base Server 10 CCU and
 * a Base Server 3 CCU add up to thirteen Base users, which is what a rep means
 * by "I need 13 concurrent users". A Base Server 10 CCU and a Cardiology CT
 * 1 CCU do not add up to eleven of anything — they are two different products
 * with different applications. Mobility makes the same point more sharply: its
 * 2D and 3D Full licences both come in CCU packs and combining them would quote
 * a mixture nobody asked for.
 *
 * The line is the SKU name with its own capacity token removed, so "BASE PKG
 * SERVER 3 CCU V6" and "BASE PKG SERVER 10 CCU V6" collapse to one line while
 * "BASE PKG STANDALONE 1 CCU" stays separate — correctly, since the price list
 * says that one cannot be increased later.
 */
export function packageLines(items) {
  const packs = (items || []).filter(i => i.kind === 'package' && (num(i.ccu) ?? 0) > 0)
  const byLine = new Map()
  for (const p of packs) {
    const key = lineKeyOf(p.name)
    const row = byLine.get(key) || { key, label: lineLabelOf(p), packages: [] }
    row.packages.push(p)
    byLine.set(key, row)
  }
  return [...byLine.values()].map(l => ({
    ...l,
    packages: l.packages.sort((a, b) => (num(a.ccu) ?? 0) - (num(b.ccu) ?? 0)),
  }))
}

function lineKeyOf(name) {
  return String(name || '')
    .replace(/\bPER\b/gi, ' ')
    .replace(/\d+\s*CCU/gi, ' ')       // the capacity token itself
    .replace(/[^a-z0-9]+/gi, ' ')
    .trim()
    .toUpperCase()
}

// Prefer the human description the price list carries, minus its capacity.
function lineLabelOf(p) {
  const base = p.description || p.name || ''
  return base.replace(/\s*[-–]?\s*\d+\s*CCU/gi, '').replace(/\s{2,}/g, ' ').trim() || p.name
}

/**
 * Group a family's items the way the catalogue should present them: the
 * packages a rep starts from, then the à-la-carte modules, then everything
 * else. Without this the 84 Synapse 3D lines arrive as one flat list.
 */
export function groupItems(items) {
  const of = kind => items.filter(i => i.kind === kind)
  return {
    packages: of('package'),
    modules: of('module'),
    upgrades: of('upgrade'),
    services: of('service'),
    hardware: of('hardware'),
  }
}

// Where the difference is.
//
// Two figures for the same month never agree, and the useful question is not
// "by how much" — it is "on which customers". A reconciliation that reports a
// gap and nothing else gets read once and ignored; one that names the three
// rows causing it gets acted on.
//
// So every customer lands in exactly one of three buckets:
//
//   both      in SAP and in the CRM, with the difference between them
//   only SAP  invoiced and never recorded as a deal — the work to do
//   only CRM  a deal marked invoiced that SAP has not billed, or billed in
//             another month, or under another name
//
// The third is as important as the second and is usually a month, not a
// mistake: a deal recognised in August that SAP invoiced in September shows on
// both sides in different months, which is exactly what somebody needs to see.
//
// Matching is by normalised name, and where that fails, by an alias somebody
// recorded once. Nothing here guesses at a fuzzy match: a wrong pairing hides a
// real gap and invents another, and two wrongs are harder to find than one.

const num = v => (v === null || v === undefined || v === '' ? null : Number(v))

/**
 * @param crm      rows from salesByClient(): { key, name, net, margin, marginPct }
 * @param sap      rows from the SAP import:  { key, name, net, margin, marginPct }
 * @param aliases  [{ sap_key, crm_key }] recorded by hand
 */
export function reconcile(crm, sap, aliases = []) {
  // An alias moves a SAP row onto a CRM key. It never moves a CRM row: the CRM
  // name is the one people work with.
  const aliasOf = new Map((aliases || []).map(a => [a.sap_key, a.crm_key]))

  const crmBy = new Map((crm || []).map(r => [r.key, r]))
  const sapBy = new Map()
  for (const r of sap || []) {
    const key = aliasOf.get(r.key) || r.key
    const at = sapBy.get(key)
    // Two SAP lines mapped to one customer are added, not overwritten.
    if (at) {
      at.net = round(at.net + (num(r.net) ?? 0))
      at.margin = round(at.margin + (num(r.margin) ?? 0))
      at.names.push(r.name)
    } else {
      sapBy.set(key, {
        key, name: r.name, names: [r.name],
        net: round(num(r.net) ?? 0), margin: round(num(r.margin) ?? 0),
      })
    }
  }

  const matched = []
  const onlyCrm = []
  const onlySap = []

  for (const [key, c] of crmBy) {
    const s = sapBy.get(key)
    if (!s) { onlyCrm.push({ ...c, sapNet: 0, delta: round(-c.net) }); continue }
    matched.push({
      key,
      name: c.name,
      sapName: s.name,
      crmNet: c.net, sapNet: s.net,
      crmMargin: c.margin, sapMargin: s.margin,
      // SAP is the book of record for what was invoiced, so the difference is
      // signed from its point of view: positive means the CRM is behind.
      delta: round(s.net - c.net),
      marginDelta: round(s.margin - c.margin),
      agrees: Math.abs(round(s.net - c.net)) < 0.01,
    })
  }
  for (const [key, s] of sapBy) {
    if (!crmBy.has(key)) onlySap.push({ ...s, crmNet: 0, delta: s.net })
  }

  const sum = (rows, f) => round(rows.reduce((t, r) => t + (f(r) || 0), 0))
  const crmTotal = sum([...crmBy.values()], r => r.net)
  const sapTotal = sum([...sapBy.values()], r => r.net)

  return {
    matched: matched.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)),
    onlySap: onlySap.sort((a, b) => b.net - a.net),
    onlyCrm: onlyCrm.sort((a, b) => b.net - a.net),
    total: {
      crm: crmTotal,
      sap: sapTotal,
      delta: round(sapTotal - crmTotal),
      // The gap, split by where it comes from. These three add up to the delta,
      // which is the property that makes the page worth opening.
      fromMissing: sum(onlySap, r => r.net),
      fromExtra: round(-sum(onlyCrm, r => r.net)),
      fromDifferences: sum(matched, r => r.delta),
      agreeing: matched.filter(m => m.agrees).length,
      differing: matched.filter(m => !m.agrees).length,
    },
  }
}

function round(n) { return Math.round((n + Number.EPSILON) * 100) / 100 }

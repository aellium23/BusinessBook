// Reading the monthly SAP export, pasted straight out of Excel.
//
// The file has four columns — CustomerName, Net Sales, Gross Margin, Gross
// Margin % — and no month and no company, because those are the filters that
// were applied before it was exported. So the month and the business unit are
// chosen on the screen, and a row carries them from there.
//
// Two things this has to get right or the whole reconciliation is noise.
//
// Numbers come out of Excel in whatever the exporting machine's locale was:
// `34,633.9` and `34.633,9` are the same figure and mean different things to
// `parseFloat`. Both are read here, decided per value by which separator comes
// last, and anything genuinely ambiguous is reported rather than guessed.
//
// Names are matched by shape, not by hope. "Unidade Local de Saúde do Oeste,
// E." and "UNIDADE LOCAL DE SAUDE DO OESTE EPE" are one hospital, and the only
// way a reconciliation is useful is if they land on one row. Accents, case,
// punctuation and the legal-form suffix all come off before comparing — and
// where that is still not enough, an alias is recorded by hand once and used
// for ever.

const LEGAL_FORMS = [
  'sa', 's a', 's.a', 'sas', 'lda', 'ltda', 'ltd', 'limited', 'llc', 'inc',
  'epe', 'e p e', 'ace', 'srl', 'spa', 'gmbh', 'bv', 'nv', 'plc', 'ag',
  'sl', 's l', 'slu', 'unipessoal', 'fze', 'sarl', 'cv', 'sac', 'spa',
]

/** The comparable shape of a customer name. */
export function normaliseName(name) {
  let s = String(name ?? '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   // strip accents
    .toLowerCase()
    .replace(/[.,;:''"`()\-–—/\\]/g, ' ')
    .replace(/&/g, ' e ')
    .replace(/\s+/g, ' ')
    .trim()

  // Legal forms trail the name and carry no identity: one system writes them,
  // another does not, and neither is wrong.
  let changed = true
  while (changed) {
    changed = false
    for (const form of LEGAL_FORMS) {
      if (s.endsWith(' ' + form)) { s = s.slice(0, -(form.length + 1)).trim(); changed = true }
    }
  }
  return s
}

/**
 * A number as Excel wrote it.
 *
 * `1.234,56` and `1,234.56` are both 1234.56; `1,234` is 1234 and `1.5` is 1.5.
 * The separator that appears last is the decimal one — the only rule that reads
 * both conventions without being told which machine produced the file.
 */
export function parseNumber(raw) {
  if (raw === null || raw === undefined) return null
  const s = String(raw).replace(/\s|€|%/g, '').trim()
  if (!s) return null

  const neg = /^\(.*\)$/.test(s) || s.startsWith('-')
  const body = s.replace(/^[-(]|\)$/g, '')
  if (!/^[\d.,]+$/.test(body)) return null

  const lastComma = body.lastIndexOf(',')
  const lastDot = body.lastIndexOf('.')
  let cleaned
  if (lastComma === -1 && lastDot === -1) cleaned = body
  else if (lastComma > lastDot) cleaned = body.replace(/\./g, '').replace(',', '.')
  else cleaned = body.replace(/,/g, '')

  const n = Number(cleaned)
  if (!Number.isFinite(n)) return null
  return neg ? -n : n
}

const HEADER_WORDS = ['customer', 'cliente', 'net sales', 'gross margin', 'vendas']

/**
 * Parse a pasted export into rows.
 *
 * Tab-separated when it comes from Excel, comma or semicolon when it comes from
 * a CSV. Rows that cannot be read are returned as problems rather than dropped:
 * an import that silently skips three lines is worse than one that refuses.
 *
 * @returns {{rows: Array, problems: Array, total: {net, margin}}}
 */
export function parseSapPaste(text) {
  const lines = String(text ?? '').split(/\r?\n/).map(l => l.trim()).filter(Boolean)
  const rows = []
  const problems = []

  for (const [i, line] of lines.entries()) {
    const cells = splitRow(line)
    if (cells.length < 3) {
      problems.push({ line: i + 1, text: line, why: 'columns' })
      continue
    }
    const [name, net, margin, pct] = cells
    const lower = name.toLowerCase()
    // A header, a total row, or Excel's own grand total: skipped on purpose and
    // not reported as a problem.
    if (HEADER_WORDS.some(w => lower.includes(w)) && parseNumber(net) === null) continue
    if (/^(total|grand total|resultado)/i.test(lower)) continue

    const netVal = parseNumber(net)
    const marginVal = parseNumber(margin)
    if (netVal === null) { problems.push({ line: i + 1, text: line, why: 'net' }); continue }

    const declaredPct = parseNumber(pct)
    const derivedPct = netVal !== 0 && marginVal !== null
      ? Math.round((marginVal / netVal) * 1000) / 10
      : null
    rows.push({
      name: name.trim(),
      key: normaliseName(name),
      net: netVal,
      margin: marginVal ?? 0,
      marginPct: derivedPct,
      // Kept only to be checked against: the percentage is derived from the two
      // figures, so a file whose own percentage disagrees is a file worth a
      // second look before it is trusted.
      declaredPct,
      pctMismatch: declaredPct !== null && derivedPct !== null
        && Math.abs(declaredPct - derivedPct) > 0.5,
    })
  }

  return {
    rows,
    problems,
    total: {
      net: round(rows.reduce((s, r) => s + r.net, 0)),
      margin: round(rows.reduce((s, r) => s + r.margin, 0)),
    },
  }
}

/** Tab first, because that is what a paste from Excel actually contains. */
function splitRow(line) {
  if (line.includes('\t')) return line.split('\t').map(c => c.trim())
  if (line.includes(';')) return line.split(';').map(c => c.trim())
  // A comma-separated line whose numbers use commas for decimals is not
  // separable by commas; quoted fields are, so respect quotes.
  const cells = line.match(/("([^"]*)"|[^,]+)/g) || []
  return cells.map(c => c.replace(/^"|"$/g, '').trim())
}

function round(n) { return Math.round((n + Number.EPSILON) * 100) / 100 }

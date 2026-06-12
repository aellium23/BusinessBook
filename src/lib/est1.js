// ── EST1 Builder — deal → Japanese-HQ Excel aggregation ──────────────────
// Pure functions that map BusinessBook deals into the structure of the
// FUJIFILM HQ "FY26 EST1" workbooks (Sales by Product, Internal Sales).
// All mapping rules are documented in FORECAST_PLAN.md and kept in sync here.
//
// Money: deal columns are stored in EUR. These functions return EUR; the UI
// divides by 1000 to present K€ (the unit the Japanese sheets use).

import { MONTHS_K, RECURRING_MODELS, normalizeBusinessModel } from '../constants'

// Quarters of the fiscal year (Apr→Mar): Q1 Apr-Jun, Q2 Jul-Sep, Q3 Oct-Dec, Q4 Jan-Mar
export const QUARTER_OF_MONTH = { apr:0, may:0, jun:0, jul:1, aug:1, sep:1, oct:2, nov:2, dec:2, jan:3, feb:3, mar:3 }
export const QUARTER_LABELS = ['Q1', 'Q2', 'Q3', 'Q4']
// Half-years for Internal Sales: 1H Apr-Sep, 2H Oct-Mar
export const HALF_OF_MONTH = { apr:0, may:0, jun:0, jul:0, aug:0, sep:0, oct:1, nov:1, dec:1, jan:1, feb:1, mar:1 }
export const HALF_LABELS = ['1H', '2H']

// Product families on the "Sales by Product" sheet.
export const EST1_PRODUCTS = ['PACS', 'VNA', 'RIS', 'Synapse 3D', 'Pathology/DP', 'Others']

// Internal-Sales regions (VGT only), in sheet order.
export const INTERNAL_REGIONS = [
  'Spain', 'UK', 'Other Europe', 'Mexico', 'Other Latin America', 'Middle East', 'Other regions',
]

const lc = (s) => (s || '').toString().toLowerCase()

// ── Product mapping ──────────────────────────────────────────────────────
// Precedence matters: "Synapse 3D" must win over the PACS/Synapse rule, and
// Pathology over a bare "DP" token.
export function productCategory(deal) {
  const p = lc(deal?.product)
  const name = p || lc(deal?.client)
  if (/\bvna\b/.test(p) || p.includes('vna')) return 'VNA'
  if (p.includes('3d')) return 'Synapse 3D'
  if (p.includes('patholog') || p.includes('digital path') || /\bdp\b/.test(name)) return 'Pathology/DP'
  if (p.includes('ris')) return 'RIS'
  if (p.includes('pacs') || p.includes('cwm') || p.includes('synapse')) return 'PACS'
  return 'Others'
}

// Core products (PACS, VNA, CV, EIS, DP) drive the New-Business test.
// Computed from the raw product text, independent of productCategory().
export function coreCategory(deal) {
  const p = lc(deal?.product)
  if (!p) return null
  if (p.includes('pacs')) return 'PACS'
  if (p.includes('vna')) return 'VNA'
  if (p.includes('patholog') || p.includes('digital path') || /\bdp\b/.test(p)) return 'DP'
  if (/\bcv\b/.test(p) || p.includes('cardiovasc')) return 'CV'
  if (/\beis\b/.test(p)) return 'EIS'
  return null
}

// ── Revenue-line mapping (A product / B maintenance / C rental-OPEX) ──────
export function businessLine(deal) {
  if (deal?.is_sla || deal?.converted_to_sla) return 'maintenance'
  if (RECURRING_MODELS.includes(normalizeBusinessModel(deal?.business_model))) return 'opex'
  return 'product'
}

// ── Quarterly distribution of a single deal ──────────────────────────────
// Same value convention as the Forecast Calendar: monthly spread wins, else
// fall back to value_total placed in the rec_month's quarter. Deals with no
// monthly spread and no rec_month land in `unallocated` (no quarter).
export function dealValue(deal) {
  const fy = MONTHS_K.reduce((s, m) => s + (Number(deal?.[m]) || 0), 0)
  return fy || Number(deal?.value_total) || 0
}

function recMonthKey(deal) {
  if (!deal?.rec_month) return null
  const key = lc(deal.rec_month).slice(0, 3)
  return Object.prototype.hasOwnProperty.call(QUARTER_OF_MONTH, key) ? key : null
}

// Returns { quarters: [q1,q2,q3,q4], unallocated } in EUR for one deal.
export function dealByQuarter(deal) {
  const quarters = [0, 0, 0, 0]
  const monthlySum = MONTHS_K.reduce((s, m) => s + (Number(deal?.[m]) || 0), 0)
  if (monthlySum > 0) {
    MONTHS_K.forEach((m) => {
      const v = Number(deal?.[m]) || 0
      if (v) quarters[QUARTER_OF_MONTH[m]] += v
    })
    return { quarters, unallocated: 0 }
  }
  const total = Number(deal?.value_total) || 0
  const rm = recMonthKey(deal)
  if (rm && total) {
    quarters[QUARTER_OF_MONTH[rm]] += total
    return { quarters, unallocated: 0 }
  }
  return { quarters, unallocated: total }
}

// Same, but split into the two halves used by the Internal-Sales sheet.
export function dealByHalf(deal) {
  const halves = [0, 0]
  const monthlySum = MONTHS_K.reduce((s, m) => s + (Number(deal?.[m]) || 0), 0)
  if (monthlySum > 0) {
    MONTHS_K.forEach((m) => {
      const v = Number(deal?.[m]) || 0
      if (v) halves[HALF_OF_MONTH[m]] += v
    })
    return { halves, unallocated: 0 }
  }
  const total = Number(deal?.value_total) || 0
  const rm = recMonthKey(deal)
  if (rm && total) {
    halves[HALF_OF_MONTH[rm]] += total
    return { halves, unallocated: 0 }
  }
  return { halves, unallocated: total }
}

// ── New Business vs Existing Base ─────────────────────────────────────────
// Build an index of core products each customer already owns (from Invoiced
// deals). Used to decide whether a product sale is a first-time core system.
export function buildBaseIndex(deals) {
  const idx = new Map() // client(lower) → Map(coreCat → count)
  deals.forEach((d) => {
    if (d.stage !== 'Invoiced') return
    const core = coreCategory(d)
    if (!core) return
    const key = lc(d.client)
    if (!idx.has(key)) idx.set(key, new Map())
    const m = idx.get(key)
    m.set(core, (m.get(core) || 0) + 1)
  })
  return idx
}

// Returns 'new' | 'existing'. Maintenance, rental/OPEX and non-core product
// sales are always Existing Base; a core product is New Business only when the
// customer has no *prior* invoiced deal of that same core category.
export function classifyNewVsExisting(deal, baseIndex) {
  if (businessLine(deal) !== 'product') return 'existing'
  const core = coreCategory(deal)
  if (!core) return 'existing'
  let prior = baseIndex.get(lc(deal.client))?.get(core) || 0
  // A deal must not count itself as its own prior base.
  if (deal.stage === 'Invoiced') prior -= 1
  return prior > 0 ? 'existing' : 'new'
}

// ── Internal-Sales region mapping (VGT only) ──────────────────────────────
export function internalRegion(deal) {
  const country = lc(deal?.country)
  const name = lc(deal?.end_client || deal?.client)
  const hay = `${name} ${country}`

  if (country === 'spain' || name.includes('ect') || name.includes('hces')) return 'Spain'
  if (hay.includes('middle east') || /\bfze\b/.test(hay) || country === 'uae') return 'Middle East'
  if (hay.includes('uk') || country === 'united kingdom' || hay.includes('healthcare uk')) return 'UK'
  if (country === 'mexico' || name.includes('mexico')) return 'Mexico'
  if (/colombia|chile|peru|costa rica|guatemala|honduras|brazil|brasil|argentina|americas|latam/.test(hay)) return 'Other Latin America'

  const europe = ['portugal','spain','france','germany','italy','netherlands','belgium','switzerland','sweden','norway','denmark','finland','austria','poland','czech republic','romania','greece','ireland','united kingdom']
  if (europe.includes(country) || hay.includes('europe')) return 'Other Europe'
  return 'Other regions'
}

// ── Top-level builders ────────────────────────────────────────────────────

// Filter to the deals that feed an EST1 sheet for a BU.
export function est1Deals(deals, bu) {
  return deals.filter((d) =>
    d.bu === bu &&
    !d.is_intercompany_mirror &&
    d.stage !== 'Lost')
}

const zeros4 = () => [0, 0, 0, 0]
const add4 = (a, b) => a.map((v, i) => v + b[i])

// Sales-by-Product sheet for one BU.
export function buildSalesByProduct(deals, bu) {
  const rows = est1Deals(deals, bu)
  const baseIndex = buildBaseIndex(deals.filter((d) => d.bu === bu))

  const products = Object.fromEntries(EST1_PRODUCTS.map((p) => [p, zeros4()]))
  const maintenance = zeros4()
  const opex = zeros4()
  const newBusiness = zeros4()
  const existingBase = zeros4()
  let unallocated = 0

  const addInto = (target, src) => src.forEach((v, i) => { target[i] += v })
  rows.forEach((d) => {
    const { quarters, unallocated: un } = dealByQuarter(d)
    unallocated += un
    const line = businessLine(d)
    if (line === 'maintenance') addInto(maintenance, quarters)
    else if (line === 'opex') addInto(opex, quarters)
    else addInto(products[productCategory(d)], quarters)
    // New vs Existing applies to the whole deal value (all lines).
    addInto(classifyNewVsExisting(d, baseIndex) === 'new' ? newBusiness : existingBase, quarters)
  })

  const productTotal = EST1_PRODUCTS.reduce((acc, p) => add4(acc, products[p]), zeros4())
  const total = add4(add4(productTotal, maintenance), opex)

  return { bu, products, productTotal, maintenance, opex, total, newBusiness, existingBase, unallocated }
}

// Internal-Sales sheet (VGT only): region × half-year.
export function buildInternalSales(deals, bu = 'VGT') {
  const rows = est1Deals(deals, bu).filter((d) => d.sales_type === 'Internal')
  const regions = Object.fromEntries(INTERNAL_REGIONS.map((r) => [r, [0, 0]]))
  const total = [0, 0]
  let unallocated = 0
  rows.forEach((d) => {
    const { halves, unallocated: un } = dealByHalf(d)
    unallocated += un
    const r = internalRegion(d)
    regions[r] = [regions[r][0] + halves[0], regions[r][1] + halves[1]]
    total[0] += halves[0]; total[1] += halves[1]
  })
  return { regions, total, unallocated }
}

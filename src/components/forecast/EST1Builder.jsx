import { useState, useEffect, useMemo } from 'react'
import { useDeals } from '../../hooks/useDeals'
import { supabase } from '../../lib/supabase'
import { MONTHS_K, WEIGHTS, normalizeBusinessModel } from '../../constants'
import { Copy, Check, Users, Package, Building2, Info, RefreshCw, Filter } from 'lucide-react'

const MONTHS_LABEL = ['Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar']

const PRODUCT_ROWS = ['PACS', 'VNA', 'RIS', 'Synapse 3D', 'Pathology/DP', 'Others']
const REGION_ROWS = ['Spain', 'UK', 'Other Europe', 'Mexico', 'Other Latin America', 'Middle East', 'Other regions']
const FTE_FUNCTIONS = ['BU head', 'Account sales', 'Sales admin', 'Product specialist', 'Project manager', 'Engineer', 'QA / RA', 'R&D']
const QUARTERS = ['Q1', 'Q2', 'Q3', 'Q4']

// ── Mapping helpers (rules confirmed in FORECAST_PLAN.md) ──────────────────
function normClient(s) { return (s || '').trim().toLowerCase() }

// Product family — uses deal.product, falling back to the client name.
function productCategory(deal) {
  const s = (deal.product || deal.client || '').toLowerCase()
  if (s.includes('3d')) return 'Synapse 3D'
  if (s.includes('patholog') || s.includes('digital path') || /\bdp\b/.test(s)) return 'Pathology/DP'
  if (s.includes('vna')) return 'VNA'
  if (s.includes('ris')) return 'RIS'
  if (s.includes('pacs') || s.includes('synapse') || s.includes('cwm')) return 'PACS'
  return 'Others'
}

// Core product (for New Business vs Existing Base).
// Falls back to product category so "Others" deals can still be classified.
function coreProduct(deal) {
  const s = (deal.product || deal.client || '').toLowerCase()
  if (s.includes('patholog') || s.includes('digital path') || /\bdp\b/.test(s)) return 'DP'
  if (s.includes('vna')) return 'VNA'
  if (s.includes('cardio') || /\bcv\b/.test(s)) return 'CV'
  if (/\beis\b/.test(s)) return 'EIS'
  if (s.includes('pacs') || s.includes('synapse') || s.includes('cwm')) return 'PACS'
  if (s.includes('3d')) return '3D'
  if (s.includes('ris')) return 'RIS'
  return 'OTHER'
}

// Revenue type bucket: maintenance | opex | product
function revenueType(deal) {
  if (deal.is_sla || deal.converted_to_sla) return 'maintenance'
  if ((deal.deal_type || '').toLowerCase().includes('recurring')) return 'maintenance'
  const raw = (deal.business_model || '').toLowerCase()
  const norm = normalizeBusinessModel(deal.business_model)
  if (['opex', 'saas', 'pay_per_study'].includes(raw) || ['subscription', 'pay_per_study'].includes(norm)) return 'opex'
  return 'product'
}

// Internal sales region (VGT only) from the trading partner / client name.
function internalRegion(deal) {
  const c = normClient(deal.client)
  if (c.includes('fujifilm uk') || c.includes('healthcare uk') || /\buk\b/.test(c)) return 'UK'
  if (c.includes('middle east') || c.includes('fze')) return 'Middle East'
  if (c.includes('mexico') || c.includes('méxico')) return 'Mexico'
  if (['colombia', 'chile', 'peru', 'costa rica', 'guatemala', 'honduras', 'brazil', 'brasil', 'argentina', 'americas', 'latam', 'panama', 'ecuador'].some(x => c.includes(x))) return 'Other Latin America'
  if (c.includes('ect') || c.includes('spain') || c.includes('españa') || c.includes('espana')) return 'Spain'
  if (c.includes('europe') || c.includes('europa')) return 'Other Europe'
  return 'Other Europe'
}

// Per-deal monthly array (€) — uses the Forecast Calendar allocation, falling
// back to value_total placed in rec_month. Unscheduled deals stay at zero.
function monthlyArray(deal) {
  const arr = MONTHS_K.map(m => Number(deal[m]) || 0)
  if (arr.some(v => v > 0)) return arr
  const v = Number(deal.value_total) || 0
  if (v <= 0) return arr
  const out = new Array(12).fill(0)
  const idx = deal.rec_month
    ? MONTHS_LABEL.findIndex(l => l.toLowerCase() === deal.rec_month.toLowerCase())
    : -1
  if (idx >= 0) out[idx] = v
  return out
}

function quarterAmounts(deal) {
  const m = monthlyArray(deal)
  const q = [0, 0, 0, 0]
  m.forEach((v, i) => { q[Math.floor(i / 3)] += v })
  return q
}

function halfAmounts(deal) {
  const m = monthlyArray(deal)
  return [
    m.slice(0, 6).reduce((s, v) => s + v, 0),
    m.slice(6, 12).reduce((s, v) => s + v, 0),
  ]
}

// K€ formatter for the grid + clipboard (values are stored in €).
function k(v) { return v ? (v / 1000).toFixed(1) : '—' }
function kNum(v) { return v ? (v / 1000).toFixed(1) : '0' }

function CopyButton({ label, rows }) {
  const [copied, setCopied] = useState(false)
  const handle = async () => {
    const tsv = rows.map(r => r.join('\t')).join('\n')
    try {
      await navigator.clipboard.writeText(tsv)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      /* clipboard unavailable */
    }
  }
  return (
    <button onClick={handle}
      className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border border-gray-200 bg-white hover:bg-gray-50 text-gray-600 transition-colors">
      {copied ? <><Check size={12} className="text-green-600"/> Copied</> : <><Copy size={12}/> {label}</>}
    </button>
  )
}

const STAGE_OPTIONS = ['Lead', 'Pipeline', 'Offer Presented', 'BackLog', 'Invoiced']
const CAL_MONTHS = [3, 4, 5, 6, 7, 8, 9, 10, 11, 0, 1, 2]
const FY_YEAR = 2026

function slaQuarterAmounts(sla) {
  const annual = Number(sla.annual_value) || 0
  if (annual <= 0) return [0, 0, 0, 0]
  const daily = annual / 365
  const start = sla.start_date ? new Date(sla.start_date) : null
  const end = sla.end_date ? new Date(sla.end_date) : null
  const monthly = []
  for (let i = 0; i < 12; i++) {
    const yr = i >= 9 ? FY_YEAR + 1 : FY_YEAR
    const cm = CAL_MONTHS[i]
    const mStart = new Date(yr, cm, 1)
    const mEnd = new Date(yr, cm + 1, 0)
    const pStart = start && start > mStart ? start : mStart
    const pEnd = end && end < mEnd ? end : mEnd
    if (pStart > pEnd) { monthly.push(0); continue }
    const days = (pEnd - pStart) / 86400000 + 1
    const totalDays = (mEnd - mStart) / 86400000 + 1
    monthly.push(days >= totalDays * 0.95 ? daily * totalDays : daily * days)
  }
  return [0, 1, 2, 3].map(q => monthly.slice(q * 3, q * 3 + 3).reduce((s, v) => s + v, 0))
}

function slaHalfAmounts(sla) {
  const qa = slaQuarterAmounts(sla)
  return [qa[0] + qa[1], qa[2] + qa[3]]
}

export default function EST1Builder() {
  const { deals: allDeals, loading } = useDeals()
  const [bu, setBu] = useState('VGT')
  const [weighted, setWeighted] = useState(false)
  const [stages, setStages] = useState(STAGE_OPTIONS)
  const [includeArr, setIncludeArr] = useState(true)
  const [slas, setSlas] = useState([])

  useEffect(() => {
    supabase.from('slas')
      .select('id, status, annual_value, start_date, end_date, bu, client, product, sales_type, deal:deal_id(sales_type)')
      .in('status', ['warranty', 'active', 'pending_renewal'])
      .then(({ data }) => setSlas(data || []))
      .catch(() => {})
  }, [])

  const toggleStage = (s) => setStages(prev =>
    prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]
  )

  const scopeDeals = useMemo(() =>
    allDeals.filter(d =>
      !d.is_intercompany_mirror &&
      d.bu === bu &&
      stages.includes(d.stage)
    )
  , [allDeals, bu, stages])

  const scopeSlas = useMemo(() =>
    includeArr ? slas.filter(s => (s.bu || '').toUpperCase() === bu) : []
  , [slas, bu, includeArr])

  const productDeals = useMemo(() => scopeDeals.filter(d => d.sales_type !== 'Internal'), [scopeDeals])
  const internalDeals = useMemo(() => scopeDeals.filter(d => d.sales_type === 'Internal'), [scopeDeals])
  const productSlas = useMemo(() => scopeSlas.filter(s => (s.sales_type || s.deal?.sales_type) !== 'Internal'), [scopeSlas])
  const internalSlas = useMemo(() => scopeSlas.filter(s => (s.sales_type || s.deal?.sales_type) === 'Internal'), [scopeSlas])

  // Prior-invoiced core products per customer (across all BUs) for New/Existing.
  const invoicedCoreMap = useMemo(() => {
    const m = {}
    allDeals.forEach(d => {
      if (d.is_intercompany_mirror || d.stage !== 'Invoiced') return
      const core = coreProduct(d)
      const key = normClient(d.client) + '|' + core
      ;(m[key] || (m[key] = new Set())).add(d.id)
    })
    return m
  }, [allDeals])

  // A deal is New Business if the client has no prior invoiced deal for the same
  // core product. Maintenance/OPEX are always Existing Base (recurring).
  const isNewBusiness = useMemo(() => (deal) => {
    if (revenueType(deal) !== 'product') return false
    const core = coreProduct(deal)
    const ids = invoicedCoreMap[normClient(deal.client) + '|' + core]
    const priorExists = ids && [...ids].some(id => id !== deal.id)
    return !priorExists
  }, [invoicedCoreMap])

  const wf = useMemo(() => (d) => weighted ? (WEIGHTS[d.stage] ?? 0) : 1, [weighted])

  // ── Sales by Product (quarterly) ──────────────────────────────────────────
  const sales = useMemo(() => {
    const Q = () => [0, 0, 0, 0]
    const products = Object.fromEntries(PRODUCT_ROWS.map(p => [p, Q()]))
    const maint = Q(), opex = Q(), newBiz = Q(), existing = Q(), total = Q()
    productDeals.forEach(d => {
      const factor = wf(d)
      if (!factor) return
      const qa = quarterAmounts(d).map(v => v * factor)
      const rt = revenueType(d)
      const cat = productCategory(d)
      const nb = isNewBusiness(d)
      qa.forEach((v, i) => {
        if (!v) return
        total[i] += v
        if (rt === 'maintenance') maint[i] += v
        else if (rt === 'opex') opex[i] += v
        else products[cat][i] += v
        if (nb) newBiz[i] += v; else existing[i] += v
      })
    })
    productSlas.forEach(s => {
      const qa = slaQuarterAmounts(s)
      qa.forEach((v, i) => { if (v) { maint[i] += v; total[i] += v; existing[i] += v } })
    })
    return { products, maint, opex, newBiz, existing, total }
  }, [productDeals, productSlas, wf, isNewBusiness])

  // ── Internal Sales (semi-annual, VGT only) ────────────────────────────────
  const internal = useMemo(() => {
    const rows = Object.fromEntries(REGION_ROWS.map(r => [r, [0, 0]]))
    const newBiz = [0, 0], recurring = [0, 0]
    internalDeals.forEach(d => {
      const factor = wf(d)
      if (!factor) return
      const ha = halfAmounts(d).map(v => v * factor)
      const reg = internalRegion(d)
      const nb = isNewBusiness(d)
      ha.forEach((v, i) => {
        rows[reg][i] += v
        if (nb) newBiz[i] += v; else recurring[i] += v
      })
    })
    internalSlas.forEach(s => {
      const ha = slaHalfAmounts(s)
      const reg = internalRegion({ client: s.client })
      ha.forEach((v, i) => { rows[reg][i] += v; recurring[i] += v })
    })
    return { rows, newBiz, recurring }
  }, [internalDeals, internalSlas, wf, isNewBusiness])

  const fy = arr => arr.reduce((s, v) => s + v, 0)

  // Clipboard payloads (K€)
  const salesClipboard = useMemo(() => {
    const out = [['Line', ...QUARTERS, 'FY26']]
    PRODUCT_ROWS.forEach(p => out.push([p, ...sales.products[p].map(kNum), kNum(fy(sales.products[p]))]))
    out.push(['B. Maintenance', ...sales.maint.map(kNum), kNum(fy(sales.maint))])
    out.push(['C. Rental / MES / OPEX', ...sales.opex.map(kNum), kNum(fy(sales.opex))])
    out.push(['Total revenue', ...sales.total.map(kNum), kNum(fy(sales.total))])
    out.push(['of which New Business', ...sales.newBiz.map(kNum), kNum(fy(sales.newBiz))])
    out.push(['of which Existing Base', ...sales.existing.map(kNum), kNum(fy(sales.existing))])
    return out
  }, [sales])

  const internalClipboard = useMemo(() => {
    const out = [['Region', '1H', '2H', 'FY26']]
    REGION_ROWS.forEach(r => out.push([r, kNum(internal.rows[r][0]), kNum(internal.rows[r][1]), kNum(fy(internal.rows[r]))]))
    out.push(['Total internal', kNum(REGION_ROWS.reduce((s, r) => s + internal.rows[r][0], 0)), kNum(REGION_ROWS.reduce((s, r) => s + internal.rows[r][1], 0)), kNum(REGION_ROWS.reduce((s, r) => s + fy(internal.rows[r]), 0))])
    out.push(['of which New Business', kNum(internal.newBiz[0]), kNum(internal.newBiz[1]), kNum(fy(internal.newBiz))])
    out.push(['of which Recurring', kNum(internal.recurring[0]), kNum(internal.recurring[1]), kNum(fy(internal.recurring))])
    return out
  }, [internal])

  // Deals not placed in any quarter (no monthly allocation, no rec_month)
  const unallocated = useMemo(() => {
    let ext = 0, int = 0
    scopeDeals.forEach(d => {
      const qa = quarterAmounts(d)
      if (qa.some(v => v > 0)) return
      const v = (Number(d.value_total) || 0) * wf(d)
      if (v <= 0) return
      if (d.sales_type === 'Internal') int += v; else ext += v
    })
    return { ext, int, total: ext + int }
  }, [scopeDeals, wf])

  if (loading) return (
    <div className="flex items-center justify-center p-16">
      <div className="w-6 h-6 border-2 border-navy border-t-transparent rounded-full animate-spin"/>
    </div>
  )

  const productTotalFY = fy(sales.total)
  const internalTotalFY = REGION_ROWS.reduce((s, r) => s + fy(internal.rows[r]), 0)
  const grandTotal = productTotalFY + internalTotalFY + unallocated.total

  return (
    <div className="space-y-5">
      {/* Controls */}
      <div className="space-y-3">
        <p className="text-sm text-gray-400">
          FY26 EST1 · Auto-populated from CRM deals + SLA contracts · values in K€
        </p>
        <div className="flex items-center gap-2 flex-wrap">
          <Filter size={13} className="text-gray-400"/>
          <div className="flex rounded-xl overflow-hidden border border-gray-200">
            {['VGT', 'ECT'].map(b => (
              <button key={b} onClick={() => setBu(b)}
                className={`px-4 py-1.5 text-xs font-semibold transition-all ${
                  bu === b ? (b === 'VGT' ? 'bg-vgt text-white' : 'bg-ect text-white') : 'bg-white text-gray-500'
                }`}>
                {b}
              </button>
            ))}
          </div>
          <span className="text-gray-300">|</span>
          {STAGE_OPTIONS.map(s => (
            <button key={s} onClick={() => toggleStage(s)}
              className={`text-xs px-2 py-1 rounded-lg border font-medium transition-colors ${
                stages.includes(s)
                  ? 'border-navy bg-navy/10 text-navy'
                  : 'border-gray-200 bg-white text-gray-400'
              }`}>
              {s === 'Offer Presented' ? 'Offer' : s}
            </button>
          ))}
          <span className="text-gray-300">|</span>
          <label className="flex items-center gap-1.5 text-xs text-purple-600 cursor-pointer">
            <input type="checkbox" checked={includeArr} onChange={e => setIncludeArr(e.target.checked)}
              className="rounded border-purple-300 text-purple-600"/>
            ARR ({scopeSlas.length})
          </label>
          <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
            <input type="checkbox" checked={weighted} onChange={e => setWeighted(e.target.checked)}
              className="rounded border-gray-300"/>
            Weight by stage
          </label>
          <span className="text-micro text-gray-400 ml-auto">
            {scopeDeals.length} deals{includeArr ? ` + ${scopeSlas.length} SLAs` : ''}
          </span>
        </div>
      </div>

      {/* Reconciliation summary */}
      <div className="bg-navy/5 border border-navy/15 rounded-xl px-4 py-3 flex items-center justify-between flex-wrap gap-3">
        <div>
          <p className="text-micro text-gray-500 uppercase tracking-wide font-semibold">{bu} FY26 Total</p>
          <p className="text-xl font-bold text-navy">{k(grandTotal)} K€</p>
        </div>
        <div className="flex items-center gap-4 text-xs">
          <div className="text-center">
            <p className="text-micro text-gray-400">External (tbl)</p>
            <p className="font-bold text-amber-700">{k(productTotalFY)}</p>
          </div>
          <div className="text-center">
            <p className="text-micro text-gray-400">Internal (tbl)</p>
            <p className="font-bold text-blue-700">{k(internalTotalFY)}</p>
          </div>
          {unallocated.total > 0 && (
            <div className="text-center border-l border-gray-300 pl-4">
              <p className="text-micro text-red-400">Unallocated</p>
              <p className="font-bold text-red-500">{k(unallocated.total)}</p>
              <p className="text-micro text-gray-400">
                E {k(unallocated.ext)} · I {k(unallocated.int)}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Sales by Product ── */}
      <section className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
            <Package size={15} className="text-navy"/> Sales by Product — {bu} {bu === 'VGT' ? '(FFPT)' : '(HCES)'}
          </h3>
          <CopyButton label="Copy table" rows={salesClipboard}/>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 text-gray-500">
                <th className="text-left px-3 py-2 font-semibold sticky left-0 bg-gray-50">Line (K€)</th>
                {QUARTERS.map(q => <th key={q} className="px-3 py-2 text-right font-semibold w-20">{q}</th>)}
                <th className="px-3 py-2 text-right font-bold text-gray-700 w-20">FY26</th>
              </tr>
            </thead>
            <tbody>
              <tr className="bg-navy/[0.03]">
                <td colSpan={6} className="px-3 py-1 text-micro font-bold text-navy uppercase tracking-wide">A. Product sales</td>
              </tr>
              {PRODUCT_ROWS.map(p => {
                const row = sales.products[p]
                const rowFY = fy(row)
                return (
                  <tr key={p} className="border-b border-gray-50 hover:bg-gray-50/50">
                    <td className="px-3 py-1.5 text-gray-600 sticky left-0 bg-white pl-5">{p}</td>
                    {row.map((v, i) => <td key={i} className="px-3 py-1.5 text-right text-gray-700">{k(v)}</td>)}
                    <td className="px-3 py-1.5 text-right font-semibold text-gray-900">{k(rowFY)}</td>
                  </tr>
                )
              })}
              <tr className="border-y border-gray-100 bg-gray-50/40 font-medium">
                <td className="px-3 py-1.5 text-gray-700 sticky left-0 bg-gray-50/40">B. Maintenance</td>
                {sales.maint.map((v, i) => <td key={i} className="px-3 py-1.5 text-right text-gray-700">{k(v)}</td>)}
                <td className="px-3 py-1.5 text-right font-semibold text-gray-900">{k(fy(sales.maint))}</td>
              </tr>
              <tr className="border-b border-gray-100 bg-gray-50/40 font-medium">
                <td className="px-3 py-1.5 text-gray-700 sticky left-0 bg-gray-50/40">C. Rental / MES / OPEX</td>
                {sales.opex.map((v, i) => <td key={i} className="px-3 py-1.5 text-right text-gray-700">{k(v)}</td>)}
                <td className="px-3 py-1.5 text-right font-semibold text-gray-900">{k(fy(sales.opex))}</td>
              </tr>
              <tr className="border-y-2 border-navy/20 bg-navy/[0.06] font-bold">
                <td className="px-3 py-2 text-navy sticky left-0 bg-[#eef1f5]">Total revenue</td>
                {sales.total.map((v, i) => <td key={i} className="px-3 py-2 text-right text-navy">{k(v)}</td>)}
                <td className="px-3 py-2 text-right text-navy">{k(productTotalFY)}</td>
              </tr>
              <tr className="border-b border-gray-50">
                <td className="px-3 py-1.5 text-green-700 sticky left-0 bg-white pl-5">of which New Business</td>
                {sales.newBiz.map((v, i) => <td key={i} className="px-3 py-1.5 text-right text-green-700">{k(v)}</td>)}
                <td className="px-3 py-1.5 text-right font-semibold text-green-700">{k(fy(sales.newBiz))}</td>
              </tr>
              <tr>
                <td className="px-3 py-1.5 text-gray-500 sticky left-0 bg-white pl-5">of which Existing Base</td>
                {sales.existing.map((v, i) => <td key={i} className="px-3 py-1.5 text-right text-gray-500">{k(v)}</td>)}
                <td className="px-3 py-1.5 text-right font-semibold text-gray-600">{k(fy(sales.existing))}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="px-4 py-2 text-micro text-gray-400 border-t border-gray-50">
          Q1 Apr–Jun · Q2 Jul–Sep · Q3 Oct–Dec · Q4 Jan–Mar. SW / SE-PS / 3rd-party split is not yet distinguished in the CRM — all aggregated.
          Unscheduled deals (no recognition month) are excluded from the quarters.
        </p>
      </section>

      {/* ── Internal Sales (VGT only) ── */}
      {bu === 'VGT' && (
        <section className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
            <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
              <Building2 size={15} className="text-navy"/> Internal Sales — VGT (FFPT)
            </h3>
            <CopyButton label="Copy table" rows={internalClipboard}/>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 text-gray-500">
                  <th className="text-left px-3 py-2 font-semibold">Region (K€)</th>
                  <th className="px-3 py-2 text-right font-semibold w-24">1H (Apr–Sep)</th>
                  <th className="px-3 py-2 text-right font-semibold w-24">2H (Oct–Mar)</th>
                  <th className="px-3 py-2 text-right font-bold text-gray-700 w-20">FY26</th>
                </tr>
              </thead>
              <tbody>
                {REGION_ROWS.map(r => {
                  const row = internal.rows[r]
                  return (
                    <tr key={r} className="border-b border-gray-50 hover:bg-gray-50/50">
                      <td className="px-3 py-1.5 text-gray-600">{r}</td>
                      <td className="px-3 py-1.5 text-right text-gray-700">{k(row[0])}</td>
                      <td className="px-3 py-1.5 text-right text-gray-700">{k(row[1])}</td>
                      <td className="px-3 py-1.5 text-right font-semibold text-gray-900">{k(fy(row))}</td>
                    </tr>
                  )
                })}
                <tr className="border-t-2 border-navy/20 bg-navy/[0.06] font-bold">
                  <td className="px-3 py-2 text-navy">Total internal</td>
                  <td className="px-3 py-2 text-right text-navy">{k(REGION_ROWS.reduce((s, r) => s + internal.rows[r][0], 0))}</td>
                  <td className="px-3 py-2 text-right text-navy">{k(REGION_ROWS.reduce((s, r) => s + internal.rows[r][1], 0))}</td>
                  <td className="px-3 py-2 text-right text-navy">{k(internalTotalFY)}</td>
                </tr>
                <tr className="border-b border-gray-50">
                  <td className="px-3 py-1.5 text-green-700 pl-5">of which New Business</td>
                  <td className="px-3 py-1.5 text-right text-green-700">{k(internal.newBiz[0])}</td>
                  <td className="px-3 py-1.5 text-right text-green-700">{k(internal.newBiz[1])}</td>
                  <td className="px-3 py-1.5 text-right font-semibold text-green-700">{k(fy(internal.newBiz))}</td>
                </tr>
                <tr>
                  <td className="px-3 py-1.5 text-gray-500 pl-5">of which Recurring</td>
                  <td className="px-3 py-1.5 text-right text-gray-500">{k(internal.recurring[0])}</td>
                  <td className="px-3 py-1.5 text-right text-gray-500">{k(internal.recurring[1])}</td>
                  <td className="px-3 py-1.5 text-right font-semibold text-gray-600">{k(fy(internal.recurring))}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="px-4 py-2 text-micro text-gray-400 border-t border-gray-50">
            Internal deals are matched to regions from the trading partner / client name. Margin % (MP) is entered manually in the HQ Excel.
          </p>
        </section>
      )}

      {/* ── FTE (manual) ── */}
      <section className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h3 className="text-sm font-bold text-gray-800 flex items-center gap-2">
            <Users size={15} className="text-navy"/> FTE — {bu}
          </h3>
        </div>
        <div className="px-4 py-3">
          <div className="flex items-start gap-2 text-xs text-gray-500 mb-3">
            <Info size={14} className="text-gray-400 shrink-0 mt-0.5"/>
            <span>FTE is a point-in-time headcount forecast (March 2027) entered manually — there is no CRM automation. Use the function list below as the template for the HQ Excel.</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {FTE_FUNCTIONS.map(f => (
              <span key={f} className="text-xs px-2.5 py-1 rounded-lg bg-gray-100 text-gray-600">{f}</span>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}

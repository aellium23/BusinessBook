import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useTranslation } from '../hooks/useTranslation'
import { formatK, CollapsibleSection } from '../components/ui'
import {
  BarChart, Bar, ComposedChart, Line, CartesianGrid, XAxis, YAxis,
  Tooltip, ResponsiveContainer, Legend, ReferenceLine, ReferenceArea, Cell
} from 'recharts'

const MONTHS_K = ['apr','may','jun','jul','aug','sep','oct','nov','dec','jan','feb','mar']
const MONTHS   = ['Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar']
const TOOLTIP  = { fontSize: 11, borderRadius: 8 }

const ALL_FYS = ['FY10','FY11','FY12','FY13','FY14','FY15','FY16','FY17',
                 'FY18','FY19','FY20','FY21','FY22','FY23','FY24','FY25']

const PERIOD_PRESETS = {
  recent:  { label: 'FY23–25',  fys: ['FY23','FY24','FY25'] },
  full:    { label: 'FY10–25',  fys: ALL_FYS },
  compare: { label: 'FY18–25',  fys: ALL_FYS.filter(f => Number(f.slice(2)) >= 18) },
}

const fyNum = fy => Number(fy.slice(2))

// Per-BU scope/perimeter break: years before are not strictly comparable
const SCOPE_BREAK = {
  VGT: { year: 'FY18', tag: 'Scope ↗',
         note: '⚠ Shaded area = legacy perimeter (FY10–17). Scope/accounts changed at FY18 — not directly comparable.' },
  ECT: { year: 'FY22', tag: 'ECT ↗',
         note: '⚠ Shaded area = inherited (FY10–21, 3rd-party run). Medical IT Spain taken over / ECT created at FY22; FY23 consolidates the GmbH-branch + Healthcare España entities.' },
}

function KpiBox({ label, value, sub, color }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 border-t-2"
      style={{ borderTopColor: color }}>
      <p className="text-micro font-semibold text-gray-400 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

function KpiSparkCard({ label, value, sub, color, data, dataKey }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-3 border-t-2"
      style={{ borderTopColor: color }}>
      <p className="text-micro font-semibold text-gray-400 uppercase tracking-wide">{label}</p>
      <div className="flex items-end justify-between gap-2">
        <div>
          <p className="text-xl font-bold text-gray-900 mt-1">{value}</p>
          {sub && <p className="text-micro text-gray-400">{sub}</p>}
        </div>
        {data && data.length > 1 && (
          <ResponsiveContainer width={60} height={28}>
            <ComposedChart data={data} margin={{top:2,right:0,bottom:0,left:0}}>
              <Line type="monotone" dataKey={dataKey} stroke={color} strokeWidth={1.5} dot={false}/>
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  )
}

const tickK = v => v >= 1000 ? `${(v/1000).toFixed(1)}M` : v <= -1000 ? `${(v/1000).toFixed(1)}M` : `${v}K`

// ── History do Distribuidor ──────────────────────────────────────────────────
function DistributorHistory({ profile }) {
  const { t } = useTranslation()
  const [deals, setDeals]   = useState([])
  const [loading, setLoading] = useState(true)

  const MONTHS_K = ['apr','may','jun','jul','aug','sep','oct','nov','dec','jan','feb','mar']
  const MONTHS   = ['Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar']

  useEffect(() => {
    if (!profile?.company_id) { setLoading(false); return }
    supabase.from('deals')
      .select('*')
      .eq('company_id', profile.company_id)
      .eq('is_intercompany_mirror', false)
      .then(({ data, error }) => {

        setDeals(data || [])
        setLoading(false)
      })
      .catch(() => { setLoading(false) })
  }, [profile])

  const { invoiced, byClient, monthly } = useMemo(() => {
    const rate = d => (!d.currency || d.currency === 'EUR') ? 1 : (Number(d.exchange_rate) || 1)
    const fyVal = d => {
      const raw = MONTHS_K.reduce((s, m) => s + (Number(d[m]) || 0), 0)
      return ((raw === 0 && Number(d.value_total) > 0) ? Number(d.value_total) : raw) * rate(d)
    }

    const invoiced = deals.filter(d => d.stage === 'Invoiced')
    const total = invoiced.reduce((s, d) => s + fyVal(d), 0)

    const clientMap = {}
    invoiced.forEach(d => {
      if (!clientMap[d.client]) clientMap[d.client] = 0
      clientMap[d.client] += fyVal(d)
    })
    const byClient = Object.entries(clientMap)
      .sort((a,b) => b[1]-a[1])
      .map(([client, value]) => ({ client, value }))

    const monthly = MONTHS_K.map((m, i) => ({
      month: MONTHS[i],
      value: Math.round(invoiced.reduce((s, d) => s + (Number(d[m]) || 0) * rate(d), 0) / 1000 * 10) / 10,
    }))

    return { invoiced, total, byClient, monthly }
  }, [deals])

  if (loading) return (
    <div className="flex items-center justify-center p-16">
      <div className="w-6 h-6 border-2 border-navy border-t-transparent rounded-full animate-spin"/>
    </div>
  )

  const total = invoiced.reduce((s, d) => {
    const rate = (!d.currency || d.currency === 'EUR') ? 1 : (Number(d.exchange_rate) || 1)
    const raw = MONTHS_K.reduce((sum, m) => sum + (Number(d[m]) || 0), 0)
    return s + ((raw === 0 && Number(d.value_total) > 0) ? Number(d.value_total) : raw) * rate
  }, 0)

  return (
    <div className="p-4 space-y-5 max-w-3xl mx-auto">
      <div className="pt-1">
        <h1 className="text-xl font-bold text-gray-900">{t('hist_title')}</h1>
        <p className="text-sm text-gray-400 mt-0.5">{t('dist_hist_subtitle')}</p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border border-gray-200 p-3 text-center">
          <p className="text-2xl font-bold text-gray-900">{Math.round(total/1000)}K€</p>
          <p className="text-xs text-gray-400 mt-0.5">{t('dist_hist_invoiced')}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-3 text-center">
          <p className="text-2xl font-bold text-gray-900">{invoiced.length}</p>
          <p className="text-xs text-gray-400 mt-0.5">{t('dist_hist_closed')}</p>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-3 text-center">
          <p className="text-2xl font-bold text-gray-900">{byClient.length}</p>
          <p className="text-xs text-gray-400 mt-0.5">Clientes</p>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <p className="text-sm font-semibold text-gray-700 mb-3">{t('dist_monthly')}</p>
        <ResponsiveContainer width="100%" height={160}>
          <BarChart data={monthly} margin={{top:5,right:5,bottom:0,left:0}}>
            <XAxis dataKey="month" tick={{fontSize:10}} tickLine={false} axisLine={false}/>
            <YAxis tick={{fontSize:10}} tickLine={false} axisLine={false} width={30}/>
            <Tooltip formatter={v => [`${v}K€`]} contentStyle={{fontSize:11,borderRadius:8}}/>
            <Bar dataKey="value" fill="#1D9E75" radius={[3,3,0,0]} name="Invoiced"/>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {byClient.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <p className="text-sm font-semibold text-gray-700 mb-3">{t('dist_hist_by_client')}</p>
          <div className="space-y-2">
            {byClient.slice(0,10).map(({ client, value }) => (
              <div key={client} className="flex items-center gap-3">
                <p className="text-sm text-gray-700 w-40 truncate">{client}</p>
                <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full bg-vgt rounded-full"
                    style={{ width: `${Math.min(value / byClient[0].value * 100, 100)}%` }}/>
                </div>
                <p className="text-sm font-medium text-gray-700 w-16 text-right">
                  {Math.round(value/1000*10)/10}K€
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {deals.length === 0 && (
        <div className="text-center py-12 text-gray-400">
          <p className="text-sm">{t('dist_hist_no_data')}</p>
        </div>
      )}
    </div>
  )
}

export default function History() {
  const { isAdmin, profile } = useAuth()
  const [fy25, setFy25]   = useState([])
  const [fySummary, setFySummary] = useState([])
  const [sga, setSga] = useState([])
  const [loading, setLoading] = useState(true)
  const [activeBU, setActiveBU] = useState(isAdmin ? 'both' : (profile?.bu || 'both'))
  const [period, setPeriod] = useState('recent')
  const [sgaYear, setSgaYear] = useState(null)
  const [sgaSort, setSgaSort] = useState('abs') // 'abs' | 'pct'
  const [sgaAll, setSgaAll] = useState(false)

  useEffect(() => {
    Promise.all([
      supabase.from('fy25_actuals').select('*'),
      supabase.from('fy_summary').select('*'),
      supabase.from('fy_sga_rubrica').select('*'),
    ]).then(([f25, fsum, srub]) => {
      setFy25(f25.data || [])
      setFySummary(fsum.data || [])
      setSga(srub.data || [])
      setLoading(false)
    }).catch(() => { setLoading(false) })
  }, [])

  useEffect(() => {
    if (!isAdmin && profile?.bu) setActiveBU(profile.bu)
  }, [isAdmin, profile?.bu])

  const get = (bu, pl, month) => {
    const row = fy25.find(r => r.bu === bu && r.pl_key === pl)
    return row ? (row[month] || 0) : 0
  }

  const totals = useMemo(() => {
    const calc = (bu) => ({
      ns: MONTHS_K.reduce((s,m) => s + get(bu,'ns',m), 0),
      gm: MONTHS_K.reduce((s,m) => s + get(bu,'gm',m), 0),
    })
    const vgt = calc('VGT'), ect = calc('ECT')
    return {
      vgt, ect,
      total: { ns: vgt.ns + ect.ns, gm: vgt.gm + ect.gm },
    }
  }, [fy25])

  const monthlyChart = useMemo(() => {
    return MONTHS.map((m, i) => {
      const mk = MONTHS_K[i]
      const vgt_ns = get('VGT','ns',mk)
      const ect_ns = get('ECT','ns',mk)
      const vgt_gm = get('VGT','gm',mk)
      const ect_gm = get('ECT','gm',mk)
      return {
        month: m,
        'VGT NS':  Math.round(vgt_ns * 10) / 10,
        'ECT NS':  Math.round(ect_ns * 10) / 10,
        'VGT GM':  Math.round(vgt_gm * 10) / 10,
        'ECT GM':  Math.round(ect_gm * 10) / 10,
        'Total NS': Math.round((vgt_ns + ect_ns) * 10) / 10,
      }
    })
  }, [fy25])

  // Helper: get fy_summary value
  const sum = (fy, bu, key) => {
    const row = fySummary.find(r => r.fiscal_year === fy && r.bu === bu)
    if (!row) return null
    const v = Number(row[key])
    return isNaN(v) ? null : v
  }

  // Full-history is single-BU; 'both' (Iberia) defaults to VGT
  const histBU = activeBU === 'ECT' ? 'ECT' : 'VGT'
  const brk = SCOPE_BREAK[histBU]

  // ── BU full history (FY10–FY25) ──
  const histData = useMemo(() => {
    const preset = PERIOD_PRESETS[period]
    return preset.fys
      .map(fy => {
        const ns = sum(fy, histBU, 'net_sales')
        if (ns === null) return null
        const dm = sum(fy, histBU, 'dm') ?? sum(fy, histBU, 'gross_margin')
        const op = sum(fy, histBU, 'op')
        const net = sum(fy, histBU, 'net_profit')
        const planNs = sum(fy, histBU, 'plan_ns')
        const intl = sum(fy, histBU, 'ns_int') ?? 0
        const ext = sum(fy, histBU, 'ns_ext') ?? 0
        const ach = (planNs && planNs > 0 && ns !== null) ? Math.round(ns / planNs * 100) : null
        const dmPct = (ns && dm !== null) ? Math.round(dm / ns * 100) : null
        const opPct = (ns && op !== null) ? Math.round(op / ns * 1000) / 10 : null
        return { fy, ns: Math.round(ns ?? 0), dm: Math.round(dm ?? 0), op: Math.round(op ?? 0),
                 net: Math.round(net ?? 0), planNs: planNs ? Math.round(planNs) : null,
                 ach, dmPct, opPct, Internal: Math.round(intl), External: Math.round(ext),
                 intPct: (intl + ext) > 0 ? Math.round(intl / (intl + ext) * 100) : 0 }
      })
      .filter(Boolean)
  }, [fySummary, period, histBU])

  const hasHist = histData.length > 3

  // Latest values for KPI sparklines
  const latest = histData[histData.length - 1]
  const prev = histData[histData.length - 2]

  // CAGR computation
  const cagr = (start, end, years) => {
    if (!start || !end || start <= 0 || years <= 0) return null
    return ((end / start) ** (1 / years) - 1) * 100
  }
  // CAGR across the comparable era (scope-break year → last visible year)
  const eraCagr = (() => {
    const base = histData.find(d => d.fy === brk.year)
    const last = histData[histData.length - 1]
    if (!base || !last || base.fy === last.fy) return null
    return cagr(base.ns, last.ns, fyNum(last.fy) - fyNum(base.fy))
  })()

  // ECT 3-year evolution (only for recent period)
  const evolution = useMemo(() => {
    return ['FY23', 'FY24', 'FY25'].map(fy => {
      const vNs = Math.round(sum(fy, 'VGT', 'net_sales') ?? 0)
      const eNs = Math.round(sum(fy, 'ECT', 'net_sales') ?? 0)
      const vOp = Math.round(sum(fy, 'VGT', 'op') ?? 0)
      const eOp = Math.round(sum(fy, 'ECT', 'op') ?? 0)
      return {
        fy,
        'VGT NS': vNs, 'ECT NS': eNs, 'Iberia NS': vNs + eNs,
        'VGT OP': vOp, 'ECT OP': eOp, 'Iberia OP': vOp + eOp,
      }
    })
  }, [fySummary])

  // Iberia consolidated full history (VGT + ECT)
  const iberiaHist = useMemo(() => {
    return PERIOD_PRESETS[period].fys.map(fy => {
      const vNs = sum(fy, 'VGT', 'net_sales'); const eNs = sum(fy, 'ECT', 'net_sales')
      if (vNs === null && eNs === null) return null
      const v = vNs ?? 0, e = eNs ?? 0
      const vDm = sum(fy, 'VGT', 'dm') ?? sum(fy, 'VGT', 'gross_margin') ?? 0
      const eDm = sum(fy, 'ECT', 'dm') ?? sum(fy, 'ECT', 'gross_margin') ?? 0
      const vOp = sum(fy, 'VGT', 'op') ?? 0; const eOp = sum(fy, 'ECT', 'op') ?? 0
      const vPlan = sum(fy, 'VGT', 'plan_ns'); const ePlan = sum(fy, 'ECT', 'plan_ns')
      const ns = v + e, dm = vDm + eDm, op = vOp + eOp
      let planTot = 0, nsForPlan = 0
      if (vPlan && vPlan > 0) { planTot += vPlan; nsForPlan += v }
      if (ePlan && ePlan > 0) { planTot += ePlan; nsForPlan += e }
      const ach = planTot > 0 ? Math.round(nsForPlan / planTot * 100) : null
      return {
        fy, 'VGT NS': Math.round(v), 'ECT NS': Math.round(e), ns: Math.round(ns),
        'VGT OP': Math.round(vOp), 'ECT OP': Math.round(eOp), op: Math.round(op),
        dm: Math.round(dm), dmPct: ns ? Math.round(dm / ns * 100) : null,
        opPct: ns ? Math.round(op / ns * 1000) / 10 : null,
        ach, planNs: planTot ? Math.round(planTot) : null,
      }
    }).filter(Boolean)
  }, [fySummary, period])

  const ibLatest = iberiaHist[iberiaHist.length - 1]
  const ibAch = useMemo(() => iberiaHist.filter(d => d.ach !== null), [iberiaHist])

  // Budget achievement data (only years with plan)
  const achData = useMemo(() =>
    histData.filter(d => d.planNs !== null && d.ach !== null)
  , [histData])

  // SG&A rubrica years available for the active BU
  const sgaYears = useMemo(() =>
    [...new Set(sga.filter(r => r.bu === histBU).map(r => r.fiscal_year))].sort()
  , [sga, histBU])

  // Default the SG&A year to the latest available
  useEffect(() => {
    if (sgaYears.length && (!sgaYear || !sgaYears.includes(sgaYear))) {
      setSgaYear(sgaYears[sgaYears.length - 1])
    }
  }, [sgaYears, sgaYear])

  // SG&A rubricas for the selected year, with variance
  const sgaRubricas = useMemo(() => {
    const rows = sga.filter(r => r.bu === histBU && r.fiscal_year === sgaYear)
      .map(r => {
        const plan = Number(r.plan) || 0
        const actual = Number(r.actual) || 0
        const variance = Math.round((actual - plan) * 10) / 10
        const pct = plan !== 0 ? Math.round((actual - plan) / Math.abs(plan) * 100) : null
        return { rubrica: r.rubrica, plan, actual, variance, pct }
      })
    const sorted = [...rows].sort((a, b) =>
      sgaSort === 'pct'
        ? Math.abs(b.pct ?? 0) - Math.abs(a.pct ?? 0)
        : Math.abs(b.variance) - Math.abs(a.variance)
    )
    const totPlan = rows.reduce((s, r) => s + r.plan, 0)
    const totActual = rows.reduce((s, r) => s + r.actual, 0)
    const maxAbs = Math.max(1, ...rows.map(r => Math.abs(r.variance)))
    return { sorted, totPlan: Math.round(totPlan), totActual: Math.round(totActual),
             totVar: Math.round(totActual - totPlan), maxAbs }
  }, [sga, sgaYear, sgaSort, histBU])

  const hasSga = sgaYears.length > 0

  if (loading) return (
    <div className="flex items-center justify-center p-16">
      <div className="w-6 h-6 border-2 border-navy border-t-transparent rounded-full animate-spin"/>
    </div>
  )

  if (profile?.role === 'distributor') {
    return <DistributorHistory profile={profile} />
  }

  const showVGT = activeBU === 'both' || activeBU === 'VGT'
  const showECT = activeBU === 'both' || activeBU === 'ECT'
  const showFullHistory = period !== 'recent' && hasHist

  // Per-BU colour for the headline series (VGT green / ECT orange)
  const histColor = histBU === 'ECT' ? '#D85A30' : '#1D9E75'

  // Determine if legacy/inherited band should show (only when pre-break years are visible)
  const showLegacyBand = period === 'full' && histData.some(d => fyNum(d.fy) < fyNum(brk.year))

  return (
    <div className="p-4 space-y-5 max-w-5xl mx-auto">

      {/* Header */}
      <div className="flex flex-col gap-3 pt-1">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900">History</h1>
            <p className="text-sm text-gray-400">
              {PERIOD_PRESETS[period].label} · {activeBU === 'both' ? 'Iberia' : histBU} actuals
            </p>
          </div>
          {isAdmin && (
            <div className="flex gap-1.5">
              {['both','VGT','ECT'].map(b => (
                <button key={b} onClick={() => setActiveBU(b)}
                  className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                    activeBU === b
                      ? b === 'VGT' ? 'bg-vgt text-white'
                      : b === 'ECT' ? 'bg-ect text-white'
                      : 'bg-navy text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}>
                  {b === 'both' ? 'Iberia' : b}
                </button>
              ))}
            </div>
          )}
        </div>
        {/* Period presets */}
        <div className="flex gap-1.5">
          {Object.entries(PERIOD_PRESETS).map(([key, { label }]) => (
            <button key={key} onClick={() => setPeriod(key)}
              className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                period === key
                  ? 'bg-navy text-white'
                  : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
              }`}>
              {label}
              {key === 'compare' && <span className="ml-1 text-micro opacity-70">≈</span>}
            </button>
          ))}
        </div>
      </div>

      {/* ── BU FULL HISTORY MODE (VGT or ECT) ── */}
      {showFullHistory && activeBU !== 'both' && (
        <>
          {/* Sparkline KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiSparkCard label="Net Sales" color={histColor}
              value={latest ? `${tickK(latest.ns)}€` : '—'}
              sub={eraCagr !== null ? `CAGR ${brk.year}+: ${eraCagr.toFixed(1)}%` : null}
              data={histData} dataKey="ns"/>
            <KpiSparkCard label="DM%" color="#185FA5"
              value={latest?.dmPct != null ? `${latest.dmPct}%` : '—'}
              sub={prev?.dmPct != null ? `prev: ${prev.dmPct}%` : null}
              data={histData} dataKey="dmPct"/>
            <KpiSparkCard label="Op. Income" color="#0D2137"
              value={latest ? `${tickK(latest.op)}€` : '—'}
              sub={latest?.opPct != null ? `${latest.opPct}% margin` : null}
              data={histData} dataKey="op"/>
            <KpiSparkCard label="Budget Ach." color={latest?.ach >= 100 ? '#1D9E75' : '#D85A30'}
              value={latest?.ach != null ? `${latest.ach}%` : '—'}
              sub={(() => {
                const hits = achData.filter(d => d.ach >= 100).length
                return achData.length > 0 ? `${hits}/${achData.length} years ≥100%` : null
              })()}
              data={achData} dataKey="ach"/>
          </div>

          {/* 13-year NS + OP evolution */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <div className="flex items-center justify-between mb-1 flex-wrap gap-1">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                {histBU} · Net Sales &amp; Operating Income · K€
              </p>
              <p className="text-micro text-gray-400">
                <span className="text-gray-500">━ NS</span> · <span className="text-gray-500">┄ OP</span>
              </p>
            </div>
            {showLegacyBand && (
              <p className="text-micro text-amber-600 mb-2">{brk.note}</p>
            )}
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={histData} margin={{ top:12, right:12, left:-8, bottom:0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false}/>
                {showLegacyBand && (
                  <ReferenceArea x1={histData[0]?.fy} x2={`FY${fyNum(brk.year) - 1}`}
                    fill="#0D2137" fillOpacity={0.04} ifOverflow="extendDomain"/>
                )}
                {showLegacyBand && (
                  <ReferenceLine x={brk.year} stroke="#94a3b8" strokeDasharray="4 4"
                    label={{ value: brk.tag, position:'top', fontSize:9, fill:'#94a3b8' }}/>
                )}
                <XAxis dataKey="fy" tick={{ fontSize:10, fill:'#475569' }} axisLine={false} tickLine={false}
                  angle={-45} textAnchor="end" height={40}/>
                <YAxis tick={{ fontSize:10, fill:'#94a3b8' }} axisLine={false} tickLine={false}
                  tickFormatter={tickK}/>
                <Tooltip contentStyle={{ ...TOOLTIP, border:'1px solid #e2e8f0', boxShadow:'0 4px 12px rgba(0,0,0,0.08)' }}
                  formatter={(v,n) => [`€${Number(v).toLocaleString('pt-PT')}K`, n]}/>
                <Legend wrapperStyle={{ fontSize:11 }} iconType="plainline"/>
                <ReferenceLine y={0} stroke="#e2e8f0"/>
                <Line type="monotone" dataKey="ns" stroke={histColor} strokeWidth={3} name="Net Sales"
                  dot={{ r:3, fill: histColor }} activeDot={{ r:5 }}/>
                <Line type="monotone" dataKey="op" stroke="#0D2137" strokeWidth={2} name="Op. Income"
                  strokeDasharray="5 4" dot={{ r:2.5, fill:'#fff', stroke:'#0D2137', strokeWidth:2 }}/>
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Budget Achievement */}
          {achData.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-1">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  {histBU} · Budget Achievement %
                </p>
                <p className="text-micro text-gray-400">Target: 100%</p>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={achData} margin={{ top:8, right:8, left:-12, bottom:0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false}/>
                  <XAxis dataKey="fy" tick={{ fontSize:10, fill:'#475569' }} axisLine={false} tickLine={false}
                    angle={-45} textAnchor="end" height={40}/>
                  <YAxis tick={{ fontSize:10, fill:'#94a3b8' }} axisLine={false} tickLine={false}
                    domain={[70, 130]} tickFormatter={v => `${v}%`}/>
                  <Tooltip contentStyle={{ ...TOOLTIP, border:'1px solid #e2e8f0' }}
                    formatter={(v) => [`${v}%`, 'Achievement']}/>
                  <ReferenceLine y={100} stroke="#475569" strokeDasharray="3 3"
                    label={{ value:'100%', position:'right', fontSize:9, fill:'#475569' }}/>
                  <Bar dataKey="ach" name="Achievement %" radius={[4,4,0,0]} barSize={28}>
                    {achData.map((d, i) => (
                      <Cell key={i} fill={d.ach >= 100 ? '#1D9E75' : d.ach >= 95 ? '#F59E0B' : '#D85A30'}/>
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Internal vs External (full history) */}
          {histData.some(d => d.Internal > 0) && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-1">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  {histBU} · Internal vs External Net Sales · K€
                </p>
                <p className="text-micro text-gray-400">
                  Internal %: {histData.filter(d => d.intPct > 0).map(d => `${d.fy} ${d.intPct}%`).join(' · ')}
                </p>
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <ComposedChart data={histData} margin={{ top:8, right:30, left:-8, bottom:0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false}/>
                  <XAxis dataKey="fy" tick={{ fontSize:10, fill:'#475569' }} axisLine={false} tickLine={false}
                    angle={-45} textAnchor="end" height={40}/>
                  <YAxis yAxisId="left" tick={{ fontSize:10, fill:'#94a3b8' }} axisLine={false} tickLine={false}
                    tickFormatter={tickK}/>
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize:10, fill:'#94a3b8' }}
                    axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} domain={[0, 50]}/>
                  <Tooltip contentStyle={{ ...TOOLTIP, border:'1px solid #e2e8f0' }}
                    formatter={(v,n) => [n === 'Int %' ? `${v}%` : `€${Number(v).toLocaleString('pt-PT')}K`, n]}/>
                  <Legend wrapperStyle={{ fontSize:11 }}/>
                  <Bar yAxisId="left" dataKey="External" stackId="ns" fill="#1D9E75" name="External" barSize={20}/>
                  <Bar yAxisId="left" dataKey="Internal" stackId="ns" fill="#185FA5" name="Internal" barSize={20} radius={[3,3,0,0]}/>
                  <Line yAxisId="right" type="monotone" dataKey="intPct" stroke="#D85A30" strokeWidth={2} name="Int %"
                    dot={{ r:2.5, fill:'#D85A30' }} strokeDasharray="4 3"/>
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* SG&A Budget Variance (rubricas) */}
          {hasSga && (
            <CollapsibleSection
              title="SG&A Budget Variance"
              subtitle={`${histBU} · ${sgaYear} · Plan vs Actual by rubrica · K€`}
              defaultOpen={false}>
              <div className="space-y-4">
                {/* Year selector + totals */}
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div className="flex gap-1.5">
                    {sgaYears.map(y => (
                      <button key={y} onClick={() => setSgaYear(y)}
                        className={`text-xs px-3 py-1.5 rounded-lg font-medium transition-colors ${
                          sgaYear === y ? 'bg-navy text-white' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                        }`}>{y}</button>
                    ))}
                  </div>
                  <div className="text-right">
                    <p className="text-micro text-gray-400 uppercase tracking-wide">Total SG&amp;A</p>
                    <p className="text-sm font-semibold text-gray-700">
                      Plan {sgaRubricas.totPlan.toLocaleString('pt-PT')}K · Act {sgaRubricas.totActual.toLocaleString('pt-PT')}K
                      <span className={`ml-1 ${sgaRubricas.totVar <= 0 ? 'text-green-600' : 'text-ect'}`}>
                        ({sgaRubricas.totVar > 0 ? '+' : ''}{sgaRubricas.totVar}K)
                      </span>
                    </p>
                  </div>
                </div>

                <p className="text-micro text-gray-400">
                  Diverging bar: <span className="text-green-600 font-medium">green = under budget</span> ·{' '}
                  <span className="text-ect font-medium">orange = over budget</span> (cost lines)
                </p>

                {/* Sort toggle */}
                <div className="flex gap-1.5">
                  {[['abs','By € variance'],['pct','By % variance']].map(([k,lbl]) => (
                    <button key={k} onClick={() => setSgaSort(k)}
                      className={`text-micro px-2.5 py-1 rounded-md font-medium transition-colors ${
                        sgaSort === k ? 'bg-navy/10 text-navy' : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                      }`}>{lbl}</button>
                  ))}
                </div>

                {/* Diverging variance rows */}
                <div className="space-y-1.5">
                  {(sgaAll ? sgaRubricas.sorted : sgaRubricas.sorted.slice(0, 6)).map(r => {
                    const over = r.variance > 0
                    const widthPct = Math.min(50, Math.abs(r.variance) / sgaRubricas.maxAbs * 50)
                    return (
                      <div key={r.rubrica} className="flex items-center gap-2 text-xs">
                        <p className="w-28 sm:w-36 truncate text-gray-600 shrink-0" title={r.rubrica}>{r.rubrica}</p>
                        {/* center-anchored diverging bar */}
                        <div className="flex-1 flex items-center h-5 min-w-0">
                          <div className="flex-1 flex justify-end">
                            {!over && (
                              <div className="h-3 rounded-l bg-vgt" style={{ width: `${widthPct * 2}%` }}/>
                            )}
                          </div>
                          <div className="w-px h-4 bg-gray-300 shrink-0"/>
                          <div className="flex-1 flex justify-start">
                            {over && (
                              <div className="h-3 rounded-r bg-ect" style={{ width: `${widthPct * 2}%` }}/>
                            )}
                          </div>
                        </div>
                        <p className={`w-12 text-right font-medium shrink-0 ${over ? 'text-ect' : 'text-green-600'}`}>
                          {r.variance > 0 ? '+' : ''}{r.variance}
                        </p>
                        <p className={`w-10 text-right text-micro shrink-0 ${over ? 'text-ect/70' : 'text-green-600/70'}`}>
                          {r.pct !== null ? `${r.pct > 0 ? '+' : ''}${r.pct}%` : '—'}
                        </p>
                      </div>
                    )
                  })}
                </div>

                {sgaRubricas.sorted.length > 6 && (
                  <button onClick={() => setSgaAll(!sgaAll)}
                    className="text-xs text-navy font-medium hover:underline">
                    {sgaAll ? 'Show top 6 only' : `Show all ${sgaRubricas.sorted.length} rubricas`}
                  </button>
                )}

                {/* Detail table */}
                <div className="overflow-x-auto -mx-4 px-4">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-100">
                        <th className="text-left px-3 py-2 font-semibold text-gray-500">Rubrica</th>
                        <th className="px-3 py-2 font-semibold text-gray-500 text-right">Plan</th>
                        <th className="px-3 py-2 font-semibold text-gray-500 text-right">Actual</th>
                        <th className="px-3 py-2 font-semibold text-gray-500 text-right">Var</th>
                        <th className="px-3 py-2 font-semibold text-gray-500 text-right">%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {sgaRubricas.sorted.map(r => {
                        const over = r.variance > 0
                        return (
                          <tr key={r.rubrica} className="border-b border-gray-50">
                            <td className="px-3 py-1.5 text-gray-600">{r.rubrica}</td>
                            <td className="px-3 py-1.5 text-right text-gray-500">{r.plan.toLocaleString('pt-PT')}</td>
                            <td className="px-3 py-1.5 text-right text-gray-700">{r.actual.toLocaleString('pt-PT')}</td>
                            <td className={`px-3 py-1.5 text-right font-medium ${over ? 'text-ect' : 'text-green-600'}`}>
                              {r.variance > 0 ? '+' : ''}{r.variance}
                            </td>
                            <td className={`px-3 py-1.5 text-right ${over ? 'text-ect/70' : 'text-green-600/70'}`}>
                              {r.pct !== null ? `${r.pct > 0 ? '+' : ''}${r.pct}%` : '—'}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </CollapsibleSection>
          )}

          {/* Annual summary table */}
          <CollapsibleSection title="Annual Summary Table" subtitle={`${histBU} · K€`} defaultOpen={false}>
            <div className="overflow-x-auto -mx-4 px-4">
              <table className="w-full text-xs whitespace-nowrap">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-3 py-2 font-semibold text-gray-500 sticky left-0 bg-gray-50 z-10">FY</th>
                    <th className="px-3 py-2 font-semibold text-gray-500 text-right">Net Sales</th>
                    <th className="px-3 py-2 font-semibold text-gray-500 text-right">Plan NS</th>
                    <th className="px-3 py-2 font-semibold text-gray-500 text-right">Ach.%</th>
                    <th className="px-3 py-2 font-semibold text-gray-500 text-right">DM</th>
                    <th className="px-3 py-2 font-semibold text-gray-500 text-right">DM%</th>
                    <th className="px-3 py-2 font-semibold text-gray-500 text-right">Op.Inc</th>
                    <th className="px-3 py-2 font-semibold text-gray-500 text-right">Int%</th>
                  </tr>
                </thead>
                <tbody>
                  {histData.map((d, i) => {
                    const isLegacy = fyNum(d.fy) < fyNum(brk.year)
                    return (
                      <tr key={d.fy} className={`border-b border-gray-50 ${isLegacy ? 'bg-gray-50/50' : ''} ${d.fy === brk.year ? 'border-t-2 border-t-amber-300' : ''}`}>
                        <td className={`px-3 py-1.5 font-semibold sticky left-0 z-10 ${isLegacy ? 'text-gray-400 bg-gray-50/50' : 'text-gray-700 bg-white'}`}>{d.fy}</td>
                        <td className="px-3 py-1.5 text-right font-medium text-gray-700">{d.ns.toLocaleString('pt-PT')}</td>
                        <td className="px-3 py-1.5 text-right text-gray-500">{d.planNs ? d.planNs.toLocaleString('pt-PT') : '—'}</td>
                        <td className={`px-3 py-1.5 text-right font-medium ${d.ach === null ? 'text-gray-300' : d.ach >= 100 ? 'text-green-600' : d.ach >= 95 ? 'text-amber-600' : 'text-red-500'}`}>
                          {d.ach !== null ? `${d.ach}%` : '—'}
                        </td>
                        <td className="px-3 py-1.5 text-right text-gray-600">{d.dm.toLocaleString('pt-PT')}</td>
                        <td className="px-3 py-1.5 text-right text-gray-500">{d.dmPct != null ? `${d.dmPct}%` : '—'}</td>
                        <td className={`px-3 py-1.5 text-right font-medium ${d.op < 0 ? 'text-red-500' : 'text-gray-700'}`}>{d.op.toLocaleString('pt-PT')}</td>
                        <td className="px-3 py-1.5 text-right text-gray-500">{d.intPct}%</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </CollapsibleSection>
        </>
      )}

      {/* ── IBERIA FULL HISTORY MODE (VGT + ECT consolidated) ── */}
      {showFullHistory && activeBU === 'both' && (
        <>
          {/* Sparkline KPI Cards (Iberia totals) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <KpiSparkCard label="Iberia Net Sales" color="#0D2137"
              value={ibLatest ? `${tickK(ibLatest.ns)}€` : '—'}
              sub={ibLatest ? `VGT ${tickK(ibLatest['VGT NS'])} · ECT ${tickK(ibLatest['ECT NS'])}` : null}
              data={iberiaHist} dataKey="ns"/>
            <KpiSparkCard label="Iberia DM%" color="#185FA5"
              value={ibLatest?.dmPct != null ? `${ibLatest.dmPct}%` : '—'}
              sub="Combined rate" data={iberiaHist} dataKey="dmPct"/>
            <KpiSparkCard label="Iberia Op. Income" color="#0D2137"
              value={ibLatest ? `${tickK(ibLatest.op)}€` : '—'}
              sub={ibLatest?.opPct != null ? `${ibLatest.opPct}% margin` : null}
              data={iberiaHist} dataKey="op"/>
            <KpiSparkCard label="Budget Ach." color={ibLatest?.ach >= 100 ? '#1D9E75' : '#D85A30'}
              value={ibLatest?.ach != null ? `${ibLatest.ach}%` : '—'}
              sub={ibAch.length ? `${ibAch.filter(d => d.ach >= 100).length}/${ibAch.length} yrs ≥100%` : null}
              data={ibAch} dataKey="ach"/>
          </div>

          {/* Consolidated NS + OP evolution */}
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
            <div className="flex items-center justify-between mb-1 flex-wrap gap-1">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                Iberia · Net Sales (VGT + ECT) &amp; Op. Income · K€
              </p>
              <p className="text-micro text-gray-400">━ NS · ┄ Iberia OP</p>
            </div>
            {period === 'full' && (
              <p className="text-micro text-amber-600 mb-2">
                ⚠ Scope breaks: VGT at FY18 (accounts), ECT at FY22 (takeover). Pre-break years not directly comparable.
              </p>
            )}
            <ResponsiveContainer width="100%" height={300}>
              <ComposedChart data={iberiaHist} margin={{ top:12, right:12, left:-8, bottom:0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false}/>
                {period === 'full' && (
                  <ReferenceLine x="FY18" stroke="#cbd5e1" strokeDasharray="4 4"
                    label={{ value:'VGT ↗', position:'top', fontSize:9, fill:'#1D9E75' }}/>
                )}
                {period === 'full' && (
                  <ReferenceLine x="FY22" stroke="#cbd5e1" strokeDasharray="4 4"
                    label={{ value:'ECT ↗', position:'top', fontSize:9, fill:'#D85A30' }}/>
                )}
                <XAxis dataKey="fy" tick={{ fontSize:10, fill:'#475569' }} axisLine={false} tickLine={false}
                  angle={-45} textAnchor="end" height={40}/>
                <YAxis tick={{ fontSize:10, fill:'#94a3b8' }} axisLine={false} tickLine={false}
                  tickFormatter={tickK}/>
                <Tooltip contentStyle={{ ...TOOLTIP, border:'1px solid #e2e8f0', boxShadow:'0 4px 12px rgba(0,0,0,0.08)' }}
                  formatter={(v,n) => [`€${Number(v).toLocaleString('pt-PT')}K`, n]}/>
                <Legend wrapperStyle={{ fontSize:11 }} iconType="plainline"/>
                <ReferenceLine y={0} stroke="#e2e8f0"/>
                <Line type="monotone" dataKey="VGT NS" stroke="#1D9E75" strokeWidth={2} name="VGT NS"
                  dot={{ r:2.5, fill:'#1D9E75' }}/>
                <Line type="monotone" dataKey="ECT NS" stroke="#D85A30" strokeWidth={2} name="ECT NS"
                  dot={{ r:2.5, fill:'#D85A30' }}/>
                <Line type="monotone" dataKey="ns" stroke="#0D2137" strokeWidth={3} name="Iberia NS"
                  dot={{ r:3, fill:'#0D2137' }} activeDot={{ r:5 }}/>
                <Line type="monotone" dataKey="op" stroke="#0D2137" strokeWidth={2} name="Iberia OP"
                  strokeDasharray="5 4" dot={{ r:2.5, fill:'#fff', stroke:'#0D2137', strokeWidth:2 }}/>
              </ComposedChart>
            </ResponsiveContainer>
          </div>

          {/* Iberia Budget Achievement */}
          {ibAch.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-1">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  Iberia · Budget Achievement %
                </p>
                <p className="text-micro text-gray-400">Target: 100%</p>
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={ibAch} margin={{ top:8, right:8, left:-12, bottom:0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false}/>
                  <XAxis dataKey="fy" tick={{ fontSize:10, fill:'#475569' }} axisLine={false} tickLine={false}
                    angle={-45} textAnchor="end" height={40}/>
                  <YAxis tick={{ fontSize:10, fill:'#94a3b8' }} axisLine={false} tickLine={false}
                    domain={[70, 130]} tickFormatter={v => `${v}%`}/>
                  <Tooltip contentStyle={{ ...TOOLTIP, border:'1px solid #e2e8f0' }}
                    formatter={(v) => [`${v}%`, 'Achievement']}/>
                  <ReferenceLine y={100} stroke="#475569" strokeDasharray="3 3"
                    label={{ value:'100%', position:'right', fontSize:9, fill:'#475569' }}/>
                  <Bar dataKey="ach" name="Achievement %" radius={[4,4,0,0]} barSize={28}>
                    {ibAch.map((d, i) => (
                      <Cell key={i} fill={d.ach >= 100 ? '#1D9E75' : d.ach >= 95 ? '#F59E0B' : '#D85A30'}/>
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Iberia annual table */}
          <CollapsibleSection title="Annual Summary Table" subtitle="Iberia (VGT + ECT) · K€" defaultOpen={false}>
            <div className="overflow-x-auto -mx-4 px-4">
              <table className="w-full text-xs whitespace-nowrap">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-3 py-2 font-semibold text-gray-500 sticky left-0 bg-gray-50 z-10">FY</th>
                    <th className="px-3 py-2 font-semibold text-gray-500 text-right">VGT NS</th>
                    <th className="px-3 py-2 font-semibold text-gray-500 text-right">ECT NS</th>
                    <th className="px-3 py-2 font-semibold text-gray-700 text-right">Iberia NS</th>
                    <th className="px-3 py-2 font-semibold text-gray-500 text-right">DM</th>
                    <th className="px-3 py-2 font-semibold text-gray-500 text-right">DM%</th>
                    <th className="px-3 py-2 font-semibold text-gray-500 text-right">Op.Inc</th>
                    <th className="px-3 py-2 font-semibold text-gray-500 text-right">Ach.%</th>
                  </tr>
                </thead>
                <tbody>
                  {iberiaHist.map(d => (
                    <tr key={d.fy} className="border-b border-gray-50">
                      <td className="px-3 py-1.5 font-semibold text-gray-700 sticky left-0 bg-white z-10">{d.fy}</td>
                      <td className="px-3 py-1.5 text-right text-vgt">{d['VGT NS'].toLocaleString('pt-PT')}</td>
                      <td className="px-3 py-1.5 text-right text-ect">{d['ECT NS'].toLocaleString('pt-PT')}</td>
                      <td className="px-3 py-1.5 text-right font-bold text-navy">{d.ns.toLocaleString('pt-PT')}</td>
                      <td className="px-3 py-1.5 text-right text-gray-600">{d.dm.toLocaleString('pt-PT')}</td>
                      <td className="px-3 py-1.5 text-right text-gray-500">{d.dmPct != null ? `${d.dmPct}%` : '—'}</td>
                      <td className={`px-3 py-1.5 text-right font-medium ${d.op < 0 ? 'text-red-500' : 'text-gray-700'}`}>{d.op.toLocaleString('pt-PT')}</td>
                      <td className={`px-3 py-1.5 text-right font-medium ${d.ach === null ? 'text-gray-300' : d.ach >= 100 ? 'text-green-600' : d.ach >= 95 ? 'text-amber-600' : 'text-red-500'}`}>
                        {d.ach !== null ? `${d.ach}%` : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CollapsibleSection>
        </>
      )}

      {/* ── RECENT MODE (FY23–25 with ECT) ── */}
      {period === 'recent' && (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {activeBU !== 'ECT' && (
              <>
                <KpiBox label="VGT Net Sales" value={formatK(totals.vgt.ns * 1000)}
                  sub={`GM: ${formatK(totals.vgt.gm * 1000)}`} color="#1D9E75"/>
                <KpiBox label="VGT GM%" value={`${totals.vgt.ns > 0 ? (totals.vgt.gm/totals.vgt.ns*100).toFixed(1) : '—'}%`}
                  sub="Gross Margin rate" color="#1D9E75"/>
              </>
            )}
            {activeBU !== 'VGT' && (
              <>
                <KpiBox label="ECT Net Sales" value={formatK(totals.ect.ns * 1000)}
                  sub={`GM: ${formatK(totals.ect.gm * 1000)}`} color="#D85A30"/>
                <KpiBox label="ECT GM%" value={`${totals.ect.ns > 0 ? (totals.ect.gm/totals.ect.ns*100).toFixed(1) : '—'}%`}
                  sub="Gross Margin rate" color="#D85A30"/>
              </>
            )}
            {activeBU === 'both' && (
              <>
                <KpiBox label="Iberia Net Sales" value={formatK(totals.total.ns * 1000)}
                  sub={`GM: ${formatK(totals.total.gm * 1000)}`} color="#0D2137"/>
                <KpiBox label="Iberia GM%" value={`${totals.total.ns > 0 ? (totals.total.gm/totals.total.ns*100).toFixed(1) : '—'}%`}
                  sub="Combined rate" color="#0D2137"/>
              </>
            )}
          </div>

          {/* 3-Year Evolution (FY23–FY25) */}
          {fySummary.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
              <div className="flex items-center justify-between mb-3 flex-wrap gap-1">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                  Net Sales &amp; Operating Profit · FY23–FY25
                </p>
                <p className="text-micro text-gray-400">
                  K€ · <span className="text-gray-500">━ Net Sales</span> · <span className="text-gray-500">┄ Op. Profit</span>
                </p>
              </div>
              <ResponsiveContainer width="100%" height={300}>
                <ComposedChart data={evolution} margin={{ top:12, right:12, left:-8, bottom:0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false}/>
                  <XAxis dataKey="fy" tick={{ fontSize:12, fontWeight:600, fill:'#475569' }} axisLine={false} tickLine={false}/>
                  <YAxis tick={{ fontSize:10, fill:'#94a3b8' }} axisLine={false} tickLine={false}
                    tickFormatter={tickK}/>
                  <Tooltip contentStyle={{ ...TOOLTIP, border:'1px solid #e2e8f0', boxShadow:'0 4px 12px rgba(0,0,0,0.08)' }}
                    formatter={(v,n) => [`€${Number(v).toLocaleString('pt-PT')}K`, n]}/>
                  <Legend wrapperStyle={{ fontSize:11 }} iconType="plainline"/>
                  <ReferenceLine y={0} stroke="#e2e8f0"/>
                  {showVGT && <Line type="monotone" dataKey="VGT NS" stroke="#1D9E75" strokeWidth={3}
                    dot={{ r:4, fill:'#1D9E75' }} activeDot={{ r:6 }}/>}
                  {showECT && <Line type="monotone" dataKey="ECT NS" stroke="#D85A30" strokeWidth={3}
                    dot={{ r:4, fill:'#D85A30' }} activeDot={{ r:6 }}/>}
                  {showVGT && <Line type="monotone" dataKey="VGT OP" stroke="#1D9E75" strokeWidth={2}
                    strokeDasharray="5 4" dot={{ r:3, fill:'#fff', stroke:'#1D9E75', strokeWidth:2 }}/>}
                  {showECT && <Line type="monotone" dataKey="ECT OP" stroke="#D85A30" strokeWidth={2}
                    strokeDasharray="5 4" dot={{ r:3, fill:'#fff', stroke:'#D85A30', strokeWidth:2 }}/>}
                  {activeBU === 'both' && <Line type="monotone" dataKey="Iberia NS" stroke="#0D2137" strokeWidth={3}
                    dot={{ r:4, fill:'#0D2137' }} activeDot={{ r:6 }}/>}
                  {activeBU === 'both' && <Line type="monotone" dataKey="Iberia OP" stroke="#0D2137" strokeWidth={2}
                    strokeDasharray="5 4" dot={{ r:3, fill:'#fff', stroke:'#0D2137', strokeWidth:2 }}/>}
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* VGT Int vs Ext (FY23–FY25) */}
          {showVGT && (() => {
            const ie = ['FY23','FY24','FY25'].map(fy => {
              const row = fySummary.find(r => r.fiscal_year === fy && r.bu === 'VGT')
              const intl = Math.round(Number(row?.ns_int) || 0)
              const ext = Math.round(Number(row?.ns_ext) || 0)
              const tot = intl + ext
              return { fy, Internal: intl, External: ext, intPct: tot > 0 ? Math.round(intl / tot * 100) : 0 }
            })
            const hasIE = ie.some(d => d.Internal > 0 || d.External > 0)
            if (!hasIE) return null
            return (
              <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
                <div className="flex items-center justify-between mb-3 flex-wrap gap-1">
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                    VGT · Internal vs External Net Sales · K€
                  </p>
                  <p className="text-micro text-gray-400">
                    Internal % FY23–25: {ie.map(d => `${d.intPct}%`).join(' → ')}
                  </p>
                </div>
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={ie} barSize={56} margin={{ top:8, right:8, left:-8, bottom:0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false}/>
                    <XAxis dataKey="fy" tick={{ fontSize:12, fontWeight:600, fill:'#475569' }} axisLine={false} tickLine={false}/>
                    <YAxis tick={{ fontSize:10, fill:'#94a3b8' }} axisLine={false} tickLine={false}
                      tickFormatter={tickK}/>
                    <Tooltip contentStyle={{ ...TOOLTIP, border:'1px solid #e2e8f0', boxShadow:'0 4px 12px rgba(0,0,0,0.08)' }}
                      formatter={(v,n) => [`€${Number(v).toLocaleString('pt-PT')}K`, n]}/>
                    <Legend wrapperStyle={{ fontSize:11 }}/>
                    <Bar dataKey="External" stackId="ns" fill="#1D9E75" radius={[0,0,0,0]}/>
                    <Bar dataKey="Internal" stackId="ns" fill="#185FA5" radius={[4,4,0,0]}/>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )
          })()}
        </>
      )}

      {/* ── FY25 MONTHLY DETAIL (always shown) ── */}
      <CollapsibleSection title="FY25 Monthly Detail" subtitle="Net Sales & Gross Margin · K€" defaultOpen={period === 'recent'}>
        <div className="space-y-5">
          {/* Monthly Net Sales chart */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
              Monthly Net Sales · K€ · FY25
            </p>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={monthlyChart} barGap={2} margin={{ top:4, right:4, left:-20, bottom:0 }}>
                <XAxis dataKey="month" tick={{ fontSize:10 }} axisLine={false} tickLine={false}/>
                <YAxis tick={{ fontSize:10 }} axisLine={false} tickLine={false}/>
                <Tooltip contentStyle={TOOLTIP} formatter={(v,n) => [`€${v}K`, n]}/>
                <Legend wrapperStyle={{ fontSize:10 }}/>
                {showVGT && <Bar dataKey="VGT NS" fill="#1D9E75" radius={[3,3,0,0]}/>}
                {showECT && <Bar dataKey="ECT NS" fill="#D85A30" radius={[3,3,0,0]}/>}
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Monthly GM chart */}
          <div>
            <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">
              Monthly Gross Margin · K€ · FY25
            </p>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={monthlyChart} barGap={2} margin={{ top:4, right:4, left:-20, bottom:0 }}>
                <XAxis dataKey="month" tick={{ fontSize:10 }} axisLine={false} tickLine={false}/>
                <YAxis tick={{ fontSize:10 }} axisLine={false} tickLine={false}/>
                <Tooltip contentStyle={TOOLTIP} formatter={(v,n) => [`€${v}K`, n]}/>
                <Legend wrapperStyle={{ fontSize:10 }}/>
                {showVGT && <Bar dataKey="VGT GM" fill="#9FE1CB" radius={[3,3,0,0]}/>}
                {showECT && <Bar dataKey="ECT GM" fill="#F5C4B3" radius={[3,3,0,0]}/>}
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Monthly table */}
          <div className="overflow-x-auto -mx-4 px-4">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-2 font-semibold text-gray-500 w-20 sm:w-28 text-micro sm:text-xs">Metric</th>
                  {MONTHS.map(m => (
                    <th key={m} className="px-2 py-2 font-semibold text-gray-500 text-center w-10 sm:w-12 text-micro sm:text-xs">{m}</th>
                  ))}
                  <th className="px-3 py-2 font-semibold text-gray-700 text-center">FY25</th>
                </tr>
              </thead>
              <tbody>
                {showVGT && (
                  <>
                    <tr className="border-b border-gray-50">
                      <td className="px-4 py-2 font-semibold text-vgt text-micro sm:text-xs">VGT NS</td>
                      {MONTHS_K.map(m => (
                        <td key={m} className="px-1 py-2 text-center text-gray-700 text-tiny">
                          {get('VGT','ns',m).toFixed(1)}
                        </td>
                      ))}
                      <td className="px-2 py-2 text-center font-bold text-vgt text-tiny">
                        {totals.vgt.ns.toFixed(1)}
                      </td>
                    </tr>
                    <tr className="border-b border-gray-100 bg-gray-50/50">
                      <td className="px-4 py-2 text-vgt/70 text-micro sm:text-xs">VGT GM</td>
                      {MONTHS_K.map(m => (
                        <td key={m} className={`px-2 py-2 text-center ${get('VGT','gm',m) < 0 ? 'text-red-500' : 'text-gray-500'}`}>
                          {get('VGT','gm',m).toFixed(1)}
                        </td>
                      ))}
                      <td className="px-3 py-2 text-center font-bold text-vgt/80">
                        {totals.vgt.gm.toFixed(1)}
                      </td>
                    </tr>
                  </>
                )}
                {showECT && (
                  <>
                    <tr className="border-b border-gray-50">
                      <td className="px-4 py-2 font-semibold text-ect text-micro sm:text-xs">ECT NS</td>
                      {MONTHS_K.map(m => (
                        <td key={m} className="px-1 py-2 text-center text-gray-700 text-tiny">
                          {get('ECT','ns',m).toFixed(1)}
                        </td>
                      ))}
                      <td className="px-3 py-2 text-center font-bold text-ect">
                        {totals.ect.ns.toFixed(1)}
                      </td>
                    </tr>
                    <tr className="border-b border-gray-100 bg-gray-50/50">
                      <td className="px-4 py-2 text-ect/70 text-micro sm:text-xs">ECT GM</td>
                      {MONTHS_K.map(m => (
                        <td key={m} className={`px-2 py-2 text-center ${get('ECT','gm',m) < 0 ? 'text-red-500' : 'text-gray-500'}`}>
                          {get('ECT','gm',m).toFixed(1)}
                        </td>
                      ))}
                      <td className="px-3 py-2 text-center font-bold text-ect/80">
                        {totals.ect.gm.toFixed(1)}
                      </td>
                    </tr>
                  </>
                )}
                {activeBU === 'both' && (
                  <tr className="bg-navy/5 font-bold">
                    <td className="px-4 py-2 text-navy text-micro sm:text-xs">Iberia NS</td>
                    {MONTHS_K.map(m => (
                      <td key={m} className="px-2 py-2 text-center text-navy">
                        {(get('VGT','ns',m) + get('ECT','ns',m)).toFixed(1)}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-center text-navy">
                      {totals.total.ns.toFixed(1)}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </CollapsibleSection>
    </div>
  )
}

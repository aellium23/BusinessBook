import { useMemo, useEffect, useState } from 'react'
import { useDeals } from '../hooks/useDeals'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { formatK } from '../components/ui'
import {
  ComposedChart, BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Legend, ReferenceLine, Cell
} from 'recharts'

const MONTHS_K = ['apr','may','jun','jul','aug','sep','oct','nov','dec','jan','feb','mar']
const MONTHS   = ['Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar']

// ── Current FY month index (0=Apr, 1=May, ... 11=Mar) ────────────────────
function getFYMonthIndex() {
  const m = new Date().getMonth() + 1
  return (m - 4 + 12) % 12
}
const MONTHS_LABEL = ['Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar']

function pct(value, reference) {
  if (!reference || reference === 0) return null
  return ((value - reference) / Math.abs(reference) * 100)
}

function PctBadge({ value, reference, label }) {
  const p = pct(value, reference)
  if (p === null) return null
  const positive = p >= 0
  return (
    <span className={`inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-0.5 rounded ${
      positive ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'
    }`}>
      {positive ? '▲' : '▼'} {Math.abs(p).toFixed(1)}% vs {label}
    </span>
  )
}

function BUPerformanceCard({ bu, color, label, actMTD, actYTD, planMTD, planYTD, pyMTD, pyYTD, cycle, mtdLabel, ytdLabel }) {
  function Bar({ value, max, c }) {
    const p = max > 0 ? Math.min(value/max*100, 140) : 0
    return (
      <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all"
          style={{ width:`${Math.min(p,100)}%`, background: p > 100 ? '#1D9E75' : c }}/>
      </div>
    )
  }
  return (
    <div className="bg-white rounded-xl border-2 shadow-sm overflow-hidden" style={{ borderColor: color }}>
      <div className="px-4 pt-3 pb-2 flex items-center justify-between" style={{ background: `${color}12` }}>
        <div>
          <p className="text-xs font-bold" style={{ color }}>{label}</p>
          <p className="text-[10px] text-gray-400">{cycle} · {new Date().toLocaleString('en',{month:'short',year:'numeric'})}</p>
        </div>
        <span className="text-[10px] text-gray-400">K€</span>
      </div>
      <div className="px-4 py-3 border-b border-gray-50">
        <div className="flex items-start justify-between mb-1.5">
          <div>
            <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Actuals · {mtdLabel}</p>
            <p className="text-2xl font-bold text-gray-900">{formatK(actMTD*1000)}</p>
          </div>
          <div className="text-right space-y-0.5 mt-1">
            <PctBadge value={actMTD} reference={planMTD} label="Plan"/>
            <div/><PctBadge value={actMTD} reference={pyMTD} label="PY"/>
          </div>
        </div>
        <Bar value={actMTD} max={planMTD} c={color}/>
        <div className="flex justify-between text-[9px] text-gray-400 mt-0.5">
          <span>Plan: {formatK(planMTD*1000)}</span><span>PY: {formatK(pyMTD*1000)}</span>
        </div>
      </div>
      <div className="px-4 py-3">
        <div className="flex items-start justify-between mb-1.5">
          <div>
            <p className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide">Actuals YTD · {ytdLabel}</p>
            <p className="text-2xl font-bold text-gray-900">{formatK(actYTD*1000)}</p>
          </div>
          <div className="text-right space-y-0.5 mt-1">
            <PctBadge value={actYTD} reference={planYTD} label="Plan"/>
            <div/><PctBadge value={actYTD} reference={pyYTD} label="PY"/>
          </div>
        </div>
        <Bar value={actYTD} max={planYTD} c={color}/>
        <div className="flex justify-between text-[9px] text-gray-400 mt-0.5">
          <span>Plan: {formatK(planYTD*1000)}</span><span>PY: {formatK(pyYTD*1000)}</span>
        </div>
      </div>
    </div>
  )
}

function PerformanceSection({ deals, budget, fy25, activeCycle, isAdmin }) {
  const fyIdx = getFYMonthIndex()
  const curMonth = MONTHS_K[fyIdx]
  const ytdMonths = MONTHS_K.slice(0, fyIdx + 1)
  const mtdLabel = MONTHS_LABEL[fyIdx]
  const ytdLabel = fyIdx === 0 ? MONTHS_LABEL[0] : `${MONTHS_LABEL[0]}–${MONTHS_LABEL[fyIdx]}`

  function sumDeals(bu, months) {
    return deals.filter(d=>d.bu===bu&&d.stage==='Invoiced'&&!d.is_intercompany_mirror)
      .reduce((s,d)=>{
        const rate = (!d.currency||d.currency==='EUR') ? 1 : (d.exchange_rate||1)
        const monthSum = months.reduce((ms,m)=>ms+(d[m]||0),0)
        // Fallback: if monthly fields empty but value_total set, use value_total
        const val = (monthSum === 0 && d.value_total > 0) ? d.value_total : monthSum
        return s + val * rate
      },0)/1000
  }
  function sumPlan(bu, months) {
    return ['ns_int','ns_ext'].reduce((s,key)=>{
      const row=budget.find(r=>r.bu===bu&&r.cycle===activeCycle&&r.pl_key===key)
      return s+months.reduce((ms,m)=>ms+(row?.[m]||0),0)
    },0)
  }
  function sumPY(bu, months) {
    const row=fy25.find(r=>r.bu===bu&&r.pl_key==='ns')
    return row ? months.reduce((s,m)=>s+(row[m]||0),0) : 0
  }

  const cards = ['VGT','ECT'].map(bu=>({
    bu, label: bu==='VGT'?'VGT · Portugal':'ECT · Spain',
    color: bu==='VGT'?'#1D9E75':'#D85A30',
    actMTD:  sumDeals(bu,[curMonth]),
    actYTD:  sumDeals(bu,ytdMonths),
    planMTD: sumPlan(bu,[curMonth]),
    planYTD: sumPlan(bu,ytdMonths),
    pyMTD:   sumPY(bu,[curMonth]),
    pyYTD:   sumPY(bu,ytdMonths),
  }))

  const iberia = {
    bu:'ALL', label:'Iberia · Consolidated', color:'#0D2137',
    actMTD:  cards.reduce((s,c)=>s+c.actMTD,0),
    actYTD:  cards.reduce((s,c)=>s+c.actYTD,0),
    planMTD: cards.reduce((s,c)=>s+c.planMTD,0),
    planYTD: cards.reduce((s,c)=>s+c.planYTD,0),
    pyMTD:   cards.reduce((s,c)=>s+c.pyMTD,0),
    pyYTD:   cards.reduce((s,c)=>s+c.pyYTD,0),
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Sales performance · {activeCycle} · MTD & YTD</p>
        <span className="text-[10px] text-gray-400">MTD: <strong>{mtdLabel}</strong> · YTD: <strong>{ytdLabel}</strong></span>
      </div>
      <div className="grid grid-cols-1 gap-3">
        {cards.map(c=><BUPerformanceCard key={c.bu} {...c} cycle={activeCycle} mtdLabel={mtdLabel} ytdLabel={ytdLabel}/>)}
      </div>
      {isAdmin && <BUPerformanceCard {...iberia} cycle={activeCycle} mtdLabel={mtdLabel} ytdLabel={ytdLabel}/>}
    </div>
  )
}

// ── KPI card with vs Plan + vs PY ─────────────────────────────────────────
function KpiCard({ label, value, plan, py, color = 'gray' }) {
  const vsPlan = plan  > 0 ? (value / plan  - 1) * 100 : null
  const vsPY   = py    > 0 ? (value / py    - 1) * 100 : null
  const border = { teal:'border-t-2 border-vgt', coral:'border-t-2 border-ect',
                   blue:'border-t-2 border-blue-400', green:'border-t-2 border-green-400', gray:'' }

  return (
    <div className={`bg-white rounded-xl border border-gray-200 shadow-sm p-3 ${border[color]}`}>
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{label}</p>
      <p className="text-xl font-bold text-gray-900 mt-0.5">{formatK(value)}</p>
      <div className="flex gap-2 mt-1.5 flex-wrap">
        {vsPlan !== null && (
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
            vsPlan >= 0 ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-600'}`}>
            {vsPlan >= 0 ? '+' : ''}{vsPlan.toFixed(1)}% vs Plan
          </span>
        )}
        {vsPY !== null && (
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${
            vsPY >= 0 ? 'bg-blue-50 text-blue-700' : 'bg-orange-50 text-orange-600'}`}>
            {vsPY >= 0 ? '+' : ''}{vsPY.toFixed(1)}% vs PY
          </span>
        )}
      </div>
    </div>
  )
}

const TOOLTIP_STYLE = { fontSize: 11, borderRadius: 8 }
const WEIGHTS = { Lead: 0.10, Pipeline: 0.30, 'Offer Presented': 0.60, BackLog: 0.80, Invoiced: 1.0, Lost: 0 }
const AGING_DAYS = 90

// ── Current FY month index (0=Apr, 1=May, ... 11=Mar) ────────────────────
export default function Dashboard() {
  const { profile, isAdmin } = useAuth()
  const { deals, loading }   = useDeals()
  const [budget, setBudget]  = useState([])
  const [fy25, setFy25]      = useState([])

  // Load budget from DB
  useEffect(() => {
    supabase.from('budget').select('*').then(({ data }) => setBudget(data || []))
    supabase.from('fy25_actuals').select('*').then(({ data }) => setFy25(data || []))
  }, [])

  // Determine active cycle
  const activeCycle = useMemo(() => {
    const m = new Date().getMonth() + 1
    if (m >= 4 && m <= 6) return 'BUD'
    if (m >= 7) return 'EST1'
    return 'EST2'
  }, [])

  const [selectedCycle, setSelectedCycle] = useState(null)
  const displayCycle = selectedCycle || activeCycle

  // Budget totals per BU
  const budgetTotals = useMemo(() => {
    const get = (bu, key) => {
      const row = budget.find(r => r.bu === bu && r.cycle === activeCycle && r.pl_key === key)
      if (!row) return 0
      return MONTHS_K.reduce((s, m) => s + (row[m] || 0), 0)
    }
    return {
      vgt_ns: get('VGT','ns_int') + get('VGT','ns_ext'),
      ect_ns: get('ECT','ns_int') + get('ECT','ns_ext'),
      vgt_gm: (get('VGT','ns_int') + get('VGT','ns_ext')) - get('VGT','cogs'),
      ect_gm: (get('ECT','ns_int') + get('ECT','ns_ext')) - get('ECT','cogs'),
    }
  }, [budget, activeCycle])

  // FY25 actuals per BU
  const fy25Totals = useMemo(() => {
    const get = (bu) => {
      const rows = fy25.filter(r => r.bu === bu)
      return rows.reduce((s, r) => s + MONTHS_K.reduce((ms, m) => ms + (r[m] || 0), 0), 0)
    }
    return { vgt: get('VGT'), ect: get('ECT') }
  }, [fy25])

  // Deal aggregates
  const agg = useMemo(() => {
    const result = {
      vgt_fc:0, ect_fc:0, vgt_act:0, ect_act:0,
      vgt_bl:0, ect_bl:0, vgt_pipe:0, ect_pipe:0,
      vgt_gm:0, ect_gm:0,
    }
    deals.forEach(d => {
      if (d.is_intercompany_mirror) return
      const bu = d.bu?.toLowerCase()
      if (!bu) return
      // Currency conversion to EUR
      const rate = (!d.currency || d.currency === 'EUR') ? 1 : (d.exchange_rate || 1)
      // Monthly sum — for SLA deals with empty months, fall back to value_total
      const fyRaw = MONTHS_K.reduce((s, m) => s + (d[m] || 0), 0)
      const fy = (fyRaw === 0 && d.value_total > 0) ? d.value_total : fyRaw
      const fyEUR = fy * rate
      const valEUR = (d.value_total || 0) * rate
      if (['BackLog','Invoiced'].includes(d.stage)) result[`${bu}_fc`]   += fyEUR / 1000
      if (d.stage === 'Invoiced')                   result[`${bu}_act`]  += fyEUR / 1000
      if (d.stage === 'BackLog')                    result[`${bu}_bl`]   += fyEUR / 1000
      if (d.stage === 'Pipeline' || d.stage === 'Offer Presented') result[`${bu}_pipe`] += valEUR / 1000
      if (['BackLog','Invoiced'].includes(d.stage)) result[`${bu}_gm`]   += (fyEUR / 1000) * (d.gm_pct || 0)
    })
    return result
  }, [deals])

  // Monthly chart data — per BU
  const monthlyDataByBU = useMemo(() => {
    const getPlan = (bu, m_idx, cycle) => {
      let plan = 0
      ;['ns_int','ns_ext'].forEach(key => {
        const row = budget.find(r => r.bu === bu && r.cycle === cycle && r.pl_key === key)
        if (row) plan += row[MONTHS_K[m_idx]] || 0
      })
      return plan
    }
    const getPY = (bu, m_idx) => {
      return fy25.filter(r => r.bu === bu && r.pl_key === 'ns')
        .reduce((s, r) => s + (r[MONTHS_K[m_idx]] || 0), 0)
    }
    return ['VGT','ECT'].reduce((acc, bu) => {
      acc[bu] = MONTHS.map((m, i) => {
        let actuals = 0, forecast = 0
        deals.forEach(d => {
          if (d.is_intercompany_mirror || d.bu !== bu) return
          const v = d[MONTHS_K[i]] || 0
          if (d.stage === 'Invoiced') actuals += v / 1000
          else if (d.stage === 'BackLog') forecast += v / 1000
        })
        return {
          month: m,
          Actuals:  Math.round(actuals * 10) / 10,
          Forecast: Math.round(forecast * 10) / 10,
          Plan:     Math.round(getPlan(bu, i, displayCycle) * 10) / 10,
          FY25:     Math.round(getPY(bu, i) * 10) / 10,
        }
      })
      return acc
    }, {})
  }, [deals, budget, fy25, displayCycle])

  // Funnel analytics
  const funnelAnalytics = useMemo(() => {
    const active = deals.filter(d => !d.is_intercompany_mirror)
    const now = Date.now()

    // Weighted forecast — uses deal-level win_probability if set, else stage default
    const weighted = active.reduce((s, d) => {
      const fy = MONTHS_K.reduce((ms,m)=>ms+(d[m]||0),0)
      const base = ['BackLog','Invoiced'].includes(d.stage) ? fy : (d.value_total||0)
      const prob = d.win_probability !== null && d.win_probability !== undefined
        ? d.win_probability / 100
        : (WEIGHTS[d.stage]||0)
      return s + base * prob
    }, 0)

    // Win rate
    const closed = active.filter(d => ['Invoiced','Lost'].includes(d.stage))
    const won    = active.filter(d => d.stage === 'Invoiced')
    const winRate = closed.length > 0 ? Math.round(won.length / closed.length * 100) : null

    // Aging alerts (Lead/Pipeline > 90 days)
    const aged = active.filter(d => {
      if (!['Lead','Pipeline','Offer Presented'].includes(d.stage)) return false
      const ref = d.stage_changed_at || d.updated_at || d.created_at
      if (!ref) return false
      return (now - new Date(ref).getTime()) / 86400000 >= AGING_DAYS
    })

    // Avg deal velocity (days from created to Invoiced)
    const invoiced = active.filter(d => d.stage === 'Invoiced' && d.created_at && d.stage_changed_at)
    const avgVelocity = invoiced.length > 0
      ? Math.round(invoiced.reduce((s,d) =>
          s + (new Date(d.stage_changed_at) - new Date(d.created_at)) / 86400000, 0
        ) / invoiced.length)
      : null

    // Lost reasons breakdown
    const lostDeals = active.filter(d => d.stage === 'Lost' && d.lost_reason)
    const lostReasons = lostDeals.reduce((acc, d) => {
      acc[d.lost_reason] = (acc[d.lost_reason]||0) + 1
      return acc
    }, {})

    // Product breakdown
    const productBreakdown = active.filter(d => d.product && !['Lost'].includes(d.stage))
      .reduce((acc, d) => {
        if (!acc[d.product]) acc[d.product] = { count:0, value:0 }
        acc[d.product].count++
        acc[d.product].value += (d.value_total||0)
        return acc
      }, {})

    // Distributor pipeline
    const distDeals = active.filter(d => d.distributor)
    const distPending = active.filter(d => d.discount_status === 'pending')

    return { weighted, winRate, aged, avgVelocity, lostReasons, wonCount: won.length, closedCount: closed.length, productBreakdown, distDeals, distPending }
  }, [deals])

  // Region breakdown
  const regionData = useMemo(() => {
    const r = {}
    deals.forEach(d => {
      if (!d.region || d.is_intercompany_mirror) return
      const fy = MONTHS_K.reduce((s, m) => s + (d[m] || 0), 0)
      if (['BackLog','Invoiced'].includes(d.stage))
        r[d.region] = (r[d.region] || 0) + fy / 1000
    })
    return Object.entries(r).sort((a,b) => b[1]-a[1])
      .map(([region, value]) => ({ region, value: Math.round(value/1000*10)/10 }))
  }, [deals])

  const REGION_COLOR = { Europe:'#B5D4F4', MEA:'#FAC775', LATAM:'#C0DD97', APAC:'#F4C0D1', NA:'#D3D1C7' }
  const total_fc = agg.vgt_fc + agg.ect_fc
  const total_act = agg.vgt_act + agg.ect_act
  const total_plan = budgetTotals.vgt_ns + budgetTotals.ect_ns
  const total_py = fy25Totals.vgt + fy25Totals.ect

  if (loading) return (
    <div className="flex items-center justify-center p-16">
      <div className="w-6 h-6 border-2 border-navy border-t-transparent rounded-full animate-spin"/>
    </div>
  )

  return (
    <div className="p-4 space-y-5 max-w-5xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between pt-1">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-400">FY26 · Apr 2026 – Mar 2027 · Active cycle:
            <span className="ml-1 px-1.5 py-0.5 rounded text-xs font-bold bg-blue-100 text-blue-800">{activeCycle}</span>
          </p>
        </div>
        <div className="flex gap-1.5">
          {isAdmin && (
            <>
              <span className="inline-flex px-2 py-0.5 rounded text-xs font-bold bg-vgt text-white">
                VGT {formatK(agg.vgt_fc)}
              </span>
              <span className="text-gray-300 text-sm">+</span>
              <span className="inline-flex px-2 py-0.5 rounded text-xs font-bold bg-ect text-white">
                ECT {formatK(agg.ect_fc)}
              </span>
            </>
          )}
        </div>
      </div>

      {/* ── PERFORMANCE MTD / YTD ─────────────────────────────────────────── */}
      <PerformanceSection
        deals={deals} budget={budget} fy25={fy25}
        activeCycle={activeCycle} isAdmin={isAdmin}
      />

      {/* ── MONTHLY EVOLUTION — VGT + ECT separate ───────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        {/* Cycle selector */}
        <div className="flex items-center justify-between mb-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Monthly sales · K€</p>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-gray-400">Plan cycle:</span>
            {['BUD','EST1','EST2'].map(c => (
              <button key={c} onClick={() => setSelectedCycle(c)}
                className={`text-xs px-2 py-0.5 rounded font-bold transition-colors ${
                  displayCycle === c
                    ? c==='BUD' ? 'bg-blue-200 text-blue-900'
                    : c==='EST1' ? 'bg-green-200 text-green-900'
                    : 'bg-amber-200 text-amber-900'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}>
                {c}{activeCycle===c ? ' ●' : ''}
              </button>
            ))}
          </div>
        </div>

        {/* Legend */}
        <div className="flex gap-4 text-[10px] text-gray-400 mb-3">
          <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm inline-block" style={{background:'#1D9E75'}}/>Actuals</span>
          <span className="flex items-center gap-1"><span className="w-3 h-2 rounded-sm bg-blue-200 inline-block"/>Forecast</span>
          <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-gray-400 inline-block"/>Plan ({displayCycle})</span>
          <span className="flex items-center gap-1"><span className="w-3 h-0.5 border-t-2 border-dashed border-purple-400 inline-block"/>FY25</span>
        </div>

        {/* Two charts side by side on desktop, stacked on mobile */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {[
            { bu: 'VGT', label: 'VGT · Portugal', actColor: '#1D9E75', fcColor: '#9FE1CB' },
            { bu: 'ECT', label: 'ECT · Spain',    actColor: '#D85A30', fcColor: '#F5C4B3' },
          ].map(({ bu, label, actColor, fcColor }) => (
            <div key={bu}>
              <p className="text-xs font-semibold mb-2" style={{ color: actColor }}>{label}</p>
              <ResponsiveContainer width="100%" height={180}>
                <ComposedChart data={monthlyDataByBU[bu] || []} barGap={2}
                  margin={{ top:4, right:4, left:-24, bottom:0 }}>
                  <XAxis dataKey="month" tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 9 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={TOOLTIP_STYLE}
                    formatter={(v, name) => [`€${v}K`, name]} />
                  <Bar dataKey="Actuals"  fill={actColor} radius={[3,3,0,0]} />
                  <Bar dataKey="Forecast" fill={fcColor}  radius={[3,3,0,0]} />
                  <Line dataKey="Plan" type="monotone" stroke="#9CA3AF"
                    strokeWidth={1.5} dot={false} />
                  <Line dataKey="FY25" type="monotone" stroke="#A78BFA"
                    strokeWidth={1.5} strokeDasharray="4 2" dot={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          ))}
        </div>
      </div>

      {/* ── VGT vs ECT SPLIT ──────────────────────────────────────────────── */}
      {isAdmin && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">VGT vs ECT · Forecast FY26</p>
          <div className="grid grid-cols-2 gap-6 mb-3">
            {[['VGT','vgt','#1D9E75'],['ECT','ect','#D85A30']].map(([label,key,color]) => (
              <div key={label}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-gray-600">{label}</span>
                  <span className="text-xs font-bold" style={{ color }}>{formatK(agg[`${key}_fc`])}</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all"
                    style={{ width: `${total_fc > 0 ? Math.min(agg[`${key}_fc`]/total_fc*100,100) : 0}%`, background: color }}/>
                </div>
                <div className="flex justify-between mt-1">
                  <span className="text-[10px] text-gray-400">
                    Plan: {formatK(key === 'vgt' ? budgetTotals.vgt_ns : budgetTotals.ect_ns)}
                  </span>
                  <span className="text-[10px] text-gray-400">
                    {total_fc > 0 ? Math.round(agg[`${key}_fc`]/total_fc*100) : 0}% of total
                  </span>
                </div>
              </div>
            ))}
          </div>
          <div className="h-3 rounded-full overflow-hidden bg-gray-100 flex">
            <div className="bg-vgt transition-all"
              style={{ width: `${total_fc > 0 ? agg.vgt_fc/total_fc*100 : 50}%` }}/>
            <div className="bg-ect flex-1"/>
          </div>
        </div>
      )}

      {/* ── REGION BREAKDOWN ──────────────────────────────────────────────── */}
      {regionData.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Revenue by region · Forecast K€</p>
          <ResponsiveContainer width="100%" height={Math.max(120, regionData.length * 36)}>
            <BarChart data={regionData} layout="vertical"
              margin={{ top:0, right:60, left:40, bottom:0 }}>
              <XAxis type="number" tick={{ fontSize:10 }} axisLine={false} tickLine={false}/>
              <YAxis type="category" dataKey="region" tick={{ fontSize:10 }} axisLine={false} tickLine={false} width={50}/>
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={v => [`€${v}K`, 'Forecast']}/>
              <Bar dataKey="value" radius={[0,4,4,0]} label={{ position:'right', fontSize:10 }}>
                {regionData.map(({ region }) => (
                  <Cell key={region} fill={REGION_COLOR[region] || '#D3D1C7'}/>
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* ── FUNNEL ANALYTICS ─────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 space-y-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Funnel analytics</p>

        {/* KPI row */}
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-purple-50 rounded-lg p-3">
            <p className="text-[10px] text-purple-500 font-semibold uppercase tracking-wide">Weighted forecast</p>
            <p className="text-lg font-bold text-purple-700 mt-0.5">{formatK(funnelAnalytics.weighted)}</p>
            <p className="text-[10px] text-purple-400">Uses deal win % or stage default</p>
          </div>
          <div className={`rounded-lg p-3 ${funnelAnalytics.winRate !== null ? (funnelAnalytics.winRate >= 50 ? 'bg-green-50' : 'bg-amber-50') : 'bg-gray-50'}`}>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Win rate</p>
            <p className={`text-lg font-bold mt-0.5 ${funnelAnalytics.winRate !== null ? (funnelAnalytics.winRate >= 50 ? 'text-green-700' : 'text-amber-700') : 'text-gray-400'}`}>
              {funnelAnalytics.winRate !== null ? `${funnelAnalytics.winRate}%` : '—'}
            </p>
            <p className="text-[10px] text-gray-400">{funnelAnalytics.wonCount} won / {funnelAnalytics.closedCount} closed</p>
          </div>
          <div className={`rounded-lg p-3 ${funnelAnalytics.aged.length > 0 ? 'bg-red-50' : 'bg-gray-50'}`}>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">Aging alerts</p>
            <p className={`text-lg font-bold mt-0.5 ${funnelAnalytics.aged.length > 0 ? 'text-red-700' : 'text-gray-400'}`}>
              {funnelAnalytics.aged.length} deal{funnelAnalytics.aged.length !== 1 ? 's' : ''}
            </p>
            <p className="text-[10px] text-gray-400">Lead/Pipeline &gt;{AGING_DAYS}d</p>
          </div>
          <div className="bg-blue-50 rounded-lg p-3">
            <p className="text-[10px] text-blue-500 font-semibold uppercase tracking-wide">Avg velocity</p>
            <p className="text-lg font-bold text-blue-700 mt-0.5">
              {funnelAnalytics.avgVelocity !== null ? `${funnelAnalytics.avgVelocity}d` : '—'}
            </p>
            <p className="text-[10px] text-blue-400">Created → Invoiced</p>
          </div>
        </div>

        {/* Aging deals list */}
        {funnelAnalytics.aged.length > 0 && (
          <div className="border border-red-200 rounded-lg overflow-hidden">
            <div className="bg-red-50 px-3 py-2 flex items-center gap-2">
              <span className="text-xs font-semibold text-red-700">⚠ Deals stalled &gt;{AGING_DAYS} days</span>
            </div>
            {funnelAnalytics.aged.slice(0,5).map(d => {
              const ref = d.stage_changed_at || d.updated_at || d.created_at
              const days = ref ? Math.floor((Date.now() - new Date(ref).getTime()) / 86400000) : 0
              return (
                <div key={d.id} className="flex items-center justify-between px-3 py-2 border-t border-red-100">
                  <div>
                    <p className="text-xs font-medium text-gray-900">{d.client}</p>
                    <p className="text-[10px] text-gray-400">{d.stage} · {d.sales_owner || '—'}</p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs font-bold text-red-700 bg-red-100 px-2 py-0.5 rounded">{days}d</span>
                    <p className="text-[10px] text-gray-400 mt-0.5">{formatK(d.value_total)}</p>
                  </div>
                </div>
              )
            })}
            {funnelAnalytics.aged.length > 5 && (
              <div className="px-3 py-2 text-xs text-gray-400 border-t border-red-100 text-center">
                +{funnelAnalytics.aged.length - 5} more stalled deals
              </div>
            )}
          </div>
        )}

        {/* Product breakdown */}
        {Object.keys(funnelAnalytics.productBreakdown).length > 0 && (
          <div>
            <p className="text-xs text-gray-400 font-medium mb-2">Active pipeline by product</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(funnelAnalytics.productBreakdown).sort((a,b)=>b[1].value-a[1].value).map(([product, { count, value }]) => (
                <span key={product} className="text-xs bg-navy/10 text-navy px-2 py-1 rounded-lg font-medium">
                  {product} · {count} deal{count!==1?'s':''} · {formatK(value)}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Distributor pending discounts */}
        {funnelAnalytics.distPending.length > 0 && (
          <div className="border border-purple-200 rounded-lg overflow-hidden">
            <div className="bg-purple-50 px-3 py-2">
              <span className="text-xs font-semibold text-purple-700">
                ⏳ {funnelAnalytics.distPending.length} discount request{funnelAnalytics.distPending.length!==1?'s':''} pending approval
              </span>
            </div>
            {funnelAnalytics.distPending.slice(0,3).map(d => (
              <div key={d.id} className="flex items-center justify-between px-3 py-2 border-t border-purple-100">
                <div>
                  <p className="text-xs font-medium text-gray-900">{d.end_customer || d.client}</p>
                  <p className="text-[10px] text-gray-400">{d.distributor} · {d.product}</p>
                </div>
                <div className="text-right">
                  <span className="text-xs font-bold text-purple-700 bg-purple-100 px-2 py-0.5 rounded">
                    -{d.discount_requested}% req.
                  </span>
                  <p className="text-[10px] text-gray-400 mt-0.5">{formatK(d.end_customer_value||d.value_total)}</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Lost reasons */}
        {Object.keys(funnelAnalytics.lostReasons).length > 0 && (
          <div>
            <p className="text-xs text-gray-400 font-medium mb-2">Lost reasons</p>
            <div className="flex flex-wrap gap-2">
              {Object.entries(funnelAnalytics.lostReasons).sort((a,b)=>b[1]-a[1]).map(([reason, count]) => (
                <span key={reason} className="text-xs bg-red-50 text-red-700 px-2 py-1 rounded-lg">
                  {reason} ({count})
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── SALES FUNNEL ──────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Sales funnel</p>
        <div className="space-y-2">
          {[
            { label:'Lead',            value: deals.filter(d=>d.stage==='Lead'&&!d.is_intercompany_mirror).reduce((s,d)=>s+(d.value_total||0)/1000,0), color:'#F4C0D1', text:'#4B1528' },
            { label:'Pipeline',        value: agg.vgt_pipe+agg.ect_pipe, color:'#FAC775', text:'#412402' },
            { label:'Offer Presented', value: deals.filter(d=>d.stage==='Offer Presented'&&!d.is_intercompany_mirror).reduce((s,d)=>s+(d.value_total||0)/1000,0), color:'#C4B5FD', text:'#3B1278' },
            { label:'BackLog',         value: agg.vgt_bl+agg.ect_bl,     color:'#B5D4F4', text:'#042C53' },
            { label:'Invoiced',        value: total_act,                  color:'#C0DD97', text:'#173404' },
          ].map(({ label, value, color, text }) => {
            const maxVal = deals.filter(d=>d.stage==='Lead'&&!d.is_intercompany_mirror).reduce((s,d)=>s+(d.value_total||0)/1000,0) || total_act || 1
            const pct = Math.max(8, (value / maxVal) * 100)
            return (
              <div key={label} className="flex items-center gap-3">
                <span className="text-xs text-gray-500 w-14 text-right">{label}</span>
                <div className="flex-1 h-6 bg-gray-50 rounded-lg overflow-hidden">
                  <div className="h-full rounded-lg flex items-center px-2 transition-all"
                    style={{ width: `${pct}%`, background: color, minWidth: 60 }}>
                    <span className="text-xs font-bold" style={{ color: text }}>{formatK(value)}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

    </div>
  )
}

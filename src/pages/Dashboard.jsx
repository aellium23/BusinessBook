import { useMemo, useEffect, useState } from 'react'
import { useDeals } from '../hooks/useDeals'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { formatK } from '../components/ui'
import {
  BarChart, Bar, LineChart, Line, XAxis, YAxis, Tooltip,
  ResponsiveContainer, Legend, ReferenceLine, Cell
} from 'recharts'

const MONTHS_K = ['apr','may','jun','jul','aug','sep','oct','nov','dec','jan','feb','mar']
const MONTHS   = ['Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar']

// ── Gauge chart (SVG semi-circle) ─────────────────────────────────────────
function Gauge({ value, max, label, sub, color = '#1D9E75', size = 160 }) {
  const pct    = max > 0 ? Math.min(value / max, 1.4) : 0
  const angle  = pct * 180
  const r      = size * 0.38
  const cx     = size / 2
  const cy     = size * 0.56
  const toRad  = a => (a - 180) * Math.PI / 180
  const x1 = cx + r * Math.cos(toRad(0))
  const y1 = cy + r * Math.sin(toRad(0))
  const x2 = cx + r * Math.cos(toRad(angle))
  const y2 = cy + r * Math.sin(toRad(angle))
  const large = angle > 180 ? 1 : 0
  const pctDisplay = max > 0 ? ((value / max - 1) * 100).toFixed(1) : '—'
  const isOver = value > max
  const trackColor = '#E5E7EB'

  return (
    <div className="flex flex-col items-center">
      <svg width={size} height={size * 0.62} viewBox={`0 0 ${size} ${size * 0.62}`}>
        {/* Track */}
        <path
          d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
          fill="none" stroke={trackColor} strokeWidth={size * 0.08} strokeLinecap="round"
        />
        {/* Value arc */}
        {pct > 0 && (
          <path
            d={`M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`}
            fill="none" stroke={isOver ? '#1D9E75' : color}
            strokeWidth={size * 0.08} strokeLinecap="round"
          />
        )}
        {/* Centre value */}
        <text x={cx} y={cy - 2} textAnchor="middle"
          style={{ fontSize: size * 0.14, fontWeight: 700, fill: '#111827', fontFamily: 'Arial' }}>
          {formatK(value)}
        </text>
        {/* Plan label */}
        <text x={cx} y={cy + size * 0.1} textAnchor="middle"
          style={{ fontSize: size * 0.085, fill: '#9CA3AF', fontFamily: 'Arial' }}>
          Plan {formatK(max)}
        </text>
      </svg>
      <p className="text-xs font-semibold text-gray-600 -mt-1">{label}</p>
      <span className={`text-xs font-bold mt-0.5 px-2 py-0.5 rounded-full ${
        isOver ? 'bg-green-100 text-green-700' : value > 0 ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-500'
      }`}>
        {pctDisplay !== '—' ? `${isOver ? '+' : ''}${pctDisplay}% vs Plan` : '—'}
      </span>
      {sub && <p className="text-[10px] text-gray-400 mt-0.5">{sub}</p>}
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
      const fy = MONTHS_K.reduce((s, m) => s + (d[m] || 0), 0)
      const bu = d.bu?.toLowerCase()
      if (!bu) return
      if (['BackLog','Invoiced'].includes(d.stage)) result[`${bu}_fc`] += fy / 1000
      if (d.stage === 'Invoiced') result[`${bu}_act`] += fy / 1000
      if (d.stage === 'BackLog')  result[`${bu}_bl`]  += fy / 1000
      if (d.stage === 'Pipeline') result[`${bu}_pipe`] += (d.value_total || 0) / 1000
      if (['BackLog','Invoiced'].includes(d.stage)) result[`${bu}_gm`] += (fy / 1000) * (d.gm_pct || 0)
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

      {/* ── GAUGE CHARTS ──────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-4">Sales YTD vs Plan</p>
        <div className={`grid gap-4 ${isAdmin ? 'grid-cols-3' : 'grid-cols-2'}`}>
          {isAdmin && (
            <Gauge value={total_act} max={total_plan}
              label="Total Iberia" color="#0D2137" size={150}
              sub={`Forecast: ${formatK(total_fc)}`}
            />
          )}
          <Gauge value={agg.vgt_act} max={budgetTotals.vgt_ns}
            label="VGT · Portugal" color="#1D9E75" size={150}
            sub={`FC: ${formatK(agg.vgt_fc)}`}
          />
          <Gauge value={agg.ect_act} max={budgetTotals.ect_ns}
            label="ECT · Spain" color="#D85A30" size={150}
            sub={`FC: ${formatK(agg.ect_fc)}`}
          />
        </div>
      </div>

      {/* ── KPI CARDS ─────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Actuals (Invoiced)"
          value={total_act} plan={total_plan} py={total_py} color="teal" />
        <KpiCard label="Forecast FY26"
          value={total_fc} plan={total_plan} py={total_py} color="blue" />
        <KpiCard label="BackLog"
          value={agg.vgt_bl + agg.ect_bl} plan={null} py={null} color="gray" />
        <KpiCard label="Pipeline"
          value={agg.vgt_pipe + agg.ect_pipe} plan={null} py={null} color="gray" />
      </div>

      {/* GM KPIs */}
      {(budgetTotals.vgt_gm > 0 || budgetTotals.ect_gm > 0) && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <KpiCard label="VGT Gross Margin"
            value={agg.vgt_gm} plan={budgetTotals.vgt_gm} py={null} color="teal" />
          <KpiCard label="ECT Gross Margin"
            value={agg.ect_gm} plan={budgetTotals.ect_gm} py={null} color="coral" />
          <div className="bg-white rounded-xl border border-gray-200 p-3">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">VGT GM%</p>
            <p className="text-xl font-bold text-vgt mt-0.5">
              {agg.vgt_fc > 0 ? (agg.vgt_gm / agg.vgt_fc * 100).toFixed(1) : '—'}%
            </p>
            <p className="text-[10px] text-gray-400 mt-1">
              Plan: {budgetTotals.vgt_ns > 0 ? (budgetTotals.vgt_gm / budgetTotals.vgt_ns * 100).toFixed(1) : '—'}%
            </p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-3">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">ECT GM%</p>
            <p className="text-xl font-bold text-ect mt-0.5">
              {agg.ect_fc > 0 ? (agg.ect_gm / agg.ect_fc * 100).toFixed(1) : '—'}%
            </p>
            <p className="text-[10px] text-gray-400 mt-1">
              Plan: {budgetTotals.ect_ns > 0 ? (budgetTotals.ect_gm / budgetTotals.ect_ns * 100).toFixed(1) : '—'}%
            </p>
          </div>
        </div>
      )}

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
                <BarChart data={monthlyDataByBU[bu] || []} barGap={2}
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
                </BarChart>
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

      {/* ── SALES FUNNEL ──────────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Sales funnel</p>
        <div className="space-y-2">
          {[
            { label:'Lead',     value: deals.filter(d=>d.stage==='Lead'&&!d.is_intercompany_mirror).reduce((s,d)=>s+(d.value_total||0)/1000,0), color:'#F4C0D1', text:'#4B1528' },
            { label:'Pipeline', value: agg.vgt_pipe+agg.ect_pipe, color:'#FAC775', text:'#412402' },
            { label:'BackLog',  value: agg.vgt_bl+agg.ect_bl,     color:'#B5D4F4', text:'#042C53' },
            { label:'Invoiced', value: total_act,                  color:'#C0DD97', text:'#173404' },
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

import { useMemo } from 'react'
import { useDeals } from '../hooks/useDeals'
import { useAuth } from '../hooks/useAuth'
import { KpiCard, Spinner, formatK } from '../components/ui'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, LineChart, Line } from 'recharts'
import { TrendingUp } from 'lucide-react'

const MONTHS = ['Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar']
const MONTHS_K = ['apr','may','jun','jul','aug','sep','oct','nov','dec','jan','feb','mar']

const STAGE_COLOR = { Lead:'#F4C0D1', Pipeline:'#FAC775', BackLog:'#B5D4F4', Invoiced:'#C0DD97' }
const REGION_COLOR = { Europe:'#B5D4F4', MEA:'#FAC775', LATAM:'#C0DD97', APAC:'#F4C0D1', NA:'#D3D1C7' }

function FunnelBar({ label, value, total, color }) {
  const pct = total > 0 ? Math.max(4, (value / total) * 100) : 4
  return (
    <div className="flex-1 min-w-0">
      <div className="h-2 rounded-full mb-1.5 transition-all" style={{ width: `${pct}%`, background: color, minWidth: 4 }} />
      <p className="text-[10px] text-gray-500 truncate">{label}</p>
      <p className="text-sm font-bold text-gray-900">{formatK(value)}</p>
    </div>
  )
}

export default function Dashboard() {
  const { profile, isAdmin } = useAuth()
  const { deals, loading, totals } = useDeals()

  const buFilter = useMemo(() => {
    if (isAdmin) return null
    return profile?.role?.toUpperCase()
  }, [profile, isAdmin])

  // Monthly actuals + forecast
  const monthlyData = useMemo(() => {
    return MONTHS.map((m, i) => {
      const key = MONTHS_K[i]
      let actuals = 0, forecast = 0
      deals.forEach(d => {
        const v = d[key] || 0
        if (d.stage === 'Invoiced') actuals += v
        else if (d.stage === 'BackLog') forecast += v
      })
      return { month: m, actuals: actuals / 1000, forecast: forecast / 1000 }
    })
  }, [deals])

  // Stage breakdown
  const stageData = useMemo(() => {
    const counts = {}
    deals.forEach(d => { counts[d.stage] = (counts[d.stage] || 0) + (d.value_total || 0) })
    return Object.entries(counts).map(([stage, value]) => ({ stage, value: value / 1000, fill: STAGE_COLOR[stage] || '#eee' }))
  }, [deals])

  // Region breakdown
  const regionData = useMemo(() => {
    const r = {}
    deals.forEach(d => {
      if (!d.region) return
      const fy = MONTHS_K.reduce((s, m) => s + (d[m] || 0), 0)
      if (['BackLog','Invoiced'].includes(d.stage)) {
        r[d.region] = (r[d.region] || 0) + fy
      }
    })
    return Object.entries(r)
      .sort((a, b) => b[1] - a[1])
      .map(([region, value]) => ({ region, value: value / 1000, fill: REGION_COLOR[region] || '#eee' }))
  }, [deals])

  // BU split
  const buSplit = useMemo(() => {
    let vgt = 0, ect = 0
    deals.forEach(d => {
      const fy = MONTHS_K.reduce((s, m) => s + (d[m] || 0), 0)
      if (['BackLog','Invoiced'].includes(d.stage)) {
        if (d.bu === 'VGT') vgt += fy
        else if (d.bu === 'ECT') ect += fy
      }
    })
    return { vgt, ect }
  }, [deals])

  if (loading) return <Spinner />

  return (
    <div className="p-4 space-y-5 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between pt-1">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-sm text-gray-400">FY26 · Apr 2026 – Mar 2027</p>
        </div>
        <div className="flex items-center gap-1.5">
          {isAdmin ? (
            <>
              <span className="badge-vgt">{formatK(buSplit.vgt)}</span>
              <span className="text-gray-300">+</span>
              <span className="badge-ect">{formatK(buSplit.ect)}</span>
            </>
          ) : (
            <span className={profile?.role === 'vgt' ? 'badge-vgt' : 'badge-ect'}>
              {formatK(buSplit.vgt + buSplit.ect)}
            </span>
          )}
        </div>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <KpiCard label="Pipeline" value={formatK(totals.pipeline)} color="gray" />
        <KpiCard label="BackLog" value={formatK(totals.backlog)} color="blue" />
        <KpiCard label="Actuals" value={formatK(totals.invoiced)} color="green" />
        <KpiCard label="Forecast FY26" value={formatK(totals.forecast)} color="teal" />
      </div>

      {/* Sales Funnel */}
      <div className="card p-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Sales funnel</p>
        <div className="flex gap-4">
          <FunnelBar label="Lead"     value={deals.filter(d=>d.stage==='Lead').reduce((s,d)=>s+(d.value_total||0),0)} total={totals.pipeline+totals.backlog+totals.invoiced||1} color="#F4C0D1" />
          <FunnelBar label="Pipeline" value={totals.pipeline} total={totals.pipeline+totals.backlog+totals.invoiced||1} color="#FAC775" />
          <FunnelBar label="BackLog"  value={totals.backlog}  total={totals.pipeline+totals.backlog+totals.invoiced||1} color="#B5D4F4" />
          <FunnelBar label="Invoiced" value={totals.invoiced} total={totals.pipeline+totals.backlog+totals.invoiced||1} color="#C0DD97" />
        </div>
      </div>

      {/* Monthly chart */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Monthly · K€</p>
          <div className="flex items-center gap-3 text-xs text-gray-400">
            <span className="flex items-center gap-1"><span className="w-3 h-1 rounded bg-vgt inline-block"/>Actuals</span>
            <span className="flex items-center gap-1"><span className="w-3 h-1 rounded bg-blue-300 inline-block"/>Forecast</span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={180}>
          <BarChart data={monthlyData} barGap={2} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
            <XAxis dataKey="month" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
            <Tooltip formatter={(v) => [`€${v.toFixed(1)}K`, '']} labelStyle={{ fontSize: 12 }} />
            <Bar dataKey="actuals"  fill="#1D9E75" radius={[3,3,0,0]} />
            <Bar dataKey="forecast" fill="#B5D4F4" radius={[3,3,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Region + BU side by side */}
      <div className="grid sm:grid-cols-2 gap-4">
        {/* Region */}
        <div className="card p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">By region · forecast K€</p>
          {regionData.length === 0
            ? <p className="text-sm text-gray-400">No data</p>
            : regionData.map(({ region, value, fill }) => (
              <div key={region} className="flex items-center gap-2 mb-2">
                <span className="text-xs w-16 font-medium text-gray-600">{region}</span>
                <div className="flex-1 bg-gray-100 rounded-full h-2">
                  <div className="h-2 rounded-full transition-all" style={{ width: `${Math.max(4, (value / (regionData[0]?.value || 1)) * 100)}%`, background: fill }} />
                </div>
                <span className="text-xs font-bold text-gray-700 w-16 text-right">{formatK(value * 1000)}</span>
              </div>
            ))
          }
        </div>

        {/* Stage donut-like bars */}
        <div className="card p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">By stage · total value K€</p>
          {stageData.length === 0
            ? <p className="text-sm text-gray-400">No data</p>
            : stageData.map(({ stage, value, fill }) => (
              <div key={stage} className="flex items-center gap-2 mb-2">
                <span className="text-xs w-16 font-medium text-gray-600">{stage}</span>
                <div className="flex-1 bg-gray-100 rounded-full h-2">
                  <div className="h-2 rounded-full transition-all" style={{ width: `${Math.max(4, (value / (stageData[0]?.value || 1)) * 100)}%`, background: fill }} />
                </div>
                <span className="text-xs font-bold text-gray-700 w-16 text-right">{formatK(value * 1000)}</span>
              </div>
            ))
          }
        </div>
      </div>

      {/* BU split (admin only) */}
      {isAdmin && (
        <div className="card p-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">VGT vs ECT · forecast FY26</p>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-400 mb-1">VGT · Portugal</p>
              <p className="text-2xl font-bold text-vgt">{formatK(buSplit.vgt)}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {buSplit.vgt + buSplit.ect > 0 ? Math.round(buSplit.vgt / (buSplit.vgt + buSplit.ect) * 100) : 0}% of total
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-400 mb-1">ECT · Spain</p>
              <p className="text-2xl font-bold text-ect">{formatK(buSplit.ect)}</p>
              <p className="text-xs text-gray-400 mt-0.5">
                {buSplit.vgt + buSplit.ect > 0 ? Math.round(buSplit.ect / (buSplit.vgt + buSplit.ect) * 100) : 0}% of total
              </p>
            </div>
          </div>
          <div className="h-3 rounded-full overflow-hidden bg-gray-100 mt-3 flex">
            <div className="bg-vgt transition-all" style={{ width: `${buSplit.vgt + buSplit.ect > 0 ? (buSplit.vgt / (buSplit.vgt + buSplit.ect) * 100) : 50}%` }} />
            <div className="bg-ect flex-1" />
          </div>
        </div>
      )}
    </div>
  )
}

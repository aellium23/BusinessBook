import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { formatK, Spinner } from '../components/ui'
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  LineChart, Line, Legend, Cell
} from 'recharts'

const MONTHS_K = ['apr','may','jun','jul','aug','sep','oct','nov','dec','jan','feb','mar']
const MONTHS   = ['Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar']
const TOOLTIP  = { fontSize: 11, borderRadius: 8 }

function KpiBox({ label, value, sub, color }) {
  return (
    <div className={`bg-white rounded-xl border border-gray-200 p-4 border-t-2`}
      style={{ borderTopColor: color }}>
      <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

export default function History() {
  const { isAdmin, profile } = useAuth()
  const [fy25, setFy25]   = useState([])
  const [loading, setLoading] = useState(true)
  const [activeBU, setActiveBU] = useState('both')

  useEffect(() => {
    supabase.from('fy25_actuals').select('*').then(({ data }) => {
      setFy25(data || [])
      setLoading(false)
    })
  }, [])

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

  if (loading) return (
    <div className="flex items-center justify-center p-16">
      <div className="w-6 h-6 border-2 border-navy border-t-transparent rounded-full animate-spin"/>
    </div>
  )

  const showVGT = activeBU === 'both' || activeBU === 'VGT'
  const showECT = activeBU === 'both' || activeBU === 'ECT'

  return (
    <div className="p-4 space-y-5 max-w-5xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between pt-1">
        <div>
          <h1 className="text-xl font-bold text-gray-900">History · FY25</h1>
          <p className="text-sm text-gray-400">Apr 2025 – Mar 2026 · Actual results</p>
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

      {/* Monthly Net Sales chart */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
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
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4">
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
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-gray-100">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Monthly detail · K€</p>
        </div>
        <div className="overflow-x-auto -mx-4 px-4">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="text-left px-4 py-2 font-semibold text-gray-500 w-28">Metric</th>
                {MONTHS.map(m => (
                  <th key={m} className="px-2 py-2 font-semibold text-gray-500 text-center w-12">{m}</th>
                ))}
                <th className="px-3 py-2 font-semibold text-gray-700 text-center">FY25</th>
              </tr>
            </thead>
            <tbody>
              {showVGT && (
                <>
                  <tr className="border-b border-gray-50">
                    <td className="px-4 py-2 font-semibold text-vgt">VGT NS</td>
                    {MONTHS_K.map(m => (
                      <td key={m} className="px-1 py-2 text-center text-gray-700 text-[11px]">
                        {get('VGT','ns',m).toFixed(1)}
                      </td>
                    ))}
                    <td className="px-2 py-2 text-center font-bold text-vgt text-[11px]">
                      {totals.vgt.ns.toFixed(1)}
                    </td>
                  </tr>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    <td className="px-4 py-2 text-vgt/70">VGT GM</td>
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
                    <td className="px-4 py-2 font-semibold text-ect">ECT NS</td>
                    {MONTHS_K.map(m => (
                      <td key={m} className="px-1 py-2 text-center text-gray-700 text-[11px]">
                        {get('ECT','ns',m).toFixed(1)}
                      </td>
                    ))}
                    <td className="px-3 py-2 text-center font-bold text-ect">
                      {totals.ect.ns.toFixed(1)}
                    </td>
                  </tr>
                  <tr className="border-b border-gray-100 bg-gray-50/50">
                    <td className="px-4 py-2 text-ect/70">ECT GM</td>
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
                  <td className="px-4 py-2 text-navy">Iberia NS</td>
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
    </div>
  )
}

import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDeals } from '../../hooks/useDeals'
import { formatK, Spinner } from '../ui'
import { MONTHS_K, WEIGHTS } from '../../constants'
import { User, ChevronRight } from 'lucide-react'

export default function SalesRepFunnel({ selectedBU = '' }) {
  const navigate = useNavigate()
  const { deals: allDeals, loading } = useDeals()
  const [sortBy, setSortBy] = useState('total')

  const deals = useMemo(() => {
    let d = allDeals.filter(x => !x.is_intercompany_mirror)
    if (selectedBU) d = d.filter(x => x.bu === selectedBU)
    return d
  }, [allDeals, selectedBU])

  const grouped = useMemo(() => {
    const map = {}
    for (const d of deals) {
      const fy26 = MONTHS_K.reduce((s, m) => s + (Number(d[m]) || 0), 0)
      const bucket = ['Lead', 'Pipeline', 'Offer Presented'].includes(d.stage) ? 'pipeline'
                   : d.stage === 'BackLog'  ? 'backlog'
                   : d.stage === 'Invoiced' ? 'invoiced' : null
      if (!bucket) continue
      const val = bucket === 'pipeline' ? (Number(d.value_total) || 0) : (fy26 || Number(d.value_total) || 0)
      if (val === 0) continue
      const key = d.sales_owner || '(unassigned)'
      if (!map[key]) map[key] = { name: key, pipeline: 0, backlog: 0, invoiced: 0, weighted: 0, count: 0 }
      const g = map[key]
      g[bucket] += val
      g.count += 1
      // Weighted: use deal win_probability if set, else stage weight
      const w = d.win_probability != null ? (d.win_probability / 100) : (WEIGHTS[d.stage] || 0)
      const base = bucket === 'pipeline' ? (Number(d.value_total) || 0) : (fy26 || Number(d.value_total) || 0)
      g.weighted += base * w
    }
    const arr = Object.values(map).map(g => ({ ...g, total: g.pipeline + g.backlog + g.invoiced }))
    arr.sort((a, b) => {
      if (sortBy === 'pipeline') return b.pipeline - a.pipeline
      if (sortBy === 'invoiced') return b.invoiced - a.invoiced
      if (sortBy === 'weighted') return b.weighted - a.weighted
      return b.total - a.total
    })
    return arr
  }, [deals, sortBy])

  const totals = useMemo(() => grouped.reduce((a, g) => ({
    pipeline: a.pipeline + g.pipeline,
    backlog:  a.backlog + g.backlog,
    invoiced: a.invoiced + g.invoiced,
  }), { pipeline: 0, backlog: 0, invoiced: 0 }), [grouped])

  const max = Math.max(1, ...grouped.map(g => g.total))

  if (loading) return <Spinner/>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <select className="select text-xs w-auto" value={sortBy} onChange={e => setSortBy(e.target.value)}>
          <option value="total">Sort: Total</option>
          <option value="pipeline">Sort: Pipeline</option>
          <option value="invoiced">Sort: Invoiced</option>
          <option value="weighted">Sort: Weighted</option>
        </select>
      </div>

      <div className="grid grid-cols-3 gap-2">
        <div className="bg-amber-50 rounded-xl p-3 text-center">
          <p className="text-[10px] text-amber-600 font-semibold uppercase">Pipeline</p>
          <p className="text-lg font-bold text-amber-800">{formatK(totals.pipeline)}</p>
        </div>
        <div className="bg-purple-50 rounded-xl p-3 text-center">
          <p className="text-[10px] text-purple-600 font-semibold uppercase">BackLog</p>
          <p className="text-lg font-bold text-purple-800">{formatK(totals.backlog)}</p>
        </div>
        <div className="bg-green-50 rounded-xl p-3 text-center">
          <p className="text-[10px] text-green-600 font-semibold uppercase">Invoiced</p>
          <p className="text-lg font-bold text-green-800">{formatK(totals.invoiced)}</p>
        </div>
      </div>

      <div className="space-y-2">
        {grouped.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">No deals yet.</p>
        ) : grouped.map(g => (
          <button key={g.name} type="button"
            onClick={() => navigate(`/deals?owner=${encodeURIComponent(g.name)}`)}
            className="w-full text-left bg-white border border-gray-200 rounded-xl p-3 space-y-2 hover:border-navy hover:shadow-sm transition-all">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <User size={13} className="text-gray-400 shrink-0"/>
                <p className="text-sm font-semibold text-gray-900 truncate">{g.name}</p>
                <span className="text-[10px] text-gray-400">({g.count})</span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-sm font-bold text-gray-900">{formatK(g.total)}</span>
                <ChevronRight size={14} className="text-gray-300"/>
              </div>
            </div>
            <div className="flex h-3 rounded-full overflow-hidden bg-gray-100" style={{ width: `${Math.max(8, g.total / max * 100)}%` }}>
              {g.pipeline > 0 && <div className="bg-amber-400" style={{ width: `${g.pipeline / g.total * 100}%` }}/>}
              {g.backlog > 0 && <div className="bg-purple-400" style={{ width: `${g.backlog / g.total * 100}%` }}/>}
              {g.invoiced > 0 && <div className="bg-green-500" style={{ width: `${g.invoiced / g.total * 100}%` }}/>}
            </div>
            <div className="flex gap-3 text-[10px] text-gray-500 flex-wrap">
              <span>🟡 Pipe {formatK(g.pipeline)}</span>
              <span>🟣 BL {formatK(g.backlog)}</span>
              <span>🟢 Inv {formatK(g.invoiced)}</span>
              <span className="text-blue-600">⚖ W {formatK(g.weighted)}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

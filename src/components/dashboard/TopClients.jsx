import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDeals } from '../../hooks/useDeals'
import { formatK, Spinner } from '../ui'
import { MONTHS_K, REGIONS } from '../../constants'
import { Building2, ChevronRight } from 'lucide-react'

export default function TopClients({ selectedBU = '' }) {
  const navigate = useNavigate()
  const { deals: allDeals, loading } = useDeals()
  const [regionF, setRegionF] = useState('')
  const [limit, setLimit] = useState(10)

  const deals = useMemo(() => {
    let d = allDeals.filter(x => !x.is_intercompany_mirror)
    if (selectedBU) d = d.filter(x => x.bu === selectedBU)
    if (regionF) d = d.filter(x => x.region === regionF)
    return d
  }, [allDeals, selectedBU, regionF])

  const clients = useMemo(() => {
    const map = {}
    for (const d of deals) {
      const fy26 = MONTHS_K.reduce((s, m) => s + (Number(d[m]) || 0), 0)
      const bucket = ['Lead', 'Pipeline', 'Offer Presented'].includes(d.stage) ? 'pipeline'
                   : d.stage === 'BackLog'  ? 'backlog'
                   : d.stage === 'Invoiced' ? 'invoiced' : null
      if (!bucket) continue
      const val = fy26 || Number(d.value_total) || 0
      if (val === 0) continue
      const rawName = (d.client || '(no client)').trim()
      const key = rawName.toLowerCase()  // case-insensitive grouping
      if (!map[key]) map[key] = { name: rawName, region: d.region || '—', pipeline: 0, backlog: 0, invoiced: 0, count: 0 }
      map[key][bucket] += val
      map[key].count += 1
    }
    const arr = Object.values(map).map(g => ({ ...g, total: g.pipeline + g.backlog + g.invoiced }))
    arr.sort((a, b) => b.total - a.total)
    return arr
  }, [deals])

  const shown = clients.slice(0, limit)
  const max = Math.max(1, ...shown.map(c => c.total))
  const grandTotal = clients.reduce((s, c) => s + c.total, 0)

  if (loading) return <Spinner/>

  return (
    <div className="space-y-4">
      {/* Region tabs */}
      <div className="flex gap-1.5 flex-wrap">
        {['', ...REGIONS].map(r => (
          <button key={r || 'all'} onClick={() => setRegionF(r)}
            className={`text-xs font-semibold px-3 py-1.5 rounded-lg ${regionF === r ? 'bg-navy text-white' : 'bg-gray-100 text-gray-500'}`}>
            {r || 'All Regions'}
          </button>
        ))}
      </div>

      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>{clients.length} clients · {formatK(grandTotal)} total</span>
        <span>Top {Math.min(limit, clients.length)}</span>
      </div>

      <div className="space-y-2">
        {shown.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">No client data for this selection.</p>
        ) : shown.map((c, i) => (
          <button key={c.name} type="button"
            onClick={() => navigate(`/deals?client=${encodeURIComponent(c.name)}`)}
            className="w-full text-left bg-white border border-gray-200 rounded-xl p-3 space-y-2 hover:border-navy hover:shadow-sm transition-all">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="text-[10px] font-bold text-gray-400 w-5 shrink-0">#{i + 1}</span>
                <Building2 size={13} className="text-gray-400 shrink-0"/>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-gray-900 truncate">{c.name}</p>
                  <p className="text-[10px] text-gray-400">{c.region} · {c.count} deal{c.count > 1 ? 's' : ''}</p>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <span className="text-sm font-bold text-gray-900">{formatK(c.total)}</span>
                <ChevronRight size={14} className="text-gray-300"/>
              </div>
            </div>
            <div className="flex h-3 rounded-full overflow-hidden bg-gray-100" style={{ width: `${Math.max(8, c.total / max * 100)}%` }}>
              {c.pipeline > 0 && <div className="bg-amber-400" style={{ width: `${c.pipeline / c.total * 100}%` }}/>}
              {c.backlog > 0 && <div className="bg-purple-400" style={{ width: `${c.backlog / c.total * 100}%` }}/>}
              {c.invoiced > 0 && <div className="bg-green-500" style={{ width: `${c.invoiced / c.total * 100}%` }}/>}
            </div>
            <div className="flex gap-3 text-[10px] text-gray-500">
              <span>🟡 Pipe {formatK(c.pipeline)}</span>
              <span>🟣 BL {formatK(c.backlog)}</span>
              <span>🟢 Inv {formatK(c.invoiced)}</span>
            </div>
          </button>
        ))}
      </div>

      {clients.length > limit && (
        <button onClick={() => setLimit(l => l + 10)} className="btn-secondary text-xs w-full">
          Show more ({clients.length - limit} remaining)
        </button>
      )}
    </div>
  )
}

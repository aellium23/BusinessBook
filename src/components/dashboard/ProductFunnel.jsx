import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDeals } from '../../hooks/useDeals'
import { supabase } from '../../lib/supabase'
import { formatK, Spinner } from '../ui'
import { MONTHS_K } from '../../constants'
import { Package, ChevronRight } from 'lucide-react'

export default function ProductFunnel({ selectedBU = '' }) {
  const navigate = useNavigate()
  const { deals: allDeals, loading: dealsLoading } = useDeals()
  const deals = useMemo(() => {
    let d = allDeals.filter(x => !x.is_intercompany_mirror)
    if (selectedBU) d = d.filter(x => x.bu === selectedBU)
    return d
  }, [allDeals, selectedBU])

  const [lines, setLines] = useState([])
  const [linesLoading, setLinesLoading] = useState(true)
  const [groupBy, setGroupBy] = useState('product')
  const [sortBy, setSortBy] = useState('total')

  const dealIds = useMemo(() => deals.map(d => d.id), [deals])

  useEffect(() => {
    if (!dealIds.length) { setLines([]); setLinesLoading(false); return }
    setLinesLoading(true)
    const chunks = []
    for (let i = 0; i < dealIds.length; i += 200) chunks.push(dealIds.slice(i, i + 200))
    Promise.all(chunks.map(ids =>
      supabase.from('deal_products')
        .select('deal_id, net_price, product_name, product:product_id(brand, category, name)')
        .in('deal_id', ids)
    )).then(results => {
      setLines(results.flatMap(r => r.data || []))
      setLinesLoading(false)
    }).catch(() => setLinesLoading(false))
  }, [dealIds.join(',')])

  // Group product lines by deal so we can attribute the deal's real value
  const linesByDeal = useMemo(() => {
    const m = {}
    for (const r of lines) {
      if (!m[r.deal_id]) m[r.deal_id] = []
      m[r.deal_id].push(r)
    }
    return m
  }, [lines])

  const grouped = useMemo(() => {
    const map = {}
    const keyOf = (r) => groupBy === 'brand'    ? (r.product?.brand || 'Fujifilm')
                       : groupBy === 'category' ? (r.product?.category || '—')
                       : (r.product?.name || r.product_name || '—')

    for (const d of deals) {
      // Deal value per funnel bucket — SAME logic as the Deals page totals
      const fy26 = MONTHS_K.reduce((s, m) => s + (Number(d[m]) || 0), 0)
      const bucket = d.stage === 'Pipeline' ? 'pipeline'
                   : d.stage === 'Offer Presented' || d.stage === 'Lead' ? 'pipeline'
                   : d.stage === 'BackLog'  ? 'backlog'
                   : d.stage === 'Invoiced' ? 'invoiced' : null
      if (!bucket) continue
      const dealValue = bucket === 'pipeline'
        ? (Number(d.value_total) || 0)
        : (fy26 || Number(d.value_total) || 0)
      if (dealValue === 0) continue

      const prodLines = linesByDeal[d.id] || []
      if (prodLines.length === 0) {
        // No product lines — attribute to "(no product)" so totals still reconcile
        const k = '(no product)'
        if (!map[k]) map[k] = { name: k, pipeline: 0, backlog: 0, invoiced: 0, count: 0 }
        map[k][bucket] += dealValue
        map[k].count += 1
        continue
      }
      // Attribute the deal value across its products by net_price share
      const lineTotal = prodLines.reduce((s, l) => s + (Number(l.net_price) || 0), 0)
      for (const l of prodLines) {
        const share = lineTotal > 0 ? (Number(l.net_price) || 0) / lineTotal : 1 / prodLines.length
        const k = keyOf(l)
        if (!map[k]) map[k] = { name: k, pipeline: 0, backlog: 0, invoiced: 0, count: 0 }
        map[k][bucket] += dealValue * share
        map[k].count += 1
      }
    }

    const arr = Object.values(map).map(g => ({ ...g, total: g.pipeline + g.backlog + g.invoiced }))
    arr.sort((a, b) => {
      if (sortBy === 'pipeline') return b.pipeline - a.pipeline
      if (sortBy === 'invoiced') return b.invoiced - a.invoiced
      return b.total - a.total
    })
    return arr
  }, [deals, linesByDeal, groupBy, sortBy])

  const totals = useMemo(() => grouped.reduce((a, g) => ({
    pipeline: a.pipeline + g.pipeline,
    backlog:  a.backlog + g.backlog,
    invoiced: a.invoiced + g.invoiced,
    total:    a.total + g.total,
  }), { pipeline: 0, backlog: 0, invoiced: 0, total: 0 }), [grouped])

  const max = Math.max(1, ...grouped.map(g => g.total))
  const loading = dealsLoading || linesLoading

  if (loading) return <Spinner/>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex gap-1.5">
          {[
            { id: 'product', label: 'By Product' },
            { id: 'category', label: 'By Category' },
            { id: 'brand', label: 'By Brand' },
          ].map(o => (
            <button key={o.id} onClick={() => setGroupBy(o.id)}
              className={`text-xs font-semibold px-3 py-1.5 rounded-lg ${groupBy === o.id ? 'bg-navy text-white' : 'bg-gray-100 text-gray-500'}`}>
              {o.label}
            </button>
          ))}
        </div>
        <select className="select text-xs w-auto" value={sortBy} onChange={e => setSortBy(e.target.value)}>
          <option value="total">Sort: Total</option>
          <option value="pipeline">Sort: Pipeline</option>
          <option value="invoiced">Sort: Invoiced</option>
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
          <p className="text-sm text-gray-400 text-center py-8">No product data yet. Add products to deals to see the funnel.</p>
        ) : grouped.map(g => (
          <button key={g.name} type="button"
            onClick={() => navigate(g.name === '(no product)' ? '/deals?noproduct=1' : `/deals?${groupBy}=${encodeURIComponent(g.name)}`)}
            className="w-full text-left bg-white border border-gray-200 rounded-xl p-3 space-y-2 hover:border-navy hover:shadow-sm transition-all">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Package size={13} className="text-gray-400 shrink-0"/>
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
            <div className="flex gap-3 text-[10px] text-gray-500">
              <span>🟡 Pipe {formatK(g.pipeline)}</span>
              <span>🟣 BL {formatK(g.backlog)}</span>
              <span>🟢 Inv {formatK(g.invoiced)}</span>
            </div>
          </button>
        ))}
      </div>
    </div>
  )
}

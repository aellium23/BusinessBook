import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../lib/supabase'
import { formatK, Spinner } from '../ui'
import { Package, ChevronRight } from 'lucide-react'

// Stages grouped into funnel buckets
const PIPELINE_STAGES = ['Lead', 'Pipeline', 'Offer Presented']
const BACKLOG_STAGES   = ['BackLog']
const INVOICED_STAGES  = ['Invoiced']

export default function ProductFunnel({ selectedBU = '' }) {
  const navigate = useNavigate()
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)
  const [groupBy, setGroupBy] = useState('product') // 'product' | 'brand' | 'category'
  const [sortBy, setSortBy] = useState('total')

  useEffect(() => {
    let active = true
    ;(async () => {
      setLoading(true)
      // Pull deal product lines joined with their deal (stage/bu) and product (brand/category)
      const { data } = await supabase
        .from('deal_products')
        .select('net_price, product_name, deal:deal_id(stage, bu, is_intercompany_mirror), product:product_id(brand, category, name)')
      if (!active) return
      setRows(data || [])
      setLoading(false)
    })()
    return () => { active = false }
  }, [])

  const grouped = useMemo(() => {
    const map = {}
    for (const r of rows) {
      const deal = r.deal
      if (!deal || deal.is_intercompany_mirror) continue
      if (selectedBU && deal.bu !== selectedBU) continue
      const key = groupBy === 'brand'    ? (r.product?.brand || 'Fujifilm')
                : groupBy === 'category' ? (r.product?.category || '—')
                : (r.product?.name || r.product_name || '—')
      if (!map[key]) map[key] = { name: key, pipeline: 0, backlog: 0, invoiced: 0, count: 0 }
      const net = Number(r.net_price) || 0
      const g = map[key]
      g.count += 1
      if (PIPELINE_STAGES.includes(deal.stage)) g.pipeline += net
      else if (BACKLOG_STAGES.includes(deal.stage)) g.backlog += net
      else if (INVOICED_STAGES.includes(deal.stage)) g.invoiced += net
    }
    const arr = Object.values(map).map(g => ({
      ...g,
      total: g.pipeline + g.backlog + g.invoiced,
    }))
    arr.sort((a, b) => {
      if (sortBy === 'pipeline') return b.pipeline - a.pipeline
      if (sortBy === 'invoiced') return b.invoiced - a.invoiced
      return b.total - a.total
    })
    return arr
  }, [rows, groupBy, selectedBU, sortBy])

  const totals = useMemo(() => grouped.reduce((a, g) => ({
    pipeline: a.pipeline + g.pipeline,
    backlog:  a.backlog + g.backlog,
    invoiced: a.invoiced + g.invoiced,
    total:    a.total + g.total,
  }), { pipeline: 0, backlog: 0, invoiced: 0, total: 0 }), [grouped])

  const max = Math.max(1, ...grouped.map(g => g.total))

  if (loading) return <Spinner/>

  return (
    <div className="space-y-4">
      {/* Controls */}
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

      {/* Summary cards */}
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

      {/* Per-product breakdown */}
      <div className="space-y-2">
        {grouped.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-8">No product data yet. Add products to deals to see the funnel.</p>
        ) : grouped.map(g => (
          <button key={g.name} type="button"
            onClick={() => navigate(`/deals?${groupBy}=${encodeURIComponent(g.name)}`)}
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
            {/* Stacked funnel bar */}
            <div className="flex h-3 rounded-full overflow-hidden bg-gray-100" style={{ width: `${Math.max(8, g.total / max * 100)}%` }}>
              {g.pipeline > 0 && <div className="bg-amber-400" style={{ width: `${g.pipeline / g.total * 100}%` }} title={`Pipeline ${formatK(g.pipeline)}`}/>}
              {g.backlog > 0 && <div className="bg-purple-400" style={{ width: `${g.backlog / g.total * 100}%` }} title={`BackLog ${formatK(g.backlog)}`}/>}
              {g.invoiced > 0 && <div className="bg-green-500" style={{ width: `${g.invoiced / g.total * 100}%` }} title={`Invoiced ${formatK(g.invoiced)}`}/>}
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

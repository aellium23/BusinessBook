import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../lib/supabase'
import { formatK } from '../ui'
import { Plus, Trash2, BarChart3 } from 'lucide-react'

export default function ProjectTCO({ dealId, dealLines, isDistributor }) {
  const [costs, setCosts] = useState([])
  const [loading, setLoading] = useState(true)

  async function load() {
    if (!dealId) { setLoading(false); return }
    const { data } = await supabase.from('deal_project_costs')
      .select('*').eq('deal_id', dealId).order('created_at')
    setCosts(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [dealId])

  function addLine() {
    setCosts(prev => [...prev, {
      _new: true,
      _key: Date.now(),
      vendor: '',
      product_name: '',
      cost_price: 0,
      sell_price: 0,
      notes: '',
    }])
  }

  function updateCost(idx, field, value) {
    setCosts(prev => prev.map((c, i) => i === idx ? { ...c, [field]: value } : c))
  }

  async function removeCost(idx) {
    const item = costs[idx]
    if (item.id) {
      await supabase.from('deal_project_costs').delete().eq('id', item.id)
    }
    setCosts(prev => prev.filter((_, i) => i !== idx))
  }

  async function saveCosts() {
    if (!dealId) return
    // Delete existing and re-insert
    await supabase.from('deal_project_costs').delete().eq('deal_id', dealId)
    const rows = costs.filter(c => c.vendor || c.product_name).map(c => ({
      deal_id: dealId,
      vendor: c.vendor || 'Other',
      product_name: c.product_name || 'Unknown',
      cost_price: parseFloat(c.cost_price) || 0,
      sell_price: parseFloat(c.sell_price) || 0,
      notes: c.notes || null,
    }))
    if (rows.length > 0) {
      await supabase.from('deal_project_costs').insert(rows)
    }
    load()
  }

  // Calculate TCO
  const tco = useMemo(() => {
    // Fujifilm products (from deal lines)
    const fjCost = (dealLines || []).reduce((s, l) => s + ((parseFloat(l.cost_price) || 0) * (parseInt(l.quantity) || 1)), 0)
    const fjSell = (dealLines || []).reduce((s, l) => s + (parseFloat(l.net_price) || 0), 0)
    const fjAnnual = (dealLines || []).reduce((s, l) => s + (parseFloat(l.annual_fee) || 0), 0)

    // Third-party costs
    const tpCost = costs.reduce((s, c) => s + (parseFloat(c.cost_price) || 0), 0)
    const tpSell = costs.reduce((s, c) => s + (parseFloat(c.sell_price) || 0), 0)

    const totalCost = fjCost + tpCost
    const totalSell = fjSell + tpSell
    const totalGM = totalSell > 0 ? ((totalSell - totalCost) / totalSell * 100) : 0
    const fjGM = fjSell > 0 ? ((fjSell - fjCost) / fjSell * 100) : 0
    const tpGM = tpSell > 0 ? ((tpSell - tpCost) / tpSell * 100) : 0

    return { fjCost, fjSell, fjAnnual, fjGM, tpCost, tpSell, tpGM, totalCost, totalSell, totalGM }
  }, [dealLines, costs])

  if (loading) return null

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <BarChart3 size={14} className="text-navy"/>
          <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
            Project TCO
          </p>
        </div>
        <button onClick={addLine} className="btn-secondary text-xs gap-1">
          <Plus size={12}/> Third-party cost
        </button>
      </div>

      {/* Summary gauges */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-blue-50 rounded-lg p-2 text-center">
          <p className="text-[10px] text-blue-600 font-semibold">Fujifilm</p>
          <p className="text-sm font-bold text-blue-800">{formatK(tco.fjSell)}</p>
          <p className={`text-[10px] font-bold ${tco.fjGM >= 20 ? 'text-green-600' : tco.fjGM >= 10 ? 'text-amber-600' : 'text-red-600'}`}>
            GM {tco.fjGM.toFixed(1)}%
          </p>
        </div>
        <div className="bg-gray-50 rounded-lg p-2 text-center">
          <p className="text-[10px] text-gray-600 font-semibold">Third-party</p>
          <p className="text-sm font-bold text-gray-800">{formatK(tco.tpSell)}</p>
          <p className={`text-[10px] font-bold ${tco.tpGM >= 20 ? 'text-green-600' : tco.tpGM >= 10 ? 'text-amber-600' : 'text-red-600'}`}>
            GM {tco.tpGM.toFixed(1)}%
          </p>
        </div>
        <div className={`rounded-lg p-2 text-center ${tco.totalGM >= 20 ? 'bg-green-50' : tco.totalGM >= 10 ? 'bg-amber-50' : 'bg-red-50'}`}>
          <p className="text-[10px] text-gray-600 font-semibold">Total Project</p>
          <p className="text-sm font-bold text-gray-900">{formatK(tco.totalSell)}</p>
          <p className={`text-[10px] font-bold ${tco.totalGM >= 20 ? 'text-green-600' : tco.totalGM >= 10 ? 'text-amber-600' : 'text-red-600'}`}>
            GM {tco.totalGM.toFixed(1)}%
          </p>
        </div>
      </div>

      {/* Margin balance indicator */}
      {tco.tpSell > 0 && tco.fjSell > 0 && (
        <div className="rounded-lg border border-gray-200 p-2">
          <p className="text-[10px] text-gray-500 font-semibold mb-1">Margin Balance</p>
          <div className="flex h-3 rounded-full overflow-hidden bg-gray-100">
            <div className="bg-blue-500 transition-all" style={{ width: `${Math.round(tco.fjSell / (tco.fjSell + tco.tpSell) * 100)}%` }}/>
            <div className="bg-gray-400 transition-all" style={{ width: `${Math.round(tco.tpSell / (tco.fjSell + tco.tpSell) * 100)}%` }}/>
          </div>
          <div className="flex justify-between text-[10px] mt-0.5">
            <span className="text-blue-600">Fujifilm {Math.round(tco.fjSell / (tco.fjSell + tco.tpSell) * 100)}%</span>
            <span className="text-gray-500">Third-party {Math.round(tco.tpSell / (tco.fjSell + tco.tpSell) * 100)}%</span>
          </div>
          {tco.fjGM < tco.tpGM - 5 && (
            <p className="text-[10px] text-red-600 bg-red-50 rounded px-2 py-1 mt-1.5">
              ⚠ Fujifilm margin ({tco.fjGM.toFixed(1)}%) is lower than third-party ({tco.tpGM.toFixed(1)}%). Consider rebalancing.
            </p>
          )}
        </div>
      )}

      {/* Third-party cost lines */}
      {costs.map((c, idx) => (
        <div key={c.id || c._key} className="bg-gray-50 rounded-lg p-3 space-y-2">
          <div className="flex items-center gap-2">
            <div className="flex-1 grid grid-cols-2 gap-2">
              <input className="input text-xs" value={c.vendor}
                onChange={e => updateCost(idx, 'vendor', e.target.value)}
                placeholder="Vendor (e.g. Fuji USA)"/>
              <input className="input text-xs" value={c.product_name}
                onChange={e => updateCost(idx, 'product_name', e.target.value)}
                placeholder="Product name"/>
            </div>
            <button onClick={() => removeCost(idx)} className="text-gray-300 hover:text-red-500 p-1 min-h-tap">
              <Trash2 size={13}/>
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-gray-400">Cost €</label>
              <input className="input text-xs" type="number" min="0" step="0.01"
                value={c.cost_price} onChange={e => updateCost(idx, 'cost_price', e.target.value)}/>
            </div>
            <div>
              <label className="text-[10px] text-gray-400">Sell to customer €</label>
              <input className="input text-xs" type="number" min="0" step="0.01"
                value={c.sell_price} onChange={e => updateCost(idx, 'sell_price', e.target.value)}/>
            </div>
          </div>
          <input className="input text-xs" value={c.notes || ''}
            onChange={e => updateCost(idx, 'notes', e.target.value)}
            placeholder="Notes (optional)"/>
        </div>
      ))}

      {costs.length > 0 && (
        <button onClick={saveCosts} className="btn-primary text-xs w-full">
          Save project costs
        </button>
      )}

      {tco.fjAnnual > 0 && (
        <p className="text-[10px] text-blue-600">
          Fujifilm annual recurring: {formatK(tco.fjAnnual)}/yr
        </p>
      )}
    </div>
  )
}

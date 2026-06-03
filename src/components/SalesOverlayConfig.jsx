import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { Plus, Trash2, TrendingUp, X, Check } from 'lucide-react'

export default function SalesOverlayConfig({ bu, salesOwners }) {
  const [rules, setRules] = useState([])
  const [catalog, setCatalog] = useState([])
  const [loading, setLoading] = useState(true)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ source: '', target: '', products: [], pct: 100, notes: '' })

  async function load() {
    const [rRes, pRes] = await Promise.all([
      supabase.from('sales_overlays').select('*').eq('bu', bu).eq('fiscal_year', 2026).order('created_at'),
      supabase.from('products').select('id, name, category').eq('active', true).order('category').order('name'),
    ])
    setRules(rRes.data || [])
    setCatalog(pRes.data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [bu])

  function toggleProduct(name) {
    setForm(f => ({
      ...f,
      products: f.products.includes(name) ? f.products.filter(p => p !== name) : [...f.products, name],
    }))
  }

  async function add() {
    if (!form.source || !form.target) return
    await supabase.from('sales_overlays').insert({
      bu,
      fiscal_year: 2026,
      source_owner: form.source,
      target_owner: form.target,
      products: form.products,  // exact catalog names (empty = all)
      share_pct: parseFloat(form.pct) || 100,
      notes: form.notes || null,
    })
    setForm({ source: '', target: '', products: [], pct: 100, notes: '' })
    setAdding(false)
    load()
  }

  async function remove(id) {
    await supabase.from('sales_overlays').delete().eq('id', id)
    load()
  }

  async function toggle(id, active) {
    await supabase.from('sales_overlays').update({ active: !active }).eq('id', id)
    load()
  }

  const owners = [...new Set(salesOwners.filter(o => o.bu === bu).map(o => o.name))].sort()

  if (loading) return null

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp size={14} className="text-navy"/>
          <p className="text-xs font-semibold text-gray-700 uppercase tracking-wide">
            Sales Overlays · {bu} · FY26
          </p>
        </div>
        <button onClick={() => setAdding(a => !a)} className="btn-secondary text-xs gap-1">
          {adding ? <><X size={12}/> Cancel</> : <><Plus size={12}/> Add rule</>}
        </button>
      </div>

      {adding && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 space-y-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="text-micro text-gray-500 font-semibold">Source Rep (whose deals are shared)</label>
              <select className="select text-xs" value={form.source} onChange={e => setForm(f => ({...f, source: e.target.value}))}>
                <option value="">Select…</option>
                {owners.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div>
              <label className="text-micro text-gray-500 font-semibold">Target Rep (who gets the credit)</label>
              <select className="select text-xs" value={form.target} onChange={e => setForm(f => ({...f, target: e.target.value}))}>
                <option value="">Select…</option>
                {owners.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-micro text-gray-500 font-semibold">
              Products ({form.products.length === 0 ? 'all products' : `${form.products.length} selected`})
            </label>
            <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-lg bg-white p-2 space-y-0.5">
              {catalog.length === 0 ? (
                <p className="text-micro text-gray-400 px-1 py-2">No products in catalog.</p>
              ) : (() => {
                const grouped = catalog.reduce((g, p) => { (g[p.category] = g[p.category] || []).push(p); return g }, {})
                return Object.entries(grouped).map(([cat, prods]) => (
                  <div key={cat}>
                    <p className="text-micro text-gray-400 uppercase font-semibold px-1 pt-1">{cat}</p>
                    {prods.map(p => {
                      const on = form.products.includes(p.name)
                      return (
                        <button key={p.id} type="button" onClick={() => toggleProduct(p.name)}
                          className={`w-full flex items-center gap-2 px-1.5 py-1 rounded text-left text-xs ${on ? 'bg-blue-50 text-blue-800' : 'hover:bg-gray-50 text-gray-700'}`}>
                          <span className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${on ? 'bg-navy border-navy text-white' : 'border-gray-300'}`}>
                            {on && <Check size={9}/>}
                          </span>
                          <span className="truncate">{p.name}</span>
                        </button>
                      )
                    })}
                  </div>
                ))
              })()}
            </div>
            <p className="text-micro text-gray-400 mt-0.5">Leave none selected to credit all products.</p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-micro text-gray-500 font-semibold">Credit % (100 = full)</label>
              <input className="input text-xs" type="number" min="1" max="100"
                value={form.pct} onChange={e => setForm(f => ({...f, pct: e.target.value}))}/>
            </div>
            <div>
              <label className="text-micro text-gray-500 font-semibold">Notes</label>
              <input className="input text-xs" value={form.notes}
                onChange={e => setForm(f => ({...f, notes: e.target.value}))}
                placeholder="Optional" style={{ fontSize: '16px' }}/>
            </div>
          </div>
          <button onClick={add} disabled={!form.source || !form.target || form.source === form.target}
            className="btn-primary text-xs w-full disabled:opacity-40">
            Add overlay rule
          </button>
        </div>
      )}

      {rules.length === 0 && !adding && (
        <p className="text-xs text-gray-400 text-center py-3">No overlay rules for {bu} FY26.</p>
      )}

      {rules.map(r => (
        <div key={r.id} className={`flex items-center gap-3 bg-white border rounded-lg px-3 py-2 ${r.active ? 'border-gray-200' : 'border-gray-100 opacity-50'}`}>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-gray-900">
              {r.source_owner} → {r.target_owner}
              <span className="text-gray-400 ml-1">({r.share_pct}%)</span>
            </p>
            <p className="text-micro text-gray-400">
              {Array.isArray(r.products) && r.products.length > 0
                ? r.products.join(', ')
                : 'All products'}
              {r.notes && ` · ${r.notes}`}
            </p>
          </div>
          <button onClick={() => toggle(r.id, r.active)}
            className={`w-7 h-4 rounded-full relative shrink-0 ${r.active ? 'bg-green-400' : 'bg-gray-200'}`}>
            <span className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${r.active ? 'translate-x-3' : 'translate-x-0.5'}`}/>
          </button>
          <button onClick={() => remove(r.id)} className="text-gray-300 hover:text-red-500 p-1">
            <Trash2 size={12}/>
          </button>
        </div>
      ))}
    </div>
  )
}

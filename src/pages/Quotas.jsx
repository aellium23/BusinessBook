import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { formatK, Spinner } from '../components/ui'
import { Target, Plus, Save, Trash2 } from 'lucide-react'

const MONTHS_K = ['apr','may','jun','jul','aug','sep','oct','nov','dec','jan','feb','mar']

function ProgressRing({ pct, color, size = 56 }) {
  const r = (size - 8) / 2
  const circ = 2 * Math.PI * r
  const dash = Math.min(pct / 100, 1) * circ
  return (
    <svg width={size} height={size} className="-rotate-90">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#E5E7EB" strokeWidth={6}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={6}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"/>
    </svg>
  )
}

export default function Quotas() {
  const { isAdmin, profile } = useAuth()
  const [quotas, setQuotas] = useState([])
  const [deals, setDeals]   = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [newRow, setNewRow]   = useState(null)
  const [saving, setSaving]   = useState(false)

  async function load() {
    const [qRes, dRes] = await Promise.all([
      supabase.from('quotas').select('*').order('bu').order('sales_owner'),
      supabase.from('deals').select('bu,sales_owner,stage,value_total,...apr,may,jun,jul,aug,sep,oct,nov,dec,jan,feb,mar').eq('is_intercompany_mirror', false)
    ])
    setQuotas(qRes.data || [])
    setDeals(dRes.data || [])
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  // Actuals per sales_owner
  const actuals = useMemo(() => {
    const map = {}
    deals.forEach(d => {
      const key = `${d.bu}::${d.sales_owner || 'Unassigned'}`
      if (!map[key]) map[key] = 0
      const fy = MONTHS_K.reduce((s,m) => s + (d[m]||0), 0)
      if (d.stage === 'Invoiced') map[key] += fy
    })
    return map
  }, [deals])

  const forecast = useMemo(() => {
    const map = {}
    deals.forEach(d => {
      const key = `${d.bu}::${d.sales_owner || 'Unassigned'}`
      if (!map[key]) map[key] = 0
      const fy = MONTHS_K.reduce((s,m) => s + (d[m]||0), 0)
      if (['BackLog','Invoiced'].includes(d.stage)) map[key] += fy
    })
    return map
  }, [deals])

  async function saveQuota(q) {
    setSaving(true)
    if (q.id) {
      await supabase.from('quotas').update({ target_eur: q.target_eur }).eq('id', q.id)
    } else {
      await supabase.from('quotas').insert({ bu: q.bu, sales_owner: q.sales_owner, target_eur: q.target_eur, fiscal_year: 2026 })
    }
    setEditing(null); setNewRow(null)
    await load()
    setSaving(false)
  }

  async function deleteQuota(id) {
    await supabase.from('quotas').delete().eq('id', id)
    await load()
  }

  if (loading) return <Spinner/>

  const allOwners = [...new Set(deals.map(d => `${d.bu}::${d.sales_owner || 'Unassigned'}`))]
    .filter(k => !quotas.find(q => `${q.bu}::${q.sales_owner}` === k))

  return (
    <div className="p-4 space-y-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between pt-1">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Quotas · FY26</h1>
          <p className="text-sm text-gray-400">Sales targets per owner</p>
        </div>
        {isAdmin && (
          <button onClick={() => setNewRow({ bu:'VGT', sales_owner:'', target_eur:0 })}
            className="btn-primary text-sm">
            <Plus size={14}/> Add quota
          </button>
        )}
      </div>

      {/* New row form */}
      {newRow && (
        <div className="card p-4 border-2 border-dashed border-navy/20 space-y-3">
          <p className="text-xs font-semibold text-gray-500">New quota</p>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="label">BU</label>
              <select className="select" value={newRow.bu} onChange={e => setNewRow(r=>({...r,bu:e.target.value}))}>
                <option>VGT</option><option>ECT</option>
              </select>
            </div>
            <div>
              <label className="label">Sales Owner</label>
              <input className="input" value={newRow.sales_owner}
                onChange={e => setNewRow(r=>({...r,sales_owner:e.target.value}))} placeholder="Name"/>
            </div>
            <div>
              <label className="label">Target €</label>
              <input className="input" type="number" value={newRow.target_eur}
                onChange={e => setNewRow(r=>({...r,target_eur:parseFloat(e.target.value)||0}))} placeholder="0"/>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setNewRow(null)} className="btn-secondary text-xs">Cancel</button>
            <button onClick={() => saveQuota(newRow)} disabled={saving} className="btn-primary text-xs">
              <Save size={12}/> Save
            </button>
          </div>
        </div>
      )}

      {/* Quota cards */}
      {quotas.length === 0 && !newRow ? (
        <div className="text-center py-12 text-gray-400">
          <Target size={32} className="mx-auto mb-2 opacity-30"/>
          <p className="font-medium text-gray-600">No quotas set yet</p>
          {isAdmin && <p className="text-sm mt-1">Add targets for each sales owner</p>}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {quotas.map(q => {
            const key = `${q.bu}::${q.sales_owner}`
            const act = actuals[key] || 0
            const fc  = forecast[key] || 0
            const pctAct = q.target_eur > 0 ? (act / q.target_eur * 100) : 0
            const pctFC  = q.target_eur > 0 ? (fc  / q.target_eur * 100) : 0
            const color  = q.bu === 'VGT' ? '#1D9E75' : '#D85A30'
            const isEdit = editing?.id === q.id

            return (
              <div key={q.id} className="card p-4">
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div>
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className={`text-xs px-1.5 py-0.5 rounded font-bold text-white`}
                        style={{ background: color }}>{q.bu}</span>
                      <p className="font-semibold text-gray-900">{q.sales_owner}</p>
                    </div>
                    {isEdit ? (
                      <div className="flex items-center gap-2 mt-1">
                        <input type="number" className="input w-32 text-xs py-1"
                          value={editing.target_eur}
                          onChange={e => setEditing(v=>({...v,target_eur:parseFloat(e.target.value)||0}))}/>
                        <button onClick={() => saveQuota(editing)} className="btn-primary text-xs py-1">
                          <Save size={11}/>
                        </button>
                        <button onClick={() => setEditing(null)} className="btn-secondary text-xs py-1">✕</button>
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400">Target: <strong>{formatK(q.target_eur)}</strong></p>
                    )}
                  </div>
                  <div className="relative shrink-0">
                    <ProgressRing pct={pctFC} color={color}/>
                    <div className="absolute inset-0 flex items-center justify-center">
                      <span className="text-[10px] font-bold text-gray-700">{Math.round(pctFC)}%</span>
                    </div>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <div>
                    <div className="flex justify-between text-[10px] text-gray-400 mb-0.5">
                      <span>Actuals (Invoiced)</span>
                      <span className="font-medium text-gray-700">{formatK(act)} · {Math.round(pctAct)}%</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width:`${Math.min(pctAct,100)}%`, background: color }}/>
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-[10px] text-gray-400 mb-0.5">
                      <span>Forecast (BL+Inv)</span>
                      <span className="font-medium text-gray-700">{formatK(fc)} · {Math.round(pctFC)}%</span>
                    </div>
                    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full rounded-full opacity-40" style={{ width:`${Math.min(pctFC,100)}%`, background: color }}/>
                    </div>
                  </div>
                </div>

                {isAdmin && !isEdit && (
                  <div className="flex gap-2 mt-3">
                    <button onClick={() => setEditing({...q})} className="btn-secondary text-xs flex-1">Edit target</button>
                    <button onClick={() => deleteQuota(q.id)} className="btn-danger text-xs"><Trash2 size={12}/></button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { Spinner } from '../components/ui'
import { Save } from 'lucide-react'

const MONTHS = ['Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar']
const MONTHS_K = ['apr','may','jun','jul','aug','sep','oct','nov','dec','jan','feb','mar']
const CYCLES = ['BUD','EST1','EST2']
const BUS = ['VGT','ECT']
const PL_LINES = [
  { key:'ns_int',  label:'NetSales – Internal', input: true  },
  { key:'ns_ext',  label:'NetSales – External', input: true  },
  { key:'ns',      label:'NetSales Total',       input: false },
  { key:'cogs',    label:'COGS',                 input: true  },
  { key:'gm',      label:'Gross Margin',         input: false },
  { key:'rd',      label:'R&D Expenses',         input: true  },
  { key:'sgas',    label:'SGAs',                 input: true  },
  { key:'op',      label:'Operating Profit',     input: false },
]
const CYCLE_COLORS = { BUD:'bg-blue-50 border-blue-200', EST1:'bg-green-50 border-green-200', EST2:'bg-amber-50 border-amber-200' }
const CYCLE_BADGE  = { BUD:'bg-blue-100 text-blue-800', EST1:'bg-green-100 text-green-800', EST2:'bg-amber-100 text-amber-800' }
const ACTIVE_CYCLE = () => {
  const m = new Date().getMonth() + 1
  if (m >= 4 && m <= 6) return 'BUD'
  if (m >= 7) return 'EST1'
  return 'EST2'
}

function calcDerived(data) {
  return {
    ns:  (data.ns_int || 0) + (data.ns_ext || 0),
    gm:  ((data.ns_int || 0) + (data.ns_ext || 0)) - (data.cogs || 0),
    op:  ((data.ns_int || 0) + (data.ns_ext || 0)) - (data.cogs || 0) - (data.rd || 0) - (data.sgas || 0),
  }
}

export default function Budget() {
  const { isAdmin } = useAuth()
  const [rows, setRows]     = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)
  const [activeBu, setActiveBu] = useState('VGT')
  const [activeCycle, setActiveCycle] = useState(ACTIVE_CYCLE())

  useEffect(() => {
    supabase.from('budget').select('*').then(({ data }) => {
      setRows(data || [])
      setLoading(false)
    })
  }, [])

  if (!isAdmin) return <div className="p-8 text-center text-gray-400">Admin access required.</div>
  if (loading) return <Spinner />

  function getVal(bu, cycle, plKey, month) {
    const row = rows.find(r => r.bu === bu && r.cycle === cycle && r.pl_key === plKey)
    return row?.[month] || 0
  }
  function setVal(bu, cycle, plKey, month, val) {
    setRows(prev => {
      const idx = prev.findIndex(r => r.bu === bu && r.cycle === cycle && r.pl_key === plKey)
      const updated = { ...(prev[idx] || { bu, cycle, pl_key: plKey }), [month]: parseFloat(val) || 0 }
      if (idx >= 0) return prev.map((r, i) => i === idx ? updated : r)
      return [...prev, updated]
    })
  }

  async function handleSave() {
    setSaving(true)
    const toSave = rows.filter(r => ['ns_int','ns_ext','cogs','rd','sgas'].includes(r.pl_key))
    const { error } = await supabase.from('budget').upsert(toSave, { onConflict: 'bu,cycle,pl_key' })
    setSaving(false)
    if (!error) { setSaved(true); setTimeout(() => setSaved(false), 2000) }
  }

  const active = ACTIVE_CYCLE()
  const bu = activeBu
  const cycle = activeCycle

  return (
    <div className="p-4 space-y-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between pt-1">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Budget</h1>
          <p className="text-sm text-gray-400">Active cycle: <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${CYCLE_BADGE[active]}`}>{active}</span></p>
        </div>
        <button onClick={handleSave} disabled={saving} className="btn-primary">
          <Save size={14}/>{saving ? 'Saving…' : saved ? 'Saved ✓' : 'Save'}
        </button>
      </div>

      {/* BU + Cycle tabs */}
      <div className="flex gap-2">
        {BUS.map(b => (
          <button key={b} onClick={() => setActiveBu(b)}
            className={`btn text-sm ${activeBu === b ? (b === 'VGT' ? 'bg-vgt text-white' : 'bg-ect text-white') : 'btn-secondary'}`}>
            {b}
          </button>
        ))}
        <div className="flex-1"/>
        {CYCLES.map(c => (
          <button key={c} onClick={() => setActiveCycle(c)}
            className={`btn text-xs ${activeCycle === c ? CYCLE_BADGE[c].replace('text-','text-').replace('bg-','bg-') + ' font-bold' : 'btn-secondary'}`}>
            {c} {c === active ? '●' : ''}
          </button>
        ))}
      </div>

      {/* P&L table */}
      <div className={`card border overflow-hidden ${CYCLE_COLORS[cycle]}`}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left p-3 font-semibold text-gray-600 w-36">Line</th>
                {MONTHS.map(m => <th key={m} className="p-2 font-semibold text-gray-600 text-center w-14">{m}</th>)}
                <th className="p-2 font-semibold text-gray-700 text-center w-16">FY26</th>
              </tr>
            </thead>
            <tbody>
              {PL_LINES.map(({ key, label, input }) => {
                const derived = !input ? calcDerived(
                  Object.fromEntries(PL_LINES.filter(l=>l.input).map(l => [l.key, MONTHS_K.reduce((s,m)=> s + getVal(bu,cycle,l.key,m), 0)]))
                ) : {}
                const isBold = ['ns','gm','op'].includes(key)
                return (
                  <tr key={key} className={`border-b border-gray-100 ${isBold ? 'bg-white/60' : ''}`}>
                    <td className={`p-3 ${isBold ? 'font-bold text-gray-900' : 'text-gray-600'}`}>{label}</td>
                    {MONTHS.map((m, i) => {
                      const mk = MONTHS_K[i]
                      if (!input) {
                        const v = calcDerived(
                          Object.fromEntries(PL_LINES.filter(l=>l.input).map(l => [l.key, getVal(bu,cycle,l.key,mk)]))
                        )[key] || 0
                        return <td key={m} className="p-2 text-center font-bold text-gray-700">{v ? v.toFixed(1) : '—'}</td>
                      }
                      return (
                        <td key={m} className="p-1">
                          <input type="number" step="0.1"
                            className="w-full border border-transparent focus:border-blue-300 rounded px-1 py-0.5 text-center text-xs text-blue-700 bg-transparent focus:bg-white focus:outline-none"
                            value={getVal(bu, cycle, key, mk) || ''}
                            onChange={e => setVal(bu, cycle, key, mk, e.target.value)}
                          />
                        </td>
                      )
                    })}
                    {/* FY26 Total */}
                    <td className="p-2 text-center font-bold text-gray-800">
                      {input
                        ? (MONTHS_K.reduce((s,m) => s + getVal(bu,cycle,key,m), 0)).toFixed(1)
                        : (MONTHS_K.reduce((s,mk) => s + (calcDerived(Object.fromEntries(PL_LINES.filter(l=>l.input).map(l=>[l.key,getVal(bu,cycle,l.key,mk)])))[key]||0), 0)).toFixed(1)
                      }
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

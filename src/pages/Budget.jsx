import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { Spinner, formatK } from '../components/ui'
import { Save, CheckCircle, TrendingUp, TrendingDown, Minus } from 'lucide-react'

const MONTHS   = ['Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar']
const MONTHS_K = ['apr','may','jun','jul','aug','sep','oct','nov','dec','jan','feb','mar']
const CYCLES   = ['BUD','EST1','EST2']
const BUS      = ['VGT','ECT']

const PL_LINES = [
  { key:'ns_int', label:'NS Internal',  input:true,  group:'revenue' },
  { key:'ns_ext', label:'NS External',  input:true,  group:'revenue' },
  { key:'ns',     label:'Net Sales',    input:false, group:'total'   },
  { key:'cogs',   label:'COGS',         input:true,  group:'cost'    },
  { key:'gm',     label:'Gross Margin', input:false, group:'total'   },
  { key:'rd',     label:'R&D',          input:true,  group:'cost'    },
  { key:'sgas',   label:'SGAs',         input:true,  group:'cost'    },
  { key:'op',     label:'Oper. Profit', input:false, group:'total'   },
]

const CYCLE_CONFIG = {
  BUD:  { label:'Budget',  color:'#185FA5', bg:'#E6F1FB', badge:'bg-blue-100 text-blue-800' },
  EST1: { label:'EST 1',   color:'#0F6E56', bg:'#E1F5EE', badge:'bg-green-100 text-green-800' },
  EST2: { label:'EST 2',   color:'#BA7517', bg:'#FAEEDA', badge:'bg-amber-100 text-amber-800' },
}
const BU_CONFIG = {
  VGT: { color:'#1D9E75', bg:'#E1F5EE', label:'VGT · Portugal' },
  ECT: { color:'#D85A30', bg:'#FAECE7', label:'ECT · Spain'    },
}

const ACTIVE_CYCLE = () => {
  const m = new Date().getMonth() + 1
  if (m >= 4 && m <= 6) return 'BUD'
  if (m >= 7) return 'EST1'
  return 'EST2'
}

function calcDerived(vals) {
  const ns = (vals.ns_int||0) + (vals.ns_ext||0)
  return {
    ns,
    gm: ns - (vals.cogs||0),
    op: ns - (vals.cogs||0) - (vals.rd||0) - (vals.sgas||0),
  }
}

function Trend({ value, reference }) {
  if (!reference || reference === 0) return null
  const pct = ((value - reference) / Math.abs(reference)) * 100
  if (Math.abs(pct) < 0.5) return <Minus size={10} className="text-gray-400"/>
  if (pct > 0) return (
    <span className="flex items-center gap-0.5 text-green-600 text-[9px] font-medium">
      <TrendingUp size={9}/>{pct.toFixed(1)}%
    </span>
  )
  return (
    <span className="flex items-center gap-0.5 text-red-500 text-[9px] font-medium">
      <TrendingDown size={9}/>{Math.abs(pct).toFixed(1)}%
    </span>
  )
}

export default function Budget() {
  const { isAdmin } = useAuth()
  const [rows, setRows]       = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)
  const [activeBu, setActiveBu]       = useState('VGT')
  const [activeCycle, setActiveCycle] = useState(ACTIVE_CYCLE())
  const [focusCell, setFocusCell]     = useState(null)
  const activeCycleDefault = ACTIVE_CYCLE()

  useEffect(() => {
    supabase.from('budget').select('*').then(({ data }) => {
      setRows(data || [])
      setLoading(false)
    })
  }, [])

  function getVal(bu, cycle, plKey, month) {
    const row = rows.find(r => r.bu===bu && r.cycle===cycle && r.pl_key===plKey)
    return row?.[month] || 0
  }
  function setVal(bu, cycle, plKey, month, val) {
    setRows(prev => {
      const idx = prev.findIndex(r => r.bu===bu && r.cycle===cycle && r.pl_key===plKey)
      const updated = { ...(prev[idx] || { bu, cycle, pl_key:plKey }), [month]: parseFloat(val)||0 }
      if (idx >= 0) return prev.map((r,i) => i===idx ? updated : r)
      return [...prev, updated]
    })
  }

  async function handleSave() {
    setSaving(true)
    const toSave = rows.filter(r => ['ns_int','ns_ext','cogs','rd','sgas'].includes(r.pl_key))
    await supabase.from('budget').upsert(toSave, { onConflict:'bu,cycle,pl_key' })
    setSaving(false); setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  // Annual totals for summary cards
  const annualTotals = useMemo(() => {
    const calc = (bu, cycle) => {
      const vals = Object.fromEntries(
        PL_LINES.filter(l=>l.input).map(l => [l.key, MONTHS_K.reduce((s,m)=>s+getVal(bu,cycle,l.key,m),0)])
      )
      return { ...vals, ...calcDerived(vals) }
    }
    return {
      VGT: { BUD: calc('VGT','BUD'), EST1: calc('VGT','EST1'), EST2: calc('VGT','EST2') },
      ECT: { BUD: calc('ECT','BUD'), EST1: calc('ECT','EST1'), EST2: calc('ECT','EST2') },
    }
  }, [rows])

  if (!isAdmin) return <div className="p-8 text-center text-gray-400">Admin access required.</div>
  if (loading) return <Spinner/>

  const buCfg    = BU_CONFIG[activeBu]
  const cycleCfg = CYCLE_CONFIG[activeCycle]
  const refCycle = activeCycle === 'EST2' ? 'EST1' : activeCycle === 'EST1' ? 'BUD' : null

  return (
    <div className="p-4 space-y-4 max-w-6xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between pt-1 flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Budget · FY26</h1>
          <p className="text-sm text-gray-400">Values in K€ · Apr 2026 – Mar 2027</p>
        </div>
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white transition-all"
          style={{ background: saved ? '#1D9E75' : '#0D2137' }}>
          {saved ? <><CheckCircle size={15}/> Saved</> : saving ? 'Saving…' : <><Save size={15}/> Save changes</>}
        </button>
      </div>

      {/* Summary cards — all cycles at a glance */}
      <div className="grid grid-cols-3 gap-3">
        {CYCLES.map(cycle => {
          const t = annualTotals[activeBu][cycle]
          const cfg = CYCLE_CONFIG[cycle]
          const isActive = cycle === activeCycleDefault
          return (
            <button key={cycle} onClick={() => setActiveCycle(cycle)}
              className={`rounded-xl p-3 text-left transition-all border-2 ${
                activeCycle === cycle ? 'shadow-md' : 'opacity-70 hover:opacity-90 border-transparent'
              }`}
              style={{
                background: cfg.bg,
                borderColor: activeCycle === cycle ? cfg.color : 'transparent'
              }}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-bold" style={{ color: cfg.color }}>{cfg.label}</span>
                {isActive && <span className="text-[9px] bg-white/70 px-1.5 py-0.5 rounded font-medium" style={{ color: cfg.color }}>Active</span>}
              </div>
              <p className="text-lg font-bold text-gray-900">{formatK(t.ns * 1000)}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                GM: {formatK(t.gm * 1000)}
                <span className="ml-1">({t.ns > 0 ? (t.gm/t.ns*100).toFixed(1) : '—'}%)</span>
              </p>
              <p className={`text-xs mt-0.5 font-medium ${t.op >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                OP: {formatK(t.op * 1000)}
              </p>
            </button>
          )
        })}
      </div>

      {/* BU + Cycle selectors */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex rounded-xl overflow-hidden border border-gray-200">
          {BUS.map(bu => (
            <button key={bu} onClick={() => setActiveBu(bu)}
              className="px-4 py-2 text-sm font-semibold transition-all"
              style={activeBu === bu
                ? { background: BU_CONFIG[bu].color, color:'white' }
                : { background:'white', color:'#6B7280' }}>
              {BU_CONFIG[bu].label}
            </button>
          ))}
        </div>
        <div className="flex rounded-xl overflow-hidden border border-gray-200">
          {CYCLES.map(c => (
            <button key={c} onClick={() => setActiveCycle(c)}
              className="px-4 py-2 text-sm font-medium transition-all flex items-center gap-1.5"
              style={activeCycle === c
                ? { background: CYCLE_CONFIG[c].color, color:'white' }
                : { background:'white', color:'#6B7280' }}>
              {CYCLE_CONFIG[c].label}
              {c === activeCycleDefault && <span className="w-1.5 h-1.5 rounded-full bg-current opacity-70"/>}
            </button>
          ))}
        </div>
      </div>

      {/* Main P&L table */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-hidden">

        {/* Table header */}
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr style={{ background: buCfg.bg }}>
                <th className="text-left px-4 py-3 font-bold w-28 sticky left-0" style={{ background:buCfg.bg, color:buCfg.color }}>
                  {buCfg.label}
                </th>
                {MONTHS.map(m => (
                  <th key={m} className="px-1.5 py-3 font-semibold text-gray-500 text-center w-14">{m}</th>
                ))}
                <th className="px-3 py-3 font-bold text-gray-800 text-center w-16">FY26</th>
                {refCycle && <th className="px-3 py-3 font-medium text-gray-400 text-center w-16">vs {CYCLE_CONFIG[refCycle].label}</th>}
              </tr>
            </thead>
            <tbody>
              {PL_LINES.map(({ key, label, input, group }, lineIdx) => {
                const isTotal = group === 'total'
                const rowVals = Object.fromEntries(
                  PL_LINES.filter(l=>l.input).map(l => [l.key, MONTHS_K.reduce((s,m)=>s+getVal(activeBu,activeCycle,l.key,m),0)])
                )
                const derived = calcDerived(rowVals)
                const annualVal = input
                  ? MONTHS_K.reduce((s,m)=>s+getVal(activeBu,activeCycle,key,m),0)
                  : derived[key] || 0

                const refAnnual = refCycle
                  ? (input
                    ? MONTHS_K.reduce((s,m)=>s+getVal(activeBu,refCycle,key,m),0)
                    : calcDerived(Object.fromEntries(PL_LINES.filter(l=>l.input).map(l=>[l.key,MONTHS_K.reduce((s,m)=>s+getVal(activeBu,refCycle,l.key,m),0)])))[key] || 0)
                  : null

                return (
                  <tr key={key}
                    className={`border-b transition-colors ${
                      isTotal
                        ? 'bg-gray-50 border-gray-300'
                        : lineIdx % 2 === 0 ? 'bg-white' : 'bg-gray-50/40'
                    }`}>

                    {/* Line label */}
                    <td className={`px-4 py-2 sticky left-0 ${isTotal ? 'bg-gray-50' : lineIdx%2===0?'bg-white':'bg-gray-50/40'}`}>
                      <span className={`${isTotal ? 'font-bold text-gray-900' : 'text-gray-600'}`}>
                        {label}
                      </span>
                    </td>

                    {/* Monthly cells */}
                    {MONTHS_K.map((mk, mi) => {
                      const mRowVals = Object.fromEntries(
                        PL_LINES.filter(l=>l.input).map(l=>[l.key, getVal(activeBu,activeCycle,l.key,mk)])
                      )
                      const mDerived = calcDerived(mRowVals)
                      const cellVal = input ? getVal(activeBu,activeCycle,key,mk) : (mDerived[key]||0)
                      const isFocused = focusCell === `${key}-${mk}`
                      const isNeg = cellVal < 0

                      return (
                        <td key={mk} className="p-0.5">
                          {input ? (
                            <input
                              type="number" step="0.1"
                              value={isFocused ? (getVal(activeBu,activeCycle,key,mk)||'') : (cellVal||'')}
                              onFocus={() => setFocusCell(`${key}-${mk}`)}
                              onBlur={() => setFocusCell(null)}
                              onChange={e => setVal(activeBu,activeCycle,key,mk,e.target.value)}
                              placeholder="—"
                              className={`w-full text-center text-xs px-1 py-1.5 rounded-lg transition-all outline-none
                                ${isFocused
                                  ? 'ring-2 bg-white shadow-sm'
                                  : 'bg-transparent hover:bg-white hover:shadow-sm'
                                } ${isNeg ? 'text-red-500' : 'text-blue-700'}`}
                              style={isFocused ? { ringColor: buCfg.color } : {}}
                            />
                          ) : (
                            <div className={`text-center px-1 py-1.5 text-xs font-bold ${
                              isNeg ? 'text-red-600' : 'text-gray-800'
                            }`}>
                              {cellVal ? cellVal.toFixed(1) : '—'}
                            </div>
                          )}
                        </td>
                      )
                    })}

                    {/* FY26 total */}
                    <td className="px-3 py-2 text-center">
                      <span className={`text-xs font-bold ${
                        isTotal
                          ? annualVal < 0 ? 'text-red-600' : 'text-gray-900'
                          : annualVal < 0 ? 'text-red-500' : 'text-gray-700'
                      }`}>
                        {annualVal ? annualVal.toFixed(1) : '—'}
                      </span>
                    </td>

                    {/* vs reference cycle */}
                    {refCycle && (
                      <td className="px-3 py-2 text-center">
                        <Trend value={annualVal} reference={refAnnual}/>
                      </td>
                    )}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bottom hint */}
      <p className="text-xs text-gray-400 text-center">
        Click any cell to edit · Values in K€ · {cycleCfg.label} cycle
        {refCycle && ` · Trend vs ${CYCLE_CONFIG[refCycle].label}`}
      </p>
    </div>
  )
}

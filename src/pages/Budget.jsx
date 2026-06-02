import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { Spinner, formatK } from '../components/ui'
import { Save, CheckCircle, TrendingUp, TrendingDown, Minus, Camera, Lock, Clock, Plus, ChevronDown } from 'lucide-react'
import { useTranslation } from '../hooks/useTranslation'

const MONTHS   = ['Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar']
const MONTHS_K = ['apr','may','jun','jul','aug','sep','oct','nov','dec','jan','feb','mar']
const CYCLES   = ['BUD','EST1','EST2','ACT']
const BUS      = ['VGT','ECT','ALL']

const PL_LINES = [
  { key:'ns_int',    label:'NS Internal',    input:true,  group:'revenue' },
  { key:'ns_ext',    label:'NS External',    input:true,  group:'revenue' },
  { key:'ns',        label:'Net Sales',      input:false, group:'total'   },
  { key:'cogs_var',  label:'Variable COGS',  input:true,  group:'cost'    },
  { key:'cogs_fix',  label:'Fixed COGS',     input:true,  group:'cost'    },
  { key:'cogs',      label:'COGS',           input:false, group:'total'   },
  { key:'gm',        label:'Gross Margin',   input:false, group:'total'   },
  { key:'rd',        label:'R&D',            input:true,  group:'cost'    },
  { key:'sgas',      label:'SG&As (excl R&D)', input:true,  group:'cost'  },
  { key:'total_sga', label:'Total SGA',      input:false, group:'total'   },
  { key:'op1',       label:'OP1',            input:false, group:'total'   },
  { key:'bapa',      label:'BAPA Adjustment', input:true, group:'cost'    },
  { key:'op2',       label:'OP2',            input:false, group:'total'   },
]

const CYCLE_CONFIG = {
  BUD:  { label:'Budget',  color:'#185FA5', bg:'#E6F1FB', badge:'bg-blue-100 text-blue-800' },
  EST1: { label:'EST 1',   color:'#0F6E56', bg:'#E1F5EE', badge:'bg-green-100 text-green-800' },
  EST2: { label:'EST 2',   color:'#BA7517', bg:'#FAEEDA', badge:'bg-amber-100 text-amber-800' },
  ACT:  { label:'Actuals', color:'#7C3AED', bg:'#F3EDFF', badge:'bg-violet-100 text-violet-800' },
}

const COMPARE_OPTIONS = [
  { id: 'act_bud',  label: 'ACT vs BUD',  left: 'ACT', right: 'BUD' },
  { id: 'act_est1', label: 'ACT vs EST1', left: 'ACT', right: 'EST1' },
  { id: 'act_est2', label: 'ACT vs EST2', left: 'ACT', right: 'EST2' },
  { id: 'bud_est1', label: 'BUD vs EST1', left: 'BUD', right: 'EST1' },
]
const BU_CONFIG = {
  VGT: { color:'#1D9E75', bg:'#E1F5EE', label:'VGT · Portugal' },
  ECT: { color:'#D85A30', bg:'#FAECE7', label:'ECT · Spain'    },
  ALL: { color:'#0D2137', bg:'#F1EFE8', label:'Iberia · Consolidated' },
}

const PERIODS = {
  FY:  { label:'Full Year', months: ['apr','may','jun','jul','aug','sep','oct','nov','dec','jan','feb','mar'], display: ['Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar'] },
  Q1:  { label:'Q1 (Apr–Jun)', months: ['apr','may','jun'], display: ['Apr','May','Jun'] },
  Q2:  { label:'Q2 (Jul–Sep)', months: ['jul','aug','sep'], display: ['Jul','Aug','Sep'] },
  Q3:  { label:'Q3 (Oct–Dec)', months: ['oct','nov','dec'], display: ['Oct','Nov','Dec'] },
  Q4:  { label:'Q4 (Jan–Mar)', months: ['jan','feb','mar'], display: ['Jan','Feb','Mar'] },
  H1:  { label:'1H (Apr–Sep)', months: ['apr','may','jun','jul','aug','sep'], display: ['Apr','May','Jun','Jul','Aug','Sep'] },
  H2:  { label:'2H (Oct–Mar)', months: ['oct','nov','dec','jan','feb','mar'], display: ['Oct','Nov','Dec','Jan','Feb','Mar'] },
}

const ACTIVE_CYCLE = () => {
  const m = new Date().getMonth() + 1
  if (m >= 4 && m <= 6) return 'BUD'
  if (m >= 7) return 'EST1'
  return 'EST2'
}

function calcDerived(vals) {
  const ns = (vals.ns_int||0) + (vals.ns_ext||0)
  const cogs = (vals.cogs_var||0) + (vals.cogs_fix||0)
  const gm = ns - cogs
  const total_sga = (vals.rd||0) + (vals.sgas||0)
  const op1 = gm - total_sga
  const op2 = op1 + (vals.bapa||0)
  return { ns, cogs, gm, total_sga, op1, op2 }
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
  const { t: tr } = useTranslation()
  const [rows, setRows]       = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving]   = useState(false)
  const [saved, setSaved]     = useState(false)
  const [budgetTab, setBudgetTab] = useState('edit')
  const [compareMode, setCompareMode] = useState('act_bud')
  const [activeBu, setActiveBu]       = useState('VGT')
  const [activeCycle, setActiveCycle] = useState(ACTIVE_CYCLE())
  const [focusCell, setFocusCell]     = useState(null)
  const [activePeriod, setActivePeriod] = useState('FY')
  const [fctTab, setFctTab]           = useState('budget')
  const [fctSnapshots, setFctSnapshots] = useState([])
  const [fctForm, setFctForm]         = useState(null)
  const [fctSaving, setFctSaving]     = useState(false)
  const activeCycleDefault = ACTIVE_CYCLE()

  useEffect(() => {
    supabase.from('budget').select("*")
      .then(({ data, error }) => {

        setRows(data || [])
        setLoading(false)
      })
      .catch(e => {

        setLoading(false)
      })
    supabase.from('forecast_snapshots').select('*').order('created_at', { ascending: false })
      .then(({ data }) => setFctSnapshots(data || []))
      .catch(() => {})
  }, [])

  function getVal(bu, cycle, plKey, month) {
    if (bu === 'ALL') {
      return (['VGT','ECT'].reduce((s, b) => {
        const row = rows.find(r => r.bu===b && r.cycle===cycle && r.pl_key===plKey)
        return s + (row?.[month] || 0)
      }, 0))
    }
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
    const toSave = rows.filter(r => ['ns_int','ns_ext','cogs_var','cogs_fix','rd','sgas','bapa'].includes(r.pl_key))
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
      VGT: Object.fromEntries(CYCLES.map(c => [c, calc('VGT', c)])),
      ECT: Object.fromEntries(CYCLES.map(c => [c, calc('ECT', c)])),
      ALL: Object.fromEntries(CYCLES.map(c => {
        const v = calc('VGT', c), e = calc('ECT', c)
        return [c, Object.fromEntries(Object.keys(v).map(k => [k, (v[k]||0)+(e[k]||0)]))]
      })),
    }
  }, [rows])

  if (!isAdmin) return <div className="p-8 text-center text-gray-400">{tr("budget_admin")}</div>
  if (loading) return <Spinner/>

  const buCfg    = BU_CONFIG[activeBu]
  const cycleCfg = CYCLE_CONFIG[activeCycle]
  const refCycle = activeCycle === 'ACT' ? 'BUD' : activeCycle === 'EST2' ? 'EST1' : activeCycle === 'EST1' ? 'BUD' : null

  return (
    <div className="p-4 space-y-4 max-w-6xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between pt-1 flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{tr("budget_title")}</h1>
          <p className="text-sm text-gray-400">{tr("budget_values")}</p>
        </div>
        {activeBu !== 'ALL' && <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium text-white transition-all"
          style={{ background: saved ? '#1D9E75' : '#0D2137' }}>
          {saved ? <><CheckCircle size={15}/> {tr("budget_saved")}</> : saving ? tr("budget_saving") : <><Save size={15}/> {tr("budget_save")}</>}
        </button>}
      </div>

      {/* Edit / Compare tab */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit">
        <button onClick={() => setBudgetTab('edit')}
          className={`px-3 py-1.5 rounded text-xs font-semibold ${budgetTab === 'edit' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>
          Edit
        </button>
        <button onClick={() => setBudgetTab('compare')}
          className={`px-3 py-1.5 rounded text-xs font-semibold ${budgetTab === 'compare' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>
          Compare
        </button>
      </div>

      {budgetTab === 'compare' && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <select className="select text-sm w-auto" value={compareMode} onChange={e => setCompareMode(e.target.value)}>
              {COMPARE_OPTIONS.map(o => <option key={o.id} value={o.id}>{o.label}</option>)}
            </select>
            <div className="flex rounded-xl overflow-hidden border border-gray-200">
              {BUS.map(bu => (
                <button key={bu} onClick={() => setActiveBu(bu)}
                  className="px-3 py-1.5 text-xs font-semibold transition-all"
                  style={activeBu === bu ? { background: BU_CONFIG[bu].color, color:'white' } : { background:'white', color:'#6B7280' }}>
                  {BU_CONFIG[bu].label}
                </button>
              ))}
            </div>
          </div>

          {(() => {
            const cmp = COMPARE_OPTIONS.find(o => o.id === compareMode) || COMPARE_OPTIONS[0]
            const fyIdx = (() => { const m = new Date().getMonth() + 1; return ((m - 4 + 12) % 12) })()
            const ytdMonths = MONTHS_K.slice(0, fyIdx + 1)

            return (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50">
                      <th className="text-left px-4 py-2 font-bold w-32 sticky left-0 bg-gray-50">P&L Line</th>
                      {MONTHS.map(m => <th key={m} className="px-1 py-2 text-center w-20 font-semibold text-gray-500">{m}</th>)}
                      <th className="px-2 py-2 text-center w-20 font-bold text-gray-800">YTD</th>
                      <th className="px-2 py-2 text-center w-20 font-bold text-gray-800">FY</th>
                    </tr>
                  </thead>
                  <tbody>
                    {PL_LINES.map(({ key: plKey, label, input, group }) => {
                      const isTotal = group === 'total'
                      const isCost = group === 'cost'

                      function getMonthVal(cycle, bu, pk, month) {
                        if (bu === 'ALL') {
                          return ['VGT','ECT'].reduce((s, b) => {
                            const row = rows.find(r => r.bu === b && r.cycle === cycle && r.pl_key === pk)
                            return s + (Number(row?.[month]) || 0)
                          }, 0)
                        }
                        const row = rows.find(r => r.bu === bu && r.cycle === cycle && r.pl_key === pk)
                        return Number(row?.[month]) || 0
                      }

                      function getDerived(cycle, bu, month) {
                        const vals = Object.fromEntries(PL_LINES.filter(l=>l.input).map(l=>[l.key, getMonthVal(cycle, bu, l.key, month)]))
                        return calcDerived(vals)
                      }

                      function cellVal(cycle, month) {
                        return input ? getMonthVal(cycle, activeBu, plKey, month) : getDerived(cycle, activeBu, month)[plKey] || 0
                      }

                      const leftYTD = ytdMonths.reduce((s, m) => s + cellVal(cmp.left, m), 0)
                      const rightYTD = ytdMonths.reduce((s, m) => s + cellVal(cmp.right, m), 0)
                      const leftFY = MONTHS_K.reduce((s, m) => s + cellVal(cmp.left, m), 0)
                      const rightFY = MONTHS_K.reduce((s, m) => s + cellVal(cmp.right, m), 0)

                      function varColor(variance, isCostLine) {
                        if (variance === 0) return 'text-gray-400'
                        const favorable = isCostLine ? variance < 0 : variance > 0
                        return favorable ? 'text-green-600' : 'text-red-600'
                      }

                      return (
                        <tr key={plKey} className={`border-b ${isTotal ? 'bg-gray-50 font-bold' : ''}`}>
                          <td className={`px-4 py-1.5 sticky left-0 ${isTotal ? 'bg-gray-50 text-gray-900' : 'bg-white text-gray-600'}`}>{label}</td>
                          {MONTHS_K.map((m, mi) => {
                            const left = cellVal(cmp.left, m)
                            const right = cellVal(cmp.right, m)
                            const variance = left - right
                            const pct = right !== 0 ? (variance / Math.abs(right) * 100) : 0
                            return (
                              <td key={m} className="px-1 py-1 text-center">
                                <p className="text-xs font-semibold text-gray-800">{left ? left.toFixed(1) : '—'}</p>
                                <p className="text-[9px] text-gray-400">{right ? right.toFixed(1) : '—'}</p>
                                {(left || right) ? (
                                  <p className={`text-[9px] font-bold ${varColor(variance, isCost)}`}>
                                    {variance > 0 ? '+' : ''}{variance.toFixed(1)} ({pct > 0 ? '+' : ''}{pct.toFixed(0)}%)
                                  </p>
                                ) : null}
                              </td>
                            )
                          })}
                          <td className="px-2 py-1 text-center border-l-2 border-gray-200">
                            <p className="text-xs font-bold text-gray-800">{leftYTD.toFixed(1)}</p>
                            <p className="text-[9px] text-gray-400">{rightYTD.toFixed(1)}</p>
                            {(leftYTD || rightYTD) ? (
                              <p className={`text-[9px] font-bold ${varColor(leftYTD - rightYTD, isCost)}`}>
                                {(leftYTD - rightYTD) > 0 ? '+' : ''}{(leftYTD - rightYTD).toFixed(1)}
                              </p>
                            ) : null}
                          </td>
                          <td className="px-2 py-1 text-center">
                            <p className="text-xs font-bold text-gray-800">{leftFY.toFixed(1)}</p>
                            <p className="text-[9px] text-gray-400">{rightFY.toFixed(1)}</p>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )
          })()}
          <p className="text-[10px] text-gray-400 text-center">
            Top: {COMPARE_OPTIONS.find(o => o.id === compareMode)?.left} · Bottom: {COMPARE_OPTIONS.find(o => o.id === compareMode)?.right} · Green = favorable · Red = unfavorable · K€
          </p>
        </div>
      )}

      {budgetTab === 'edit' && (<>
      {/* Summary cards — all cycles at a glance */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
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
                {isActive && <span className="text-[9px] bg-white/70 px-1.5 py-0.5 rounded font-medium" style={{ color: cfg.color }}>{tr("budget_active")}</span>}
              </div>
              <p className="text-lg font-bold text-gray-900">{formatK(t.ns * 1000)}</p>
              <p className="text-xs text-gray-500 mt-0.5">
                GM: {formatK(t.gm * 1000)}
                <span className="ml-1">({t.ns > 0 ? (t.gm/t.ns*100).toFixed(1) : '—'}%)</span>
              </p>
              <p className={`text-xs mt-0.5 font-medium ${(t.op2 || t.op1) >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                OP2: {formatK((t.op2 || t.op1) * 1000)}
              </p>
            </button>
          )
        })}
      </div>

      {/* BU + Cycle selectors */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex rounded-xl overflow-hidden border border-gray-200 w-full sm:w-auto">
          {BUS.map(bu => (
            <button key={bu} onClick={() => setActiveBu(bu)}
              className="flex-1 sm:flex-none px-3 sm:px-4 py-2 text-sm font-semibold transition-all"
              style={activeBu === bu
                ? { background: BU_CONFIG[bu].color, color:'white' }
                : { background:'white', color:'#6B7280' }}>
              {BU_CONFIG[bu].label}
            </button>
          ))}
        </div>
        <div className="flex rounded-xl overflow-hidden border border-gray-200 w-full sm:w-auto">
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
                {PERIODS[activePeriod].display.map(m => (
                  <th key={m} className="px-1.5 py-3 font-semibold text-gray-500 text-center w-14">{m}</th>
                ))}
                <th className="px-3 py-3 font-bold text-gray-800 text-center w-16">
                  {activePeriod === 'FY' ? 'FY26' : PERIODS[activePeriod].label.split(" ")[0]}
                </th>
                {refCycle && <th className="px-3 py-3 font-medium text-gray-400 text-center w-16">vs {CYCLE_CONFIG[refCycle].label}</th>}
              </tr>
            </thead>
            <tbody>
              {PL_LINES.map(({ key, label, input, group }, lineIdx) => {
                const isTotal = group === 'total'
                const rowVals = Object.fromEntries(
                  PL_LINES.filter(l=>l.input).map(l => [l.key, PERIODS[activePeriod].months.reduce((s,m)=>s+getVal(activeBu,activeCycle,l.key,m),0)])
                )
                const derived = calcDerived(rowVals)
                const periodMonths = PERIODS[activePeriod].months
                const annualVal = input
                  ? periodMonths.reduce((s,m)=>s+getVal(activeBu,activeCycle,key,m),0)
                  : (() => {
                      const pVals = Object.fromEntries(PL_LINES.filter(l=>l.input).map(l=>[l.key, periodMonths.reduce((s,m)=>s+getVal(activeBu,activeCycle,l.key,m),0)]))
                      return calcDerived(pVals)[key] || 0
                    })()

                const refAnnual = refCycle
                  ? (input
                    ? periodMonths.reduce((s,m)=>s+getVal(activeBu,refCycle,key,m),0)
                    : calcDerived(Object.fromEntries(PL_LINES.filter(l=>l.input).map(l=>[l.key,periodMonths.reduce((s,m)=>s+getVal(activeBu,refCycle,l.key,m),0)])))[key] || 0)
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
                    {PERIODS[activePeriod].months.map((mk, mi) => {
                      const mRowVals = Object.fromEntries(
                        PL_LINES.filter(l=>l.input).map(l=>[l.key, getVal(activeBu,activeCycle,l.key,mk)])
                      )
                      const mDerived = calcDerived(mRowVals)
                      const cellVal = input ? getVal(activeBu,activeCycle,key,mk) : (mDerived[key]||0)
                      const isFocused = focusCell === `${key}-${mk}`
                      const isNeg = cellVal < 0

                      return (
                        <td key={mk} className="p-0.5">
                          {input && activeBu !== 'ALL' ? (
                            <input
                              type="number" step="0.1"
                              value={isFocused ? (getVal(activeBu,activeCycle,key,mk)||'') : (cellVal ? Math.round(cellVal*10)/10 : '')}
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

      {/* Period selector */}
      <div className="flex items-center gap-1 flex-wrap">
        <span className="text-xs text-gray-400 mr-1">{tr("budget_period")}</span>
        {Object.entries(PERIODS).map(([key, p]) => (
          <button key={key} onClick={() => setActivePeriod(key)}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all border ${
              activePeriod === key
                ? 'text-white border-transparent shadow-sm'
                : 'bg-white text-gray-500 border-gray-200 hover:border-gray-300'
            }`}
            style={activePeriod === key ? { background: buCfg.color } : {}}>
            {key === 'FY' ? 'Full Year' : key}
          </button>
        ))}
      </div>

      {/* Bottom hint */}
      <p className="text-xs text-gray-400 text-center">
        {activeBu === 'ALL'
          ? `Read-only consolidated view · K€ · ${cycleCfg.label} · ${PERIODS[activePeriod].label}`
          : `Click any cell to edit · K€ · ${cycleCfg.label} · ${PERIODS[activePeriod].label}`
        }
        {refCycle && ` · Trend vs ${CYCLE_CONFIG[refCycle].label}`}
      </p>

      </>)}

      {/* ── Manual FCT Section ──────────────────────────────── */}
      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <p className="text-sm font-bold text-gray-900 flex items-center gap-1.5">
              <Camera size={14}/> Manual Forecast (FCT)
            </p>
            <p className="text-[10px] text-gray-400">Snapshots from management review meetings</p>
          </div>
          {!fctForm && (
            <button onClick={() => {
              const autoExt = {}; const autoInt = {}
              MONTHS_K.forEach(m => {
                autoExt[m] = getVal(activeBu === 'ALL' ? 'VGT' : activeBu, activeCycle, 'ns_ext', m)
                autoInt[m] = getVal(activeBu === 'ALL' ? 'VGT' : activeBu, activeCycle, 'ns_int', m)
              })
              setFctForm({
                cycle: activeCycle,
                bu: activeBu === 'ALL' ? 'VGT' : activeBu,
                ns_ext: autoExt,
                ns_int: autoInt,
                notes: '',
              })
            }} className="btn-primary text-xs flex items-center gap-1">
              <Plus size={12}/> New FCT Snapshot
            </button>
          )}
        </div>

        {/* FCT Form */}
        {fctForm && (
          <div className="border border-blue-200 rounded-xl p-3 space-y-3 bg-blue-50/30">
            <div className="flex items-center gap-2 flex-wrap">
              <select className="select text-xs w-auto" value={fctForm.cycle}
                onChange={e => setFctForm(f => ({ ...f, cycle: e.target.value }))}>
                {CYCLES.map(c => <option key={c} value={c}>{CYCLE_CONFIG[c].label}</option>)}
              </select>
              <select className="select text-xs w-auto" value={fctForm.bu}
                onChange={e => setFctForm(f => ({ ...f, bu: e.target.value }))}>
                <option value="VGT">VGT</option>
                <option value="ECT">ECT</option>
              </select>
              <span className="text-[10px] text-blue-500">Pre-filled from budget · adjust as needed</span>
            </div>

            {['ns_ext', 'ns_int'].map(plKey => (
              <div key={plKey}>
                <p className="text-[10px] font-semibold text-gray-500 uppercase mb-1">
                  {plKey === 'ns_ext' ? 'External Sales (K€)' : 'Internal Sales (K€)'}
                </p>
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-1">
                  {MONTHS_K.map((m, i) => (
                    <div key={m}>
                      <label className="text-[9px] text-gray-400">{MONTHS[i]}</label>
                      <input className="input text-xs py-1" type="number"
                        value={fctForm[plKey][m] || 0}
                        onChange={e => setFctForm(f => ({
                          ...f, [plKey]: { ...f[plKey], [m]: parseFloat(e.target.value) || 0 }
                        }))}/>
                    </div>
                  ))}
                </div>
                <p className="text-[10px] text-right text-gray-500 mt-0.5">
                  Total: {formatK(MONTHS_K.reduce((s, m) => s + (fctForm[plKey][m] || 0), 0) * 1000)}
                </p>
              </div>
            ))}

            <div>
              <label className="text-[10px] text-gray-500">Notes (optional)</label>
              <input className="input text-xs" value={fctForm.notes}
                onChange={e => setFctForm(f => ({ ...f, notes: e.target.value }))}
                placeholder="e.g. EST1 reviewed with Director — adjusted Q3 pipeline"/>
            </div>

            <div className="flex gap-2">
              <button onClick={() => setFctForm(null)} className="btn-secondary text-xs flex-1">Cancel</button>
              <button onClick={async () => {
                setFctSaving(true)
                const base = { cycle: fctForm.cycle, bu: fctForm.bu, created_by: null, notes: fctForm.notes || null }
                await supabase.from('forecast_snapshots').insert([
                  { ...base, pl_key: 'ns_ext', ...fctForm.ns_ext },
                  { ...base, pl_key: 'ns_int', ...fctForm.ns_int },
                ])
                const { data } = await supabase.from('forecast_snapshots').select('*').order('created_at', { ascending: false })
                setFctSnapshots(data || [])
                setFctForm(null)
                setFctSaving(false)
              }} disabled={fctSaving} className="btn-primary text-xs flex-1">
                {fctSaving ? 'Saving…' : 'Save Snapshot'}
              </button>
            </div>
          </div>
        )}

        {/* FCT History */}
        {fctSnapshots.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] font-semibold text-gray-400 uppercase">Snapshot History</p>
            {(() => {
              const byDate = {}
              for (const s of fctSnapshots) {
                const key = `${s.cycle}-${s.bu}-${s.created_at?.slice(0, 16)}`
                if (!byDate[key]) byDate[key] = { cycle: s.cycle, bu: s.bu, created_at: s.created_at, notes: s.notes, rows: [], expanded: false }
                byDate[key].rows.push(s)
                if (s.notes) byDate[key].notes = s.notes
              }
              return Object.values(byDate).slice(0, 20).map((group, i) => {
                const total = group.rows.reduce((s, r) =>
                  s + MONTHS_K.reduce((ms, m) => ms + (Number(r[m]) || 0), 0), 0)
                const extRow = group.rows.find(r => r.pl_key === 'ns_ext')
                const intRow = group.rows.find(r => r.pl_key === 'ns_int')
                return (
                  <div key={i} className="bg-gray-50 rounded-lg overflow-hidden">
                    <button onClick={() => {
                      const el = document.getElementById(`fct-detail-${i}`)
                      if (el) el.classList.toggle('hidden')
                    }} className="w-full flex items-center justify-between px-3 py-2 hover:bg-gray-100 transition-colors">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${CYCLE_CONFIG[group.cycle]?.badge}`}>
                          {group.cycle}
                        </span>
                        <span className="text-[10px] text-gray-500">{group.bu}</span>
                        <span className="text-[10px] text-gray-400">
                          {new Date(group.created_at).toLocaleDateString('pt-PT', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </span>
                        {group.rows[0]?.is_locked && <Lock size={10} className="text-amber-500"/>}
                      </div>
                      <div className="flex items-center gap-2">
                        {group.notes && <span className="text-[9px] text-gray-400 max-w-32 truncate">{group.notes}</span>}
                        <span className="text-xs font-semibold text-gray-700">{formatK(total * 1000)}</span>
                        <ChevronDown size={12} className="text-gray-400"/>
                      </div>
                    </button>
                    <div id={`fct-detail-${i}`} className="hidden px-3 pb-2 space-y-1">
                      {extRow && (
                        <div>
                          <p className="text-[9px] text-gray-400 uppercase">External</p>
                          <div className="grid grid-cols-6 gap-0.5">
                            {MONTHS.map((m, mi) => (
                              <div key={m} className="text-center">
                                <p className="text-[8px] text-gray-300">{m}</p>
                                <p className="text-[10px] font-semibold text-gray-700">{Number(extRow[MONTHS_K[mi]]) || '—'}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {intRow && (
                        <div>
                          <p className="text-[9px] text-gray-400 uppercase">Internal</p>
                          <div className="grid grid-cols-6 gap-0.5">
                            {MONTHS.map((m, mi) => (
                              <div key={m} className="text-center">
                                <p className="text-[8px] text-gray-300">{m}</p>
                                <p className="text-[10px] font-semibold text-gray-700">{Number(intRow[MONTHS_K[mi]]) || '—'}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })
            })()}
          </div>
        )}
      </div>
    </div>
  )
}

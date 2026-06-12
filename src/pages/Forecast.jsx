import { useState, useMemo, useCallback } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useDeals } from '../hooks/useDeals'
import { useTranslation } from '../hooks/useTranslation'
import { supabase } from '../lib/supabase'
import { formatK } from '../components/ui'
import { MONTHS_K, WEIGHTS, STAGE_CLASS } from '../constants'
import { Calendar, GripVertical, Filter, Split, X, Save, Check } from 'lucide-react'

const MONTHS_LABEL = ['Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar']
const FY_YEAR = 2026

function dealValue(d) {
  const fy = MONTHS_K.reduce((s, m) => s + (Number(d[m]) || 0), 0)
  return fy || Number(d.value_total) || 0
}

function monthKeyFromLabel(label) {
  return MONTHS_K[MONTHS_LABEL.indexOf(label)]
}

function hasMonthlySpread(d) {
  let nonZero = 0
  MONTHS_K.forEach(m => { if (Number(d[m]) > 0) nonZero++ })
  return nonZero > 1
}

function firstMonthWithValue(d) {
  for (let i = 0; i < MONTHS_K.length; i++) {
    if (Number(d[MONTHS_K[i]]) > 0) return MONTHS_LABEL[i]
  }
  return null
}

function recMonthLabel(d) {
  if (d.rec_month) {
    const idx = MONTHS_LABEL.findIndex(m => m.toLowerCase() === d.rec_month.toLowerCase())
    if (idx >= 0) return MONTHS_LABEL[idx]
  }
  return null
}

function StagePill({ stage }) {
  return (
    <span className={`text-micro font-bold px-1.5 py-0.5 rounded ${STAGE_CLASS[stage] || 'bg-gray-100 text-gray-600'}`}>
      {stage === 'Offer Presented' ? 'Offer' : stage}
    </span>
  )
}

function SplitEditor({ deal, onSave, onClose }) {
  const total = Number(deal.value_total) || 0
  const [vals, setVals] = useState(() => {
    const v = {}
    MONTHS_K.forEach(m => { v[m] = Number(deal[m]) || 0 })
    return v
  })
  const [saving, setSaving] = useState(false)
  const allocated = Object.values(vals).reduce((s, v) => s + v, 0)
  const remaining = total - allocated

  const handleSave = async () => {
    setSaving(true)
    const update = { ...vals }
    const firstM = MONTHS_K.find(m => vals[m] > 0)
    if (firstM) {
      const idx = MONTHS_K.indexOf(firstM)
      update.rec_month = MONTHS_LABEL[idx]
      update.rec_year = idx >= 9 ? FY_YEAR + 1 : FY_YEAR
    }
    await onSave(deal.id, update)
    setSaving(false)
  }

  return (
    <div className="bg-blue-50/50 border border-blue-200 rounded-lg p-2 mt-1 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-micro font-bold text-blue-700">Revenue split · {formatK(total)} total</p>
        <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={12}/></button>
      </div>
      <div className="grid grid-cols-4 gap-1">
        {MONTHS_LABEL.map((m, i) => (
          <div key={m}>
            <label className="text-micro text-gray-400">{m}</label>
            <input type="number" step="0.01" min="0"
              value={vals[MONTHS_K[i]] || ''}
              onChange={e => setVals(v => ({ ...v, [MONTHS_K[i]]: parseFloat(e.target.value) || 0 }))}
              placeholder="0"
              className="w-full text-xs text-center px-1 py-1 rounded border border-gray-200 focus:border-blue-400 focus:ring-1 focus:ring-blue-200 outline-none"
              style={{ fontSize: '16px' }}
            />
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between text-micro">
        <span className={remaining < -0.01 ? 'text-red-500 font-bold' : remaining > 0.01 ? 'text-amber-600' : 'text-green-600'}>
          {remaining > 0.01 ? `${formatK(remaining)} remaining` : remaining < -0.01 ? `${formatK(Math.abs(remaining))} over-allocated!` : 'Fully allocated'}
        </span>
        <button onClick={handleSave} disabled={saving}
          className="flex items-center gap-1 text-xs bg-navy text-white px-3 py-1 rounded-lg hover:bg-navy/90 disabled:opacity-50">
          {saving ? '...' : <><Save size={11}/> Save split</>}
        </button>
      </div>
    </div>
  )
}

function DealCard({ deal, canEdit, onDragStart, onDragEnd, onSaveSplit, monthContext }) {
  const [splitOpen, setSplitOpen] = useState(false)
  const val = dealValue(deal)
  const weight = WEIGHTS[deal.stage] ?? 0
  const isSplit = hasMonthlySpread(deal)
  const monthVal = monthContext ? Number(deal[monthKeyFromLabel(monthContext)]) || 0 : 0

  return (
    <div className="mb-1.5">
      <div
        draggable={canEdit && !splitOpen}
        onDragStart={e => { e.dataTransfer.setData('text/plain', deal.id); onDragStart?.(deal.id) }}
        onDragEnd={onDragEnd}
        className={`bg-white rounded-lg border border-gray-200 p-2 shadow-sm hover:shadow transition-all ${
          canEdit && !splitOpen ? 'cursor-grab active:cursor-grabbing' : ''
        } ${isSplit ? 'border-l-2 border-l-blue-400' : ''}`}
      >
        <div className="flex items-start gap-1">
          {canEdit && !splitOpen && <GripVertical size={10} className="text-gray-300 shrink-0 mt-1"/>}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1 mb-0.5">
              <span className={`text-micro font-bold px-1 py-0 rounded ${deal.bu === 'VGT' ? 'bg-vgt/10 text-vgt' : 'bg-ect/10 text-ect'}`}>
                {deal.bu}
              </span>
              <StagePill stage={deal.stage}/>
              {isSplit && <span className="text-micro text-blue-500 font-medium">split</span>}
            </div>
            <p className="text-xs font-semibold text-gray-900 truncate leading-tight">{deal.client}</p>
            {deal.product && <p className="text-micro text-gray-400 truncate">{deal.product}</p>}
            <div className="flex items-center gap-2 mt-0.5">
              {monthContext && isSplit ? (
                <>
                  <span className="text-xs font-bold text-blue-700">{formatK(monthVal)}</span>
                  <span className="text-micro text-gray-400">of {formatK(val)}</span>
                </>
              ) : (
                <>
                  <span className="text-xs font-bold text-gray-700">{formatK(val)}</span>
                  {weight < 1 && weight > 0 && (
                    <span className="text-micro text-gray-400">w: {formatK(val * weight)}</span>
                  )}
                </>
              )}
            </div>
            {canEdit && (
              <button onClick={e => { e.stopPropagation(); setSplitOpen(o => !o) }}
                className="text-micro text-blue-500 hover:text-blue-700 mt-0.5 flex items-center gap-0.5">
                <Split size={9}/> {splitOpen ? 'close' : 'split'}
              </button>
            )}
          </div>
        </div>
      </div>
      {splitOpen && canEdit && (
        <SplitEditor deal={deal} onSave={onSaveSplit} onClose={() => setSplitOpen(false)}/>
      )}
    </div>
  )
}

function MonthColumn({ label, deals, canEdit, dragOver, onDragOver, onDragLeave, onDrop, onDragStart, onDragEnd, onSaveSplit }) {
  const mk = monthKeyFromLabel(label)
  const total = deals.reduce((s, d) => s + (Number(d[mk]) || 0 || dealValue(d)), 0)
  const monthTotal = deals.reduce((s, d) => {
    const mv = Number(d[mk]) || 0
    return s + (mv > 0 ? mv : dealValue(d))
  }, 0)
  const weighted = deals.reduce((s, d) => {
    const mv = Number(d[mk]) || 0
    const v = mv > 0 ? mv : dealValue(d)
    return s + v * (WEIGHTS[d.stage] ?? 0)
  }, 0)
  const isPast = (() => {
    const now = new Date()
    const mi = MONTHS_LABEL.indexOf(label)
    const yr = mi >= 9 ? FY_YEAR + 1 : FY_YEAR
    const calMonth = (mi + 3) % 12
    return new Date(yr, calMonth + 1, 0) < now
  })()

  return (
    <div
      onDragOver={e => { e.preventDefault(); onDragOver?.() }}
      onDragLeave={onDragLeave}
      onDrop={e => { e.preventDefault(); onDrop?.(e.dataTransfer.getData('text/plain')) }}
      className={`flex flex-col min-w-[140px] max-w-[180px] rounded-xl border transition-colors shrink-0 ${
        dragOver ? 'border-navy bg-navy/5' : 'border-gray-200 bg-gray-50/50'
      } ${isPast ? 'opacity-60' : ''}`}
      style={{ scrollSnapAlign: 'start' }}
    >
      <div className="px-2 py-1.5 border-b border-gray-200 bg-white rounded-t-xl">
        <p className="text-xs font-bold text-gray-700">{label}</p>
        <div className="flex items-center justify-between">
          <span className="text-micro text-gray-500">{deals.length} deals</span>
          <span className="text-xs font-bold text-navy">{formatK(monthTotal)}</span>
        </div>
        {Math.abs(monthTotal - weighted) > 1 && (
          <p className="text-micro text-gray-400">weighted: {formatK(weighted)}</p>
        )}
      </div>
      <div className="flex-1 p-1.5 overflow-y-auto max-h-[55vh] min-h-[60px]">
        {deals.map(d => (
          <DealCard key={d.id} deal={d} canEdit={canEdit} monthContext={label}
            onDragStart={onDragStart} onDragEnd={onDragEnd} onSaveSplit={onSaveSplit}/>
        ))}
        {deals.length === 0 && (
          <p className="text-micro text-gray-300 text-center py-4">Drop deals here</p>
        )}
      </div>
    </div>
  )
}

export default function Forecast() {
  const { isAdmin, canEdit: canEditPerm, profile, readOnly } = useAuth()
  const { deals: allDeals, loading, refetch } = useDeals()
  const { t } = useTranslation()
  const [dragOverMonth, setDragOverMonth] = useState(null)
  const [draggingId, setDraggingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [filterBU, setFilterBU] = useState('')
  const [filterStage, setFilterStage] = useState('')
  const [showInvoiced, setShowInvoiced] = useState(false)

  const editable = (isAdmin || canEditPerm) && !readOnly

  const deals = useMemo(() => {
    let d = allDeals.filter(x => !x.is_intercompany_mirror)
    if (filterBU) d = d.filter(x => x.bu === filterBU)
    if (!showInvoiced) d = d.filter(x => x.stage !== 'Invoiced')
    if (filterStage) d = d.filter(x => x.stage === filterStage)
    return d
  }, [allDeals, filterBU, filterStage, showInvoiced])

  // Unallocated = no rec_month AND no monthly spread
  const unallocated = useMemo(() =>
    deals.filter(d => {
      if (recMonthLabel(d)) return false
      if (hasMonthlySpread(d)) return false
      const first = firstMonthWithValue(d)
      return !first
    })
  , [deals])

  // By month: show deal in month if rec_month matches OR if that month column has value > 0
  const byMonth = useMemo(() => {
    const map = {}
    MONTHS_LABEL.forEach(m => { map[m] = [] })
    const placed = new Set()
    deals.forEach(d => {
      const spread = hasMonthlySpread(d)
      if (spread) {
        MONTHS_K.forEach((mk, i) => {
          if (Number(d[mk]) > 0) {
            map[MONTHS_LABEL[i]].push(d)
            placed.add(d.id)
          }
        })
      } else {
        const rm = recMonthLabel(d)
        const fm = firstMonthWithValue(d)
        const target = rm || fm
        if (target && map[target]) {
          map[target].push(d)
          placed.add(d.id)
        }
      }
    })
    return map
  }, [deals])

  const handleDrop = useCallback(async (dealId, monthLabel) => {
    if (!editable || saving) return
    setSaving(true)
    setDragOverMonth(null)
    const mk = monthKeyFromLabel(monthLabel)
    const deal = allDeals.find(d => d.id === dealId)
    if (!deal) { setSaving(false); return }
    const val = dealValue(deal)
    const update = {
      rec_month: monthLabel,
      rec_year: MONTHS_LABEL.indexOf(monthLabel) >= 9 ? FY_YEAR + 1 : FY_YEAR,
    }
    // Only set month columns if deal doesn't already have a multi-month spread
    if (!hasMonthlySpread(deal) && val > 0) {
      MONTHS_K.forEach(m => { update[m] = 0 })
      update[mk] = val
    }
    await supabase.from('deals').update(update).eq('id', dealId)
    await refetch()
    setSaving(false)
  }, [editable, saving, allDeals, refetch])

  const handleUnallocate = useCallback(async (dealId) => {
    if (!editable || saving) return
    setSaving(true)
    setDragOverMonth(null)
    await supabase.from('deals').update({ rec_month: null, rec_year: null }).eq('id', dealId)
    await refetch()
    setSaving(false)
  }, [editable, saving, refetch])

  const handleSaveSplit = useCallback(async (dealId, update) => {
    if (!editable) return
    await supabase.from('deals').update(update).eq('id', dealId)
    await refetch()
  }, [editable, refetch])

  const totals = useMemo(() => {
    const t = { total: 0, weighted: 0, allocated: 0, unalloc: 0 }
    deals.forEach(d => {
      const v = dealValue(d); const w = v * (WEIGHTS[d.stage] ?? 0)
      t.total += v; t.weighted += w
      const rm = recMonthLabel(d); const fm = firstMonthWithValue(d)
      if (rm || fm || hasMonthlySpread(d)) t.allocated += v; else t.unalloc += v
    })
    return t
  }, [deals])

  if (loading) return (
    <div className="flex items-center justify-center p-16">
      <div className="w-6 h-6 border-2 border-navy border-t-transparent rounded-full animate-spin"/>
    </div>
  )

  return (
    <div className="p-4 space-y-4 max-w-full mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <Calendar size={20} className="text-navy"/> Forecast Calendar
          </h1>
          <p className="text-sm text-gray-400">
            FY26 · Drag deals to months · Click <Split size={10} className="inline text-blue-500"/> to split revenue across months
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs flex-wrap">
          <div className="bg-white border border-gray-200 rounded-lg px-3 py-1.5">
            <span className="text-gray-400">Pipeline:</span>{' '}
            <span className="font-bold text-gray-900">{formatK(totals.total)}</span>
            <span className="text-gray-300 mx-1">·</span>
            <span className="text-gray-400">Weighted:</span>{' '}
            <span className="font-bold text-navy">{formatK(totals.weighted)}</span>
          </div>
          <div className="bg-white border border-gray-200 rounded-lg px-3 py-1.5">
            <span className="text-green-600 font-medium">Allocated: {formatK(totals.allocated)}</span>
            <span className="text-gray-300 mx-1">·</span>
            <span className="text-amber-600 font-medium">Unalloc: {formatK(totals.unalloc)}</span>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter size={13} className="text-gray-400"/>
        <select value={filterBU} onChange={e => setFilterBU(e.target.value)}
          className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white">
          <option value="">All BUs</option>
          <option value="VGT">VGT</option>
          <option value="ECT">ECT</option>
        </select>
        <select value={filterStage} onChange={e => setFilterStage(e.target.value)}
          className="text-xs border border-gray-200 rounded-lg px-2 py-1.5 bg-white">
          <option value="">All Stages</option>
          <option value="Lead">Lead</option>
          <option value="Pipeline">Pipeline</option>
          <option value="Offer Presented">Offer Presented</option>
          <option value="BackLog">BackLog</option>
        </select>
        <label className="flex items-center gap-1.5 text-xs text-gray-500 cursor-pointer">
          <input type="checkbox" checked={showInvoiced} onChange={e => setShowInvoiced(e.target.checked)}
            className="rounded border-gray-300"/>
          Show Invoiced
        </label>
        {saving && <span className="text-micro text-amber-600 animate-pulse">Saving...</span>}
      </div>

      {/* Calendar grid */}
      <div className="flex gap-2 overflow-x-auto pb-4" style={{ scrollSnapType: 'x mandatory' }}>
        {/* Unallocated column */}
        <div
          onDragOver={e => { e.preventDefault(); setDragOverMonth('unalloc') }}
          onDragLeave={() => setDragOverMonth(null)}
          onDrop={e => { e.preventDefault(); handleUnallocate(e.dataTransfer.getData('text/plain')) }}
          className={`flex flex-col min-w-[160px] max-w-[200px] rounded-xl border transition-colors shrink-0 ${
            dragOverMonth === 'unalloc' ? 'border-amber-400 bg-amber-50' : 'border-amber-200 bg-amber-50/30'
          }`}
          style={{ scrollSnapAlign: 'start' }}
        >
          <div className="px-2 py-1.5 border-b border-amber-200 bg-white rounded-t-xl">
            <p className="text-xs font-bold text-amber-700">Unallocated</p>
            <div className="flex items-center justify-between">
              <span className="text-micro text-gray-500">{unallocated.length} deals</span>
              <span className="text-xs font-bold text-amber-700">{formatK(unallocated.reduce((s, d) => s + dealValue(d), 0))}</span>
            </div>
          </div>
          <div className="flex-1 p-1.5 overflow-y-auto max-h-[55vh] min-h-[60px]">
            {unallocated.map(d => (
              <DealCard key={d.id} deal={d} canEdit={editable}
                onDragStart={() => setDraggingId(d.id)}
                onDragEnd={() => setDraggingId(null)}
                onSaveSplit={handleSaveSplit}/>
            ))}
          </div>
        </div>

        <div className="w-px bg-gray-200 shrink-0 self-stretch"/>

        {/* Month columns */}
        {MONTHS_LABEL.map(m => (
          <MonthColumn key={m} label={m} deals={byMonth[m] || []}
            canEdit={editable}
            dragOver={dragOverMonth === m}
            onDragOver={() => setDragOverMonth(m)}
            onDragLeave={() => { if (dragOverMonth === m) setDragOverMonth(null) }}
            onDrop={dealId => handleDrop(dealId, m)}
            onDragStart={() => setDraggingId}
            onDragEnd={() => setDraggingId(null)}
            onSaveSplit={handleSaveSplit}
          />
        ))}
      </div>
    </div>
  )
}

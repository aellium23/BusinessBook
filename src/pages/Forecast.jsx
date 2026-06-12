import { useState, useMemo, useCallback } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useDeals } from '../hooks/useDeals'
import { useTranslation } from '../hooks/useTranslation'
import { supabase } from '../lib/supabase'
import { formatK, CollapsibleSection } from '../components/ui'
import { MONTHS_K, WEIGHTS, STAGE_CLASS } from '../constants'
import { Calendar, GripVertical, Filter, ChevronDown } from 'lucide-react'

const MONTHS_LABEL = ['Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar']
const FY_YEAR = 2026

function dealValue(d) {
  const fy = MONTHS_K.reduce((s, m) => s + (Number(d[m]) || 0), 0)
  return fy || Number(d.value_total) || 0
}

function monthKeyFromLabel(label) {
  return MONTHS_K[MONTHS_LABEL.indexOf(label)]
}

function recMonthIndex(d) {
  if (!d.rec_month) return -1
  const idx = MONTHS_LABEL.findIndex(m => m.toLowerCase() === d.rec_month.toLowerCase())
  return idx
}

function StagePill({ stage }) {
  return (
    <span className={`text-micro font-bold px-1.5 py-0.5 rounded ${STAGE_CLASS[stage] || 'bg-gray-100 text-gray-600'}`}>
      {stage === 'Offer Presented' ? 'Offer' : stage}
    </span>
  )
}

function DealCard({ deal, canEdit, onDragStart, onDragEnd }) {
  const val = dealValue(deal)
  const weight = WEIGHTS[deal.stage] ?? 0
  return (
    <div
      draggable={canEdit}
      onDragStart={e => { e.dataTransfer.setData('text/plain', deal.id); onDragStart?.(deal.id) }}
      onDragEnd={onDragEnd}
      className={`bg-white rounded-lg border border-gray-200 p-2 shadow-sm hover:shadow transition-all mb-1.5 ${
        canEdit ? 'cursor-grab active:cursor-grabbing' : ''
      }`}
    >
      <div className="flex items-start gap-1">
        {canEdit && <GripVertical size={10} className="text-gray-300 shrink-0 mt-1"/>}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 mb-0.5">
            <span className={`text-micro font-bold px-1 py-0 rounded ${deal.bu === 'VGT' ? 'bg-vgt/10 text-vgt' : 'bg-ect/10 text-ect'}`}>
              {deal.bu}
            </span>
            <StagePill stage={deal.stage}/>
          </div>
          <p className="text-xs font-semibold text-gray-900 truncate leading-tight">{deal.client}</p>
          {deal.product && <p className="text-micro text-gray-400 truncate">{deal.product}</p>}
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs font-bold text-gray-700">{formatK(val)}</span>
            {weight < 1 && weight > 0 && (
              <span className="text-micro text-gray-400">w: {formatK(val * weight)}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

function MonthColumn({ label, deals, canEdit, dragOver, onDragOver, onDragLeave, onDrop, onDragStart, onDragEnd }) {
  const total = deals.reduce((s, d) => s + dealValue(d), 0)
  const weighted = deals.reduce((s, d) => s + dealValue(d) * (WEIGHTS[d.stage] ?? 0), 0)
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
      className={`flex flex-col min-w-[140px] max-w-[180px] rounded-xl border transition-colors ${
        dragOver ? 'border-navy bg-navy/5' : 'border-gray-200 bg-gray-50/50'
      } ${isPast ? 'opacity-60' : ''}`}
    >
      <div className="px-2 py-1.5 border-b border-gray-200 bg-white rounded-t-xl">
        <p className="text-xs font-bold text-gray-700">{label}</p>
        <div className="flex items-center justify-between">
          <span className="text-micro text-gray-500">{deals.length} deals</span>
          <span className="text-xs font-bold text-navy">{formatK(total)}</span>
        </div>
        {Math.abs(total - weighted) > 1 && (
          <p className="text-micro text-gray-400">weighted: {formatK(weighted)}</p>
        )}
      </div>
      <div className="flex-1 p-1.5 space-y-0 overflow-y-auto max-h-[55vh] min-h-[60px]">
        {deals.map(d => (
          <DealCard key={d.id} deal={d} canEdit={canEdit}
            onDragStart={onDragStart} onDragEnd={onDragEnd}/>
        ))}
        {deals.length === 0 && (
          <p className="text-micro text-gray-300 text-center py-4">Drop deals here</p>
        )}
      </div>
    </div>
  )
}

export default function Forecast() {
  const { isAdmin, canEdit, profile, readOnly } = useAuth()
  const { deals: allDeals, loading, refetch } = useDeals()
  const { t } = useTranslation()
  const [dragOverMonth, setDragOverMonth] = useState(null)
  const [draggingId, setDraggingId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [filterBU, setFilterBU] = useState('')
  const [filterStage, setFilterStage] = useState('')
  const [showInvoiced, setShowInvoiced] = useState(false)

  const editable = (isAdmin || canEdit) && !readOnly

  const deals = useMemo(() => {
    let d = allDeals.filter(x => !x.is_intercompany_mirror)
    if (filterBU) d = d.filter(x => x.bu === filterBU)
    if (!showInvoiced) d = d.filter(x => x.stage !== 'Invoiced')
    if (filterStage) d = d.filter(x => x.stage === filterStage)
    return d
  }, [allDeals, filterBU, filterStage, showInvoiced])

  const unallocated = useMemo(() =>
    deals.filter(d => !d.rec_month || recMonthIndex(d) < 0)
  , [deals])

  const byMonth = useMemo(() => {
    const map = {}
    MONTHS_LABEL.forEach(m => { map[m] = [] })
    deals.forEach(d => {
      const idx = recMonthIndex(d)
      if (idx >= 0) map[MONTHS_LABEL[idx]].push(d)
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
    if (val > 0 && Number(deal[mk] || 0) === 0) {
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

  const totals = useMemo(() => {
    const t = { total: 0, weighted: 0, allocated: 0, unalloc: 0 }
    deals.forEach(d => {
      const v = dealValue(d); const w = v * (WEIGHTS[d.stage] ?? 0)
      t.total += v; t.weighted += w
      if (recMonthIndex(d) >= 0) t.allocated += v; else t.unalloc += v
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
          <p className="text-sm text-gray-400">FY26 · Drag deals to the month you expect to recognize revenue</p>
        </div>
        <div className="flex items-center gap-3 text-xs">
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
        >
          <div className="px-2 py-1.5 border-b border-amber-200 bg-white rounded-t-xl">
            <p className="text-xs font-bold text-amber-700">Unallocated</p>
            <div className="flex items-center justify-between">
              <span className="text-micro text-gray-500">{unallocated.length} deals</span>
              <span className="text-xs font-bold text-amber-700">{formatK(unallocated.reduce((s, d) => s + dealValue(d), 0))}</span>
            </div>
          </div>
          <div className="flex-1 p-1.5 space-y-0 overflow-y-auto max-h-[55vh] min-h-[60px]">
            {unallocated.map(d => (
              <DealCard key={d.id} deal={d} canEdit={editable}
                onDragStart={() => setDraggingId(d.id)}
                onDragEnd={() => setDraggingId(null)}/>
            ))}
          </div>
        </div>

        {/* Separator */}
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
          />
        ))}
      </div>
    </div>
  )
}

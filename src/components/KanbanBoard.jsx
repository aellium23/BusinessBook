import { useState } from 'react'
import { BUBadge, ForecastBadge, formatK } from './ui'
import { STAGES, MONTHS_K, WEIGHTS } from '../constants'
import { Pencil, Trash2, GripVertical } from 'lucide-react'

// Columns = pipeline stages (Lost hidden by default, configurable)
const DEFAULT_COLUMNS = STAGES.filter(s => s !== 'Lost')

function stageColor(stage) {
  switch (stage) {
    case 'Lead':             return 'bg-gray-100 text-gray-600'
    case 'Pipeline':         return 'bg-amber-100 text-amber-700'
    case 'Offer Presented':  return 'bg-purple-100 text-purple-700'
    case 'BackLog':          return 'bg-blue-100 text-blue-700'
    case 'Invoiced':         return 'bg-green-100 text-green-700'
    case 'Lost':             return 'bg-red-100 text-red-700'
    default:                 return 'bg-gray-100 text-gray-600'
  }
}

function dealFY26(deal) {
  return MONTHS_K.reduce((s, m) => s + (deal[m] || 0), 0)
}

function columnTotal(deals, stage) {
  return deals
    .filter(d => d.stage === stage && !d.is_intercompany_mirror)
    .reduce((s, d) => {
      // For closed stages use monthly sum; otherwise deal value
      if (stage === 'BackLog' || stage === 'Invoiced') return s + dealFY26(d)
      return s + (d.value_total || 0)
    }, 0)
}

function KanbanCard({ deal, onEdit, onDelete, canEdit, dragHandlers }) {
  const isIC   = deal.is_intercompany_mirror
  const weight = WEIGHTS[deal.stage] ?? 0
  const weighted = (deal.value_total || 0) * weight
  return (
    <div
      draggable={canEdit && !isIC}
      onDragStart={dragHandlers?.onDragStart}
      onDragEnd={dragHandlers?.onDragEnd}
      className={`group bg-white rounded-lg border border-gray-200 p-2.5 shadow-sm hover:shadow transition-all ${
        canEdit && !isIC ? 'cursor-grab active:cursor-grabbing' : ''
      }`}>
      <div className="flex items-start gap-1.5">
        {canEdit && !isIC && (
          <GripVertical size={12} className="text-gray-300 group-hover:text-gray-400 shrink-0 mt-0.5"/>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1 flex-wrap mb-0.5">
            <BUBadge bu={deal.bu}/>
            <ForecastBadge deal={deal} compact/>
            {deal.win_probability != null && (
              <span className="text-[9px] text-gray-400 font-medium">{deal.win_probability}%</span>
            )}
          </div>
          <p className="text-xs font-semibold text-gray-900 truncate">{deal.client}</p>
          {(deal.country || deal.sales_owner) && (
            <p className="text-[10px] text-gray-400 truncate">
              {[deal.country, deal.sales_owner].filter(Boolean).join(' · ')}
            </p>
          )}
          <div className="flex items-center justify-between mt-1">
            <span className="text-xs font-bold text-gray-800">
              {['BackLog','Invoiced'].includes(deal.stage)
                ? formatK(dealFY26(deal))
                : formatK(deal.value_total)}
            </span>
            {weight > 0 && weight < 1 && (
              <span className="text-[10px] text-blue-500">W: {formatK(weighted)}</span>
            )}
          </div>
        </div>
      </div>
      {canEdit && !isIC && (
        <div className="flex gap-1 mt-1.5 pt-1.5 border-t border-gray-50 opacity-0 group-hover:opacity-100 transition-opacity">
          <button type="button" onClick={() => onEdit(deal)}
            className="text-[10px] text-gray-500 hover:text-navy flex items-center gap-0.5">
            <Pencil size={9}/> Edit
          </button>
          <button type="button" onClick={() => onDelete(deal)}
            className="text-[10px] text-gray-400 hover:text-red-500 ml-auto flex items-center gap-0.5">
            <Trash2 size={9}/>
          </button>
        </div>
      )}
    </div>
  )
}

/**
 * Props:
 *   deals      : [{ id, stage, ... }]
 *   onEdit     : (deal) => void
 *   onDelete   : (deal) => void
 *   onMove     : async (dealId, newStage) => void — called when a card is dropped
 *   canEdit    : boolean
 *   columns    : string[] (optional) — stages to render; defaults to STAGES without Lost
 */
export default function KanbanBoard({ deals = [], onEdit, onDelete, onMove, canEdit = true, columns = DEFAULT_COLUMNS }) {
  const [draggingId, setDraggingId] = useState(null)
  const [hoverStage, setHoverStage] = useState(null)

  function startDrag(id) { setDraggingId(id) }
  function endDrag() { setDraggingId(null); setHoverStage(null) }

  function handleDrop(e, stage) {
    e.preventDefault()
    setHoverStage(null)
    const id = draggingId
    if (!id) return
    const deal = deals.find(d => d.id === id)
    if (!deal || deal.stage === stage) { setDraggingId(null); return }
    onMove?.(id, stage)
    setDraggingId(null)
  }

  const perStage = {}
  deals.forEach(d => {
    (perStage[d.stage] ??= []).push(d)
  })

  return (
    <div className="overflow-x-auto pb-2 -mx-1 px-1">
      <div className="flex gap-3 min-w-max">
        {columns.map(stage => {
          const list = perStage[stage] || []
          const total = columnTotal(deals, stage)
          const isHover = hoverStage === stage
          return (
            <div key={stage}
              onDragOver={e => { if (canEdit) { e.preventDefault(); setHoverStage(stage) } }}
              onDragLeave={() => setHoverStage(h => h === stage ? null : h)}
              onDrop={e => handleDrop(e, stage)}
              className={`w-64 shrink-0 rounded-xl border transition-colors ${
                isHover ? 'border-navy bg-navy/5' : 'border-gray-200 bg-gray-50'
              }`}>
              {/* Column header */}
              <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${stageColor(stage)}`}>
                    {stage}
                  </span>
                  <span className="text-[10px] text-gray-400">{list.length}</span>
                </div>
                <span className="text-[11px] font-semibold text-gray-600">{formatK(total)}</span>
              </div>

              {/* Cards */}
              <div className="p-2 space-y-2 min-h-[100px] max-h-[70vh] overflow-y-auto">
                {list.length === 0 ? (
                  <p className="text-[11px] text-gray-400 text-center py-4 italic">Drop deals here</p>
                ) : list.map(d => (
                  <KanbanCard
                    key={d.id}
                    deal={d}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    canEdit={canEdit}
                    dragHandlers={{
                      onDragStart: () => startDrag(d.id),
                      onDragEnd:   endDrag,
                    }}
                  />
                ))}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

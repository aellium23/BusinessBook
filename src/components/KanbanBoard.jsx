import { useState, memo } from 'react'
import { BUBadge, ForecastBadge, formatK } from './ui'
import { STAGES, MONTHS_K, WEIGHTS, STAGE_CLASS } from '../constants'
import { Pencil, Trash2, GripVertical } from 'lucide-react'
import { canTransition, getAllowedTransitions } from '../lib/stateMachine'

// Columns = pipeline stages (Lost hidden by default, configurable)
const DEFAULT_COLUMNS = STAGES.filter(s => s !== 'Lost')

function stageColor(stage) {
  return STAGE_CLASS[stage] || 'bg-gray-100 text-gray-600'
}

function dealValue(deal) {
  const fy26 = MONTHS_K.reduce((s, m) => s + (Number(deal[m]) || 0), 0)
  return fy26 || Number(deal.value_total) || 0
}

function columnTotal(deals, stage) {
  return deals
    .filter(d => d.stage === stage && !d.is_intercompany_mirror)
    .reduce((s, d) => s + dealValue(d), 0)
}

const KanbanCard = memo(function KanbanCard({ deal, onEdit, onDelete, canEdit, dragHandlers }) {
  const isIC   = deal.is_intercompany_mirror
  const val    = dealValue(deal)
  const weight = WEIGHTS[deal.stage] ?? 0
  const weighted = val * weight
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
              <span className="text-micro text-gray-400 font-medium">{deal.win_probability}%</span>
            )}
          </div>
          <p className="text-xs font-semibold text-gray-900 truncate">{deal.client}</p>
          {(deal.country || deal.sales_owner) && (
            <p className="text-micro text-gray-400 truncate">
              {[deal.country, deal.sales_owner].filter(Boolean).join(' · ')}
            </p>
          )}
          <div className="flex items-center justify-between mt-1">
            <span className="text-xs font-bold text-gray-800">
              {formatK(val)}
            </span>
            {weight > 0 && weight < 1 && (
              <span className="text-micro text-blue-500">W: {formatK(weighted)}</span>
            )}
          </div>
        </div>
      </div>
      {canEdit && !isIC && (
        <div className="flex gap-1 mt-1.5 pt-1.5 border-t border-gray-50 opacity-0 group-hover:opacity-100 transition-opacity">
          <button type="button" onClick={() => onEdit(deal)}
            className="text-micro text-gray-500 hover:text-navy flex items-center gap-0.5">
            <Pencil size={9}/> Edit
          </button>
          <button type="button" onClick={() => onDelete(deal)}
            className="text-micro text-gray-400 hover:text-red-500 ml-auto flex items-center gap-0.5">
            <Trash2 size={9}/>
          </button>
        </div>
      )}
    </div>
  )
})

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
    // Validate the transition using the state machine
    if (!canTransition('deal', deal.stage, stage)) {
      const allowed = getAllowedTransitions('deal', deal.stage).filter(s => s !== deal.stage)
      alert(`Cannot move deal from "${deal.stage}" to "${stage}".\nAllowed transitions: ${allowed.join(', ') || 'none'}`)
      setDraggingId(null)
      return
    }
    onMove?.(id, stage)
    setDraggingId(null)
  }

  // Determine which stages are valid drop targets for the currently dragged deal
  const draggingDeal = draggingId ? deals.find(d => d.id === draggingId) : null
  const validDropStages = draggingDeal
    ? getAllowedTransitions('deal', draggingDeal.stage)
    : []

  const perStage = {}
  deals.forEach(d => {
    (perStage[d.stage] ??= []).push(d)
  })

  return (
    <div className="sm:overflow-x-auto pb-2 -mx-1 px-1">
      <div className="flex gap-3 max-sm:flex-col">
        {columns.map(stage => {
          const list = perStage[stage] || []
          const total = columnTotal(deals, stage)
          const isHover = hoverStage === stage
          const isValidDrop = draggingId ? validDropStages.includes(stage) : true
          const isInvalidHover = isHover && !isValidDrop
          return (
            <div key={stage}
              onDragOver={e => { if (canEdit) { e.preventDefault(); setHoverStage(stage) } }}
              onDragLeave={() => setHoverStage(h => h === stage ? null : h)}
              onDrop={e => handleDrop(e, stage)}
              className={`max-sm:w-full sm:w-64 sm:shrink-0 rounded-xl border transition-colors ${
                isInvalidHover ? 'border-red-300 bg-red-50/50 opacity-60' :
                isHover && isValidDrop ? 'border-navy bg-navy/5' :
                draggingId && !isValidDrop ? 'border-gray-200 bg-gray-50 opacity-40' :
                'border-gray-200 bg-gray-50'
              }`}>
              {/* Column header */}
              <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className={`text-micro font-bold px-2 py-0.5 rounded ${stageColor(stage)}`}>
                    {stage}
                  </span>
                  <span className="text-micro text-gray-400">{list.length}</span>
                </div>
                <span className="text-tiny font-semibold text-gray-600">{formatK(total)}</span>
              </div>

              {/* Cards */}
              <div className="p-2 space-y-2 min-h-[100px] max-h-[70vh] overflow-y-auto">
                {list.length === 0 ? (
                  <p className="text-tiny text-gray-400 text-center py-4 italic">Drop deals here</p>
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

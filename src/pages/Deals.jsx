import { useState, useMemo } from 'react'
import { useDeals, deleteDeal } from '../hooks/useDeals'
import { useAuth } from '../hooks/useAuth'
import { BUBadge, StageBadge, SalesTypeBadge, Spinner, EmptyState, formatK } from '../components/ui'
import DealForm from '../components/DealForm'
import { Plus, Search, Filter, Trash2, Pencil, ChevronDown, ChevronUp } from 'lucide-react'

const STAGES = ['','Lead','Pipeline','BackLog','Invoiced']
const REGIONS = ['','Europe','MEA','LATAM','APAC','NA']
const BUS = ['','VGT','ECT']
const MONTHS_K = ['apr','may','jun','jul','aug','sep','oct','nov','dec','jan','feb','mar']

function DealCard({ deal, onEdit, onDelete, canEdit }) {
  const [open, setOpen] = useState(false)
  const fy26 = MONTHS_K.reduce((s, m) => s + (deal[m] || 0), 0)

  return (
    <div className="card p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            <BUBadge bu={deal.bu} />
            <StageBadge stage={deal.stage} />
            <SalesTypeBadge type={deal.sales_type} />
          </div>
          <p className="font-semibold text-sm text-gray-900 truncate">{deal.client}</p>
          <p className="text-xs text-gray-400">{deal.country} · {deal.sales_owner}</p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-sm font-bold text-gray-900">{formatK(deal.value_total)}</p>
          <p className="text-xs text-gray-400">FY26: {formatK(fy26)}</p>
        </div>
      </div>

      {deal.description && (
        <p className="text-xs text-gray-500 truncate">{deal.description}</p>
      )}

      <div className="flex items-center justify-between pt-1">
        <button onClick={() => setOpen(o => !o)} className="text-xs text-gray-400 flex items-center gap-1">
          Monthly {open ? <ChevronUp size={12}/> : <ChevronDown size={12}/>}
        </button>
        {canEdit && (
          <div className="flex gap-2">
            <button onClick={() => onEdit(deal)} className="text-gray-400 hover:text-navy">
              <Pencil size={14}/>
            </button>
            <button onClick={() => onDelete(deal)} className="text-gray-400 hover:text-red-500">
              <Trash2 size={14}/>
            </button>
          </div>
        )}
      </div>

      {open && (
        <div className="grid grid-cols-6 gap-1 pt-1">
          {['Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar'].map((m, i) => {
            const v = deal[MONTHS_K[i]] || 0
            return (
              <div key={m} className={`text-center rounded p-1 ${v > 0 ? 'bg-vgt/10' : 'bg-gray-50'}`}>
                <p className="text-[9px] text-gray-400">{m}</p>
                <p className="text-[10px] font-bold text-gray-700">{v > 0 ? `${(v/1000).toFixed(1)}K` : '—'}</p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function Deals() {
  const { canEdit, isAdmin } = useAuth()
  const [search, setSearch]   = useState('')
  const [stageF, setStageF]   = useState('')
  const [regionF, setRegionF] = useState('')
  const [buF, setBuF]         = useState('')
  const [editDeal, setEditDeal]   = useState(null)
  const [formOpen, setFormOpen]   = useState(false)
  const [confirmDel, setConfirmDel] = useState(null)

  const { deals, loading, refetch, totals } = useDeals({
    stage: stageF || undefined,
    region: regionF || undefined,
    bu: buF || undefined,
    search: search || undefined,
  })

  async function handleDelete(deal) {
    setConfirmDel(deal)
  }
  async function confirmDelete() {
    await deleteDeal(confirmDel.id)
    setConfirmDel(null)
    refetch()
  }

  return (
    <div className="p-4 space-y-4 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between pt-1">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Deals</h1>
          <p className="text-sm text-gray-400">{deals.length} records</p>
        </div>
        {canEdit && (
          <button onClick={() => { setEditDeal(null); setFormOpen(true) }} className="btn-primary">
            <Plus size={16}/> New deal
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-32">
          <Search size={14} className="absolute left-2.5 top-2.5 text-gray-400"/>
          <input className="input pl-8" placeholder="Search client…" value={search} onChange={e => setSearch(e.target.value)}/>
        </div>
        {isAdmin && (
          <select className="select w-24" value={buF} onChange={e => setBuF(e.target.value)}>
            {BUS.map(b => <option key={b} value={b}>{b || 'All BU'}</option>)}
          </select>
        )}
        <select className="select w-28" value={stageF} onChange={e => setStageF(e.target.value)}>
          {STAGES.map(s => <option key={s} value={s}>{s || 'All stages'}</option>)}
        </select>
        <select className="select w-28" value={regionF} onChange={e => setRegionF(e.target.value)}>
          {REGIONS.map(r => <option key={r} value={r}>{r || 'All regions'}</option>)}
        </select>
      </div>

      {/* Summary strip */}
      <div className="flex gap-3 overflow-x-auto pb-1">
        {[
          { l: 'Pipeline', v: totals.pipeline, c: 'text-amber-700' },
          { l: 'BackLog',  v: totals.backlog,  c: 'text-blue-700'  },
          { l: 'Actuals',  v: totals.invoiced, c: 'text-green-700' },
          { l: 'Forecast', v: totals.forecast, c: 'text-vgt font-bold' },
        ].map(({ l, v, c }) => (
          <div key={l} className="text-center shrink-0">
            <p className="text-[10px] text-gray-400">{l}</p>
            <p className={`text-sm font-semibold ${c}`}>{formatK(v)}</p>
          </div>
        ))}
      </div>

      {/* List */}
      {loading ? <Spinner /> : deals.length === 0
        ? <EmptyState icon="📋" title="No deals found" description="Adjust filters or add a new deal" action={canEdit && <button onClick={() => setFormOpen(true)} className="btn-primary">Add deal</button>}/>
        : (
          <div className="space-y-2">
            {deals.map(d => (
              <DealCard key={d.id} deal={d} canEdit={canEdit}
                onEdit={deal => { setEditDeal(deal); setFormOpen(true) }}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )
      }

      {/* Forms / Modals */}
      {formOpen && (
        <DealForm deal={editDeal} onClose={() => { setFormOpen(false); setEditDeal(null) }} onSaved={refetch} />
      )}

      {confirmDel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setConfirmDel(null)} />
          <div className="relative bg-white rounded-2xl p-6 max-w-xs w-full shadow-xl">
            <h3 className="font-semibold text-gray-900 mb-2">Delete deal?</h3>
            <p className="text-sm text-gray-500 mb-4">
              <strong>{confirmDel.client}</strong> will be permanently removed.
            </p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDel(null)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={confirmDelete} className="btn-danger flex-1">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

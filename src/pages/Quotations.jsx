import { useState, useMemo, memo } from 'react'
import { useAuth } from '../hooks/useAuth'
import { useQuotations, updateQuotation, deleteQuotation, convertQuotationToDeal } from '../hooks/useQuotations'
import { useTranslation } from '../hooks/useTranslation'
import { formatK } from '../components/ui'
import { Plus, Search, Send, Check, X, ArrowRight, MessageSquare, Trash2, FileText } from 'lucide-react'
import QuotationFormModal from '../components/QuotationFormModal'

const STATUS_STYLES = {
  draft:     'bg-gray-100 text-gray-600',
  sent:      'bg-blue-100 text-blue-700',
  viewed:    'bg-purple-100 text-purple-700',
  accepted:  'bg-green-100 text-green-700',
  rejected:  'bg-red-100 text-red-700',
  counter:   'bg-amber-100 text-amber-800',
  expired:   'bg-gray-200 text-gray-500',
  converted: 'bg-navy/10 text-navy',
}

const CONTEXT_LABELS = {
  license_compliance: 'License Compliance',
  new_business:       'New Business',
  upgrade:            'Upgrade',
}

const QuotationCard = memo(function QuotationCard({ q, onEdit, onDelete, onSend, onConvert, onRespond, isDistributor, canEdit, t }) {
  const [showRespond, setShowRespond] = useState(false)
  const [responseNote, setResponseNote] = useState('')
  const [counterValue, setCounterValue] = useState('')
  const [responding, setResponding] = useState(false)

  const total = (q.items || []).reduce((s, it) => s + (Number(it.total_price) || 0), 0) || Number(q.total_value) || 0
  const isTerminal = ['accepted', 'rejected', 'converted', 'expired'].includes(q.status)

  async function handleRespond(status) {
    setResponding(true)
    await onRespond(q, status, responseNote, status === 'counter' ? parseFloat(counterValue) : null)
    setResponding(false)
    setShowRespond(false)
    setResponseNote('')
    setCounterValue('')
  }

  return (
    <div className="card p-4 space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`badge ${STATUS_STYLES[q.status] || 'badge-neutral'}`}>{q.status}</span>
          {q.context_type && <span className="badge-info">{CONTEXT_LABELS[q.context_type] || q.context_type}</span>}
          {q.quotation_number && <span className="text-micro text-gray-400">#{q.quotation_number}</span>}
        </div>
        {!isTerminal && canEdit && !isDistributor && (
          <div className="flex items-center gap-1">
            <button onClick={() => onEdit(q)} className="text-gray-400 hover:text-navy p-1 min-h-tap"><FileText size={13}/></button>
            {q.status === 'draft' && (
              <button onClick={() => onSend(q)} className="text-blue-500 hover:text-blue-700 p-1 min-h-tap"><Send size={13}/></button>
            )}
            {['accepted'].includes(q.status) && !q.deal_id && (
              <button onClick={() => onConvert(q)} className="text-green-600 hover:text-green-800 p-1 min-h-tap" title="Convert to Deal">
                <ArrowRight size={13}/>
              </button>
            )}
            <button onClick={() => onDelete(q)} className="text-gray-300 hover:text-red-500 p-1 min-h-tap"><Trash2 size={13}/></button>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-bold text-gray-900 truncate">{q.client}</p>
          {q.description && <p className="text-micro text-gray-500 truncate">{q.description}</p>}
        </div>
        <p className="text-lg font-bold text-gray-900">{formatK(total)}</p>
      </div>

      {/* Items summary */}
      {(q.items || []).length > 0 && (
        <div className="flex flex-wrap gap-1">
          {q.items.map((it, i) => (
            <span key={i} className="badge-neutral">{it.product_name} ×{it.quantity || 1}</span>
          ))}
        </div>
      )}

      {/* Compliance context */}
      {q.context_type === 'license_compliance' && q.licensed_volume && (
        <p className="text-micro text-red-600 bg-red-50 rounded px-2 py-1">
          {t('quot_licensed')}: {Number(q.licensed_volume).toLocaleString('pt-PT')} → {t('quot_actual')}: {Number(q.actual_volume).toLocaleString('pt-PT')}
        </p>
      )}

      {/* Negotiation trail */}
      {q.response_note && (
        <div className="bg-gray-50 rounded px-2 py-1">
          <p className="text-micro text-gray-600"><MessageSquare size={10} className="inline mr-1"/>{q.response_note}</p>
        </div>
      )}
      {q.counter_value && q.status === 'counter' && (
        <p className="text-micro text-amber-700 font-semibold">{t('quot_counter_value')}: {formatK(q.counter_value)}</p>
      )}

      {/* Deal link */}
      {q.deal_id && (
        <p className="text-micro text-navy">{t('quot_converted_to_deal')} <a href="/deals" className="underline">→ Deals</a></p>
      )}

      {/* Distributor response actions */}
      {isDistributor && ['sent', 'viewed'].includes(q.status) && !showRespond && (
        <div className="flex gap-2 pt-1 border-t border-gray-100">
          <button onClick={() => { setShowRespond(true) }} className="btn-primary text-xs flex-1">
            <Check size={11}/> {t('quot_accept')}
          </button>
          <button onClick={() => { setShowRespond(true); setCounterValue(String(total)) }} className="btn-secondary text-xs flex-1">
            <MessageSquare size={11}/> {t('quot_counter')}
          </button>
          <button onClick={() => handleRespond('rejected')} className="btn-danger text-xs">
            <X size={11}/>
          </button>
        </div>
      )}

      {showRespond && (
        <div className="space-y-2 pt-1 border-t border-gray-100">
          {counterValue && (
            <div>
              <label className="text-micro text-gray-500">{t('quot_counter_value')}</label>
              <input className="input text-xs py-1" type="number" value={counterValue} onChange={e => setCounterValue(e.target.value)}/>
            </div>
          )}
          <div>
            <label className="text-micro text-gray-500">{t('quot_note')}</label>
            <input className="input text-xs py-1" value={responseNote} onChange={e => setResponseNote(e.target.value)} placeholder={t('quot_note_ph')}/>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setShowRespond(false)} className="btn-secondary text-xs flex-1">{t('df_cancel')}</button>
            {counterValue ? (
              <button onClick={() => handleRespond('counter')} disabled={responding} className="btn-primary text-xs flex-1">
                <MessageSquare size={11}/> {t('quot_send_counter')}
              </button>
            ) : (
              <button onClick={() => handleRespond('accepted')} disabled={responding} className="btn-primary text-xs flex-1">
                <Check size={11}/> {t('quot_confirm_accept')}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Internal: accept counter-offer from distributor */}
      {!isDistributor && q.status === 'counter' && canEdit && (
        <div className="flex gap-2 pt-1 border-t border-amber-100">
          <button onClick={() => onRespond(q, 'accepted', null, null)} className="btn-primary text-xs flex-1">
            <Check size={11}/> {t('quot_accept_counter')} ({formatK(q.counter_value)})
          </button>
          <button onClick={() => onEdit(q)} className="btn-secondary text-xs">{t('quot_revise')}</button>
        </div>
      )}
    </div>
  )
})

export default function Quotations() {
  const { profile, isAdmin, canEdit } = useAuth()
  const { t } = useTranslation()
  const isDistributor = profile?.role === 'distributor'
  const [statusF, setStatusF] = useState('')
  const [search, setSearch]   = useState('')
  const { quotations, loading, refetch } = useQuotations({ status: statusF || undefined, search: search || undefined })
  const [editQ, setEditQ]     = useState(null)
  const [showNew, setShowNew] = useState(false)
  const [confirmDel, setConfirmDel] = useState(null)

  const tabs = useMemo(() => [
    { id: '',         label: t('quot_tab_all'),      count: quotations.length },
    { id: 'draft',    label: t('quot_tab_draft'),    count: quotations.filter(q => q.status === 'draft').length },
    { id: 'sent',     label: t('quot_tab_sent'),     count: quotations.filter(q => ['sent','viewed'].includes(q.status)).length },
    { id: 'counter',  label: t('quot_tab_counter'),  count: quotations.filter(q => q.status === 'counter').length },
    { id: 'accepted', label: t('quot_tab_accepted'), count: quotations.filter(q => q.status === 'accepted').length },
    { id: 'converted',label: t('quot_tab_converted'),count: quotations.filter(q => q.status === 'converted').length },
  ], [quotations, t])

  const filtered = useMemo(() => {
    if (statusF === 'sent') return quotations.filter(q => ['sent','viewed'].includes(q.status))
    return statusF ? quotations.filter(q => q.status === statusF) : quotations
  }, [quotations, statusF])

  async function handleSend(q) {
    await updateQuotation(q.id, { status: 'sent', sent_at: new Date().toISOString() })
    // Notify distributor
    if (q.company_id) {
      const { data: distUsers } = await (await import('../lib/supabase')).supabase
        .from('profiles').select('id').eq('company_id', q.company_id).eq('role', 'distributor')
      if (distUsers?.length) {
        await (await import('../lib/supabase')).supabase.from('notifications').insert(
          distUsers.map(u => ({
            user_id: u.id, type: 'quotation_sent',
            title: `New quotation: ${q.client}`,
            body: `A quotation for ${q.client} has been sent for your review.`,
            link_type: 'quotation', link_id: q.id,
          }))
        )
      }
    }
    refetch()
  }

  async function handleConvert(q) {
    const { data, error } = await convertQuotationToDeal(q)
    if (error) { alert(error.message); return }
    alert(`Deal created for ${q.client}`)
    refetch()
  }

  async function handleRespond(q, status, note, counterVal) {
    const updates = { status, response_note: note || null, responded_at: new Date().toISOString() }
    if (status === 'counter') updates.counter_value = counterVal
    if (status === 'accepted') updates.accepted_at = new Date().toISOString()
    await updateQuotation(q.id, updates)
    // Notify the other party
    const notifyUserId = isDistributor ? q.created_by : null
    if (notifyUserId) {
      await (await import('../lib/supabase')).supabase.from('notifications').insert({
        user_id: notifyUserId, type: 'quotation_response',
        title: `Quotation ${status}: ${q.client}`,
        body: status === 'accepted' ? 'Quotation accepted' : status === 'counter' ? `Counter-offer: ${formatK(counterVal)}` : 'Quotation rejected',
        link_type: 'quotation', link_id: q.id,
      })
    }
    refetch()
  }

  async function handleDelete() {
    if (!confirmDel) return
    await deleteQuotation(confirmDel.id)
    setConfirmDel(null)
    refetch()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-lg font-bold text-gray-900">{t('quot_title')}</h1>
        {canEdit && !isDistributor && (
          <button onClick={() => setShowNew(true)} className="btn-primary text-xs">
            <Plus size={13}/> {t('quot_new')}
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto no-scrollbar">
        {tabs.map(tab => (
          <button key={tab.id} onClick={() => setStatusF(tab.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors ${
              statusF === tab.id ? 'bg-navy text-white' : 'bg-white text-gray-500 border border-gray-200 hover:border-gray-400'
            }`}>
            {tab.label} {tab.count > 0 && <span className="ml-1 opacity-70">({tab.count})</span>}
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"/>
        <input className="input pl-9" value={search} onChange={e => setSearch(e.target.value)}
          placeholder={t('quot_search')}/>
      </div>

      {/* List */}
      {loading ? (
        <p className="text-sm text-gray-400 text-center py-8">{t('loading')}</p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-8">{t('quot_empty')}</p>
      ) : (
        <div className="space-y-3">
          {filtered.map(q => (
            <QuotationCard key={q.id} q={q} isDistributor={isDistributor} canEdit={canEdit} t={t}
              onEdit={setEditQ} onDelete={setConfirmDel} onSend={handleSend}
              onConvert={handleConvert} onRespond={handleRespond}/>
          ))}
        </div>
      )}

      {/* Modals */}
      {(showNew || editQ) && (
        <QuotationFormModal
          quotation={editQ}
          onClose={() => { setShowNew(false); setEditQ(null) }}
          onSaved={() => { setShowNew(false); setEditQ(null); refetch() }}
        />
      )}
      {confirmDel && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={() => setConfirmDel(null)}>
          <div className="bg-white rounded-xl p-6 max-w-sm space-y-3" onClick={e => e.stopPropagation()}>
            <p className="text-sm font-semibold">{t('quot_delete_confirm')}</p>
            <p className="text-sm text-gray-600">{confirmDel.client} — {formatK(confirmDel.total_value)}</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDel(null)} className="btn-secondary flex-1">{t('df_cancel')}</button>
              <button onClick={handleDelete} className="btn-danger flex-1">{t('quot_delete')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

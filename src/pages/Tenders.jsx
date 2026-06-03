import { useState, useEffect, useRef, memo, useMemo } from 'react'
import { useTenders, createTender, updateTender, deleteTender } from '../hooks/useTasks'
import { useAuth } from '../hooks/useAuth'
import { useTranslation } from '../hooks/useTranslation'
import { useDebounce } from '../hooks/useDebounce'
import { supabase } from '../lib/supabase'
import { validateTender } from '../lib/validation'
import { Modal, Spinner, StageBadge, BUBadge } from '../components/ui'
import AttachmentsList from '../components/AttachmentsList'
import RequirementsMatrix from '../components/RequirementsMatrix'
import SearchableSelect from '../components/SearchableSelect'
import QuickDealForm from '../components/QuickDealForm'
import ProductLineItems from '../components/ProductLineItems'
import {
  Plus, Edit3, Trash2, AlertCircle, Calendar, Link2,
  Users, TrendingUp, CheckCircle2, XCircle, Clock,
  ChevronDown, ChevronUp, Search, FileText, X,
  ListChecks, Paperclip, Info,
} from 'lucide-react'

const STATUS_CONFIG = {
  open:       { labelKey: 'tender_open',       color: 'text-blue-700',  bg: 'bg-blue-50',  border: 'border-blue-200' },
  submitted:  { labelKey: 'tender_submitted',  color: 'text-purple-700',bg: 'bg-purple-50',border: 'border-purple-200' },
  won:        { labelKey: 'tender_won',        color: 'text-green-700', bg: 'bg-green-50', border: 'border-green-200' },
  lost:       { labelKey: 'tender_lost',       color: 'text-red-700',   bg: 'bg-red-50',   border: 'border-red-200' },
  cancelled:  { labelKey: 'tender_cancelled',  color: 'text-gray-500',  bg: 'bg-gray-50',  border: 'border-gray-200' },
}

function daysDiff(dateStr) {
  if (!dateStr) return null
  return Math.ceil((new Date(dateStr) - new Date()) / 86400000)
}

function DeadlineChip({ date, label }) {
  const { t } = useTranslation()
  if (!date) return null
  const diff = daysDiff(date)
  const text = diff < 0
    ? `${Math.abs(diff)}${t('tender_d_overdue')}`
    : diff === 0 ? t('task_today')
    : diff === 1 ? t('task_tomorrow')
    : `${diff}d`
  const cls = diff < 0
    ? 'bg-red-100 text-red-700 border-red-200'
    : diff <= 3 ? 'bg-amber-100 text-amber-700 border-amber-200'
    : diff <= 7 ? 'bg-orange-100 text-orange-700 border-orange-200'
    : 'bg-gray-100 text-gray-500 border-gray-200'
  return (
    <div className={`flex items-center gap-1 text-micro font-semibold px-2 py-1 rounded-lg border ${cls}`}>
      <Calendar size={9} />
      <span>{label}: {new Date(date).toLocaleDateString('pt-PT', { day:'numeric', month:'short' })}</span>
      <span className="opacity-60">({text})</span>
    </div>
  )
}

// ── Tender Form Modal ──────────────────────────────────────────────────────────
function TenderModal({ tender, onClose, onSaved, deals, users, onDealsChanged, canEdit: canEditProp }) {
  const { user, profile } = useAuth()
  const { t } = useTranslation()
  const isEdit = !!tender?.id
  const [form, setForm] = useState({
    title:               tender?.title               ?? '',
    reference:           tender?.reference           ?? '',
    description:         tender?.description         ?? '',
    status:              tender?.status              ?? 'open',
    submission_deadline: tender?.submission_deadline ?? '',
    decision_date:       tender?.decision_date       ?? '',
    estimated_value:     tender?.estimated_value     ?? '',
    currency:            tender?.currency            ?? 'EUR',
    deal_id:             tender?.deal_id             ?? '',
    collaborators:       tender?.collaborators?.map(c => c.user_id) ?? [],
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState(null)
  const [fieldErrors, setFieldErrors] = useState({})
  const [creatingDeal, setCreatingDeal] = useState(false)
  const [prefillClient, setPrefillClient] = useState('')
  const [tab, setTab]       = useState('details')
  const [tenderLines, setTenderLines] = useState([])
  const [catalogProducts, setCatalogProducts] = useState([])

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  useEffect(() => {
    supabase.from('products').select('*').eq('active', true).order('sort_order').order('name')
      .then(({ data }) => { if (data) setCatalogProducts(data) }).catch(() => {})
    if (tender?.id) {
      supabase.from('tender_products').select('*').eq('tender_id', tender.id).order('created_at')
        .then(({ data }) => { if (data) setTenderLines(data.map(d => ({ ...d, _key: d.id }))) }).catch(() => {})
    }
  }, [tender?.id])

  function toggleCollab(userId) {
    setForm(f => ({
      ...f,
      collaborators: f.collaborators.includes(userId)
        ? f.collaborators.filter(id => id !== userId)
        : [...f.collaborators, userId],
    }))
  }

  async function handleSave() {
    const { valid, errors: valErrors } = validateTender(form)
    setFieldErrors(valErrors)
    if (!valid) { setError(t('tender_fix_fields')); return }
    setSaving(true)
    const payload = {
      title:               form.title.trim(),
      reference:           form.reference || null,
      description:         form.description || null,
      status:              form.status,
      submission_deadline: form.submission_deadline || null,
      decision_date:       form.decision_date || null,
      estimated_value:     form.estimated_value ? parseFloat(form.estimated_value) : null,
      currency:            form.currency,
      deal_id:             form.deal_id || null,
      created_by:          user.id,
    }
    let tenderId = tender?.id
    if (isEdit) {
      const { error: e } = await updateTender(tender.id, payload)
      if (e) { setError(e.message); setSaving(false); return }
    } else {
      const { data, error: e } = await createTender(payload)
      if (e) { setError(e.message); setSaving(false); return }
      tenderId = data?.id
    }
    if (tenderId) {
      await supabase.from('tender_collaborators').delete().eq('tender_id', tenderId)
      if (form.collaborators.length > 0) {
        await supabase.from('tender_collaborators').insert(
          form.collaborators.map(uid => ({ tender_id: tenderId, user_id: uid, role: 'contributor' }))
        )
      }
      await supabase.from('tender_products').delete().eq('tender_id', tenderId)
      if (tenderLines.length > 0) {
        await supabase.from('tender_products').insert(
          tenderLines.map(l => ({
            tender_id:    tenderId,
            product_id:   l.product_id || null,
            product_name: l.product_name,
            quantity:     parseInt(l.quantity) || 1,
            unit_price:   parseFloat(l.unit_price) || 0,
            notes:        l.notes || null,
          }))
        )
      }
    }
    setSaving(false)
    onSaved()
    onClose()
  }

  const tabs = [
    { id: 'details',      label: t('tender_tab_details'),      icon: Info,       show: true },
    { id: 'products',     label: t('tender_tab_products'),     icon: Info,       show: true },
    { id: 'requirements', label: t('tender_tab_requirements'), icon: ListChecks, show: isEdit },
    { id: 'attachments',  label: t('tender_tab_attachments'),  icon: Paperclip,  show: isEdit },
  ].filter(tb => tb.show)

  return (
    <Modal open onClose={onClose} title={isEdit ? t('tender_edit_title') : t('tender_new_title')}>
      <div className="space-y-4 p-1 max-h-[70vh] overflow-y-auto">

        {/* Tabs — hidden until the tender exists (requirements/attachments need an id) */}
        {isEdit && (
          <div className="flex gap-1 border-b border-gray-100 -mx-1 px-1 sticky top-0 bg-white z-10">
            {tabs.map(tb => {
              const Icon = tb.icon
              const active = tab === tb.id
              return (
                <button key={tb.id} type="button"
                  onClick={() => setTab(tb.id)}
                  className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold transition-colors border-b-2 ${
                    active
                      ? 'text-navy border-navy'
                      : 'text-gray-500 border-transparent hover:text-gray-700'
                  }`}>
                  <Icon size={12}/> {tb.label}
                </button>
              )
            })}
          </div>
        )}

        {tab === 'details' && <>

        {/* Title + Reference */}
        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-2">
            <label className="label">{t('tender_title_lbl')} *</label>
            <input className={`input ${fieldErrors.title ? 'border-red-400' : ''}`} value={form.title} onChange={e => set('title', e.target.value)}
              placeholder={t('tender_title_ph')} autoFocus />
            {fieldErrors.title && <p className="text-tiny text-red-500 mt-0.5">{fieldErrors.title}</p>}
          </div>
          <div>
            <label className="label">{t('tender_ref')}</label>
            <input className={`input ${fieldErrors.reference ? 'border-red-400' : ''}`} value={form.reference} onChange={e => set('reference', e.target.value)}
              placeholder={t('tender_ref_ph')} />
            {fieldErrors.reference && <p className="text-tiny text-red-500 mt-0.5">{fieldErrors.reference}</p>}
          </div>
        </div>

        {/* Deal link — searchable, optional, allows inline creation */}
        <div>
          <label className="label">{t('tender_linked_deal')} <span className="text-gray-400">{t('df_optional')}</span></label>
          {creatingDeal ? (
            <QuickDealForm
              initialClient={prefillClient}
              onCancel={() => { setCreatingDeal(false); setPrefillClient('') }}
              onCreated={newDeal => {
                setCreatingDeal(false); setPrefillClient('')
                set('deal_id', newDeal.id)
                onDealsChanged && onDealsChanged(newDeal)
              }}
            />
          ) : (
            <SearchableSelect
              value={form.deal_id}
              onChange={val => set('deal_id', val)}
              options={deals.map(d => ({
                value: d.id,
                label: `[${d.bu}] ${d.client}${d.country ? ` — ${d.country}` : ''}`,
              }))}
              placeholder={t('tender_search_deals')}
              emptyLabel={t('no_deal')}
              createLabel={t('tender_create_deal')}
              onCreateNew={query => { setPrefillClient(query || ''); setCreatingDeal(true) }}
            />
          )}
        </div>

        {/* Description */}
        <div>
          <label className="label">{t('tender_description')}</label>
          <textarea className={`input min-h-[72px] resize-none ${fieldErrors.description ? 'border-red-400' : ''}`} value={form.description}
            onChange={e => set('description', e.target.value)}
            placeholder={t('tender_desc_ph')} />
          {fieldErrors.description && <p className="text-tiny text-red-500 mt-0.5">{fieldErrors.description}</p>}
        </div>

        {/* Dates */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">{t('tender_sub_deadline')}</label>
            <input className={`input ${fieldErrors.submission_deadline ? 'border-red-400' : ''}`} type="date" value={form.submission_deadline}
              onChange={e => set('submission_deadline', e.target.value)} />
            {fieldErrors.submission_deadline && <p className="text-tiny text-red-500 mt-0.5">{fieldErrors.submission_deadline}</p>}
          </div>
          <div>
            <label className="label">{t('tender_decision')}</label>
            <input className={`input ${fieldErrors.decision_date ? 'border-red-400' : ''}`} type="date" value={form.decision_date}
              onChange={e => set('decision_date', e.target.value)} />
            {fieldErrors.decision_date && <p className="text-tiny text-red-500 mt-0.5">{fieldErrors.decision_date}</p>}
          </div>
        </div>

        {/* Value + Currency + Status */}
        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-2">
            <label className="label">{t('tender_est_value')}</label>
            <input className={`input ${fieldErrors.estimated_value ? 'border-red-400' : ''}`} type="number" value={form.estimated_value}
              onChange={e => set('estimated_value', e.target.value)} placeholder="0" />
            {fieldErrors.estimated_value && <p className="text-tiny text-red-500 mt-0.5">{fieldErrors.estimated_value}</p>}
          </div>
          <div>
            <label className="label">{t('tender_currency')}</label>
            <select className={`select ${fieldErrors.currency ? 'border-red-400' : ''}`} value={form.currency} onChange={e => set('currency', e.target.value)}>
              <option>EUR</option><option>USD</option><option>GBP</option>
            </select>
            {fieldErrors.currency && <p className="text-tiny text-red-500 mt-0.5">{fieldErrors.currency}</p>}
          </div>
        </div>

        {/* Status */}
        <div>
          <label className="label">{t('tender_status')}</label>
          <select className="select" value={form.status} onChange={e => set('status', e.target.value)}>
            {Object.entries(STATUS_CONFIG).map(([k, v]) => (
              <option key={k} value={k}>{t(v.labelKey)}</option>
            ))}
          </select>
        </div>

        {/* Collaborators — sourced from quotas (sales owners) */}
        <div>
          <label className="label">{t('tender_collab')} <span className="text-gray-400">({t('tender_collab_owners')})</span></label>
          {users.length === 0 ? (
            <p className="text-tiny text-gray-400 mt-1">
              {t('tenders_no_owners')}
            </p>
          ) : (
            <div className="flex flex-wrap gap-2 mt-1">
              {users.map(u => {
                const active = form.collaborators.includes(u.id)
                return (
                  <button key={u.id} type="button"
                    onClick={() => toggleCollab(u.id)}
                    className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-full border transition-all ${
                      active
                        ? 'bg-navy text-white border-navy'
                        : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                    }`}>
                    <Users size={10} />
                    {u.full_name}{u.bu ? ` · ${u.bu}` : ''}
                  </button>
                )
              })}
            </div>
          )}
        </div>

        {error && (
          <p className="text-sm text-red-600 flex items-center gap-1">
            <AlertCircle size={13} /> {error}
          </p>
        )}

        <div className="flex gap-2 pt-1">
          <button className="btn-primary flex-1" onClick={handleSave} disabled={saving}>
            {saving ? t('tender_saving') : isEdit ? t('tender_save') : t('tender_create')}
          </button>
          <button className="btn-secondary" onClick={onClose}>{t('tender_cancel')}</button>
        </div>

        </>}

        {tab === 'products' && (
          <ProductLineItems
            lines={tenderLines}
            onChange={setTenderLines}
            products={catalogProducts}
            businessModel="capex"
            userRole={profile?.role}
            t={t}
          />
        )}

        {tab === 'requirements' && (
          <RequirementsMatrix
            tenderId={tender?.id}
            canEdit={canEditProp}
            assignees={users}
          />
        )}

        {tab === 'attachments' && (
          <AttachmentsList
            entityType="tender"
            entityId={tender?.id}
            canEdit={canEditProp}
          />
        )}
      </div>
    </Modal>
  )
}

// ── Tender Card ────────────────────────────────────────────────────────────────
const TenderCard = memo(function TenderCard({ tender, onEdit, onDelete, canEdit }) {
  const { t } = useTranslation()
  const [expanded, setExpanded] = useState(false)
  const st = STATUS_CONFIG[tender.status] || STATUS_CONFIG.open
  const subDiff = tender.submission_deadline ? daysDiff(tender.submission_deadline) : null
  const isUrgent = tender.status === 'open' && subDiff !== null && subDiff <= 7 && subDiff >= 0
  const isOverdue = tender.status === 'open' && subDiff !== null && subDiff < 0

  return (
    <div className={`bg-white rounded-xl border ${
      isOverdue ? 'border-red-200' :
      isUrgent  ? 'border-amber-200' :
      'border-gray-200'
    } shadow-sm overflow-hidden`}>
      {/* Header */}
      <div className="flex items-start gap-3 p-4">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className={`text-micro font-bold px-2 py-0.5 rounded-full border ${st.bg} ${st.color} ${st.border}`}>
              {t(st.labelKey)}
            </span>
            {tender.reference && (
              <span className="text-micro text-gray-400 font-mono">#{tender.reference}</span>
            )}
            {isUrgent && (
              <span className="text-micro font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-full">
                ⚡ {t('tender_urgent')}
              </span>
            )}
          </div>
          <h3 className="font-semibold text-gray-900 text-sm">{tender.title}</h3>
          {/* Deal link */}
          {tender.deal && (
            <div className="flex items-center gap-1.5 mt-1">
              <Link2 size={10} className="text-gray-400" />
              <span className="text-xs text-gray-500">
                [{tender.deal.bu}] {tender.deal.client}
              </span>
            </div>
          )}
        </div>

        {/* Value */}
        {tender.estimated_value && (
          <div className="text-right shrink-0">
            <p className="text-sm font-bold text-gray-900">
              {tender.estimated_value.toLocaleString('pt-PT', { minimumFractionDigits: 0 })}
            </p>
            <p className="text-micro text-gray-400">{tender.currency}</p>
          </div>
        )}
      </div>

      {/* Deadline — submission only (decision date lives in the modal) */}
      <div className="flex flex-wrap gap-2 px-4 pb-3">
        <DeadlineChip date={tender.submission_deadline} label={t('tender_submit_lbl')} />
      </div>

      {/* Collaborators row — only for active tenders */}
      {['open','submitted'].includes(tender.status) && tender.collaborators?.length > 0 && (
        <div className="flex items-center gap-2 px-4 pb-3">
          <Users size={11} className="text-gray-400" />
          <div className="flex gap-1 flex-wrap">
            {tender.collaborators.map(c => (
              <span key={c.user_id} className="text-micro bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">
                {c.profile?.full_name || c.profile?.email?.split("@")[0] || '—'}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Expand description */}
      {tender.description && (
        <div className="border-t border-gray-50">
          <button onClick={() => setExpanded(e => !e)}
            className="w-full flex items-center gap-1 px-4 py-2 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-50">
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {expanded ? t('tender_hide') : t('tender_show')}
          </button>
          {expanded && (
            <p className="px-4 pb-3 text-xs text-gray-600 whitespace-pre-wrap">{tender.description}</p>
          )}
        </div>
      )}

      {/* Actions */}
      {canEdit && (
        <div className="flex gap-1 px-3 pb-3">
          <button onClick={() => onEdit(tender)}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 px-2 py-1 rounded-lg hover:bg-gray-100">
            <Edit3 size={11} /> {t('edit')}
          </button>
          <button onClick={() => onDelete(tender.id)}
            className="flex items-center gap-1 text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded-lg hover:bg-red-50">
            <Trash2 size={11} /> {t('delete')}
          </button>
        </div>
      )}
    </div>
  )
})

// ── Main Tenders Page ──────────────────────────────────────────────────────────
export default function Tenders() {
  const { user, profile, isAdmin, canEdit: authCanEdit } = useAuth()
  const canEdit = authCanEdit
  const { tenders, urgentCount, loading, refetch } = useTenders()

  const [modal, setModal]   = useState(null)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('active') // 'all'|'active'|'won'|'lost'

  const debouncedSearch = useDebounce(search)

  const [deals, setDeals] = useState([])
  const [users, setUsers] = useState([])

  function loadDeals() {
    let dealsQ = supabase.from('deals').select("id, client, bu, country, company_id").order('client')
    if (profile?.role === 'distributor' && profile?.company_id) {
      dealsQ = dealsQ.eq('company_id', profile.company_id)
    }
    return dealsQ.then(({ data }) => setDeals(data ?? []))
      .catch(() => {})
  }

  useEffect(() => {
    loadDeals()
    // Collaborators come from quotas (sales owners) joined with profiles
    Promise.all([
      supabase.from('quotas').select('sales_owner, bu').order('bu').order('sales_owner'),
      supabase.from('profiles').select('id, full_name, email, sales_owner_name'),
    ]).then(([qRes, pRes]) => {
      const profiles = pRes.data ?? []
      const seen = new Set()
      const merged = (qRes.data ?? []).flatMap(q => {
        const key = `${q.bu}::${q.sales_owner}`
        if (seen.has(key)) return []
        seen.add(key)
        const match = profiles.find(p =>
          (p.sales_owner_name && p.sales_owner_name.toLowerCase() === (q.sales_owner || '').toLowerCase()) ||
          (p.full_name && p.full_name.toLowerCase() === (q.sales_owner || '').toLowerCase())
        )
        if (!match) return []
        return [{ id: match.id, full_name: q.sales_owner, email: match.email, bu: q.bu }]
      })
      setUsers(merged)
    }).catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id, profile?.role, profile?.company_id])

  const filtered = useMemo(() => tenders.filter(t => {
    const matchSearch = !debouncedSearch || t.title.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      t.deal?.client?.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
      t.reference?.toLowerCase().includes(debouncedSearch.toLowerCase())
    const matchStatus = statusFilter === 'all' ? true
      : statusFilter === 'active' ? ['open','submitted'].includes(t.status)
      : t.status === statusFilter
    return matchSearch && matchStatus
  }), [tenders, debouncedSearch, statusFilter])

  const { t } = useTranslation()

  async function handleDelete(id) {
    if (!confirm(t('tender_delete'))) return
    await deleteTender(id)
    refetch()
  }

  if (loading) return <Spinner label="Loading…" />

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <FileText size={20} className="text-navy" />
            {t('tenders_title')}
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">{t('tenders_collab_subtitle')}</p>
        </div>
        {canEdit && (
          <button className="btn-primary flex items-center gap-1.5 py-1.5 px-3 text-sm"
            onClick={() => setModal('new')}>
            <Plus size={15} /> {t('tenders_new')}
          </button>
        )}
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: t('tender_total'),     value: tenders.length,                         color: 'text-gray-700' },
          { label: t('tender_open'),      value: tenders.filter(td=>td.status==='open').length,      color: 'text-blue-600' },
          { label: t('tender_submitted'), value: tenders.filter(td=>td.status==='submitted').length, color: 'text-purple-600' },
          { label: `⚡ ${t('tender_urgent')}`, value: urgentCount,                            color: 'text-amber-600' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 p-3 text-center">
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
            <p className="text-micro text-gray-400 mt-0.5 uppercase tracking-wide">{label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-40">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="input pl-8 py-1.5 text-sm" placeholder={t('tender_search_ph')}
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {[
          { id: 'active', label: t('tender_active') },
          { id: 'won', label: t('tender_won') },
          { id: 'lost', label: t('tender_lost') },
          { id: 'all', label: t('tender_all') },
        ].map(s => (
          <button key={s.id}
            onClick={() => setStatusFilter(s.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
              statusFilter === s.id
                ? 'bg-navy text-white border-navy'
                : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
            }`}>
            {s.label}
          </button>
        ))}
      </div>

      {/* Tender list */}
      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <FileText size={32} className="mx-auto mb-3 opacity-40" />
          <p className="font-medium text-gray-500">{t('tenders_no_found')}</p>
          <p className="text-sm mt-1">{canEdit ? t('tenders_create_hint') : t('tenders_no_visible')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(t => (
            <TenderCard key={t.id} tender={t} canEdit={canEdit}
              onEdit={t => setModal(t)}
              onDelete={handleDelete} />
          ))}
        </div>
      )}

      {/* Modal */}
      {modal !== null && (
        <TenderModal
          tender={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={refetch}
          deals={deals}
          users={users}
          onDealsChanged={() => loadDeals()}
          canEdit={canEdit}
        />
      )}
    </div>
  )
}

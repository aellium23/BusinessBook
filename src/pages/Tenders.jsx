import { useState, useEffect, useRef } from 'react'
import { useTenders, createTender, updateTender, deleteTender } from '../hooks/useTasks'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { Modal, Spinner } from '../components/ui'
import {
  Plus, Edit3, Trash2, AlertCircle, Calendar, Link2,
  Users, ChevronDown, ChevronUp, Search, FileText, PlusCircle
} from 'lucide-react'

const STATUS_CONFIG = {
  open:       { label: 'Open',       color: 'text-blue-700',   bg: 'bg-blue-50',   border: 'border-blue-200' },
  submitted:  { label: 'Submitted',  color: 'text-purple-700', bg: 'bg-purple-50', border: 'border-purple-200' },
  won:        { label: 'Won',        color: 'text-green-700',  bg: 'bg-green-50',  border: 'border-green-200' },
  lost:       { label: 'Lost',       color: 'text-red-700',    bg: 'bg-red-50',    border: 'border-red-200' },
  cancelled:  { label: 'Cancelled',  color: 'text-gray-500',   bg: 'bg-gray-50',   border: 'border-gray-200' },
}

const STAGES = ['Lead','Pipeline','Offer Presented','BackLog','Invoiced','Lost']

function daysDiff(dateStr) {
  if (!dateStr) return null
  return Math.ceil((new Date(dateStr) - new Date()) / 86400000)
}

function DeadlineChip({ date, label }) {
  if (!date) return null
  const diff = daysDiff(date)
  const text = diff < 0 ? `${Math.abs(diff)}d overdue`
    : diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : `${diff}d`
  const cls = diff < 0 ? 'bg-red-100 text-red-700 border-red-200'
    : diff <= 3 ? 'bg-amber-100 text-amber-700 border-amber-200'
    : diff <= 7 ? 'bg-orange-100 text-orange-700 border-orange-200'
    : 'bg-gray-100 text-gray-500 border-gray-200'
  return (
    <div className={`flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded-lg border ${cls}`}>
      <Calendar size={9} />
      <span>{label}: {new Date(date).toLocaleDateString('pt-PT', { day:'numeric', month:'short' })}</span>
      <span className="opacity-60">({text})</span>
    </div>
  )
}

function SearchableSelect({ value, onChange, options, placeholder = 'Search...', emptyLabel = '--- None ---' }) {
  const [open, setOpen]   = useState(false)
  const [query, setQuery] = useState('')
  const containerRef      = useRef(null)
  const inputRef          = useRef(null)
  const selected          = options.find(o => o.value === value)
  const filtered          = query
    ? options.filter(o => o.label.toLowerCase().includes(query.toLowerCase()))
    : options

  useEffect(() => {
    function handler(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false); setQuery('')
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div ref={containerRef} className="relative">
      <button type="button"
        onClick={() => { setOpen(o => !o); setTimeout(() => inputRef.current?.focus(), 50) }}
        className="input w-full text-left flex items-center justify-between gap-2 min-h-[38px]">
        <span className={selected ? 'text-gray-900 truncate' : 'text-gray-400'}>
          {selected ? selected.label : emptyLabel}
        </span>
        <ChevronDown size={14} className={`shrink-0 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white border border-gray-200 rounded-xl shadow-lg overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <input ref={inputRef} type="text" className="input py-1.5 text-sm"
              placeholder={placeholder} value={query}
              onChange={e => setQuery(e.target.value)}
              onClick={e => e.stopPropagation()} />
          </div>
          <div className="max-h-48 overflow-y-auto">
            <button type="button" onClick={() => { onChange(''); setOpen(false); setQuery('') }}
              className="w-full text-left px-3 py-2 text-sm text-gray-400 hover:bg-gray-50">
              {emptyLabel}
            </button>
            {filtered.length === 0
              ? <p className="px-3 py-2 text-sm text-gray-400">No results</p>
              : filtered.map(o => (
                <button type="button" key={o.value}
                  onClick={() => { onChange(o.value); setOpen(false); setQuery('') }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 truncate ${
                    o.value === value ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'
                  }`}>
                  {o.label}
                </button>
              ))
            }
          </div>
        </div>
      )}
    </div>
  )
}

function TenderModal({ tender, onClose, onSaved, deals, users, onDealCreated }) {
  const { user } = useAuth()
  const isEdit = !!tender?.id

  const [form, setForm] = useState({
    title:               tender?.title               ?? '',
    reference:           tender?.reference           ?? '',
    description:         tender?.description         ?? '',
    status:              tender?.status              ?? 'open',
    bu:                  tender?.bu                  ?? '',
    submission_deadline: tender?.submission_deadline ?? '',
    decision_date:       tender?.decision_date       ?? '',
    estimated_value:     tender?.estimated_value     ?? '',
    currency:            tender?.currency            ?? 'EUR',
    deal_id:             tender?.deal_id             ?? '',
    collaborators:       tender?.collaborators?.map(c => c.user_id) ?? [],
  })

  const [newDealMode, setNewDealMode] = useState(false)
  const [newDeal, setNewDeal] = useState({ client: '', bu: 'VGT', country: '', stage: 'Lead', currency: 'EUR' })
  const [creatingDeal, setCreatingDeal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState(null)

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }
  function setND(k, v) { setNewDeal(f => ({ ...f, [k]: v })) }

  function toggleCollab(userId) {
    setForm(f => ({
      ...f,
      collaborators: f.collaborators.includes(userId)
        ? f.collaborators.filter(id => id !== userId)
        : [...f.collaborators, userId],
    }))
  }

  async function handleCreateDeal() {
    if (!newDeal.client.trim()) { setError('Client name is required'); return }
    setCreatingDeal(true)
    const { data, error: e } = await supabase.from('deals').insert({
      client:   newDeal.client.trim(),
      bu:       newDeal.bu,
      country:  newDeal.country || null,
      stage:    newDeal.stage,
      currency: newDeal.currency,
      created_by: user.id,
    }).select('id, client, bu, country').single()
    setCreatingDeal(false)
    if (e) { setError(e.message); return }
    onDealCreated(data)
    set('deal_id', data.id)
    setNewDealMode(false)
    setError(null)
  }

  async function handleSave() {
    if (!form.title.trim()) { setError('Title is required'); return }
    if (!form.deal_id)       { setError('Please link or create a deal'); return }
    setSaving(true)
    const payload = {
      title:               form.title.trim(),
      reference:           form.reference || null,
      description:         form.description || null,
      status:              form.status,
      bu:                  form.bu || null,
      submission_deadline: form.submission_deadline || null,
      decision_date:       form.decision_date || null,
      estimated_value:     form.estimated_value ? parseFloat(form.estimated_value) : null,
      currency:            form.currency,
      deal_id:             form.deal_id,
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
    }
    setSaving(false)
    onSaved()
    onClose()
  }

  const uniqueUsers = users.filter((u, i, arr) => arr.findIndex(x => x.id === u.id) === i)
  const linkedDeal  = deals.find(d => d.id === form.deal_id)

  return (
    <Modal open onClose={onClose} title={isEdit ? 'Edit Tender / RFP' : 'New Tender / RFP'}>
      <div className="space-y-4 p-1 max-h-[75vh] overflow-y-auto">

        {/* Title + Reference */}
        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-2">
            <label className="label">Title *</label>
            <input className="input" value={form.title} onChange={e => set('title', e.target.value)}
              placeholder="Tender title..." autoFocus />
          </div>
          <div>
            <label className="label">Reference</label>
            <input className="input" value={form.reference} onChange={e => set('reference', e.target.value)}
              placeholder="Ref. no" />
          </div>
        </div>

        {/* BU */}
        <div>
          <label className="label">Business Unit</label>
          <div className="flex gap-2">
            {['VGT','ECT'].map(bu => (
              <button key={bu} type="button"
                onClick={() => set('bu', bu === form.bu ? '' : bu)}
                className={`flex-1 py-2 rounded-lg text-sm font-semibold border transition-all ${
                  form.bu === bu
                    ? bu === 'VGT'
                      ? 'bg-teal-600 text-white border-teal-600'
                      : 'bg-red-500 text-white border-red-500'
                    : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                }`}>
                {bu}
              </button>
            ))}
          </div>
        </div>

        {/* Deal link */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="label mb-0">Linked deal *</label>
            <button type="button"
              onClick={() => { setNewDealMode(m => !m); setError(null) }}
              className="flex items-center gap-1 text-xs text-blue-600 hover:text-blue-800">
              <PlusCircle size={12} />
              {newDealMode ? 'Link existing deal' : 'Create new deal'}
            </button>
          </div>

          {newDealMode ? (
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 space-y-3">
              <p className="text-xs font-semibold text-blue-700">New deal</p>
              <div className="grid grid-cols-2 gap-2">
                <div className="col-span-2">
                  <label className="label">Client *</label>
                  <input className="input" value={newDeal.client}
                    onChange={e => setND('client', e.target.value)} placeholder="Client name..." />
                </div>
                <div>
                  <label className="label">BU</label>
                  <select className="select" value={newDeal.bu} onChange={e => setND('bu', e.target.value)}>
                    <option>VGT</option><option>ECT</option>
                  </select>
                </div>
                <div>
                  <label className="label">Country</label>
                  <input className="input" value={newDeal.country}
                    onChange={e => setND('country', e.target.value)} placeholder="e.g. Portugal" />
                </div>
                <div>
                  <label className="label">Stage</label>
                  <select className="select" value={newDeal.stage} onChange={e => setND('stage', e.target.value)}>
                    {STAGES.map(s => <option key={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Currency</label>
                  <select className="select" value={newDeal.currency} onChange={e => setND('currency', e.target.value)}>
                    <option>EUR</option><option>USD</option><option>GBP</option>
                  </select>
                </div>
              </div>
              <button type="button" onClick={handleCreateDeal} disabled={creatingDeal}
                className="btn-primary w-full text-sm py-1.5">
                {creatingDeal ? 'Creating...' : 'Create deal & link'}
              </button>
            </div>
          ) : (
            <SearchableSelect
              value={form.deal_id}
              onChange={val => set('deal_id', val)}
              options={deals.map(d => ({ value: d.id, label: `[${d.bu}] ${d.client}${d.country ? ' - ' + d.country : ''}` }))}
              placeholder="Search deals..."
              emptyLabel="--- Select deal ---"
            />
          )}

          {linkedDeal && !newDealMode && (
            <p className="text-xs text-green-600 mt-1">
              linked: [{linkedDeal.bu}] {linkedDeal.client}
            </p>
          )}
        </div>

        {/* Description */}
        <div>
          <label className="label">Description</label>
          <textarea className="input min-h-[72px] resize-none" value={form.description}
            onChange={e => set('description', e.target.value)}
            placeholder="Scope, requirements, notes..." />
        </div>

        {/* Dates */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Submission deadline</label>
            <input className="input" type="date" value={form.submission_deadline}
              onChange={e => set('submission_deadline', e.target.value)} />
          </div>
          <div>
            <label className="label">Decision date</label>
            <input className="input" type="date" value={form.decision_date}
              onChange={e => set('decision_date', e.target.value)} />
          </div>
        </div>

        {/* Value + Currency */}
        <div className="grid grid-cols-3 gap-2">
          <div className="col-span-2">
            <label className="label">Base Price</label>
            <input className="input" type="number" value={form.estimated_value}
              onChange={e => set('estimated_value', e.target.value)} placeholder="0" />
          </div>
          <div>
            <label className="label">Currency</label>
            <select className="select" value={form.currency} onChange={e => set('currency', e.target.value)}>
              <option>EUR</option><option>USD</option><option>GBP</option>
            </select>
          </div>
        </div>

        {/* Status */}
        <div>
          <label className="label">Status</label>
          <select className="select" value={form.status} onChange={e => set('status', e.target.value)}>
            {Object.entries(STATUS_CONFIG).map(([k, v]) => (
              <option key={k} value={k}>{v.label}</option>
            ))}
          </select>
        </div>

        {/* Collaborators */}
        <div>
          <label className="label">Collaborators</label>
          <div className="flex flex-wrap gap-2 mt-1">
            {uniqueUsers.map(u => {
              const active = form.collaborators.includes(u.id)
              return (
                <button key={u.id} type="button" onClick={() => toggleCollab(u.id)}
                  className={`flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-full border transition-all ${
                    active ? 'bg-navy text-white border-navy' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-400'
                  }`}>
                  <Users size={10} />
                  {u.full_name || u.email?.split('@')[0]}
                </button>
              )
            })}
          </div>
        </div>

        {error && (
          <p className="text-sm text-red-600 flex items-center gap-1">
            <AlertCircle size={13} /> {error}
          </p>
        )}

        <div className="flex gap-2 pt-1">
          <button className="btn-primary flex-1" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : isEdit ? 'Save changes' : 'Create tender'}
          </button>
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
        </div>
      </div>
    </Modal>
  )
}

function TenderCard({ tender, onEdit, onDelete, canEdit }) {
  const [expanded, setExpanded] = useState(false)
  const st      = STATUS_CONFIG[tender.status] || STATUS_CONFIG.open
  const subDiff = tender.submission_deadline ? daysDiff(tender.submission_deadline) : null
  const isUrgent  = tender.status === 'open' && subDiff !== null && subDiff <= 7 && subDiff >= 0
  const isOverdue = tender.status === 'open' && subDiff !== null && subDiff < 0

  return (
    <div className={`bg-white rounded-xl border ${
      isOverdue ? 'border-red-200' : isUrgent ? 'border-amber-200' : 'border-gray-200'
    } shadow-sm overflow-hidden`}>
      <div className="flex items-start gap-3 p-4">
        <div className="flex-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2 mb-1">
            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${st.bg} ${st.color} ${st.border}`}>
              {st.label}
            </span>
            {tender.bu && (
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                tender.bu === 'VGT'
                  ? 'bg-teal-50 text-teal-700 border-teal-200'
                  : 'bg-red-50 text-red-700 border-red-200'
              }`}>
                {tender.bu}
              </span>
            )}
            {tender.reference && (
              <span className="text-[10px] text-gray-400 font-mono">#{tender.reference}</span>
            )}
            {isUrgent && (
              <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-full">
                Urgent
              </span>
            )}
          </div>
          <h3 className="font-semibold text-gray-900 text-sm">{tender.title}</h3>
          {tender.deal && (
            <div className="flex items-center gap-1.5 mt-1">
              <Link2 size={10} className="text-gray-400" />
              <span className="text-xs text-gray-500">[{tender.deal.bu}] {tender.deal.client}</span>
            </div>
          )}
        </div>
        {tender.estimated_value && (
          <div className="text-right shrink-0">
            <p className="text-sm font-bold text-gray-900">
              {tender.estimated_value.toLocaleString('pt-PT', { minimumFractionDigits: 0 })}
            </p>
            <p className="text-[10px] text-gray-400">{tender.currency}</p>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2 px-4 pb-3">
        <DeadlineChip date={tender.submission_deadline} label="Submit" />
        <DeadlineChip date={tender.decision_date} label="Decision" />
      </div>

      {tender.collaborators?.length > 0 && (
        <div className="flex items-center gap-2 px-4 pb-3">
          <Users size={11} className="text-gray-400" />
          <div className="flex gap-1 flex-wrap">
            {tender.collaborators
              .filter((c, i, arr) => arr.findIndex(x => x.user_id === c.user_id) === i)
              .map(c => (
                <span key={c.user_id} className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded-full">
                  {c.profile?.full_name || c.profile?.email?.split('@')[0] || '---'}
                </span>
              ))}
          </div>
        </div>
      )}

      {tender.description && (
        <div className="border-t border-gray-50">
          <button onClick={() => setExpanded(e => !e)}
            className="w-full flex items-center gap-1 px-4 py-2 text-xs text-gray-400 hover:text-gray-600 hover:bg-gray-50">
            {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {expanded ? 'Hide details' : 'Show details'}
          </button>
          {expanded && (
            <p className="px-4 pb-3 text-xs text-gray-600 whitespace-pre-wrap">{tender.description}</p>
          )}
        </div>
      )}

      {canEdit && (
        <div className="flex gap-1 px-3 pb-3">
          <button onClick={() => onEdit(tender)}
            className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 px-2 py-1 rounded-lg hover:bg-gray-100">
            <Edit3 size={11} /> Edit
          </button>
          <button onClick={() => onDelete(tender.id)}
            className="flex items-center gap-1 text-xs text-red-400 hover:text-red-600 px-2 py-1 rounded-lg hover:bg-red-50">
            <Trash2 size={11} /> Delete
          </button>
        </div>
      )}
    </div>
  )
}

export default function Tenders() {
  const { user, profile, isAdmin } = useAuth()
  const canEdit = isAdmin || ['vgt_editor','ect_editor','vgt_member','ect_member'].includes(profile?.role)
  const { tenders, urgentCount, loading, refetch } = useTenders()

  const [modal, setModal]               = useState(null)
  const [search, setSearch]             = useState('')
  const [statusFilter, setStatusFilter] = useState('active')
  const [buFilter, setBuFilter]         = useState('all')
  const [deals, setDeals]               = useState([])
  const [users, setUsers]               = useState([])

  useEffect(() => {
    if (!profile) return
    supabase.from('deals').select('id, client, bu, country').order('client').then(({ data }) => setDeals(data ?? []))
    supabase.from('profiles').select('id, full_name, email').then(({ data }) => setUsers(data ?? []))
  }, [profile])

  function handleDealCreated(deal) {
    setDeals(prev => [...prev, deal].sort((a, b) => a.client.localeCompare(b.client)))
  }

  const filtered = tenders.filter(t => {
    const matchSearch = !search
      || t.title.toLowerCase().includes(search.toLowerCase())
      || t.deal?.client?.toLowerCase().includes(search.toLowerCase())
      || t.reference?.toLowerCase().includes(search.toLowerCase())
    const matchStatus = statusFilter === 'all' ? true
      : statusFilter === 'active' ? ['open','submitted'].includes(t.status)
      : t.status === statusFilter
    const matchBU = buFilter === 'all' ? true : t.bu === buFilter
    return matchSearch && matchStatus && matchBU
  })

  async function handleDelete(id) {
    if (!confirm('Delete this tender?')) return
    await deleteTender(id)
    refetch()
  }

  if (loading) return <Spinner />

  return (
    <div className="max-w-3xl mx-auto p-4 sm:p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <FileText size={20} className="text-navy" />
            Tenders & RFPs
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">Public tenders and client proposals</p>
        </div>
        {canEdit && (
          <button className="btn-primary flex items-center gap-1.5 py-1.5 px-3 text-sm"
            onClick={() => setModal('new')}>
            <Plus size={15} /> New tender
          </button>
        )}
      </div>

      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Total',     value: tenders.length,                                    color: 'text-gray-700' },
          { label: 'Open',      value: tenders.filter(t => t.status==='open').length,      color: 'text-blue-600' },
          { label: 'Submitted', value: tenders.filter(t => t.status==='submitted').length, color: 'text-purple-600' },
          { label: 'Urgent',    value: urgentCount,                                        color: 'text-amber-600' },
        ].map(({ label, value, color }) => (
          <div key={label} className="bg-white rounded-xl border border-gray-200 p-3 text-center">
            <p className={`text-2xl font-bold ${color}`}>{value}</p>
            <p className="text-[10px] text-gray-400 mt-0.5 uppercase tracking-wide">{label}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-2 flex-wrap">
        <div className="relative flex-1 min-w-40">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input className="input pl-8 py-1.5 text-sm" placeholder="Search tenders..."
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        {['active','all','open','submitted','won','lost'].map(s => (
          <button key={s} onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all capitalize ${
              statusFilter === s ? 'bg-navy text-white border-navy' : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
            }`}>
            {s}
          </button>
        ))}
        {['all','VGT','ECT'].map(bu => (
          <button key={bu} onClick={() => setBuFilter(bu)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
              buFilter === bu
                ? bu === 'VGT' ? 'bg-teal-600 text-white border-teal-600'
                  : bu === 'ECT' ? 'bg-red-500 text-white border-red-500'
                  : 'bg-navy text-white border-navy'
                : 'bg-white text-gray-500 border-gray-200 hover:border-gray-400'
            }`}>
            {bu === 'all' ? 'All BU' : bu}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <FileText size={32} className="mx-auto mb-3 opacity-40" />
          <p className="font-medium text-gray-500">No tenders found</p>
          <p className="text-sm mt-1">{canEdit ? 'Create one to track deadlines and collaborate.' : 'No tenders visible yet.'}</p>
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

      {modal !== null && (
        <TenderModal
          tender={modal === 'new' ? null : modal}
          onClose={() => setModal(null)}
          onSaved={refetch}
          deals={deals}
          users={users}
          onDealCreated={handleDealCreated}
        />
      )}
    </div>
  )
}

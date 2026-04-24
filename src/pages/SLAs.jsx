import { useState, useMemo, useEffect } from 'react'
import { useSlas, createSla, updateSla, deleteSla } from '../hooks/useSlas'
import { useAuth } from '../hooks/useAuth'
import { useTranslation } from '../hooks/useTranslation'
import { Modal, Spinner, EmptyState, BUBadge, formatK, KpiCard } from '../components/ui'
import { SLA_STATUSES, SLA_TYPES, FY_RANGE, BILLING_MODELS, BILLING_FREQUENCIES, getFiscalYear, projectSlaRevenue } from '../constants'
import {
  Plus, Search, Pencil, Trash2, RefreshCw, Calendar, User,
  TrendingUp, AlertCircle, Clock, ChevronDown, ChevronUp,
  FileText, DollarSign, Shield,
} from 'lucide-react'

function SlaStatusBadge({ status }) {
  const cfg = SLA_STATUSES.find(s => s.id === status) || SLA_STATUSES[0]
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold border ${cfg.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`}/>
      {cfg.label}
    </span>
  )
}

function SlaCard({ sla, onEdit, onDelete, canEdit }) {
  const [expanded, setExpanded] = useState(false)
  const { t } = useTranslation()
  const revenue = sla.revenue_by_fy || {}

  return (
    <div className="card p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <BUBadge bu={sla.bu}/>
            <SlaStatusBadge status={sla.status}/>
            {sla.sla_type && <span className="text-[10px] text-gray-400">{sla.sla_type}</span>}
          </div>
          <p className="font-semibold text-sm text-gray-900 mt-1 truncate">{sla.client}</p>
          {sla.description && <p className="text-xs text-gray-500 truncate">{sla.description}</p>}
        </div>
        <div className="text-right shrink-0">
          <p className="text-lg font-bold text-gray-900">{formatK(sla.annual_value)}</p>
          <p className="text-[10px] text-gray-400">/year</p>
        </div>
      </div>

      <div className="flex items-center gap-3 text-[10px] text-gray-500 flex-wrap">
        {sla.sla_owner && (
          <span className="flex items-center gap-1"><User size={9}/> {sla.sla_owner}</span>
        )}
        {sla.start_date && (
          <span className="flex items-center gap-1">
            <Calendar size={9}/> Start: {new Date(sla.start_date).toLocaleDateString('pt-PT', { month: 'short', year: 'numeric' })}
          </span>
        )}
        {sla.warranty_end_date && sla.status === 'pipeline' && (
          <span className="flex items-center gap-1">
            <Shield size={9}/> Warranty ends: {new Date(sla.warranty_end_date).toLocaleDateString('pt-PT', { month: 'short', year: 'numeric' })}
          </span>
        )}
        {sla.deal_owner && sla.deal_owner !== sla.sla_owner && (
          <span className="text-gray-400">Deal: {sla.deal_owner}</span>
        )}
      </div>

      <div className="flex items-center gap-1 flex-wrap">
        <button onClick={() => setExpanded(e => !e)}
          className="text-[10px] text-gray-400 hover:text-gray-600 flex items-center gap-0.5 min-h-tap">
          {expanded ? <ChevronUp size={10}/> : <ChevronDown size={10}/>}
          {expanded ? 'Hide' : 'FY breakdown'}
        </button>
        <div className="ml-auto flex items-center gap-1">
          {canEdit && (
            <>
              <button onClick={() => onEdit(sla)} className="text-gray-400 hover:text-navy min-h-tap p-1.5">
                <Pencil size={13}/>
              </button>
              <button onClick={() => onDelete(sla)} className="text-gray-400 hover:text-red-500 min-h-tap p-1.5">
                <Trash2 size={13}/>
              </button>
            </>
          )}
        </div>
      </div>

      {expanded && (
        <div className="border-t border-gray-100 pt-2">
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-1">
            {FY_RANGE.map(fy => (
              <div key={fy} className={`text-center rounded p-1.5 ${revenue[fy] ? 'bg-blue-50' : 'bg-gray-50'}`}>
                <p className="text-[9px] text-gray-400 font-medium">{fy}</p>
                <p className="text-xs font-bold text-gray-700">{revenue[fy] ? formatK(revenue[fy]) : '—'}</p>
              </div>
            ))}
          </div>
          {sla.previous_value && (
            <p className="text-[10px] text-orange-600 mt-1">
              Previous value: {formatK(sla.previous_value)} — {sla.change_reason || 'reduced'}
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function SlaFormModal({ sla, onClose, onSaved, owners }) {
  const { profile } = useAuth()
  const { t } = useTranslation()
  const isEdit = !!sla?.id
  const [form, setForm] = useState({
    bu:                sla?.bu                || 'VGT',
    client:            sla?.client            || '',
    description:       sla?.description       || '',
    sla_type:          sla?.sla_type          || '',
    status:            sla?.status            || 'pipeline',
    sla_owner:         sla?.sla_owner         || '',
    deal_owner:        sla?.deal_owner        || '',
    annual_value:      sla?.annual_value      || '',
    currency:          sla?.currency          || 'EUR',
    warranty_months:   sla?.warranty_months   || 36,
    warranty_end_date: sla?.warranty_end_date || '',
    start_date:        sla?.start_date        || '',
    end_date:          sla?.end_date          || '',
    billing_month:     sla?.billing_month     || '',
    renewal_target_pct:sla?.renewal_target_pct|| '',
    renewal_notes:     sla?.renewal_notes     || '',
    previous_value:    sla?.previous_value    || '',
    change_reason:     sla?.change_reason     || '',
    country:           sla?.country           || '',
    region:            sla?.region            || '',
    product:           sla?.product           || '',
    billing_model:     sla?.billing_model     || 'fixed',
    price_per_study:   sla?.price_per_study   || '',
    estimated_annual_studies: sla?.estimated_annual_studies || '',
    billing_frequency: sla?.billing_frequency || 'annual',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState(null)

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function handleSave() {
    if (!form.client.trim() || !form.bu) { setError('Client and BU are required'); return }
    setSaving(true); setError(null)

    const annualVal = parseFloat(form.annual_value) || 0
    const revenue = form.start_date
      ? projectSlaRevenue(annualVal, form.start_date, form.end_date || null)
      : {}

    const payload = {
      bu:                form.bu,
      client:            form.client.trim(),
      description:       form.description || null,
      sla_type:          form.sla_type || null,
      status:            form.status,
      sla_owner:         form.sla_owner || null,
      deal_owner:        form.deal_owner || null,
      annual_value:      annualVal,
      currency:          form.currency,
      warranty_months:   parseInt(form.warranty_months) || null,
      warranty_end_date: form.warranty_end_date || null,
      start_date:        form.start_date || null,
      end_date:          form.end_date || null,
      revenue_by_fy:     revenue,
      billing_month:     form.billing_month || null,
      renewal_target_pct:parseFloat(form.renewal_target_pct) || null,
      renewal_notes:     form.renewal_notes || null,
      previous_value:    parseFloat(form.previous_value) || null,
      change_reason:     form.change_reason || null,
      country:           form.country || null,
      region:            form.region || null,
      product:           form.product || null,
      billing_model:     form.billing_model || 'fixed',
      price_per_study:   parseFloat(form.price_per_study) || null,
      estimated_annual_studies: parseInt(form.estimated_annual_studies) || null,
      billing_frequency: form.billing_frequency || 'annual',
      ...(!isEdit ? { created_by: profile?.id } : {}),
    }

    const result = isEdit
      ? await updateSla(sla.id, payload)
      : await createSla(payload)

    setSaving(false)
    if (result.error) { setError(result.error.message); return }
    onSaved()
  }

  const MONTHS_ALL = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

  return (
    <Modal open title={isEdit ? 'Edit SLA' : 'New SLA'} onClose={onClose}
      footer={
        <div className="flex gap-2">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary flex-1">
            {saving ? 'Saving…' : 'Save SLA'}
          </button>
        </div>
      }>
      <div className="space-y-3">
        {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">BU *</label>
            <select className="select" value={form.bu} onChange={e => set('bu', e.target.value)}>
              <option value="VGT">VGT</option>
              <option value="ECT">ECT</option>
            </select>
          </div>
          <div>
            <label className="label">Status</label>
            <select className="select" value={form.status} onChange={e => set('status', e.target.value)}>
              {SLA_STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="label">Client *</label>
          <input className="input" value={form.client} onChange={e => set('client', e.target.value)}/>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">SLA Owner</label>
            <select className="select" value={form.sla_owner} onChange={e => set('sla_owner', e.target.value)}>
              <option value="">Select…</option>
              {owners.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div>
            <label className="label">SLA Type</label>
            <select className="select" value={form.sla_type} onChange={e => set('sla_type', e.target.value)}>
              <option value="">Select…</option>
              {SLA_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="label">Annual Value</label>
            <input className="input" type="number" value={form.annual_value} onChange={e => set('annual_value', e.target.value)} placeholder="28000"/>
          </div>
          <div>
            <label className="label">Warranty (months)</label>
            <input className="input" type="number" value={form.warranty_months} onChange={e => set('warranty_months', e.target.value)} placeholder="36"/>
          </div>
          <div>
            <label className="label">Billing month</label>
            <select className="select" value={form.billing_month} onChange={e => set('billing_month', e.target.value)}>
              <option value="">—</option>
              {MONTHS_ALL.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Warranty End</label>
            <input className="input" type="date" value={form.warranty_end_date} onChange={e => set('warranty_end_date', e.target.value)}/>
          </div>
          <div>
            <label className="label">SLA Start</label>
            <input className="input" type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)}/>
          </div>
        </div>

        <div>
          <label className="label">Description</label>
          <textarea className="input min-h-[60px] resize-none" value={form.description} onChange={e => set('description', e.target.value)}/>
        </div>

        <div className="grid grid-cols-2 gap-3 border-t pt-3">
          <div>
            <label className="label">Billing Model</label>
            <select className="select" value={form.billing_model} onChange={e => set('billing_model', e.target.value)}>
              {BILLING_MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Billing Frequency</label>
            <select className="select" value={form.billing_frequency} onChange={e => set('billing_frequency', e.target.value)}>
              {BILLING_FREQUENCIES.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
          </div>
        </div>

        {form.billing_model !== 'fixed' && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Price per Study €</label>
              <input className="input" type="number" step="0.01" value={form.price_per_study} onChange={e => set('price_per_study', e.target.value)} placeholder="e.g. 2.50"/>
            </div>
            <div>
              <label className="label">Est. Annual Studies</label>
              <input className="input" type="number" value={form.estimated_annual_studies} onChange={e => set('estimated_annual_studies', e.target.value)} placeholder="e.g. 15000"/>
            </div>
          </div>
        )}

        {['reduced','cancelled'].includes(form.status) && (
          <div className="grid grid-cols-2 gap-3 border-t pt-3">
            <div>
              <label className="label">Previous Value</label>
              <input className="input" type="number" value={form.previous_value} onChange={e => set('previous_value', e.target.value)}/>
            </div>
            <div>
              <label className="label">Change Reason</label>
              <input className="input" value={form.change_reason} onChange={e => set('change_reason', e.target.value)} placeholder="e.g. scope reduction UK"/>
            </div>
          </div>
        )}
      </div>
    </Modal>
  )
}

export default function SLAs() {
  const { canEdit, isAdmin, profile } = useAuth()
  const { t } = useTranslation()
  const [search, setSearch]     = useState('')
  const [buF, setBuF]           = useState('')
  const [tab, setTab]           = useState('active')
  const [formOpen, setFormOpen] = useState(false)
  const [editSla, setEditSla]   = useState(null)
  const [confirmDel, setConfirmDel] = useState(null)
  const [owners, setOwners]     = useState([])

  const { slas, loading, refetch } = useSlas({ bu: buF || undefined, search: search || undefined })

  useEffect(() => {
    import('../lib/supabase').then(({ supabase }) => {
      supabase.from('quotas').select('sales_owner').then(({ data }) => {
        if (data) setOwners([...new Set(data.map(q => q.sales_owner).filter(Boolean))].sort())
      })
    })
  }, [])

  const filtered = useMemo(() => {
    const tabFilter = {
      active:   s => ['active','invoiced'].includes(s.status),
      awaiting: s => ['negotiation','waiting_po'].includes(s.status),
      pipeline: s => s.status === 'pipeline',
      changes:  s => ['reduced','cancelled'].includes(s.status),
      all:      () => true,
    }
    return slas.filter(tabFilter[tab] || tabFilter.all)
  }, [slas, tab])

  const pipelineByFY = useMemo(() => {
    const byFY = {}
    for (const s of slas) {
      if (s.status !== 'pipeline' || !s.start_date) continue
      const fy = getFiscalYear(s.start_date)
      if (!byFY[fy]) byFY[fy] = []
      byFY[fy].push(s)
    }
    return byFY
  }, [slas])

  const kpis = useMemo(() => {
    const active = slas.filter(s => ['active','invoiced'].includes(s.status))
    const pipeline = slas.filter(s => s.status === 'pipeline')
    const awaiting = slas.filter(s => ['negotiation','waiting_po'].includes(s.status))
    return {
      activeCount: active.length,
      activeValue: active.reduce((s, a) => s + (Number(a.annual_value) || 0), 0),
      pipelineValue: pipeline.reduce((s, a) => s + (Number(a.annual_value) || 0), 0),
      awaitingCount: awaiting.length,
    }
  }, [slas])

  const revenueByFY = useMemo(() => {
    const result = {}
    for (const fy of FY_RANGE) {
      result[fy] = { vgt: 0, ect: 0 }
    }
    for (const s of slas) {
      if (['cancelled'].includes(s.status)) continue
      const rev = s.revenue_by_fy || {}
      for (const fy of FY_RANGE) {
        if (rev[fy]) {
          const key = (s.bu || 'VGT').toLowerCase()
          if (result[fy][key] !== undefined) result[fy][key] += rev[fy]
        }
      }
    }
    return result
  }, [slas])

  async function handleDelete() {
    if (!confirmDel) return
    await deleteSla(confirmDel.id)
    setConfirmDel(null)
    refetch()
  }

  if (loading) return <Spinner/>

  const tabs = [
    { id: 'active',   label: `Active (${slas.filter(s=>['active','invoiced'].includes(s.status)).length})` },
    { id: 'awaiting', label: `Awaiting (${slas.filter(s=>['negotiation','waiting_po'].includes(s.status)).length})` },
    { id: 'pipeline', label: `Pipeline (${slas.filter(s=>s.status==='pipeline').length})` },
    { id: 'changes',  label: `Changes (${slas.filter(s=>['reduced','cancelled'].includes(s.status)).length})` },
    { id: 'all',      label: `All (${slas.length})` },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-lg font-bold text-gray-900">{t('sla_title') || 'SLA Management'}</h1>
          <p className="text-xs text-gray-400">{t('sla_subtitle') || 'Service contracts & recurring revenue'}</p>
        </div>
        {canEdit && (
          <button onClick={() => { setEditSla(null); setFormOpen(true) }} className="btn-primary flex items-center gap-1">
            <Plus size={14}/> {t('sla_new') || 'New SLA'}
          </button>
        )}
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="card p-3">
          <p className="text-[10px] text-gray-400 uppercase font-semibold">Active SLAs</p>
          <p className="text-xl font-bold text-green-600">{kpis.activeCount}</p>
          <p className="text-xs text-gray-500">{formatK(kpis.activeValue)}/year</p>
        </div>
        <div className="card p-3">
          <p className="text-[10px] text-gray-400 uppercase font-semibold">Pipeline</p>
          <p className="text-xl font-bold text-gray-700">{formatK(kpis.pipelineValue)}</p>
          <p className="text-xs text-gray-500">future annual value</p>
        </div>
        <div className="card p-3">
          <p className="text-[10px] text-gray-400 uppercase font-semibold">Awaiting Action</p>
          <p className="text-xl font-bold text-amber-600">{kpis.awaitingCount}</p>
          <p className="text-xs text-gray-500">need attention</p>
        </div>
        <div className="card p-3">
          <p className="text-[10px] text-gray-400 uppercase font-semibold">Total SLAs</p>
          <p className="text-xl font-bold text-navy">{slas.length}</p>
          <p className="text-xs text-gray-500">all statuses</p>
        </div>
      </div>

      {/* Revenue by FY */}
      <div className="card p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2 flex items-center gap-1">
          <TrendingUp size={12}/> Projected SLA Revenue by Fiscal Year
        </p>
        <div className="grid grid-cols-6 gap-2">
          {FY_RANGE.map(fy => {
            const total = revenueByFY[fy].vgt + revenueByFY[fy].ect
            return (
              <div key={fy} className="text-center">
                <p className="text-[10px] text-gray-400 font-medium">{fy}</p>
                <p className="text-sm font-bold text-gray-800">{total > 0 ? formatK(total) : '—'}</p>
                {isAdmin && total > 0 && (
                  <div className="flex justify-center gap-1 mt-0.5">
                    <span className="text-[8px] text-teal-600">{formatK(revenueByFY[fy].vgt)}</span>
                    <span className="text-[8px] text-coral-600">{formatK(revenueByFY[fy].ect)}</span>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Search + filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[180px]">
          <input className="input pl-8 text-sm" placeholder={t('sla_search_ph') || 'Search SLAs…'}
            value={search} onChange={e => setSearch(e.target.value)} style={{ fontSize: '16px' }}/>
          <Search size={14} className="absolute left-2.5 top-3 text-gray-400"/>
        </div>
        {isAdmin && (
          <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
            {['','VGT','ECT'].map(bu => (
              <button key={bu} onClick={() => setBuF(bu)}
                className={`px-2.5 py-1 rounded text-xs font-semibold transition-all ${
                  buF === bu ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
                }`}>
                {bu || 'All'}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto border-b border-gray-200">
        {tabs.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`px-3 py-2 text-xs font-semibold whitespace-nowrap border-b-2 transition-all ${
              tab === t.id ? 'border-navy text-navy' : 'border-transparent text-gray-400 hover:text-gray-600'
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {/* SLA list */}
      {tab === 'pipeline' ? (
        <div className="space-y-4">
          {FY_RANGE.map(fy => {
            const fySlas = pipelineByFY[fy]
            if (!fySlas?.length) return null
            return (
              <div key={fy}>
                <p className="text-xs font-semibold text-gray-500 uppercase mb-2">{fy} — {fySlas.length} SLA{fySlas.length > 1 ? 's' : ''}</p>
                <div className="space-y-2">
                  {fySlas.map(s => (
                    <SlaCard key={s.id} sla={s} canEdit={canEdit}
                      onEdit={s => { setEditSla(s); setFormOpen(true) }}
                      onDelete={setConfirmDel}/>
                  ))}
                </div>
              </div>
            )
          })}
          {Object.keys(pipelineByFY).length === 0 && (
            <EmptyState icon="📋" title="No pipeline SLAs" description="Future SLAs will appear here grouped by fiscal year."/>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.length === 0 ? (
            <EmptyState icon="📋" title={t('sla_no_found') || 'No SLAs found'}
              description={t('sla_create_hint') || 'Create SLAs from deals or add manually.'}
              action={canEdit && <button onClick={() => setFormOpen(true)} className="btn-primary">New SLA</button>}/>
          ) : filtered.map(s => (
            <SlaCard key={s.id} sla={s} canEdit={canEdit}
              onEdit={s => { setEditSla(s); setFormOpen(true) }}
              onDelete={setConfirmDel}/>
          ))}
        </div>
      )}

      {/* Form modal */}
      {formOpen && (
        <SlaFormModal sla={editSla} owners={owners}
          onClose={() => { setFormOpen(false); setEditSla(null) }}
          onSaved={() => { setFormOpen(false); setEditSla(null); refetch() }}/>
      )}

      {/* Delete confirm */}
      {confirmDel && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setConfirmDel(null)}/>
          <div className="relative bg-white rounded-t-3xl sm:rounded-2xl p-5 w-full sm:max-w-sm space-y-3">
            <p className="font-semibold text-gray-900">Delete SLA?</p>
            <p className="text-sm text-gray-600">{confirmDel.client} — {formatK(confirmDel.annual_value)}/year</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDel(null)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={handleDelete} className="bg-red-600 text-white rounded-lg px-4 py-2 text-sm font-semibold flex-1">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

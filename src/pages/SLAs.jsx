import { useState, useMemo, useEffect } from 'react'
import { useSlas, createSla, updateSla, deleteSla } from '../hooks/useSlas'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import SearchableSelect from '../components/SearchableSelect'
import { useTranslation } from '../hooks/useTranslation'
import { Modal, Spinner, EmptyState, BUBadge, formatK, KpiCard } from '../components/ui'
import { SLA_STATUSES, SLA_TYPES, FY_RANGE, BILLING_MODELS, BILLING_FREQUENCIES, getFiscalYear, projectSlaRevenue } from '../constants'
import {
  Plus, Search, Pencil, Trash2, RefreshCw, Calendar, User,
  TrendingUp, AlertCircle, Clock, ChevronDown, ChevronUp,
  FileText, DollarSign, Shield, X,
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

function RenewalBadge({ sla }) {
  const rd = sla.renewal_date || sla.end_date
  if (!rd || !['warranty','active','pending_renewal'].includes(sla.status)) return null
  const days = Math.ceil((new Date(rd) - new Date()) / 86400000)
  if (days < 0) return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700">Expired</span>
  if (days <= 30) return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700">{days}d</span>
  if (days <= 60) return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">{days}d</span>
  if (days <= 90) return <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700">{days}d</span>
  return null
}

function SlaCard({ sla, onEdit, onDelete, canEdit, canDelete }) {
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
            <RenewalBadge sla={sla}/>
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
            <button onClick={() => onEdit(sla)} className="text-gray-400 hover:text-navy min-h-tap p-1.5">
              <Pencil size={13}/>
            </button>
          )}
          {canDelete && (
            <button onClick={() => onDelete(sla)} className="text-gray-400 hover:text-red-500 min-h-tap p-1.5">
              <Trash2 size={13}/>
            </button>
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
    status:            sla?.status            || 'draft',
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
    contract_duration_years: sla?.contract_duration_years || 1,
    renewal_date:    sla?.renewal_date    || '',
    invoice_date:    sla?.invoice_date    || '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState(null)
  const [clients, setClients] = useState([])
  const [slaProducts, setSlaProducts] = useState([])
  const [catalogProducts, setCatalogProducts] = useState([])
  const [addProductId, setAddProductId] = useState('')

  useEffect(() => {
    supabase.from('deals').select('client').then(({ data }) => {
      if (data) setClients([...new Set(data.map(d => d.client).filter(Boolean))].sort())
    }).catch(() => {})
    supabase.from('products').select('id, name, sku, category, annual_fee').eq('active', true).order('name')
      .then(({ data }) => { if (data) setCatalogProducts(data) }).catch(() => {})
    if (sla?.id) {
      supabase.from('sla_products').select('*').eq('sla_id', sla.id).order('created_at')
        .then(({ data }) => { if (data) setSlaProducts(data) }).catch(() => {})
    }
  }, [sla?.id])

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  const monthlyRecognition = useMemo(() => {
    const annualVal = parseFloat(form.annual_value) || 0
    if (!annualVal || !form.start_date) return null
    const start = new Date(form.start_date)
    const duration = parseInt(form.contract_duration_years) || 1
    const end = form.end_date ? new Date(form.end_date) : new Date(start.getFullYear() + duration, start.getMonth(), start.getDate() - 1)
    const invoice = form.invoice_date ? new Date(form.invoice_date) : null
    const monthlyRate = annualVal / 12

    const FY_MONTHS = ['Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar']
    const FY_KEYS = ['apr','may','jun','jul','aug','sep','oct','nov','dec','jan','feb','mar']
    const CALENDAR_MONTHS = [3,4,5,6,7,8,9,10,11,0,1,2]
    const FY_START_YEAR = 2026

    const result = {}
    const status = {}
    FY_KEYS.forEach(k => { result[k] = 0; status[k] = 'none' })

    for (let i = 0; i < 12; i++) {
      const calMonth = CALENDAR_MONTHS[i]
      const year = calMonth >= 3 ? FY_START_YEAR : FY_START_YEAR + 1
      const monthDate = new Date(year, calMonth, 15)

      if (monthDate >= start && monthDate <= end) {
        status[FY_KEYS[i]] = 'active'
        result[FY_KEYS[i]] = Math.round(monthlyRate)
      } else if (monthDate > end) {
        status[FY_KEYS[i]] = 'pending_renewal'
      }
    }

    if (invoice && invoice > start) {
      const invoiceFYIdx = (invoice.getMonth() - 3 + 12) % 12
      let catchUpMonths = 0
      for (let i = 0; i < invoiceFYIdx; i++) {
        if (status[FY_KEYS[i]] === 'active') {
          catchUpMonths += 1
          result[FY_KEYS[i]] = 0
          status[FY_KEYS[i]] = 'accrued'
        }
      }
      if (catchUpMonths > 0 && status[FY_KEYS[invoiceFYIdx]] === 'active') {
        result[FY_KEYS[invoiceFYIdx]] = Math.round(monthlyRate * (catchUpMonths + 1))
        status[FY_KEYS[invoiceFYIdx]] = 'invoice'
      }
    }

    return {
      months: FY_MONTHS, keys: FY_KEYS, values: result, status,
      total: Object.values(result).reduce((s, v) => s + v, 0)
    }
  }, [form.annual_value, form.start_date, form.end_date, form.invoice_date, form.contract_duration_years])

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
      contract_duration_years: parseInt(form.contract_duration_years) || 1,
      renewal_date:    form.renewal_date || null,
      invoice_date:    form.invoice_date || null,
      ...(!isEdit ? { created_by: profile?.id } : {}),
    }

    const result = isEdit
      ? await updateSla(sla.id, payload)
      : await createSla(payload)

    setSaving(false)
    if (result.error) { setError(result.error.message); return }

    // Sync client name to accounts and deals if changed
    if (isEdit && sla.client && form.client.trim() !== sla.client) {
      const oldName = sla.client
      const newName = form.client.trim()
      supabase.from('accounts').update({ name: newName }).eq('name', oldName).then(() => {})
      supabase.from('deals').update({ client: newName }).eq('client', oldName).then(() => {})
      supabase.from('slas').update({ client: newName }).eq('client', oldName).neq('id', sla.id).then(() => {})
    }

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
          <div className="flex gap-2">
            <input className="input flex-1" value={form.client}
              onChange={e => set('client', e.target.value)}
              placeholder="Client name"/>
            <SearchableSelect
              value=""
              onChange={v => { if (v) set('client', v) }}
              options={clients.map(c => ({ value: c, label: c }))}
              placeholder="Search…"
              emptyLabel="Pick existing"
              size="sm"
            />
          </div>
          {sla?.id && form.client !== sla.client && (
            <p className="text-[10px] text-amber-500 mt-0.5">Changed from "{sla.client}" → "{form.client}"</p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">SLA Owner</label>
            <SearchableSelect
              value={form.sla_owner}
              onChange={v => set('sla_owner', v)}
              options={owners.map(o => ({ value: o, label: o }))}
              placeholder="Search owners…"
              emptyLabel="— Select —"
              onCreateNew={(q) => { if (q) set('sla_owner', q) }}
              createLabel="Other"
            />
          </div>
          <div>
            <label className="label">SLA Type</label>
            <select className="select" value={form.sla_type} onChange={e => set('sla_type', e.target.value)}>
              <option value="">Select…</option>
              {SLA_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Annual Value</label>
            <input className="input" type="number" value={form.annual_value} onChange={e => set('annual_value', e.target.value)} placeholder="28000"/>
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
            <label className="label">Start Date</label>
            <input className="input" type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)}/>
          </div>
        </div>

        <div>
          <label className="label">Description</label>
          <textarea className="input min-h-[60px] resize-none" value={form.description} onChange={e => set('description', e.target.value)}/>
        </div>

        {/* Contract Products */}
        {sla?.id && (
          <div className="border-t pt-3 space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-gray-500 uppercase">Products ({slaProducts.length})</p>
              {slaProducts.length > 0 && (
                <span className="text-xs text-gray-500">
                  Total: <span className="font-bold text-blue-600">{formatK(slaProducts.reduce((s, p) => s + (Number(p.annual_value) || 0), 0))}/yr</span>
                </span>
              )}
            </div>
            {slaProducts.map(sp => (
              <div key={sp.id} className="bg-gray-50 rounded-lg px-3 py-2 space-y-1">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-gray-800 truncate">{sp.product_name || '—'}</p>
                  <button onClick={async () => {
                    await supabase.from('sla_products').delete().eq('id', sp.id)
                    setSlaProducts(prev => prev.filter(p => p.id !== sp.id))
                    const newTotal = slaProducts.filter(p => p.id !== sp.id).reduce((s, p) => s + (Number(p.annual_value) || 0), 0)
                    set('annual_value', newTotal)
                  }} className="text-gray-300 hover:text-red-500 p-1 min-h-tap">
                    <X size={12}/>
                  </button>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <label className="text-[9px] text-gray-400">Cost €</label>
                    <input className="input text-xs py-1" type="number" defaultValue={sp.unit_price ?? 0}
                      onBlur={async (e) => {
                        const cost = parseFloat(e.target.value) || 0
                        await supabase.from('sla_products').update({ unit_price: cost }).eq('id', sp.id).then(() => {}).catch(() => {})
                      }}/>
                  </div>
                  <div>
                    <label className="text-[9px] text-blue-500">Annual Fee €</label>
                    <input className="input text-xs py-1 border-blue-200" type="number" defaultValue={sp.annual_value ?? 0}
                      onBlur={async (e) => {
                        const val = parseFloat(e.target.value) || 0
                        await supabase.from('sla_products').update({ annual_value: val }).eq('id', sp.id).then(() => {}).catch(() => {})
                        setSlaProducts(prev => prev.map(p => p.id === sp.id ? { ...p, annual_value: val } : p))
                        const newTotal = slaProducts.map(p => p.id === sp.id ? { ...p, annual_value: val } : p)
                          .reduce((s, p) => s + (Number(p.annual_value) || 0), 0)
                        set('annual_value', newTotal)
                      }}/>
                  </div>
                  <div>
                    <label className="text-[9px] text-gray-400">Qty</label>
                    <input className="input text-xs py-1" type="number" min="1" defaultValue={sp.quantity ?? 1}
                      onBlur={async (e) => {
                        const qty = parseInt(e.target.value) || 1
                        await supabase.from('sla_products').update({ quantity: qty }).eq('id', sp.id).then(() => {}).catch(() => {})
                      }}/>
                  </div>
                </div>
              </div>
            ))}
            <div className="flex gap-2">
              <select className="select text-xs flex-1" value={addProductId} onChange={e => setAddProductId(e.target.value)}>
                <option value="">+ Add product…</option>
                {catalogProducts.map(p => (
                  <option key={p.id} value={p.id}>{p.name} ({formatK(p.annual_fee)}/yr)</option>
                ))}
              </select>
              {addProductId && (
                <button onClick={async () => {
                  const prod = catalogProducts.find(p => p.id === addProductId)
                  if (!prod) return
                  const { data } = await supabase.from('sla_products').insert({
                    sla_id: sla.id,
                    product_id: prod.id,
                    product_name: prod.name,
                    quantity: 1,
                    annual_value: prod.annual_fee || 0,
                  }).select().single()
                  if (data) {
                    setSlaProducts(prev => [...prev, data])
                    const newTotal = [...slaProducts, data].reduce((s, p) => s + (Number(p.annual_value) || 0), 0)
                    set('annual_value', newTotal)
                  }
                  setAddProductId('')
                }} className="btn-primary text-xs px-3">Add</button>
              )}
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 gap-3 border-t pt-3">
          <div>
            <label className="label">{t('sla_billing_model')}</label>
            <select className="select" value={form.billing_model} onChange={e => set('billing_model', e.target.value)}>
              {BILLING_MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </div>
          <div>
            <label className="label">{t('sla_billing_freq')}</label>
            <select className="select" value={form.billing_frequency} onChange={e => set('billing_frequency', e.target.value)}>
              {BILLING_FREQUENCIES.map(f => <option key={f.id} value={f.id}>{f.label}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Contract Duration</label>
            <select className="select" value={form.contract_duration_years} onChange={e => {
              set('contract_duration_years', e.target.value)
              if (form.start_date) {
                const start = new Date(form.start_date)
                const end = new Date(start)
                end.setFullYear(end.getFullYear() + parseInt(e.target.value))
                end.setDate(end.getDate() - 1)
                set('end_date', end.toISOString().split('T')[0])
                set('renewal_date', end.toISOString().split('T')[0])
              }
            }}>
              <option value="1">1 Year</option>
              <option value="2">2 Years</option>
              <option value="3">3 Years</option>
              <option value="5">5 Years</option>
            </select>
          </div>
          <div>
            <label className="label">Renewal Date</label>
            <input className="input" type="date" value={form.renewal_date} onChange={e => set('renewal_date', e.target.value)}/>
          </div>
        </div>

        <div>
          <label className="label">Invoice Date</label>
          <input className="input" type="date" value={form.invoice_date} onChange={e => set('invoice_date', e.target.value)}/>
          <p className="text-[10px] text-gray-400 mt-0.5">Date when PO received and invoice issued</p>
        </div>

        {monthlyRecognition && (
          <div className="border-t pt-3">
            <p className="text-[10px] font-semibold text-gray-500 uppercase mb-2">Revenue Recognition · FY26</p>
            <div className="grid grid-cols-4 sm:grid-cols-6 gap-1">
              {monthlyRecognition.months.map((m, i) => {
                const key = monthlyRecognition.keys[i]
                const val = monthlyRecognition.values[key]
                const st = monthlyRecognition.status[key]
                const bgClass = st === 'invoice' ? 'bg-amber-100 border border-amber-300'
                  : st === 'accrued' ? 'bg-amber-50'
                  : st === 'active' ? 'bg-blue-50'
                  : st === 'pending_renewal' ? 'bg-orange-50 border border-orange-200'
                  : 'bg-gray-50'
                return (
                  <div key={m} className={`text-center rounded p-1.5 ${bgClass}`}>
                    <p className="text-[9px] text-gray-400">{m}</p>
                    {st === 'pending_renewal' ? (
                      <p className="text-[9px] font-bold text-orange-500">Renew</p>
                    ) : (
                      <p className={`text-xs font-bold ${val > 0 ? 'text-gray-800' : 'text-gray-300'}`}>
                        {val > 0 ? formatK(val) : '—'}
                      </p>
                    )}
                  </div>
                )
              })}
            </div>
            <div className="flex items-center justify-between mt-1">
              <div className="flex gap-2 text-[9px] text-gray-400">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-blue-100 border border-blue-200"/> Active</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-amber-100 border border-amber-300"/> Invoice</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-orange-50 border border-orange-200"/> Renewal</span>
              </div>
              <p className="text-[10px] text-gray-500">Total: {formatK(monthlyRecognition.total)}</p>
            </div>
          </div>
        )}

        {/* Renewal section */}
        {sla?.id && ['active','pending_renewal'].includes(form.status) && (
          <div className="border-t pt-3 space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase">Renewal</p>
            {sla.previous_value && (
              <p className="text-[10px] text-gray-400">Previous: {formatK(sla.previous_value)} → Current: {formatK(sla.annual_value)}</p>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-[10px] text-gray-500">New Value €</label>
                <input className="input text-xs py-1" type="number"
                  id="renewal_new_value"
                  defaultValue={form.annual_value}/>
              </div>
              <div>
                <label className="text-[10px] text-gray-500">or Increase %</label>
                <input className="input text-xs py-1" type="number"
                  id="renewal_increase_pct"
                  placeholder="e.g. 3"
                  onChange={e => {
                    const pct = parseFloat(e.target.value) || 0
                    const newVal = Math.round((parseFloat(form.annual_value) || 0) * (1 + pct / 100))
                    const el = document.getElementById('renewal_new_value')
                    if (el) el.value = newVal
                  }}/>
              </div>
            </div>
            <button type="button" onClick={async () => {
              const newVal = parseFloat(document.getElementById('renewal_new_value')?.value) || form.annual_value
              const { error } = await updateSla(sla.id, {
                previous_value: parseFloat(form.annual_value) || 0,
                change_reason: `Renewed: ${formatK(form.annual_value)} → ${formatK(newVal)}`,
                change_date: new Date().toISOString().split('T')[0],
                annual_value: newVal,
                status: 'renewed',
                start_date: form.renewal_date || form.end_date || null,
              })
              if (!error) { onSaved(); onClose() }
            }} className="btn-primary text-xs w-full">
              Renew Contract
            </button>
          </div>
        )}

        {/* Value change history */}
        {sla?.previous_value && (
          <div className="bg-gray-50 rounded-lg p-2">
            <p className="text-[10px] text-gray-400">
              History: {sla.change_reason || 'Value changed'} · {sla.change_date ? new Date(sla.change_date).toLocaleDateString('pt-PT') : ''}
            </p>
          </div>
        )}

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
  const { canEdit, isAdmin, profile, perms } = useAuth()
  const canDelete = perms?.canDelete ?? false
  const { t } = useTranslation()
  const [search, setSearch]     = useState('')
  const [buF, setBuF]           = useState('')
  const [regionF, setRegionF]   = useState('')
  const [countryF, setCountryF] = useState('')
  const [productF, setProductF] = useState('')
  const [ownerF, setOwnerF]     = useState('')
  const [renewalF, setRenewalF] = useState('')
  const [typeTab, setTypeTab]   = useState('all_types')
  const [tab, setTab]           = useState('active')
  const [statusF, setStatusF]   = useState('')
  const [viewMode, setViewMode] = useState('list')
  const [sortBy, setSortBy]     = useState('value_desc')
  const [formOpen, setFormOpen] = useState(false)
  const [editSla, setEditSla]   = useState(null)
  const [confirmDel, setConfirmDel] = useState(null)
  const [owners, setOwners]     = useState([])

  const { slas: rawSlas, loading, refetch } = useSlas({ bu: buF || undefined })
  const slas = useMemo(() => {
    if (!search) return rawSlas
    const s = search.toLowerCase()
    return rawSlas.filter(sla =>
      (sla.client || '').toLowerCase().includes(s) ||
      (sla.sla_owner || '').toLowerCase().includes(s) ||
      (sla.description || '').toLowerCase().includes(s) ||
      (sla.product || '').toLowerCase().includes(s)
    )
  }, [rawSlas, search])

  useEffect(() => {
    import('../lib/supabase').then(({ supabase }) => {
      supabase.from('quotas').select('sales_owner').then(({ data }) => {
        if (data) setOwners([...new Set(data.map(q => q.sales_owner).filter(Boolean))].sort())
      })
    })
  }, [])

  const now = new Date()
  const regions = useMemo(() => [...new Set(slas.map(s => s.region).filter(Boolean))].sort(), [slas])
  const countries = useMemo(() => {
    const src = regionF ? slas.filter(s => s.region === regionF) : slas
    return [...new Set(src.map(s => s.country).filter(Boolean))].sort()
  }, [slas, regionF])
  const products = useMemo(() => [...new Set(slas.map(s => s.product).filter(Boolean))].sort(), [slas])
  const ownersList = useMemo(() => [...new Set(slas.map(s => s.sla_owner).filter(Boolean))].sort(), [slas])

  const typeFiltered = useMemo(() => {
    let list = slas
    if (typeTab === 'maintenance') list = list.filter(s => !s.billing_model || s.billing_model === 'fixed')
    if (typeTab === 'variable') list = list.filter(s => s.billing_model && s.billing_model !== 'fixed')
    if (regionF) list = list.filter(s => s.region === regionF)
    if (countryF) list = list.filter(s => s.country === countryF)
    if (productF) list = list.filter(s => (s.product || '').toLowerCase().includes(productF.toLowerCase()))
    if (ownerF) list = list.filter(s => s.sla_owner === ownerF)
    if (renewalF) {
      const days = parseInt(renewalF)
      if (days > 0) {
        const cutoff = new Date(now.getTime() + days * 86400000)
        list = list.filter(s => {
          const rd = s.renewal_date || s.end_date
          return rd && new Date(rd) <= cutoff && new Date(rd) >= now
        })
      }
    }
    if (statusF) list = list.filter(s => s.status === statusF)
    list.sort((a, b) => {
      if (sortBy === 'value_desc') return (Number(b.annual_value) || 0) - (Number(a.annual_value) || 0)
      if (sortBy === 'value_asc')  return (Number(a.annual_value) || 0) - (Number(b.annual_value) || 0)
      if (sortBy === 'client')     return (a.client || '').localeCompare(b.client || '')
      if (sortBy === 'date_desc')  return new Date(b.created_at || 0) - new Date(a.created_at || 0)
      if (sortBy === 'date_asc')   return new Date(a.created_at || 0) - new Date(b.created_at || 0)
      if (sortBy === 'renewal')    return new Date(a.renewal_date || a.end_date || '2099') - new Date(b.renewal_date || b.end_date || '2099')
      return 0
    })
    return list
  }, [slas, typeTab, regionF, countryF, productF, ownerF, renewalF, statusF, sortBy])

  const filtered = useMemo(() => {
    const tabFilter = {
      pipeline: s => ['draft','waiting_po'].includes(s.status),
      active:   s => ['warranty','active','pending_renewal'].includes(s.status),
      renewal:  s => ['pending_renewal','renewed'].includes(s.status),
      closed:   s => ['expired','cancelled'].includes(s.status),
      all:      () => true,
    }
    return typeFiltered.filter(tabFilter[tab] || tabFilter.all)
  }, [typeFiltered, tab])

  const pipelineByFY = useMemo(() => {
    const byFY = {}
    for (const s of typeFiltered) {
      if (!['draft','waiting_po'].includes(s.status)) continue
      const fy = s.start_date ? getFiscalYear(s.start_date) : 'Unscheduled'
      if (!byFY[fy]) byFY[fy] = []
      byFY[fy].push(s)
    }
    return byFY
  }, [typeFiltered])

  const kpis = useMemo(() => {
    const active = slas.filter(s => ['warranty','active','pending_renewal'].includes(s.status))
    const pipeline = slas.filter(s => ['draft','waiting_po'].includes(s.status))
    const expired = slas.filter(s => s.status === 'expired')
    const renewing90 = slas.filter(s => {
      const rd = s.renewal_date || s.end_date
      return rd && ['active','invoiced'].includes(s.status) && new Date(rd) <= new Date(now.getTime() + 90 * 86400000) && new Date(rd) >= now
    })
    const atRisk = [...expired, ...slas.filter(s => {
      const rd = s.renewal_date || s.end_date
      return rd && ['active','pending_renewal'].includes(s.status) && new Date(rd) <= new Date(now.getTime() + 30 * 86400000) && new Date(rd) >= now
    })]
    return {
      activeCount: active.length,
      activeValue: active.reduce((s, a) => s + (Number(a.annual_value) || 0), 0),
      pipelineValue: pipeline.reduce((s, a) => s + (Number(a.annual_value) || 0), 0),
      renewals90: renewing90.length,
      renewals90Value: renewing90.reduce((s, a) => s + (Number(a.annual_value) || 0), 0),
      atRiskValue: atRisk.reduce((s, a) => s + (Number(a.annual_value) || 0), 0),
      atRiskCount: atRisk.length,
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

  const tf = typeFiltered
  const tabs = [
    { id: 'active',   label: `Active (${tf.filter(s=>['warranty','active','pending_renewal'].includes(s.status)).length})` },
    { id: 'pipeline', label: `Pipeline (${tf.filter(s=>['draft','waiting_po'].includes(s.status)).length})` },
    { id: 'renewal',  label: `Renewal (${tf.filter(s=>['pending_renewal','renewed'].includes(s.status)).length})` },
    { id: 'closed',   label: `Closed (${tf.filter(s=>['expired','cancelled'].includes(s.status)).length})` },
    { id: 'all',      label: `All (${tf.length})` },
  ]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-lg font-bold text-gray-900">{t('sla_title')}</h1>
          <p className="text-xs text-gray-400">{t('sla_subtitle')}</p>
        </div>
        {(isAdmin || profile?.role === 'manager') && (
          <button onClick={() => { setEditSla(null); setFormOpen(true) }} className="btn-primary flex items-center gap-1">
            <Plus size={14}/> {t('sla_new')}
          </button>
        )}
      </div>

      {/* Renewal alert banner */}
      {kpis.atRiskCount > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle size={14} className="text-red-600"/>
            <span className="text-sm text-red-700 font-medium">
              {kpis.atRiskCount} contract{kpis.atRiskCount > 1 ? 's' : ''} ({formatK(kpis.atRiskValue)}) at risk or expiring within 30 days
            </span>
          </div>
          <button onClick={() => setRenewalF('30')} className="text-xs text-red-600 font-semibold hover:text-red-800">View →</button>
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="card p-3">
          <p className="text-[10px] text-gray-400 uppercase font-semibold">Active ARR</p>
          <p className="text-xl font-bold text-green-600">{formatK(kpis.activeValue)}</p>
          <p className="text-xs text-gray-500">{kpis.activeCount} contracts</p>
        </div>
        <div className="card p-3">
          <p className="text-[10px] text-gray-400 uppercase font-semibold">Renewals 90d</p>
          <p className="text-xl font-bold text-amber-600">{kpis.renewals90}</p>
          <p className="text-xs text-gray-500">{formatK(kpis.renewals90Value)} at stake</p>
        </div>
        <div className="card p-3">
          <p className="text-[10px] text-gray-400 uppercase font-semibold">Pipeline ARR</p>
          <p className="text-xl font-bold text-gray-700">{formatK(kpis.pipelineValue)}</p>
          <p className="text-xs text-gray-500">{t('sla_future_val')}</p>
        </div>
      </div>

      {/* Revenue by FY */}
      <div className="card p-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-2 flex items-center gap-1">
          <TrendingUp size={12}/> {t('sla_revenue_fy')}
        </p>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
          {FY_RANGE.map(fy => {
            const total = revenueByFY[fy].vgt + revenueByFY[fy].ect
            return (
              <div key={fy} className="text-center">
                <p className="text-[10px] text-gray-400 font-medium">{fy}</p>
                <p className="text-sm font-bold text-gray-800">{total > 0 ? formatK(total) : '—'}</p>
                {isAdmin && total > 0 && (
                  <div className="flex justify-center gap-1 mt-0.5">
                    <span className="text-[10px] text-teal-600">{formatK(revenueByFY[fy].vgt)}</span>
                    <span className="text-[10px] text-coral-600">{formatK(revenueByFY[fy].ect)}</span>
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
          <input className="input pl-8 text-sm" placeholder={t('sla_search_ph')}
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
        {regions.length > 0 && (
          <select className="select text-xs w-auto" value={regionF} onChange={e => setRegionF(e.target.value)}>
            <option value="">All Regions</option>
            {regions.map(r => <option key={r}>{r}</option>)}
          </select>
        )}
        {countries.length > 0 && (
          <select className="select text-xs w-auto" value={countryF} onChange={e => setCountryF(e.target.value)}>
            <option value="">All Countries</option>
            {countries.map(c => <option key={c}>{c}</option>)}
          </select>
        )}
        {ownersList.length > 0 && (
          <select className="select text-xs w-auto" value={ownerF} onChange={e => setOwnerF(e.target.value)}>
            <option value="">All Owners</option>
            {ownersList.map(o => <option key={o}>{o}</option>)}
          </select>
        )}
        <select className="select text-xs w-auto" value={renewalF} onChange={e => setRenewalF(e.target.value)}>
          <option value="">Renewal</option>
          <option value="30">≤30 days</option>
          <option value="60">≤60 days</option>
          <option value="90">≤90 days</option>
        </select>
        <select className="select text-xs w-auto" value={statusF} onChange={e => setStatusF(e.target.value)}>
          <option value="">All Status</option>
          {SLA_STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <select className="select text-xs w-auto" value={sortBy} onChange={e => setSortBy(e.target.value)}>
          <option value="value_desc">Value ↓</option>
          <option value="value_asc">Value ↑</option>
          <option value="client">Client A→Z</option>
          <option value="date_desc">Newest</option>
          <option value="date_asc">Oldest</option>
          <option value="renewal">Renewal soon</option>
        </select>
        <div className="flex gap-0.5 bg-gray-100 p-0.5 rounded-lg ml-auto">
          <button onClick={() => setViewMode('list')}
            className={`px-2 py-1 rounded text-xs font-semibold ${viewMode === 'list' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>
            List
          </button>
          <button onClick={() => setViewMode('kanban')}
            className={`px-2 py-1 rounded text-xs font-semibold ${viewMode === 'kanban' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>
            Kanban
          </button>
        </div>
      </div>

      {/* Contract type tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
        {[
          { id: 'all_types', label: 'All Contracts' },
          { id: 'maintenance', label: 'Maintenance SLAs' },
          { id: 'variable', label: 'Variable Recurring' },
        ].map(tt => (
          <button key={tt.id} onClick={() => setTypeTab(tt.id)}
            className={`px-3 py-1.5 rounded text-xs font-semibold transition-all flex-1 ${
              typeTab === tt.id ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500'
            }`}>
            {tt.label}
          </button>
        ))}
      </div>

      {/* Status tabs */}
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

      {/* Contract list / Kanban */}
      {viewMode === 'kanban' ? (
        <div className="overflow-x-auto">
          <div className="flex gap-3 min-w-[900px]">
            {SLA_STATUSES.map(st => {
              const colSlas = typeFiltered.filter(s => s.status === st.id)
              const colValue = colSlas.reduce((s, a) => s + (Number(a.annual_value) || 0), 0)
              return (
                <div key={st.id} className="flex-1 min-w-[160px]">
                  <div className={`rounded-t-lg px-2 py-1.5 flex items-center justify-between ${st.color.split(' ').filter(c => c.startsWith('bg-')).join(' ')}`}>
                    <span className={`text-[10px] font-bold uppercase ${st.color.split(' ').filter(c => c.startsWith('text-')).join(' ')}`}>
                      {st.label}
                    </span>
                    <span className="text-[10px] font-semibold text-gray-500">{colSlas.length}</span>
                  </div>
                  <div className="bg-gray-50 rounded-b-lg p-1.5 space-y-1.5 min-h-[100px]">
                    {colValue > 0 && (
                      <p className="text-[10px] text-center text-gray-400 font-medium">{formatK(colValue)}</p>
                    )}
                    {colSlas.map(s => (
                      <div key={s.id} onClick={() => { setEditSla(s); setFormOpen(true) }}
                        className="bg-white rounded-lg p-2 shadow-sm border border-gray-100 cursor-pointer hover:shadow-md transition-shadow">
                        <div className="flex items-center gap-1 mb-0.5">
                          <BUBadge bu={s.bu}/>
                          <RenewalBadge sla={s}/>
                        </div>
                        <p className="text-xs font-semibold text-gray-900 truncate">{s.client}</p>
                        {s.description && <p className="text-[10px] text-gray-400 truncate">{s.description}</p>}
                        <p className="text-xs font-bold text-gray-700 mt-1">{formatK(s.annual_value)}<span className="text-[10px] text-gray-400 font-normal">/yr</span></p>
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : tab === 'pipeline' ? (
        <div className="space-y-4">
          {[...FY_RANGE, 'Unscheduled'].map(fy => {
            const fySlas = pipelineByFY[fy]
            if (!fySlas?.length) return null
            return (
              <div key={fy}>
                <p className="text-xs font-semibold text-gray-500 uppercase mb-2">{fy} — {fySlas.length} contract{fySlas.length > 1 ? 's' : ''}</p>
                <div className="space-y-2">
                  {fySlas.map(s => (
                    <SlaCard key={s.id} sla={s} canEdit={canEdit} canDelete={canDelete}
                      onEdit={s => { setEditSla(s); setFormOpen(true) }}
                      onDelete={setConfirmDel}/>
                  ))}
                </div>
              </div>
            )
          })}
          {Object.keys(pipelineByFY).length === 0 && (
            <EmptyState icon="📋" title={t('sla_no_pipeline')} description={t('sla_create_hint')}/>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.length === 0 ? (
            <EmptyState icon="📋" title={t('sla_no_found')}
              description={t('sla_create_hint')}
              action={canEdit && <button onClick={() => setFormOpen(true)} className="btn-primary">New SLA</button>}/>
          ) : filtered.map(s => (
            <SlaCard key={s.id} sla={s} canEdit={canEdit} canDelete={canDelete}
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
            <p className="font-semibold text-gray-900">{t('sla_delete')}</p>
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

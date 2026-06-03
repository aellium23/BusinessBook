import { useState, useMemo, useEffect } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import SearchableSelect from './SearchableSelect'
import { validateSLA } from '../lib/validation'
import { useTranslation } from '../hooks/useTranslation'
import { Modal } from './ui'
import { formatK } from './ui'
import { SLA_STATUSES, SLA_TYPES, BILLING_MODELS, BILLING_FREQUENCIES } from '../constants'
import { getAllowedTransitions, canTransition } from '../lib/stateMachine'
import { createSla, updateSla } from '../hooks/useSlas'
import { X } from 'lucide-react'

export default function SlaFormModal({ sla, onClose, onSaved, owners }) {
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
  const [fieldErrors, setFieldErrors] = useState({})
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
    const { valid, errors: valErrors } = validateSLA(form)
    setFieldErrors(valErrors)
    if (!valid) { setError('Please fix the highlighted fields'); return }
    // Validate status transition for existing SLAs
    if (sla?.id && sla.status !== form.status && !canTransition('sla', sla.status, form.status)) {
      setError(`Invalid status transition: "${SLA_STATUSES.find(s => s.id === sla.status)?.label || sla.status}" to "${SLA_STATUSES.find(s => s.id === form.status)?.label || form.status}". Allowed: ${getAllowedTransitions('sla', sla.status).filter(s => s !== sla.status).map(id => SLA_STATUSES.find(s => s.id === id)?.label || id).join(', ') || 'none'}`)
      return
    }
    setSaving(true); setError(null)

    const annualVal = parseFloat(form.annual_value) || 0
    const { projectSlaRevenue } = await import('../constants')
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
            <select className={`select ${fieldErrors.bu ? 'border-red-400' : ''}`} value={form.bu} onChange={e => set('bu', e.target.value)}>
              <option value="VGT">VGT</option>
              <option value="ECT">ECT</option>
            </select>
            {fieldErrors.bu && <p className="text-tiny text-red-500 mt-0.5">{fieldErrors.bu}</p>}
          </div>
          <div>
            <label className="label">Status</label>
            <select className="select" value={form.status} onChange={e => {
              const newStatus = e.target.value
              if (sla?.id && !canTransition('sla', sla.status, newStatus)) {
                setError(`Cannot move from "${SLA_STATUSES.find(s => s.id === sla.status)?.label || sla.status}" to "${SLA_STATUSES.find(s => s.id === newStatus)?.label || newStatus}". Allowed: ${getAllowedTransitions('sla', sla.status).filter(s => s !== sla.status).map(id => SLA_STATUSES.find(s => s.id === id)?.label || id).join(', ') || 'none'}`)
                return
              }
              set('status', newStatus)
            }}>
              {(() => {
                if (sla?.id) {
                  const allowed = getAllowedTransitions('sla', sla.status)
                  return SLA_STATUSES.filter(s => allowed.includes(s.id)).map(s => <option key={s.id} value={s.id}>{s.label}</option>)
                }
                return SLA_STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)
              })()}
            </select>
          </div>
        </div>

        <div>
          <label className="label">Client *</label>
          <div className={`flex gap-2 ${fieldErrors.client ? 'ring-1 ring-red-400 rounded-lg' : ''}`}>
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
          {fieldErrors.client && <p className="text-tiny text-red-500 mt-0.5">{fieldErrors.client}</p>}
          {sla?.id && form.client !== sla.client && !fieldErrors.client && (
            <p className="text-micro text-amber-500 mt-0.5">Changed from "{sla.client}" → "{form.client}"</p>
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
            <input className={`input ${fieldErrors.annual_value ? 'border-red-400' : ''}`} type="number" value={form.annual_value} onChange={e => set('annual_value', e.target.value)} placeholder="28000"/>
            {fieldErrors.annual_value && <p className="text-tiny text-red-500 mt-0.5">{fieldErrors.annual_value}</p>}
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
            <input className={`input ${fieldErrors.start_date ? 'border-red-400' : ''}`} type="date" value={form.start_date} onChange={e => set('start_date', e.target.value)}/>
            {fieldErrors.start_date && <p className="text-tiny text-red-500 mt-0.5">{fieldErrors.start_date}</p>}
          </div>
        </div>

        <div>
          <label className="label">Description</label>
          <textarea className={`input min-h-[60px] resize-none ${fieldErrors.description ? 'border-red-400' : ''}`} value={form.description} onChange={e => set('description', e.target.value)}/>
          {fieldErrors.description && <p className="text-tiny text-red-500 mt-0.5">{fieldErrors.description}</p>}
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
                    <label className="text-micro text-gray-400">Cost €</label>
                    <input className="input text-xs py-1" type="number" defaultValue={sp.unit_price ?? 0}
                      onBlur={async (e) => {
                        const cost = parseFloat(e.target.value) || 0
                        await supabase.from('sla_products').update({ unit_price: cost }).eq('id', sp.id).then(() => {}).catch(() => {})
                      }}/>
                  </div>
                  <div>
                    <label className="text-micro text-blue-500">Annual Fee €</label>
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
                    <label className="text-micro text-gray-400">Qty</label>
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
            <input className={`input ${fieldErrors.renewal_date ? 'border-red-400' : ''}`} type="date" value={form.renewal_date} onChange={e => set('renewal_date', e.target.value)}/>
            {fieldErrors.renewal_date && <p className="text-tiny text-red-500 mt-0.5">{fieldErrors.renewal_date}</p>}
          </div>
        </div>

        <div>
          <label className="label">Invoice Date</label>
          <input className={`input ${fieldErrors.invoice_date ? 'border-red-400' : ''}`} type="date" value={form.invoice_date} onChange={e => set('invoice_date', e.target.value)}/>
          {fieldErrors.invoice_date && <p className="text-tiny text-red-500 mt-0.5">{fieldErrors.invoice_date}</p>}
          <p className="text-micro text-gray-400 mt-0.5">Date when PO received and invoice issued</p>
        </div>

        {monthlyRecognition && (
          <div className="border-t pt-3">
            <p className="text-micro font-semibold text-gray-500 uppercase mb-2">Revenue Recognition · FY26</p>
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
                    <p className="text-micro text-gray-400">{m}</p>
                    {st === 'pending_renewal' ? (
                      <p className="text-micro font-bold text-orange-500">Renew</p>
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
              <div className="flex gap-2 text-micro text-gray-400">
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-blue-100 border border-blue-200"/> Active</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-amber-100 border border-amber-300"/> Invoice</span>
                <span className="flex items-center gap-1"><span className="w-2 h-2 rounded bg-orange-50 border border-orange-200"/> Renewal</span>
              </div>
              <p className="text-micro text-gray-500">Total: {formatK(monthlyRecognition.total)}</p>
            </div>
          </div>
        )}

        {/* Renewal section */}
        {sla?.id && ['active','pending_renewal'].includes(form.status) && (
          <div className="border-t pt-3 space-y-2">
            <p className="text-xs font-semibold text-gray-500 uppercase">Renewal</p>
            {sla.previous_value && (
              <p className="text-micro text-gray-400">Previous: {formatK(sla.previous_value)} → Current: {formatK(sla.annual_value)}</p>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-micro text-gray-500">New Value €</label>
                <input className="input text-xs py-1" type="number"
                  id="renewal_new_value"
                  defaultValue={form.annual_value}/>
              </div>
              <div>
                <label className="text-micro text-gray-500">or Increase %</label>
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
            <p className="text-micro text-gray-400">
              History: {sla.change_reason || 'Value changed'} · {sla.change_date ? new Date(sla.change_date).toLocaleDateString('pt-PT') : ''}
            </p>
          </div>
        )}

        {form.billing_model !== 'fixed' && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Price per Study €</label>
              <input className={`input ${fieldErrors.price_per_study ? 'border-red-400' : ''}`} type="number" step="0.01" value={form.price_per_study} onChange={e => set('price_per_study', e.target.value)} placeholder="e.g. 2.50"/>
              {fieldErrors.price_per_study && <p className="text-tiny text-red-500 mt-0.5">{fieldErrors.price_per_study}</p>}
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

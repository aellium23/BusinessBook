import { useState, useEffect, useMemo } from 'react'
import { useAuth } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'
import { useTranslation } from '../hooks/useTranslation'
import { Modal, formatK } from './ui'
import { createQuotation, updateQuotation } from '../hooks/useQuotations'
import { X, Plus } from 'lucide-react'
import SearchableSelect from './SearchableSelect'

const CONTEXT_TYPES = [
  { id: 'license_compliance', label: 'License Compliance' },
  { id: 'new_business',       label: 'New Business' },
  { id: 'upgrade',            label: 'Upgrade' },
]

export default function QuotationFormModal({ quotation, onClose, onSaved, prefill }) {
  const { profile } = useAuth()
  const { t } = useTranslation()
  const isEdit = !!quotation?.id

  const [form, setForm] = useState({
    bu:             quotation?.bu           || prefill?.bu || 'VGT',
    client:         quotation?.client       || prefill?.client || '',
    description:    quotation?.description  || '',
    context_type:   quotation?.context_type || prefill?.context_type || 'new_business',
    currency:       quotation?.currency     || 'EUR',
    total_value:    quotation?.total_value  || '',
    sla_id:         quotation?.sla_id       || prefill?.sla_id || null,
    company_id:     quotation?.company_id   || prefill?.company_id || null,
    country:        quotation?.country      || prefill?.country || '',
    region:         quotation?.region       || prefill?.region || '',
    licensed_volume:quotation?.licensed_volume || prefill?.licensed_volume || '',
    actual_volume:  quotation?.actual_volume   || prefill?.actual_volume || '',
    notes:          quotation?.notes        || '',
    validity_days:  quotation?.validity_days || 30,
  })
  const [items, setItems] = useState(quotation?.items || [])
  const [saving, setSaving]   = useState(false)
  const [error, setError]     = useState('')
  const [clients, setClients] = useState([])
  const [products, setProducts] = useState([])
  const [distributors, setDistributors] = useState([])
  const [addProductId, setAddProductId] = useState('')

  useEffect(() => {
    supabase.from('deals').select('client').then(({ data }) => {
      if (data) setClients([...new Set(data.map(d => d.client).filter(Boolean))].sort())
    })
    supabase.from('products').select('id, name, sku, license_fee, annual_fee').eq('active', true).order('name')
      .then(({ data }) => { if (data) setProducts(data) })
    supabase.from('distributors').select('id, name, company_id').order('name')
      .then(({ data }) => { if (data) setDistributors(data) })
  }, [])

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  const total = useMemo(() =>
    items.reduce((s, it) => s + (Number(it.total_price) || 0), 0)
  , [items])

  function addProduct() {
    const prod = products.find(p => p.id === addProductId)
    if (!prod) return
    setItems(prev => [...prev, {
      product_id: prod.id,
      product_name: prod.name,
      quantity: 1,
      unit_price: prod.license_fee || 0,
      total_price: prod.license_fee || 0,
    }])
    setAddProductId('')
  }

  function updateItem(idx, field, val) {
    setItems(prev => prev.map((it, i) => {
      if (i !== idx) return it
      const next = { ...it, [field]: val }
      if (field === 'quantity' || field === 'unit_price') {
        next.total_price = (Number(next.quantity) || 0) * (Number(next.unit_price) || 0)
      }
      return next
    }))
  }

  function removeItem(idx) { setItems(prev => prev.filter((_, i) => i !== idx)) }

  async function handleSave() {
    if (!form.client.trim()) { setError('Client is required'); return }
    setSaving(true); setError('')

    const payload = {
      bu:               form.bu,
      client:           form.client.trim(),
      description:      form.description || null,
      context_type:     form.context_type || 'new_business',
      currency:         form.currency || 'EUR',
      total_value:      total || parseFloat(form.total_value) || 0,
      sla_id:           form.sla_id || null,
      company_id:       form.company_id || null,
      country:          form.country || null,
      region:           form.region || null,
      licensed_volume:  parseInt(form.licensed_volume) || null,
      actual_volume:    parseInt(form.actual_volume) || null,
      notes:            form.notes || null,
      validity_days:    parseInt(form.validity_days) || 30,
      status:           isEdit ? undefined : 'draft',
      created_by:       isEdit ? undefined : profile?.id,
      created_by_name:  isEdit ? undefined : (profile?.full_name || profile?.email),
    }

    let result
    if (isEdit) {
      // Only update header — items managed separately
      delete payload.status
      delete payload.created_by
      delete payload.created_by_name
      result = await updateQuotation(quotation.id, payload)
      // Sync items
      if (result.data) {
        await supabase.from('quotation_items').delete().eq('quotation_id', quotation.id)
        if (items.length > 0) {
          await supabase.from('quotation_items').insert(items.map(it => ({
            quotation_id: quotation.id,
            product_id:   it.product_id || null,
            product_name: it.product_name,
            quantity:      it.quantity || 1,
            unit_price:    it.unit_price || 0,
            total_price:   it.total_price || 0,
            description:   it.description || null,
          })))
        }
      }
    } else {
      result = await createQuotation({
        ...payload,
        items: items.map(it => ({
          product_id:   it.product_id || null,
          product_name: it.product_name,
          quantity:      it.quantity || 1,
          unit_price:    it.unit_price || 0,
          total_price:   it.total_price || 0,
          description:   it.description || null,
        })),
      })
    }
    setSaving(false)
    if (result.error) { setError(result.error.message); return }
    onSaved()
  }

  return (
    <Modal open title={isEdit ? t('quot_edit') : t('quot_new')} onClose={onClose}
      footer={
        <div className="flex gap-2">
          <button onClick={onClose} className="btn-secondary flex-1">{t('df_cancel')}</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary flex-1">
            {saving ? t('df_saving') : t('df_save')}
          </button>
        </div>
      }>
      <div className="space-y-3">
        {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">BU</label>
            <select className="select" value={form.bu} onChange={e => set('bu', e.target.value)}>
              <option value="VGT">VGT</option>
              <option value="ECT">ECT</option>
            </select>
          </div>
          <div>
            <label className="label">{t('quot_context')}</label>
            <select className="select" value={form.context_type} onChange={e => set('context_type', e.target.value)}>
              {CONTEXT_TYPES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </div>
        </div>

        <div>
          <label className="label">{t('df_client')} *</label>
          <SearchableSelect
            value={form.client}
            onChange={v => set('client', v)}
            options={clients.map(c => ({ value: c, label: c }))}
            placeholder={t('df_search_accounts')}
            emptyLabel="—"
            onCreateNew={q => { if (q) set('client', q) }}
            createLabel={t('df_new_client')}
          />
        </div>

        {/* Distributor link */}
        <div>
          <label className="label">{t('quot_distributor')}</label>
          <select className="select" value={form.company_id || ''} onChange={e => set('company_id', e.target.value || null)}>
            <option value="">— {t('quot_no_distributor')} —</option>
            {distributors.map(d => <option key={d.id} value={d.company_id}>{d.name}</option>)}
          </select>
        </div>

        <div>
          <label className="label">{t('df_description')}</label>
          <input className="input" value={form.description} onChange={e => set('description', e.target.value)}
            placeholder={t('quot_desc_ph')}/>
        </div>

        {/* Compliance context */}
        {form.context_type === 'license_compliance' && (
          <div className="grid grid-cols-2 gap-3 bg-red-50 border border-red-200 rounded-xl p-3">
            <div>
              <label className="label text-red-600">{t('quot_licensed_vol')}</label>
              <input className="input" type="number" value={form.licensed_volume}
                onChange={e => set('licensed_volume', e.target.value)} placeholder="e.g. 50000"/>
            </div>
            <div>
              <label className="label text-red-600">{t('quot_actual_vol')}</label>
              <input className="input" type="number" value={form.actual_volume}
                onChange={e => set('actual_volume', e.target.value)} placeholder="e.g. 100000"/>
            </div>
          </div>
        )}

        {/* Product line items */}
        <div className="border-t pt-3 space-y-2">
          <p className="text-xs font-semibold text-gray-500 uppercase">{t('quot_items')} ({items.length})</p>
          {items.map((it, idx) => (
            <div key={idx} className="bg-gray-50 rounded-lg px-3 py-2 space-y-1">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium text-gray-800 truncate">{it.product_name || '—'}</p>
                <button onClick={() => removeItem(idx)} className="text-gray-300 hover:text-red-500 p-1 min-h-tap">
                  <X size={12}/>
                </button>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-micro text-gray-400">{t('quot_qty')}</label>
                  <input className="input text-xs py-1" type="number" min="1"
                    value={it.quantity} onChange={e => updateItem(idx, 'quantity', parseInt(e.target.value) || 1)}/>
                </div>
                <div>
                  <label className="text-micro text-gray-400">{t('quot_unit_price')}</label>
                  <input className="input text-xs py-1" type="number" step="0.01"
                    value={it.unit_price} onChange={e => updateItem(idx, 'unit_price', parseFloat(e.target.value) || 0)}/>
                </div>
                <div>
                  <label className="text-micro text-gray-400">{t('quot_total')}</label>
                  <p className="text-xs font-bold text-gray-800 mt-1">{formatK(it.total_price)}</p>
                </div>
              </div>
            </div>
          ))}
          <div className="flex gap-2">
            <select className="select text-xs flex-1" value={addProductId} onChange={e => setAddProductId(e.target.value)}>
              <option value="">+ {t('quot_add_product')}</option>
              {products.map(p => <option key={p.id} value={p.id}>{p.name} ({formatK(p.license_fee)}/u)</option>)}
            </select>
            {addProductId && (
              <button onClick={addProduct} className="btn-primary text-xs px-3">
                <Plus size={11}/> {t('quot_add')}
              </button>
            )}
          </div>
          {items.length > 0 && (
            <div className="flex items-center justify-end pt-1 border-t border-gray-100">
              <p className="text-sm font-bold text-gray-900">{t('quot_grand_total')}: {formatK(total)}</p>
            </div>
          )}
        </div>

        {/* Validity */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">{t('quot_validity')}</label>
            <select className="select" value={form.validity_days} onChange={e => set('validity_days', e.target.value)}>
              <option value="15">15 days</option>
              <option value="30">30 days</option>
              <option value="60">60 days</option>
              <option value="90">90 days</option>
            </select>
          </div>
        </div>

        <div>
          <label className="label">{t('quot_notes')}</label>
          <textarea className="input min-h-[60px] resize-none" value={form.notes} onChange={e => set('notes', e.target.value)}
            placeholder={t('quot_notes_ph')}/>
        </div>
      </div>
    </Modal>
  )
}

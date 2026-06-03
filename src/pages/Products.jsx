import { useState, useMemo, useEffect, useCallback } from 'react'
import { useProducts, createProduct, updateProduct, deleteProduct } from '../hooks/useProducts'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useTranslation } from '../hooks/useTranslation'
import { Modal, Spinner, EmptyState, formatK, CollapsibleSection } from '../components/ui'
import SearchableSelect from '../components/SearchableSelect'
import { Plus, Search, Pencil, Trash2, Package, ChevronDown, ChevronUp, X, Layers } from 'lucide-react'

const PRICING_MODELS = [
  { id: 'license_plus_annual', labelKey: 'products_pm_license_annual' },
  { id: 'subscription',        labelKey: 'products_pm_subscription' },
  { id: 'pay_per_study',       labelKey: 'products_pm_pay_per_study' },
  { id: 'saas',                labelKey: 'products_pm_saas' },
]

const LICENSE_TYPES = [
  { id: 'per_equipment', labelKey: 'products_lt_per_equipment' },
  { id: 'per_volume',    labelKey: 'products_lt_per_volume' },
  { id: 'per_package',   labelKey: 'products_lt_package' },
  { id: 'per_ccu',       labelKey: 'products_lt_per_ccu' },
  { id: 'flat',          labelKey: 'products_lt_flat' },
]

function ComponentsEditor({ productId, allProducts, t }) {
  const [components, setComponents] = useState([])
  const [loading, setLoading] = useState(true)
  const [addingId, setAddingId] = useState('')

  const fetchComponents = useCallback(async () => {
    if (!productId) { setLoading(false); return }
    const { data } = await supabase
      .from('product_components')
      .select('*, component:component_id(id, name, sku, license_fee, annual_fee)')
      .eq('product_id', productId)
      .order('created_at')
    setComponents(data || [])
    setLoading(false)
  }, [productId])

  useEffect(() => { fetchComponents() }, [fetchComponents])

  const available = useMemo(() =>
    allProducts.filter(p => p.id !== productId && !components.some(c => c.component_id === p.id)),
    [allProducts, productId, components]
  )

  async function addComponent() {
    if (!addingId) return
    await supabase.from('product_components').insert({ product_id: productId, component_id: addingId })
    setAddingId('')
    fetchComponents()
  }

  async function removeComponent(id) {
    await supabase.from('product_components').delete().eq('id', id)
    fetchComponents()
  }

  async function toggleIncluded(comp) {
    await supabase.from('product_components').update({ included: !comp.included }).eq('id', comp.id)
    fetchComponents()
  }

  if (loading) return <Spinner />

  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-gray-500 uppercase flex items-center gap-1">
        <Layers size={12}/> {t('products_components') || 'Components'}
        <span className="text-gray-400 font-normal">({components.length})</span>
      </p>

      {components.length > 0 && (
        <div className="space-y-1">
          {components.map(c => (
            <div key={c.id} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-1.5">
              <button onClick={() => toggleIncluded(c)}
                className={`w-4 h-4 rounded border flex items-center justify-center text-micro shrink-0 ${
                  c.included ? 'bg-green-500 border-green-500 text-white' : 'border-gray-300 text-gray-300'
                }`}>
                {c.included ? '✓' : ''}
              </button>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium text-gray-800 truncate">{c.component?.name}</p>
                {c.component?.sku && <p className="text-micro text-gray-400 font-mono">{c.component.sku}</p>}
              </div>
              {c.component?.annual_fee > 0 && (
                <span className="text-micro text-blue-500 shrink-0">{formatK(c.component.annual_fee)}/yr</span>
              )}
              <button onClick={() => removeComponent(c.id)} className="text-gray-300 hover:text-red-500 shrink-0 min-h-tap p-1">
                <X size={12}/>
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <select className="select text-xs flex-1" value={addingId} onChange={e => setAddingId(e.target.value)}>
          <option value="">{t('products_add_comp') || '+ Add component…'}</option>
          {available.map(p => (
            <option key={p.id} value={p.id}>{p.name} {p.sku ? `(${p.sku})` : ''}</option>
          ))}
        </select>
        {addingId && (
          <button onClick={addComponent} className="btn-primary text-xs px-3">
            {t('products_add') || 'Add'}
          </button>
        )}
      </div>
    </div>
  )
}

/* --- Safe array parser: DB may return string, JSON string, or array --- */
function ensureArray(val, fallback = []) {
  if (Array.isArray(val)) return val
  if (typeof val === 'string') {
    try { const parsed = JSON.parse(val); if (Array.isArray(parsed)) return parsed } catch { /* ignore */ }
    if (val.includes(',')) return val.split(',').map(s => s.trim()).filter(Boolean)
    if (val) return [val]
  }
  return fallback
}

/* --- Section divider with icon + title --- */
function SectionHeader({ icon, title, subtitle }) {
  return (
    <div className="flex items-center gap-2 pt-1 pb-0.5">
      <span className="text-gray-400">{icon}</span>
      <div>
        <p className="text-xs font-bold text-gray-700 uppercase tracking-wide">{title}</p>
        {subtitle && <p className="text-micro text-gray-400 leading-tight">{subtitle}</p>}
      </div>
    </div>
  )
}

/* --- Touch-friendly toggle chip (44px min target) --- */
function ToggleChip({ checked, label, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`
        inline-flex items-center gap-2 min-h-[44px] px-3.5 py-2 rounded-xl border-2 text-sm font-medium
        transition-all select-none cursor-pointer
        ${checked
          ? 'border-navy bg-navy/5 text-navy shadow-sm'
          : 'border-gray-200 bg-white text-gray-500 hover:border-gray-300 hover:bg-gray-50'}
      `}>
      <span className={`
        w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-colors text-xs
        ${checked ? 'bg-navy border-navy text-white' : 'border-gray-300 bg-white text-transparent'}
      `}>
        {checked ? '✓' : ''}
      </span>
      {label}
    </button>
  )
}

/* --- Badge summary row for selected options --- */
function SelectedBadges({ items, allOptions }) {
  const { t } = useTranslation()
  if (!items || items.length === 0) return (
    <p className="text-tiny text-gray-400 italic mt-1">{t('products_none_selected')}</p>
  )
  return (
    <div className="flex flex-wrap gap-1 mt-1.5">
      {items.map(id => {
        const opt = allOptions.find(o => o.id === id)
        return (
          <span key={id} className="inline-flex items-center text-tiny font-medium bg-navy/10 text-navy px-2 py-0.5 rounded-full">
            {opt?.labelKey ? t(opt.labelKey) : (opt?.label || id)}
          </span>
        )
      })}
    </div>
  )
}

/* --- Toggle switch for boolean flags --- */
function ToggleSwitch({ checked, onChange, label, activeColor = 'green' }) {
  const colors = {
    green: { track: 'bg-green-500', border: 'border-green-300 bg-green-50' },
    blue:  { track: 'bg-blue-500',  border: 'border-blue-300 bg-blue-50'  },
  }
  const c = colors[activeColor] || colors.green
  return (
    <label className={`flex items-center gap-3 min-h-[44px] px-3 py-2 rounded-xl border-2 cursor-pointer select-none transition-all ${
      checked ? c.border : 'border-gray-200 bg-white'
    }`}>
      <span className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${
        checked ? c.track : 'bg-gray-300'
      }`}>
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform shadow-sm ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}/>
      </span>
      <input type="checkbox" className="sr-only" checked={checked} onChange={e => onChange(e.target.checked)}/>
      <span className="text-sm font-medium text-gray-700">{label}</span>
    </label>
  )
}

function ProductFormModal({ product, onClose, onSaved, t, allProducts }) {
  const isEdit = !!product?.id
  const [form, setForm] = useState({
    category:       product?.category       || '',
    sku:            product?.sku            || '',
    name:           product?.name           || '',
    description:    product?.description    || '',
    license_fee:    product?.license_fee    || 0,
    annual_fee:     product?.annual_fee     || 0,
    brand:          product?.brand          || 'Fujifilm',
    allowed_pricing_models: ensureArray(
      product?.allowed_pricing_models || product?.pricing_model,
      ['license_plus_annual']
    ),
    bu:             product?.bu             || 'VGT',
    active:         product?.active !== false,
    distributor_visible: product?.distributor_visible !== false,
    allowed_license_types: ensureArray(product?.allowed_license_types, ['flat']),
    sort_order:     product?.sort_order     || 0,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState(null)
  const [tab, setTab]       = useState('details')

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  function toggleArrayItem(field, id) {
    const cur = form[field] || []
    set(field, cur.includes(id) ? cur.filter(x => x !== id) : [...cur, id])
  }

  async function handleSave() {
    if (!form.name.trim() || !form.category.trim()) {
      setError(t('products_name') + ' & ' + t('products_cat') + ' required')
      return
    }
    setSaving(true); setError(null)
    const payload = {
      ...form,
      license_fee: parseFloat(form.license_fee) || 0,
      annual_fee:  parseFloat(form.annual_fee)  || 0,
      brand:       (form.brand || 'Fujifilm').trim(),
      sort_order:  parseInt(form.sort_order)    || 0,
      // backward compat: write single pricing_model from first selection
      pricing_model: (form.allowed_pricing_models && form.allowed_pricing_models.length > 0)
        ? form.allowed_pricing_models[0]
        : 'license_plus_annual',
    }
    const result = isEdit
      ? await updateProduct(product.id, payload)
      : await createProduct(payload)
    setSaving(false)
    if (result.error) { setError(result.error.message); return }
    onSaved()
  }

  const tabs = isEdit
    ? [
        { id: 'details',    label: t('products_details'),    icon: <Pencil size={13}/> },
        { id: 'components', label: t('products_components'), icon: <Layers size={13}/> },
      ]
    : [{ id: 'details', label: t('products_details'), icon: <Pencil size={13}/> }]

  return (
    <Modal open title={isEdit ? t('products_edit') : t('products_new')} onClose={onClose}
      footer={
        <div className="flex gap-2">
          <button onClick={onClose} className="btn-secondary flex-1">{t('cancel')}</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary flex-1">
            {saving ? t('saving') : t('save')}
          </button>
        </div>
      }>
      <div className="space-y-4">
        {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

        {/* ---- Prominent pill-style tab bar ---- */}
        {isEdit && tabs.length > 1 && (
          <div className="flex gap-1 bg-gray-100 rounded-xl p-1">
            {tabs.map(tb => (
              <button key={tb.id} onClick={() => setTab(tb.id)}
                className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-semibold rounded-lg transition-all ${
                  tab === tb.id
                    ? 'bg-white text-navy shadow-sm'
                    : 'text-gray-400 hover:text-gray-600'
                }`}>
                {tb.icon}
                {tb.label}
              </button>
            ))}
          </div>
        )}

        {/* ==================== DETAILS TAB ==================== */}
        {tab === 'details' && (
          <div className="space-y-5">

            {/* ---- SECTION 1: Identity ---- */}
            <div className="space-y-3">
              <SectionHeader icon={<Package size={14}/>} title={t('products_identity')} subtitle={t('products_identity_sub')}/>
              <div className="bg-gray-50/70 rounded-xl p-3 space-y-3 border border-gray-100">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">{t('products_cat')} *</label>
                    <SearchableSelect
                      value={form.category}
                      onChange={v => set('category', v)}
                      options={[...new Set((allProducts || []).map(p => p.category).filter(Boolean))].sort().map(c => ({ value: c, label: c }))}
                      placeholder={t('products_search_cat')}
                      emptyLabel={t('products_select')}
                      onCreateNew={(q) => { if (q) set('category', q) }}
                      createLabel={t('products_new_cat')}
                    />
                  </div>
                  <div>
                    <label className="label">{t('products_sku')}</label>
                    <input className="input font-mono" value={form.sku} onChange={e => set('sku', e.target.value)} placeholder="e.g. S3D-BASE-1CCU"/>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">{t('products_name')} *</label>
                    <input className="input" value={form.name} onChange={e => set('name', e.target.value)}/>
                  </div>
                  <div>
                    <label className="label">Brand / Vendor</label>
                    <input className="input" list="brand-options" value={form.brand}
                      onChange={e => set('brand', e.target.value)} placeholder="Fujifilm"/>
                    <datalist id="brand-options">
                      <option value="Fujifilm"/>
                      <option value="Medsky"/>
                    </datalist>
                    <p className="text-micro text-gray-400 mt-0.5">Routes discount approvals to the brand's approver</p>
                  </div>
                </div>
                <div>
                  <label className="label">{t('products_desc')}</label>
                  <textarea className="input min-h-[60px] resize-y" rows={2} value={form.description} onChange={e => set('description', e.target.value)}/>
                </div>
              </div>
            </div>

            {/* ---- SECTION 2: Pricing ---- */}
            <div className="space-y-3">
              <SectionHeader icon={<span className="text-sm font-bold">&#8364;</span>} title={t('products_pricing')} subtitle={t('products_pricing_sub')}/>
              <div className="bg-gray-50/70 rounded-xl p-3 border border-gray-100">
                {(() => {
                  const models = form.allowed_pricing_models || []
                  const isSubscription = models.some(m => ['pay_per_study','subscription'].includes(m))
                  const isCapex = models.some(m => m === 'license_plus_annual')
                  return (
                    <div className={`grid ${isSubscription && !isCapex ? 'grid-cols-1' : 'grid-cols-2'} gap-3`}>
                      <div>
                        <label className="label">
                          {isSubscription ? 'Price per Unit / Study (€)' : `${t('products_license')} (€)`}
                        </label>
                        <input className="input" type="number" min="0" step="0.01" value={form.license_fee} onChange={e => set('license_fee', e.target.value)}/>
                        {models.includes('pay_per_study') && (
                          <p className="text-micro text-purple-500 mt-0.5">e.g. 0.53 = €0.53 per study</p>
                        )}
                      </div>
                      {/* Annual fee only applies to CAPEX (recurring maintenance on equipment) */}
                      {isCapex && (
                        <div>
                          <label className="label">{t('products_annual')} (€)</label>
                          <input className="input" type="number" min="0" step="0.01" value={form.annual_fee} onChange={e => set('annual_fee', e.target.value)}/>
                          <p className="text-micro text-gray-400 mt-0.5">Recurring maintenance (CAPEX only)</p>
                        </div>
                      )}
                    </div>
                  )
                })()}
              </div>
            </div>

            {/* ---- Models & license types — collapsed by default ---- */}
            <CollapsibleSection title={`${t('products_model')} · ${t('products_license_types')}`} subtitle={t('df_optional')}>
              <div className="space-y-2">
                <p className="text-micro font-semibold text-gray-500 uppercase">{t('products_model')}</p>
                <div className="flex flex-wrap gap-2">
                  {PRICING_MODELS.map(m => (
                    <ToggleChip
                      key={m.id}
                      label={t(m.labelKey)}
                      checked={(form.allowed_pricing_models || []).includes(m.id)}
                      onChange={() => toggleArrayItem('allowed_pricing_models', m.id)}
                    />
                  ))}
                </div>
                <SelectedBadges items={form.allowed_pricing_models} allOptions={PRICING_MODELS}/>
              </div>
              <div className="space-y-2 pt-2 border-t border-gray-100">
                <p className="text-micro font-semibold text-gray-500 uppercase">{t('products_license_types')}</p>
                <div className="flex flex-wrap gap-2">
                  {LICENSE_TYPES.map(lt => (
                    <ToggleChip
                      key={lt.id}
                      label={t(lt.labelKey)}
                      checked={(form.allowed_license_types || []).includes(lt.id)}
                      onChange={() => toggleArrayItem('allowed_license_types', lt.id)}
                    />
                  ))}
                </div>
                <SelectedBadges items={form.allowed_license_types} allOptions={LICENSE_TYPES}/>
              </div>
            </CollapsibleSection>

            {/* ---- Configuration — collapsed by default (set-once) ---- */}
            <CollapsibleSection title={t('products_config')} subtitle={t('df_optional')}>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">{t('products_bu')}</label>
                  <select className="select" value={form.bu} onChange={e => set('bu', e.target.value)}>
                    <option value="VGT">VGT</option>
                    <option value="ECT">ECT</option>
                  </select>
                </div>
                <div>
                  <label className="label">{t('products_sort_order')}</label>
                  <input className="input" type="number" min="0" value={form.sort_order} onChange={e => set('sort_order', e.target.value)}/>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <ToggleSwitch
                  checked={form.active}
                  onChange={v => set('active', v)}
                  label={t('products_active')}
                  activeColor="green"
                />
                <ToggleSwitch
                  checked={form.distributor_visible}
                  onChange={v => set('distributor_visible', v)}
                  label={t('products_dist_vis')}
                  activeColor="blue"
                />
              </div>
            </CollapsibleSection>

          </div>
        )}

        {/* ==================== COMPONENTS TAB ==================== */}
        {tab === 'components' && isEdit && (
          <ComponentsEditor productId={product.id} allProducts={allProducts} t={t}/>
        )}
      </div>
    </Modal>
  )
}

export default function Products() {
  const { isAdmin } = useAuth()
  const { t } = useTranslation()
  const [search, setSearch]       = useState('')
  const [catFilter, setCatFilter] = useState('')
  const [formOpen, setFormOpen]   = useState(false)
  const [editProd, setEditProd]   = useState(null)
  const [confirmDel, setConfirmDel] = useState(null)
  const [expandedCats, setExpandedCats] = useState({})
  const [compCounts, setCompCounts] = useState({})

  const { products, loading, refetch } = useProducts({ search: search || undefined })

  useEffect(() => {
    supabase.from('product_components').select('product_id').then(({ data }) => {
      if (!data) return
      const counts = {}
      for (const r of data) { counts[r.product_id] = (counts[r.product_id] || 0) + 1 }
      setCompCounts(counts)
    }).catch(() => {})
  }, [products])

  const categories = useMemo(() => {
    return [...new Set(products.map(p => p.category))].sort()
  }, [products])

  const grouped = useMemo(() => {
    const filtered = catFilter ? products.filter(p => p.category === catFilter) : products
    const groups = {}
    for (const p of filtered) {
      if (!groups[p.category]) groups[p.category] = []
      groups[p.category].push(p)
    }
    return groups
  }, [products, catFilter])

  const totals = useMemo(() => ({
    count: products.length,
    categories: categories.length,
  }), [products, categories])

  function toggleCat(cat) {
    // Categories are expanded by default (undefined = open); store explicit false to collapse
    setExpandedCats(prev => ({ ...prev, [cat]: prev[cat] === false }))
  }

  async function handleDelete() {
    if (!confirmDel) return
    await deleteProduct(confirmDel.id)
    setConfirmDel(null)
    refetch()
  }

  if (loading) return <Spinner/>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-lg font-bold text-gray-900">{t('products_title')}</h1>
          <p className="text-xs text-gray-400">{totals.count} {t('products_name')} · {totals.categories} {t('products_cat')}</p>
        </div>
        {isAdmin && (
          <button onClick={() => { setEditProd(null); setFormOpen(true) }} className="btn-primary flex items-center gap-1">
            <Plus size={14}/> {t('products_new')}
          </button>
        )}
      </div>

      <div className="flex gap-1 mb-1">
        <button onClick={() => { const all = {}; Object.keys(grouped).forEach(c => { all[c] = true }); setExpandedCats(all) }}
          className="text-micro text-gray-500 hover:text-gray-700 px-2 py-1 rounded border border-gray-200">
          {t('products_expand_all')}
        </button>
        <button onClick={() => setExpandedCats({})}
          className="text-micro text-gray-500 hover:text-gray-700 px-2 py-1 rounded border border-gray-200">
          {t('products_collapse_all')}
        </button>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-0">
          <input className="input pl-8 text-sm" placeholder={t('products_search')}
            value={search} onChange={e => setSearch(e.target.value)} style={{ fontSize: '16px' }}/>
          <Search size={14} className="absolute left-2.5 top-3 text-gray-400"/>
        </div>
        <select className="select text-sm w-auto" value={catFilter} onChange={e => setCatFilter(e.target.value)}>
          <option value="">{t('products_all_cat')}</option>
          {categories.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div className="space-y-3">
        {Object.entries(grouped).map(([cat, prods]) => (
          <div key={cat} className="card overflow-hidden">
            <button onClick={() => toggleCat(cat)}
              className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors">
              <div className="flex items-center gap-2">
                <Package size={14} className="text-gray-500"/>
                <span className="font-semibold text-sm text-gray-800">{cat}</span>
                <span className="text-micro text-gray-400 bg-gray-200 px-1.5 py-0.5 rounded">{prods.length}</span>
              </div>
              {expandedCats[cat] !== false ? <ChevronUp size={14} className="text-gray-400"/> : <ChevronDown size={14} className="text-gray-400"/>}
            </button>

            {expandedCats[cat] !== false && (
              <div className="divide-y divide-gray-50">
                {prods.map(p => (
                  <div key={p.id} className="px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50/50">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-gray-900 truncate">{p.name}</p>
                        {!p.active && <span className="text-micro bg-red-100 text-red-600 px-1 rounded">{t('products_inactive')}</span>}
                        {compCounts[p.id] > 0 && (
                          <span className="text-micro bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded flex items-center gap-0.5">
                            <Layers size={8}/> {compCounts[p.id]}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-micro text-gray-400">
                        {p.sku && <span className="font-mono">{p.sku}</span>}
                        {p.description && <span>· {p.description}</span>}
                      </div>
                    </div>

                    <div className="text-right shrink-0 space-y-0.5">
                      {p.license_fee > 0 && (
                        <p className="text-xs font-semibold text-gray-700">
                          <span className="text-micro text-gray-400 mr-1">{t('products_license')}</span>
                          {formatK(p.license_fee)}
                        </p>
                      )}
                      {p.annual_fee > 0 && (
                        <p className="text-xs text-blue-600">
                          <span className="text-micro text-gray-400 mr-1">{t('products_annual')}</span>
                          {formatK(p.annual_fee)}
                        </p>
                      )}
                    </div>

                    {isAdmin && (
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button onClick={() => { setEditProd(p); setFormOpen(true) }}
                          className="text-gray-400 hover:text-navy p-1.5 min-h-tap">
                          <Pencil size={13}/>
                        </button>
                        <button onClick={() => setConfirmDel(p)}
                          className="text-gray-400 hover:text-red-500 p-1.5 min-h-tap">
                          <Trash2 size={13}/>
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}

        {Object.keys(grouped).length === 0 && (
          <EmptyState icon="📦" title={t('products_none')} description={t('products_search')}/>
        )}
      </div>

      {formOpen && (
        <ProductFormModal product={editProd} t={t} allProducts={products}
          onClose={() => { setFormOpen(false); setEditProd(null) }}
          onSaved={() => { setFormOpen(false); setEditProd(null); refetch() }}/>
      )}

      {confirmDel && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setConfirmDel(null)}/>
          <div className="relative bg-white rounded-t-3xl sm:rounded-2xl p-5 w-full sm:max-w-sm space-y-3">
            <p className="font-semibold text-gray-900">{t('products_delete')}</p>
            <p className="text-sm text-gray-600">{confirmDel.name}</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmDel(null)} className="btn-secondary flex-1">{t('cancel')}</button>
              <button onClick={handleDelete} className="bg-red-600 text-white rounded-lg px-4 py-2 text-sm font-semibold flex-1">{t('delete')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

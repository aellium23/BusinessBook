import { useState, useMemo } from 'react'
import { useProducts, createProduct, updateProduct, deleteProduct } from '../hooks/useProducts'
import { useAuth } from '../hooks/useAuth'
import { useTranslation } from '../hooks/useTranslation'
import { Modal, Spinner, EmptyState, BUBadge, formatK } from '../components/ui'
import { Plus, Search, Pencil, Trash2, Package, DollarSign, ChevronDown, ChevronUp } from 'lucide-react'

const PRICING_MODELS = [
  { id: 'license_plus_annual', label: 'License + Annual Fee' },
  { id: 'subscription',        label: 'Subscription' },
  { id: 'pay_per_study',       label: 'Pay per Study' },
  { id: 'saas',                label: 'SaaS' },
]

function ProductFormModal({ product, onClose, onSaved, t }) {
  const isEdit = !!product?.id
  const [form, setForm] = useState({
    category:       product?.category       || '',
    sku:            product?.sku            || '',
    name:           product?.name           || '',
    description:    product?.description    || '',
    license_fee:    product?.license_fee    || 0,
    annual_fee:     product?.annual_fee     || 0,
    pricing_model:  product?.pricing_model  || 'license_plus_annual',
    bu:             product?.bu             || 'VGT',
    active:         product?.active !== false,
    distributor_visible: product?.distributor_visible !== false,
    sort_order:     product?.sort_order     || 0,
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState(null)

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function handleSave() {
    if (!form.name.trim() || !form.category.trim()) {
      setError('Name and Category are required')
      return
    }
    setSaving(true); setError(null)
    const payload = {
      ...form,
      license_fee: parseFloat(form.license_fee) || 0,
      annual_fee:  parseFloat(form.annual_fee)  || 0,
      sort_order:  parseInt(form.sort_order)    || 0,
    }
    const result = isEdit
      ? await updateProduct(product.id, payload)
      : await createProduct(payload)
    setSaving(false)
    if (result.error) { setError(result.error.message); return }
    onSaved()
  }

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
      <div className="space-y-3">
        {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">{t('products_cat')} *</label>
            <input className="input" value={form.category} onChange={e => set('category', e.target.value)} placeholder="e.g. Synapse 3D"/>
          </div>
          <div>
            <label className="label">{t('products_sku')}</label>
            <input className="input" value={form.sku} onChange={e => set('sku', e.target.value)} placeholder="e.g. S3D-BASE-1CCU"/>
          </div>
        </div>

        <div>
          <label className="label">{t('products_name')} *</label>
          <input className="input" value={form.name} onChange={e => set('name', e.target.value)}/>
        </div>

        <div>
          <label className="label">{t('products_desc')}</label>
          <input className="input" value={form.description} onChange={e => set('description', e.target.value)}/>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="label">{t('products_license')} €</label>
            <input className="input" type="number" value={form.license_fee} onChange={e => set('license_fee', e.target.value)}/>
          </div>
          <div>
            <label className="label">{t('products_annual')} €</label>
            <input className="input" type="number" value={form.annual_fee} onChange={e => set('annual_fee', e.target.value)}/>
          </div>
          <div>
            <label className="label">{t('products_model')}</label>
            <select className="select" value={form.pricing_model} onChange={e => set('pricing_model', e.target.value)}>
              {PRICING_MODELS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="label">BU</label>
            <select className="select" value={form.bu} onChange={e => set('bu', e.target.value)}>
              <option value="VGT">VGT</option>
              <option value="ECT">ECT</option>
            </select>
          </div>
          <div className="flex items-end gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.active} onChange={e => set('active', e.target.checked)} className="rounded"/>
              {t('products_active')}
            </label>
          </div>
          <div className="flex items-end gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.distributor_visible} onChange={e => set('distributor_visible', e.target.checked)} className="rounded"/>
              {t('products_dist_vis')}
            </label>
          </div>
        </div>
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

  const { products, loading, refetch } = useProducts({ search: search || undefined })

  const categories = useMemo(() => {
    const cats = [...new Set(products.map(p => p.category))].sort()
    return cats
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
    setExpandedCats(prev => ({ ...prev, [cat]: !prev[cat] }))
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
          <h1 className="text-lg font-bold text-gray-900">{t('products_title') || 'Product Catalog'}</h1>
          <p className="text-xs text-gray-400">{totals.count} products · {totals.categories} categories</p>
        </div>
        {isAdmin && (
          <button onClick={() => { setEditProd(null); setFormOpen(true) }} className="btn-primary flex items-center gap-1">
            <Plus size={14}/> {t('products_new')}
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[180px]">
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
                <span className="text-[10px] text-gray-400 bg-gray-200 px-1.5 py-0.5 rounded">{prods.length}</span>
              </div>
              {expandedCats[cat] === false ? <ChevronDown size={14} className="text-gray-400"/> : <ChevronUp size={14} className="text-gray-400"/>}
            </button>

            {expandedCats[cat] !== false && (
              <div className="divide-y divide-gray-50">
                {prods.map(p => (
                  <div key={p.id} className="px-4 py-2.5 flex items-center gap-3 hover:bg-gray-50/50">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-medium text-gray-900 truncate">{p.name}</p>
                        {!p.active && <span className="text-[9px] bg-red-100 text-red-600 px-1 rounded">inactive</span>}
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-gray-400">
                        {p.sku && <span className="font-mono">{p.sku}</span>}
                        {p.description && <span>· {p.description}</span>}
                      </div>
                    </div>

                    <div className="text-right shrink-0 space-y-0.5">
                      {p.license_fee > 0 && (
                        <p className="text-xs font-semibold text-gray-700">
                          <span className="text-[9px] text-gray-400 mr-1">{t('products_license')}</span>
                          {formatK(p.license_fee)}
                        </p>
                      )}
                      {p.annual_fee > 0 && (
                        <p className="text-xs text-blue-600">
                          <span className="text-[9px] text-gray-400 mr-1">{t('products_annual')}</span>
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
        <ProductFormModal product={editProd} t={t}
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
              <button onClick={() => setConfirmDel(null)} className="btn-secondary flex-1">Cancel</button>
              <button onClick={handleDelete} className="bg-red-600 text-white rounded-lg px-4 py-2 text-sm font-semibold flex-1">Delete</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

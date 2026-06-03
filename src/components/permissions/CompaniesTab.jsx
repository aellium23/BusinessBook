import { useState, useMemo, useEffect } from 'react'
import { supabase } from '../../lib/supabase'
import { useTranslation } from '../../hooks/useTranslation'
import { Modal } from '../ui'
import {
  Building2, Plus, Edit3, Trash2, X, Target, Check
} from 'lucide-react'

const COMPANY_TYPES = {
  internal_vgt: { label:'VGT (Portugal)', icon:'🇵🇹' },
  internal_ect: { label:'ECT (Spain)',    icon:'🇪🇸' },
  distributor:  { label:'Distributor',    icon:'🤝' },
  partner:      { label:'Partner',        icon:'🏢' },
  client:       { label:'Client',         icon:'🏥' },
}

// ── Empresas ──────────────────────────────────────────────────────────────────
function CompaniesSection({ companies, onRefresh }) {
  const { t } = useTranslation()
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ name:'', type:'distributor', country:'', default_currency:'EUR' })
  const [saving, setSaving] = useState(false)
  const [editingAuth, setEditingAuth] = useState(null)
  const [authProducts, setAuthProducts] = useState([])
  const [catalogProducts, setCatalogProducts] = useState([])
  const [addProd, setAddProd] = useState('')
  const [addCountry, setAddCountry] = useState('')

  useEffect(() => {
    supabase.from('products').select('id, name, sku, category').eq('active', true).order('name')
      .then(({ data }) => { if (data) setCatalogProducts(data) }).catch(() => {})
  }, [])

  async function loadAuth(co) {
    setEditingAuth(co)
    const { data } = await supabase.from('company_product_authorizations')
      .select('*, product:product_id(id, name, sku)')
      .eq('company_id', co.id).order('created_at')
    setAuthProducts(data || [])
  }

  async function addAuth() {
    if (!addProd || !addCountry || !editingAuth) return
    await supabase.from('company_product_authorizations').insert({
      company_id: editingAuth.id, product_id: addProd, country: addCountry
    })
    setAddProd(''); setAddCountry('')
    loadAuth(editingAuth)
  }

  async function removeAuth(id) {
    await supabase.from('company_product_authorizations').delete().eq('id', id)
    if (editingAuth) loadAuth(editingAuth)
  }

  async function toggleAuth(id, active) {
    await supabase.from('company_product_authorizations').update({ active: !active }).eq('id', id)
    if (editingAuth) loadAuth(editingAuth)
  }

  async function handleAdd() {
    if (!form.name.trim()) return
    setSaving(true)
    await supabase.from('companies').insert({
      name: form.name.trim(), type: form.type,
      bu: form.type === 'internal_vgt' ? 'VGT' : form.type === 'internal_ect' ? 'ECT' : null,
      country: form.country || null, active: true,
      default_currency: form.default_currency || 'EUR',
    })
    setForm({ name:'', type:'distributor', country:'', default_currency:'EUR' })
    setAdding(false); setSaving(false); onRefresh()
  }

  const grouped = useMemo(() => {
    const g = {}
    companies.forEach(co => { if (!g[co.type]) g[co.type] = []; g[co.type].push(co) })
    return g
  }, [companies])

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-gray-700 flex items-center gap-2">
          <Building2 size={15} className="text-navy"/>{t('perm_companies')}
        </h2>
        <button onClick={() => setAdding(o => !o)} className="btn-primary text-xs gap-1">
          <Plus size={12}/> {t('perm_new_company') || 'New company'}
        </button>
      </div>

      {adding && (
        <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="label">{t('perm_name')}</label>
              <input className="input" value={form.name}
                onChange={e => setForm(f => ({...f, name: e.target.value}))}
                placeholder={t('perm_company_ph')} style={{fontSize:'16px'}}/>
            </div>
            <div>
              <label className="label">{t('perm_type')}</label>
              <select className="select" value={form.type}
                onChange={e => setForm(f => ({...f, type: e.target.value}))}>
                {Object.entries(COMPANY_TYPES).map(([k,v]) => (
                  <option key={k} value={k}>{v.icon} {v.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">{t('perm_country') || 'Country'}</label>
              <input className="input" value={form.country}
                onChange={e => setForm(f => ({...f, country: e.target.value}))}
                placeholder={t('perm_country_ph')} style={{fontSize:'16px'}}/>
            </div>
            <div>
              <label className="label">{t('perm_currency') || 'Default Currency'}</label>
              <select className="select" value={form.default_currency}
                onChange={e => setForm(f => ({...f, default_currency: e.target.value}))}>
                <option value="EUR">EUR</option>
                <option value="USD">USD</option>
                <option value="GBP">GBP</option>
              </select>
            </div>
          </div>
          <div className="flex gap-2">
            <button onClick={() => setAdding(false)} className="btn-secondary flex-1 text-xs">{t('cancel') || 'Cancel'}</button>
            <button onClick={handleAdd} disabled={!form.name.trim() || saving}
              className="btn-primary flex-1 text-xs">
              {saving ? '…' : t('save') || 'Save'}
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {Object.entries(grouped).map(([type, list]) => {
          const cfg = COMPANY_TYPES[type] || { label: type, icon:'🏢' }
          return (
            <div key={type} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
              <div className="px-3 py-2 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
                <span>{cfg.icon}</span>
                <p className="text-xs font-bold text-gray-700">{cfg.label}</p>
                <span className="ml-auto text-xs text-gray-400">{list.filter(c=>c.active).length}</span>
              </div>
              {list.map(co => (
                <div key={co.id} className={`px-3 py-2.5 flex items-center gap-2 border-b border-gray-50 last:border-0 ${!co.active ? 'opacity-40' : ''}`}>
                  <button onClick={() => loadAuth(co)} className="flex-1 min-w-0 text-left hover:text-blue-700">
                    <p className="text-sm font-medium text-gray-800 truncate">{co.name}</p>
                    <div className="flex items-center gap-2">
                      {co.country && <span className="text-micro text-gray-400">{co.country}</span>}
                      {co.default_currency && co.default_currency !== 'EUR' && (
                        <span className="text-micro font-medium text-blue-600 bg-blue-50 px-1 rounded">{co.default_currency}</span>
                      )}
                    </div>
                  </button>
                  <select className="text-micro border border-gray-200 rounded px-1 py-0.5 bg-white text-gray-600 shrink-0"
                    value={co.default_currency || 'EUR'}
                    onClick={e => e.stopPropagation()}
                    onChange={async (e) => {
                      await supabase.from('companies').update({ default_currency: e.target.value }).eq('id', co.id)
                      onRefresh()
                    }}>
                    <option value="EUR">EUR</option>
                    <option value="USD">USD</option>
                    <option value="GBP">GBP</option>
                  </select>
                  <button onClick={async () => { await supabase.from('companies').update({active:!co.active}).eq('id',co.id); onRefresh() }}
                    className={`w-7 h-3.5 rounded-full transition-colors relative shrink-0 ${co.active ? 'bg-green-400' : 'bg-gray-200'}`}>
                    <span className={`absolute top-0.5 w-2.5 h-2.5 bg-white rounded-full shadow transition-transform ${co.active ? 'translate-x-3.5' : 'translate-x-0.5'}`}/>
                  </button>
                </div>
              ))}
            </div>
          )
        })}
      </div>

      {/* Product Authorization Modal */}
      {editingAuth && <Modal open onClose={() => setEditingAuth(null)}
        title={`${editingAuth.name} — ${t('perm_auth_products') || 'Authorized Products'}`}>
        {(() => {
          const byProduct = {}
          authProducts.forEach(ap => {
            const pid = ap.product_id
            if (!byProduct[pid]) byProduct[pid] = { name: ap.product?.name || '—', sku: ap.product?.sku, markets: [] }
            byProduct[pid].markets.push(ap)
          })
          return (
            <div className="space-y-3">
              {Object.entries(byProduct).length > 0 ? Object.entries(byProduct).map(([pid, prod]) => (
                <div key={pid} className="bg-gray-50 rounded-xl p-3 space-y-2">
                  <p className="text-xs font-semibold text-gray-800">{prod.name}
                    {prod.sku && <span className="text-micro text-gray-400 font-mono ml-1">{prod.sku}</span>}
                  </p>
                  {prod.markets.map(m => (
                    <div key={m.id} className="flex items-center gap-2 bg-white rounded-lg px-2 py-1.5">
                      <span className="text-xs text-gray-700 flex-1">{m.country}</span>
                      <span className="text-xs font-semibold text-green-700 shrink-0">
                        {m.price != null ? `€${Number(m.price)}` : 'catalog price'}
                      </span>
                      <button onClick={() => {
                        const newPrice = prompt(`Override price for ${prod.name} in ${m.country} (€).\nLeave empty to use the catalog price.`, m.price ?? '')
                        if (newPrice !== null) {
                          const trimmed = newPrice.trim()
                          const price = trimmed === '' ? null : (parseFloat(trimmed) || null)
                          supabase.from('company_product_authorizations').update({ price }).eq('id', m.id)
                            .then(() => loadAuth(editingAuth))
                        }
                      }} className="text-gray-400 hover:text-blue-600 p-1.5 min-h-tap min-w-tap">
                        <Edit3 size={12}/>
                      </button>
                      <button onClick={() => toggleAuth(m.id, m.active)}
                        className={`w-7 h-4 rounded-full relative shrink-0 ${m.active !== false ? 'bg-green-400' : 'bg-gray-200'}`}>
                        <span className={`absolute top-0.5 w-3 h-3 bg-white rounded-full shadow transition-transform ${m.active !== false ? 'translate-x-3' : 'translate-x-0.5'}`}/>
                      </button>
                      <button onClick={() => removeAuth(m.id)} className="text-gray-300 hover:text-red-500 p-1.5 min-h-tap min-w-tap">
                        <Trash2 size={12}/>
                      </button>
                    </div>
                  ))}
                </div>
              )) : (
                <p className="text-xs text-gray-400 text-center py-4">{t('perm_no_auth') || 'No products authorized yet'}</p>
              )}

              <div className="border-t pt-3 space-y-2">
                <p className="text-micro font-semibold text-gray-500 uppercase">{t('perm_add_auth') || 'Add Product Authorization'}</p>
                <select className="select text-xs" value={addProd} onChange={e => setAddProd(e.target.value)} style={{fontSize:'16px'}}>
                  <option value="">{t('perm_select_product') || 'Select product…'}</option>
                  {Object.entries(
                    catalogProducts.reduce((g, p) => { (g[p.category] = g[p.category] || []).push(p); return g }, {})
                  ).map(([cat, prods]) => (
                    <optgroup key={cat} label={cat}>
                      {prods.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                    </optgroup>
                  ))}
                </select>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <select className="select text-xs" value={addCountry} onChange={e => setAddCountry(e.target.value)} style={{fontSize:'16px'}}>
                    <option value="">{t('perm_country') || 'Country'}…</option>
                    {['Portugal','Spain','France','Germany','Italy','Netherlands','Belgium','UK','Switzerland','Sweden','Norway','Denmark','Finland','Austria','Poland','Czech Republic','Romania','Greece','Turkey',
                      'UAE','Saudi Arabia','Qatar','Kuwait','Egypt','Morocco','South Africa','Israel',
                      'Mexico','Brazil','Argentina','Chile','Colombia','Peru',
                      'Japan','China','South Korea','Australia','India','Singapore',
                      'USA','Canada'].map(c => <option key={c}>{c}</option>)}
                  </select>
                  <input className="input text-xs" id="addAuthPrice" type="number" step="0.01"
                    placeholder={`${t('perm_price') || 'Price'} € (${t('optional') || 'optional'})`} style={{ fontSize: '16px' }}/>
                </div>
                <button onClick={async () => {
                  if (!addProd || !addCountry || !editingAuth) return
                  const price = parseFloat(document.getElementById('addAuthPrice')?.value) || null
                  await supabase.from('company_product_authorizations').insert({
                    company_id: editingAuth.id, product_id: addProd, country: addCountry, price
                  })
                  setAddProd(''); setAddCountry('')
                  if (document.getElementById('addAuthPrice')) document.getElementById('addAuthPrice').value = ''
                  loadAuth(editingAuth)
                }} disabled={!addProd || !addCountry}
                  className="btn-primary text-xs w-full disabled:opacity-30">
                  <Plus size={12}/> {t('perm_authorize') || 'Authorize'}
                </button>
              </div>
            </div>
          )
        })()}
      </Modal>}
    </div>
  )
}

// ── Sales Targets ─────────────────────────────────────────────────────────────
function SalesTargetsSection({ companies, onRefresh }) {
  const { t } = useTranslation()
  const [quotas, setQuotas]   = useState([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(null)
  const [editVal, setEditVal] = useState('')
  const [saving, setSaving]   = useState(false)

  async function load() {
    const { data } = await supabase.from('quotas').select('*').not('company_id', 'is', null)
    setQuotas(data || [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const distCompanies = companies.filter(c =>
    !['internal_vgt','internal_ect'].includes(c.type) && c.active
  )

  function getTarget(companyId) {
    return quotas.find(q => q.company_id === companyId)?.target_eur || 0
  }

  async function handleSave(companyId) {
    setSaving(true)
    const val = parseFloat(editVal) || 0
    const existing = quotas.find(q => q.company_id === companyId)
    if (existing) {
      await supabase.from('quotas').update({ target_eur: val }).eq('id', existing.id)
    } else {
      const co = companies.find(c => c.id === companyId)
      await supabase.from('quotas').insert({
        company_id: companyId,
        bu: co?.bu || 'VGT',
        sales_owner: co?.name || '',
        target_eur: val,
        fiscal_year: 2026,
      })
    }
    setSaving(false); setEditing(null); setEditVal('')
    load(); onRefresh()
  }

  if (loading) return <div className="flex justify-center p-8"><div className="w-5 h-5 border-2 border-navy border-t-transparent rounded-full animate-spin"/></div>

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-sm font-bold text-gray-700 flex items-center gap-2">
          <Target size={15} className="text-navy"/>{t('perm_sales_targets') || 'Sales Targets'}
        </h2>
        <p className="text-xs text-gray-400 mt-0.5">{t('perm_targets_desc') || 'Annual targets for distributors and partners'}</p>
      </div>

      {distCompanies.length === 0 ? (
        <div className="bg-gray-50 rounded-xl p-8 text-center">
          <p className="text-gray-400 text-sm">{t('perm_no_distributors') || 'No active distributors'}</p>
        </div>
      ) : (
        <div className="space-y-2">
          {distCompanies.map(co => {
            const target = getTarget(co.id)
            const isEditing = editing === co.id
            const cfg = COMPANY_TYPES[co.type] || { icon:'🏢' }
            return (
              <div key={co.id} className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-gray-50 flex items-center justify-center text-lg shrink-0">
                    {cfg.icon}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{co.name}</p>
                    <p className="text-xs text-gray-400">{co.bu || co.country || '—'}</p>
                  </div>
                  {isEditing ? (
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="relative">
                        <input className="input w-32 text-right pr-7 text-sm" type="number"
                          value={editVal} onChange={e => setEditVal(e.target.value)}
                          placeholder="0" style={{fontSize:'16px'}}/>
                        <span className="absolute right-2 top-2.5 text-xs text-gray-400">€</span>
                      </div>
                      <button onClick={() => handleSave(co.id)} disabled={saving}
                        className="btn-primary text-xs px-3 py-1.5">
                        {saving ? '…' : <Check size={12}/>}
                      </button>
                      <button onClick={() => setEditing(null)} className="btn-secondary text-xs px-2 py-1.5">
                        <X size={12}/>
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 shrink-0">
                      <div className="text-right">
                        <p className="text-sm font-bold text-gray-900">
                          {target > 0 ? `${target >= 1000 ? Math.round(target/1000)+'K€' : target+'€'}` : '—'}
                        </p>
                        <p className="text-micro text-gray-400">{t('perm_target_fy26')}</p>
                      </div>
                      <button onClick={() => { setEditing(co.id); setEditVal(target > 0 ? String(target) : '') }}
                        className="text-gray-300 hover:text-navy p-1 transition-colors">
                        <Edit3 size={14}/>
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ── Main export ──────────────────────────────────────────────────────────────
export default function CompaniesTab({ companies, onRefresh }) {
  return (
    <div className="space-y-6">
      <CompaniesSection companies={companies} onRefresh={onRefresh}/>
      <SalesTargetsSection companies={companies} onRefresh={onRefresh}/>
    </div>
  )
}

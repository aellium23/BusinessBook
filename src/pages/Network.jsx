import { useEffect, useMemo, useState } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useTranslation } from '../hooks/useTranslation'
import { Spinner, EmptyState } from '../components/ui'
import SearchableSelect from '../components/SearchableSelect'
import { REGIONS } from '../constants'

const COUNTRY_MAP = {
  Europe: ['Portugal','Spain','France','Germany','Italy','Netherlands','Belgium','UK','Switzerland','Sweden','Norway','Denmark','Finland','Austria','Poland','Czech Republic','Romania','Greece','Turkey','Other Europe'],
  MEA:    ['UAE','Saudi Arabia','Qatar','Kuwait','Bahrain','Oman','Egypt','Morocco','Algeria','Tunisia','South Africa','Israel','Jordan','Iraq','Nigeria','Kenya','Ghana','Other MEA'],
  LATAM:  ['Mexico','Brazil','Argentina','Chile','Colombia','Peru','Costa Rica','Panama','El Salvador','Guatemala','Ecuador','Bolivia','Venezuela','Dominican Republic','Other LATAM'],
  APAC:   ['Japan','China','South Korea','Australia','India','Singapore','Malaysia','Thailand','Indonesia','Vietnam','New Zealand','Other APAC'],
  NA:     ['USA','Canada','Other NA'],
}
import {
  Globe, Plus, Edit3, Trash2, X, Save, AlertCircle, Search,
  MapPin, Building, Network as NetIcon,
} from 'lucide-react'

const TAB_KEYS = [
  { id: 'distributors', labelKey: 'network_tab_distributors', icon: Building },
  { id: 'hubs',         labelKey: 'network_tab_hubs',         icon: Globe },
]

// ── Distributor editor ─────────────────────────────────────────────────────
function DistributorEditor({ item, hubs, onClose, onSaved }) {
  const { t } = useTranslation()
  const isEdit = !!item?.id
  const [form, setForm] = useState({
    name:       item?.name       ?? '',
    country:    item?.country    ?? '',
    region:     item?.region     ?? '',
    hub_id:     item?.hub_id     ?? '',
    sales_type: item?.sales_type ?? 'external',
    notes:      item?.notes      ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState(null)

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function handleSave() {
    if (!form.name.trim()) { setError(t('network_name_required')); return }
    setSaving(true); setError(null)
    const payload = {
      name:       form.name.trim(),
      country:    form.country || null,
      region:     form.region  || null,
      hub_id:     form.hub_id  || null,
      sales_type: form.sales_type || 'external',
      notes:      form.notes   || null,
    }
    const res = isEdit
      ? await supabase.from('distributors').update(payload).eq('id', item.id)
      : await supabase.from('distributors').insert(payload)
    setSaving(false)
    if (res.error) { setError(res.error.message); return }
    onSaved?.()
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose}/>
      <div className="relative bg-white w-full sm:max-w-md sm:rounded-modal rounded-t-3xl shadow-2xl flex flex-col" style={{ maxHeight: '90dvh' }}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h3 className="font-semibold text-sm text-gray-900">{isEdit ? t('network_edit_distributor') : t('network_new_distributor')}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={16}/></button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          <div>
            <label className="label">{t('network_name')} *</label>
            <input className="input" value={form.name} autoFocus
              onChange={e => set('name', e.target.value)} placeholder="Ajoveco"/>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="label">{t('network_region')}</label>
              <select className="select" value={form.region} onChange={e => { set('region', e.target.value); set('country', '') }}>
                <option value="">—</option>
                {REGIONS.map(r => <option key={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="label">{t('network_country')}</label>
              <select className="select" value={form.country} onChange={e => set('country', e.target.value)}>
                <option value="">—</option>
                {(COUNTRY_MAP[form.region] || []).map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="label">{t('network_sales_type')}</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button type="button" onClick={() => set('sales_type', 'external')}
                className={`px-3 py-2 rounded-lg text-sm font-medium border-2 transition-all ${
                  form.sales_type === 'external' ? 'border-amber-400 bg-amber-50 text-amber-800' : 'border-gray-200 text-gray-500'
                }`}>
                {t('network_external')}
              </button>
              <button type="button" onClick={() => set('sales_type', 'internal')}
                className={`px-3 py-2 rounded-lg text-sm font-medium border-2 transition-all ${
                  form.sales_type === 'internal' ? 'border-blue-400 bg-blue-50 text-blue-800' : 'border-gray-200 text-gray-500'
                }`}>
                {t('network_internal')}
              </button>
            </div>
          </div>
          <div>
            <label className="label">{t('network_regional_hub')}</label>
            <SearchableSelect
              value={form.hub_id}
              onChange={v => set('hub_id', v || '')}
              options={hubs.map(h => ({ value: h.id, label: h.name, hint: h.region }))}
              placeholder={t('network_search_hubs')}
              emptyLabel={t('network_not_linked')}
            />
          </div>
          <div>
            <label className="label">{t('network_notes')}</label>
            <textarea className="input min-h-[72px] resize-none" value={form.notes}
              onChange={e => set('notes', e.target.value)}/>
          </div>
          {error && (
            <p className="text-xs text-red-600 flex items-center gap-1">
              <AlertCircle size={12}/> {error}
            </p>
          )}
        </div>
        <div className="flex gap-2 px-4 py-3 border-t border-gray-100" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
          <button className="btn-secondary flex-1" onClick={onClose}>{t('cancel')}</button>
          <button className="btn-primary flex-1 flex items-center justify-center gap-1" onClick={handleSave} disabled={saving}>
            <Save size={12}/> {saving ? t('saving') : isEdit ? t('save') : t('network_create')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Hub editor ─────────────────────────────────────────────────────────────
function HubEditor({ item, onClose, onSaved }) {
  const { t } = useTranslation()
  const isEdit = !!item?.id
  const [form, setForm] = useState({
    name:   item?.name   ?? '',
    region: item?.region ?? '',
    notes:  item?.notes  ?? '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError]   = useState(null)

  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function handleSave() {
    if (!form.name.trim()) { setError(t('network_name_required')); return }
    setSaving(true); setError(null)
    const payload = {
      name:   form.name.trim(),
      region: form.region || null,
      notes:  form.notes  || null,
    }
    const res = isEdit
      ? await supabase.from('regional_hubs').update(payload).eq('id', item.id)
      : await supabase.from('regional_hubs').insert(payload)
    setSaving(false)
    if (res.error) { setError(res.error.message); return }
    onSaved?.()
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50" onClick={onClose}/>
      <div className="relative bg-white w-full sm:max-w-md sm:rounded-modal rounded-t-3xl shadow-2xl flex flex-col" style={{ maxHeight: '90dvh' }}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <h3 className="font-semibold text-sm text-gray-900">{isEdit ? t('network_edit_hub') : t('network_new_regional_hub')}</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={16}/></button>
        </div>
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
          <div>
            <label className="label">{t('network_name')} *</label>
            <input className="input" value={form.name} autoFocus
              onChange={e => set('name', e.target.value)} placeholder="HCUS"/>
          </div>
          <div>
            <label className="label">{t('network_region')}</label>
            <select className="select" value={form.region} onChange={e => set('region', e.target.value)}>
              <option value="">—</option>
              {REGIONS.map(r => <option key={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="label">{t('network_notes')}</label>
            <textarea className="input min-h-[72px] resize-none" value={form.notes}
              onChange={e => set('notes', e.target.value)}/>
          </div>
          {error && (
            <p className="text-xs text-red-600 flex items-center gap-1">
              <AlertCircle size={12}/> {error}
            </p>
          )}
        </div>
        <div className="flex gap-2 px-4 py-3 border-t border-gray-100" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
          <button className="btn-secondary flex-1" onClick={onClose}>{t('cancel')}</button>
          <button className="btn-primary flex-1 flex items-center justify-center gap-1" onClick={handleSave} disabled={saving}>
            <Save size={12}/> {saving ? t('saving') : isEdit ? t('save') : t('network_create')}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Main page ──────────────────────────────────────────────────────────────
export default function Network() {
  const { isAdmin, canEdit } = useAuth()
  const { t } = useTranslation()
  const [tab, setTab]               = useState('distributors')
  const [distributors, setDistributors] = useState([])
  const [hubs, setHubs]             = useState([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState(null)
  const [search, setSearch]         = useState('')
  const [editing, setEditing]       = useState(null)

  async function refresh() {
    setLoading(true)
    const [dRes, hRes] = await Promise.all([
      supabase.from('distributors').select('*, hub:hub_id(id, name, region)').order('name'),
      supabase.from('regional_hubs').select('*').order('name'),
    ])
    if (dRes.error) setError(dRes.error.message)
    if (hRes.error) setError(hRes.error.message)
    setDistributors(dRes.data ?? [])
    setHubs(hRes.data ?? [])
    setLoading(false)
  }

  useEffect(() => { refresh() }, [])

  const filteredDistributors = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return distributors
    return distributors.filter(d =>
      [d.name, d.country, d.region, d.hub?.name].filter(Boolean).join(' ').toLowerCase().includes(q)
    )
  }, [distributors, search])

  const filteredHubs = useMemo(() => {
    const q = search.trim().toLowerCase()
    if (!q) return hubs
    return hubs.filter(h => [h.name, h.region].filter(Boolean).join(' ').toLowerCase().includes(q))
  }, [hubs, search])

  // Group distributors by country for readability
  const distByCountry = useMemo(() => {
    const m = new Map()
    filteredDistributors.forEach(d => {
      const k = d.country || '(No country)'
      if (!m.has(k)) m.set(k, [])
      m.get(k).push(d)
    })
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b))
  }, [filteredDistributors])

  async function handleDelete(type, item) {
    if (!confirm(`Delete "${item.name}"?`)) return
    const table = type === 'hubs' ? 'regional_hubs' : 'distributors'
    const { error } = await supabase.from(table).delete().eq('id', item.id)
    if (error) { setError(error.message); return }
    refresh()
  }

  if (loading) return <Spinner/>

  return (
    <div className="p-4 space-y-4 max-w-4xl mx-auto">
      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <NetIcon size={20} className="text-navy"/> {t('network_title')}
          </h1>
          <p className="text-sm text-gray-400 mt-0.5">
            {t('network_subtitle')}
          </p>
        </div>
        {canEdit && (
          <button onClick={() => setEditing({ type: tab, item: 'new' })} className="btn-primary">
            <Plus size={15}/> <span className="hidden sm:inline">{tab === 'hubs' ? t('network_new_hub') : t('network_new_distributor')}</span>
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-gray-100">
        {TAB_KEYS.map(tb => {
          const Icon = tb.icon
          const active = tab === tb.id
          return (
            <button key={tb.id} type="button"
              onClick={() => setTab(tb.id)}
              className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold transition-colors border-b-2 ${
                active ? 'text-navy border-navy' : 'text-gray-500 border-transparent hover:text-gray-700'
              }`}>
              <Icon size={12}/> {t(tb.labelKey)}
              <span className="ml-1 text-micro text-gray-400 font-normal">
                ({tb.id === 'distributors' ? distributors.length : hubs.length})
              </span>
            </button>
          )
        })}
      </div>

      <div className="relative">
        <Search size={14} className="absolute left-2.5 top-2.5 text-gray-400"/>
        <input className="input pl-8 w-full" placeholder={tab === 'hubs' ? t('network_search_hubs') : t('network_search_dist')}
          value={search} onChange={e => setSearch(e.target.value)}/>
      </div>

      {error && (
        <p className="text-sm text-red-600 flex items-center gap-1">
          <AlertCircle size={13}/> {error}
        </p>
      )}

      {/* Distributors tab */}
      {tab === 'distributors' && (
        filteredDistributors.length === 0 ? (
          <EmptyState icon="🚚" title={t('network_no_distributors')}
            description={t('network_no_distributors_desc')}
            action={canEdit && <button onClick={() => setEditing({ type: 'distributors', item: 'new' })} className="btn-primary">{t('network_new_distributor')}</button>}/>
        ) : (
          <div className="space-y-4">
            {distByCountry.map(([country, list]) => (
              <div key={country} className="bg-white border border-gray-200 rounded-card overflow-hidden">
                <div className="px-4 py-2 bg-gray-50 border-b border-gray-100 flex items-center gap-2">
                  <MapPin size={12} className="text-gray-400"/>
                  <span className="text-sm font-semibold text-gray-800">{country}</span>
                  <span className="text-micro text-gray-400">({list.length})</span>
                </div>
                <ul className="divide-y divide-gray-50">
                  {list.map(d => (
                    <li key={d.id} className="px-4 py-3 flex items-start gap-3 hover:bg-gray-50/50 transition-colors">
                      <Building size={14} className="text-navy/60 shrink-0 mt-0.5"/>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-gray-900 truncate">{d.name}</p>
                        <div className="flex items-center gap-2 text-tiny text-gray-500 mt-0.5 flex-wrap">
                          {d.region && <span>{d.region}</span>}
                          {d.hub && <span className="bg-purple-50 text-purple-700 px-1.5 py-0.5 rounded">{t('network_hub_label')}: {d.hub.name}</span>}
                        </div>
                        {d.notes && <p className="text-tiny text-gray-600 mt-1 whitespace-pre-wrap line-clamp-2">{d.notes}</p>}
                      </div>
                      {canEdit && (
                        <div className="flex flex-col gap-1 shrink-0">
                          <button type="button" onClick={() => setEditing({ type: 'distributors', item: d })}
                            className="p-1.5 text-gray-400 hover:text-gray-700 rounded hover:bg-gray-100 min-h-tap min-w-tap">
                            <Edit3 size={13}/>
                          </button>
                          <button type="button" onClick={() => handleDelete('distributors', d)}
                            className="p-1.5 text-gray-400 hover:text-red-500 rounded hover:bg-red-50 min-h-tap min-w-tap">
                            <Trash2 size={13}/>
                          </button>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )
      )}

      {/* Hubs tab */}
      {tab === 'hubs' && (
        filteredHubs.length === 0 ? (
          <EmptyState icon="🌐" title={t('network_no_hubs')}
            description={t('network_no_hubs_desc')}
            action={isAdmin && <button onClick={() => setEditing({ type: 'hubs', item: 'new' })} className="btn-primary">{t('network_new_hub')}</button>}/>
        ) : (
          <div className="bg-white border border-gray-200 rounded-card overflow-hidden">
            <ul className="divide-y divide-gray-50">
              {filteredHubs.map(h => {
                const dCount = distributors.filter(d => d.hub_id === h.id).length
                return (
                  <li key={h.id} className="px-4 py-3 flex items-start gap-3 hover:bg-gray-50/50 transition-colors">
                    <Globe size={14} className="text-purple-600/70 shrink-0 mt-0.5"/>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="text-sm font-semibold text-gray-900">{h.name}</p>
                        {h.region && <span className="text-micro bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{h.region}</span>}
                        <span className="text-micro text-gray-400">{dCount} {dCount !== 1 ? t('network_distributors_count') : t('network_distributor_count')}</span>
                      </div>
                      {h.notes && <p className="text-tiny text-gray-600 mt-1 whitespace-pre-wrap">{h.notes}</p>}
                    </div>
                    {isAdmin && (
                      <div className="flex flex-col gap-1 shrink-0">
                        <button type="button" onClick={() => setEditing({ type: 'hubs', item: h })}
                          className="p-1.5 text-gray-400 hover:text-gray-700 rounded hover:bg-gray-100 min-h-tap min-w-tap">
                          <Edit3 size={13}/>
                        </button>
                        <button type="button" onClick={() => handleDelete('hubs', h)}
                          className="p-1.5 text-gray-400 hover:text-red-500 rounded hover:bg-red-50 min-h-tap min-w-tap">
                          <Trash2 size={13}/>
                        </button>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          </div>
        )
      )}

      {editing && (editing.type === 'distributors' ? (
        <DistributorEditor
          item={editing.item === 'new' ? null : editing.item}
          hubs={hubs}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); refresh() }}
        />
      ) : (
        <HubEditor
          item={editing.item === 'new' ? null : editing.item}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); refresh() }}
        />
      ))}
    </div>
  )
}

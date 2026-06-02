import { useEffect, useState, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { useDebounce } from '../hooks/useDebounce'
import { BUBadge, formatK, Spinner, EmptyState, Modal } from '../components/ui'
import DealForm from '../components/DealForm'
import { Building2, Search, MapPin, Globe, RefreshCw, Plus, Pencil } from 'lucide-react'
import { useTranslation } from '../hooks/useTranslation'
import { REGIONS } from '../constants'

const MONTHS_K = ['apr','may','jun','jul','aug','sep','oct','nov','dec','jan','feb','mar']
const COUNTRY_MAP = {
  Europe: ['Portugal','Spain','France','Germany','Italy','Netherlands','Belgium','UK','Switzerland','Sweden','Norway','Denmark','Finland','Austria','Poland','Czech Republic','Romania','Greece','Turkey','Other Europe'],
  MEA: ['UAE','Saudi Arabia','Qatar','Kuwait','Egypt','Morocco','South Africa','Israel','Other MEA'],
  LATAM: ['Mexico','Brazil','Argentina','Chile','Colombia','Peru','Other LATAM'],
  APAC: ['Japan','China','South Korea','Australia','India','Singapore','Other APAC'],
  NA: ['USA','Canada','Other NA'],
}

function ClientFormModal({ client, distributors, onClose, onSaved }) {
  const isEdit = !!client?.id
  const [form, setForm] = useState({
    name:           client?.name           || '',
    country:        client?.country        || '',
    region:         client?.region         || '',
    bu:             client?.bu             || 'VGT',
    client_type:    client?.client_type    || 'public',
    distributor_id: client?.distributor_id || '',
    notes:          client?.notes          || '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  function set(k, v) { setForm(f => ({ ...f, [k]: v })) }

  async function handleSave() {
    if (!form.name.trim()) { setError('Name is required'); return }
    setSaving(true); setError(null)
    const payload = {
      name: form.name.trim(),
      country: form.country || null,
      region: form.region || null,
      bu: form.bu || 'VGT',
      client_type: form.client_type || 'public',
      distributor_id: form.distributor_id || null,
      notes: form.notes || null,
    }
    const res = isEdit
      ? await supabase.from('accounts').update(payload).eq('id', client.id)
      : await supabase.from('accounts').insert(payload)
    setSaving(false)
    if (res.error) { setError(res.error.message); return }
    onSaved()
  }

  return (
    <Modal open title={isEdit ? 'Edit Client' : 'New Client'} onClose={onClose}
      footer={
        <div className="flex gap-2">
          <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary flex-1">
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      }>
      <div className="space-y-3">
        {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
        <div>
          <label className="label">Name *</label>
          <input className="input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Hospital name"/>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Region</label>
            <select className="select" value={form.region} onChange={e => { set('region', e.target.value); set('country', '') }}>
              <option value="">—</option>
              {REGIONS.map(r => <option key={r}>{r}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Country</label>
            <select className="select" value={form.country} onChange={e => set('country', e.target.value)}>
              <option value="">—</option>
              {(COUNTRY_MAP[form.region] || []).map(c => <option key={c}>{c}</option>)}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Type</label>
            <div className="grid grid-cols-2 gap-1">
              <button type="button" onClick={() => set('client_type', 'public')}
                className={`px-2 py-1.5 rounded text-xs font-medium border-2 ${form.client_type === 'public' ? 'border-blue-400 bg-blue-50 text-blue-700' : 'border-gray-200 text-gray-500'}`}>
                Public
              </button>
              <button type="button" onClick={() => set('client_type', 'private')}
                className={`px-2 py-1.5 rounded text-xs font-medium border-2 ${form.client_type === 'private' ? 'border-purple-400 bg-purple-50 text-purple-700' : 'border-gray-200 text-gray-500'}`}>
                Private
              </button>
            </div>
          </div>
          <div>
            <label className="label">BU</label>
            <select className="select" value={form.bu} onChange={e => set('bu', e.target.value)}>
              <option value="VGT">VGT</option>
              <option value="ECT">ECT</option>
            </select>
          </div>
        </div>
        {distributors.length > 0 && (
          <div>
            <label className="label">Distributor</label>
            <select className="select" value={form.distributor_id} onChange={e => set('distributor_id', e.target.value)}>
              <option value="">— Direct —</option>
              {distributors.map(d => <option key={d.id} value={d.id}>{d.name} ({d.country || d.region})</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="label">Notes</label>
          <textarea className="input min-h-[60px] resize-none" value={form.notes} onChange={e => set('notes', e.target.value)}/>
        </div>
      </div>
    </Modal>
  )
}

export default function Clients() {
  const { isAdmin, canEdit, profile } = useAuth()
  const { t } = useTranslation()
  const [accounts, setAccounts] = useState([])
  const [deals, setDeals] = useState([])
  const [selectedDeal, setSelectedDeal] = useState(null)
  const [distributors, setDistributors] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const debouncedSearch = useDebounce(search)
  const [regionF, setRegionF] = useState('')
  const [countryF, setCountryF] = useState('')
  const [typeF, setTypeF] = useState('')
  const [buF, setBuF] = useState('')
  const [page, setPage] = useState(1)
  const [formOpen, setFormOpen] = useState(false)
  const [editClient, setEditClient] = useState(null)
  const pageSize = 10

  useEffect(() => {
    let dealsQ = supabase.from('deals').select('*').eq('is_intercompany_mirror', false)
    if (profile?.role === 'distributor' && profile?.company_id) {
      dealsQ = dealsQ.eq('company_id', profile.company_id)
    } else if (!isAdmin && profile?.bu) {
      dealsQ = dealsQ.eq('bu', profile.bu)
    }
    Promise.all([
      supabase.from('accounts').select('*').order('name'),
      dealsQ,
      supabase.from('distributors').select('id, name, country, region').order('name'),
    ]).then(([aRes, dRes, distRes]) => {
      const allAccounts = aRes.data || []
      const filteredDeals = dRes.data || []
      if (profile?.role === 'distributor' && profile?.company_id) {
        const dealAccountIds = new Set(filteredDeals.map(d => d.account_id).filter(Boolean))
        const dealClientNames = new Set(filteredDeals.map(d => d.client?.toLowerCase()).filter(Boolean))
        setAccounts(allAccounts.filter(a => dealAccountIds.has(a.id) || dealClientNames.has(a.name?.toLowerCase())))
      } else {
        setAccounts(allAccounts)
      }
      setDeals(filteredDeals)
      setDistributors(distRes.data || [])
      setLoading(false)
    }).catch(() => setLoading(false))
  }, [profile, isAdmin])

  function refresh() {
    supabase.from('accounts').select('*').order('name')
      .then(({ data }) => setAccounts(data || []))
  }

  const leafAccounts = useMemo(() => {
    const parentIds = new Set(accounts.filter(a => a.parent_id).map(a => a.parent_id))
    return accounts.filter(a => !parentIds.has(a.id))
  }, [accounts])

  const enriched = useMemo(() => {
    return leafAccounts.map(acc => {
      const accDeals = deals.filter(d => d.account_id === acc.id || (d.client && d.client.toLowerCase() === acc.name.toLowerCase()))
      const pipeline = accDeals.filter(d => ['Pipeline', 'Offer Presented'].includes(d.stage)).reduce((s, d) => s + (Number(d.value_total) || 0), 0)
      const invoiced = accDeals.filter(d => d.stage === 'Invoiced').reduce((s, d) => s + (Number(d.value_total) || 0), 0)
      const slaCount = accDeals.filter(d => d.is_sla).length
      return { ...acc, dealCount: accDeals.length, pipeline, invoiced, slaCount }
    })
  }, [leafAccounts, deals])

  const filtered = useMemo(() => {
    let list = enriched
    if (regionF) list = list.filter(a => a.region === regionF)
    if (countryF) list = list.filter(a => a.country === countryF)
    if (typeF) list = list.filter(a => a.client_type === typeF)
    if (buF) list = list.filter(a => a.bu === buF)
    if (debouncedSearch) {
      const s = debouncedSearch.toLowerCase()
      list = list.filter(a => a.name.toLowerCase().includes(s) || (a.country || '').toLowerCase().includes(s))
    }
    return list.sort((a, b) => (b.invoiced + b.pipeline) - (a.invoiced + a.pipeline))
  }, [enriched, regionF, countryF, typeF, buF, debouncedSearch])

  const countries = useMemo(() =>
    [...new Set(enriched.map(a => a.country).filter(Boolean))].sort(),
    [enriched]
  )

  const stats = useMemo(() => ({
    total: filtered.length,
    public: filtered.filter(a => a.client_type === 'public').length,
    private: filtered.filter(a => a.client_type === 'private').length,
    withSLA: filtered.filter(a => a.slaCount > 0).length,
    pipeline: filtered.reduce((s, a) => s + a.pipeline, 0),
    invoiced: filtered.reduce((s, a) => s + a.invoiced, 0),
  }), [filtered])

  const paginated = filtered.slice((page - 1) * pageSize, page * pageSize)
  const totalPages = Math.ceil(filtered.length / pageSize)

  if (loading) return <Spinner/>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-lg font-bold text-gray-900">{t('clients_title')}</h1>
          <p className="text-xs text-gray-400">{t('clients_subtitle')}</p>
          <Link to="/accounts" className="text-[10px] text-blue-500 hover:text-blue-700">{t('clients_go_accounts')}</Link>
        </div>
        {canEdit && (
          <button onClick={() => { setEditClient(null); setFormOpen(true) }} className="btn-primary flex items-center gap-1">
            <Plus size={14}/> New Client
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="card p-3">
          <p className="text-[10px] text-gray-400 uppercase font-semibold">Clients</p>
          <p className="text-xl font-bold text-navy">{stats.total}</p>
        </div>
        <div className="card p-3">
          <p className="text-[10px] text-gray-400 uppercase font-semibold">Pipeline</p>
          <p className="text-xl font-bold text-amber-600">{formatK(stats.pipeline)}</p>
        </div>
        <div className="card p-3">
          <p className="text-[10px] text-gray-400 uppercase font-semibold">Invoiced</p>
          <p className="text-xl font-bold text-green-600">{formatK(stats.invoiced)}</p>
        </div>
        <div className="card p-3">
          <p className="text-[10px] text-gray-400 uppercase font-semibold">With SLA</p>
          <p className="text-xl font-bold text-blue-600">{stats.withSLA}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[140px]">
          <input className="input pl-8 text-sm" placeholder="Search…" value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }} style={{ fontSize: '16px' }}/>
          <Search size={14} className="absolute left-2.5 top-3 text-gray-400"/>
        </div>
        <select className="select text-xs w-auto" value={regionF} onChange={e => { setRegionF(e.target.value); setCountryF(''); setPage(1) }}>
          <option value="">All Regions</option>
          {REGIONS.map(r => <option key={r}>{r}</option>)}
        </select>
        <select className="select text-xs w-auto" value={countryF} onChange={e => { setCountryF(e.target.value); setPage(1) }}>
          <option value="">All Countries</option>
          {countries.map(c => <option key={c}>{c}</option>)}
        </select>
        <select className="select text-xs w-auto" value={typeF} onChange={e => { setTypeF(e.target.value); setPage(1) }}>
          <option value="">All Types</option>
          <option value="public">Public</option>
          <option value="private">Private</option>
        </select>
        {isAdmin && (
          <select className="select text-xs w-auto" value={buF} onChange={e => { setBuF(e.target.value); setPage(1) }}>
            <option value="">All BU</option>
            <option value="VGT">VGT</option>
            <option value="ECT">ECT</option>
          </select>
        )}
      </div>

      <p className="text-xs text-gray-400">
        Showing {Math.min((page-1)*pageSize+1, filtered.length)}–{Math.min(page*pageSize, filtered.length)} of {filtered.length}
      </p>

      <div className="space-y-2">
        {paginated.length === 0 ? (
          <EmptyState icon="🏥" title={t('clients_none')} description="Create a client or adjust filters."
            action={canEdit && <button onClick={() => setFormOpen(true)} className="btn-primary">New Client</button>}/>
        ) : paginated.map(c => {
          const clientDeals = deals.filter(d => d.account_id === c.id || (d.client && d.client.toLowerCase() === c.name.toLowerCase()))
          return (
          <div key={c.id} className="card overflow-hidden">
            <div className="p-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
                  <BUBadge bu={c.bu}/>
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${c.client_type === 'public' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                    {c.client_type === 'public' ? 'Public' : 'Private'}
                  </span>
                  {c.slaCount > 0 && (
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-green-100 text-green-700 flex items-center gap-0.5">
                      <RefreshCw size={8}/> {c.slaCount} SLA
                    </span>
                  )}
                </div>
                <p className="font-semibold text-sm text-gray-900 truncate">{c.name}</p>
                <div className="flex items-center gap-2 text-[10px] text-gray-400">
                  {c.country && <span className="flex items-center gap-0.5"><MapPin size={8}/> {c.country}</span>}
                  {c.region && <span>{c.region}</span>}
                  {c.dealCount > 0 && <span>{c.dealCount} deals</span>}
                </div>
              </div>
              <div className="text-right shrink-0">
                {c.invoiced > 0 && <p className="text-sm font-bold text-green-600">{formatK(c.invoiced)}</p>}
                {c.pipeline > 0 && <p className="text-[10px] text-amber-600">+{formatK(c.pipeline)} pipe</p>}
              </div>
              {canEdit && (
                <button onClick={() => { setEditClient(c); setFormOpen(true) }}
                  className="text-gray-400 hover:text-navy p-1.5 min-h-tap shrink-0">
                  <Pencil size={13}/>
                </button>
              )}
            </div>
            {clientDeals.length > 0 && (
              <details className="border-t border-gray-100">
                <summary className="px-3 py-1.5 text-[10px] text-gray-400 cursor-pointer hover:text-gray-600">
                  View {clientDeals.length} deal{clientDeals.length > 1 ? 's' : ''}
                </summary>
                <div className="px-3 pb-2 space-y-1">
                  {clientDeals.map(d => (
                    <button key={d.id} onClick={() => setSelectedDeal(d)}
                      className="w-full flex items-center justify-between bg-gray-50 rounded px-2 py-1.5 hover:bg-blue-50 transition-colors cursor-pointer text-left">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`text-[9px] font-bold px-1 py-0.5 rounded ${
                          d.stage === 'Invoiced' ? 'bg-green-100 text-green-700' :
                          d.stage === 'BackLog' ? 'bg-purple-100 text-purple-700' :
                          d.stage === 'Lost' ? 'bg-red-100 text-red-600' :
                          'bg-amber-100 text-amber-700'
                        }`}>{d.stage}</span>
                        <span className="text-xs text-gray-700 truncate">{d.description || d.product || d.sales_owner || '—'}</span>
                      </div>
                      <span className="text-xs font-semibold text-gray-800 shrink-0 ml-2">{formatK(Number(d.value_total) || 0)}</span>
                    </button>
                  ))}
                </div>
              </details>
            )}
          </div>
        )})}
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-1 pt-1">
          <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page === 1}
            className="btn-secondary text-xs px-2 py-1 disabled:opacity-30">←</button>
          {Array.from({ length: totalPages }, (_, i) => i + 1)
            .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
            .reduce((acc, p, i, arr) => { if (i > 0 && p - arr[i-1] > 1) acc.push('…'); acc.push(p); return acc }, [])
            .map((p, i) => p === '…'
              ? <span key={`e${i}`} className="text-xs text-gray-300 px-1">…</span>
              : <button key={p} onClick={() => setPage(p)}
                  className={`text-xs px-2.5 py-1 rounded-lg font-medium ${p === page ? 'bg-navy text-white' : 'text-gray-500 hover:bg-gray-100'}`}>{p}</button>
            )}
          <button onClick={() => setPage(p => Math.min(totalPages, p+1))} disabled={page >= totalPages}
            className="btn-secondary text-xs px-2 py-1 disabled:opacity-30">→</button>
        </div>
      )}

      {formOpen && (
        <ClientFormModal
          client={editClient}
          distributors={distributors}
          onClose={() => { setFormOpen(false); setEditClient(null) }}
          onSaved={() => { setFormOpen(false); setEditClient(null); refresh() }}
        />
      )}

      {selectedDeal && (
        <DealForm
          deal={selectedDeal}
          onClose={() => setSelectedDeal(null)}
          onSaved={() => setSelectedDeal(null)}
        />
      )}
    </div>
  )
}

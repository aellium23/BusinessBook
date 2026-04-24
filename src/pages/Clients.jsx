import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { BUBadge, StageBadge, formatK, CurrencyBadge, Spinner, EmptyState } from '../components/ui'
import { Building2, Search, ChevronDown, ChevronUp, RefreshCw, MapPin, Globe, Filter } from 'lucide-react'
import { useTranslation } from '../hooks/useTranslation'
import { REGIONS } from '../constants'

const MONTHS_K = ['apr','may','jun','jul','aug','sep','oct','nov','dec','jan','feb','mar']

function ClientCard({ client, deals }) {
  const [open, setOpen] = useState(false)

  const totalFY26 = deals.reduce((s, d) => {
    const fy = MONTHS_K.reduce((ms, m) => ms + (d[m] || 0), 0)
    const fyEUR = fy * ((!d.currency || d.currency === 'EUR') ? 1 : (d.exchange_rate || 1))
    return s + (['BackLog', 'Invoiced'].includes(d.stage) ? fyEUR : 0)
  }, 0)

  const totalPipe = deals.reduce((s, d) =>
    ['Pipeline', 'Offer Presented'].includes(d.stage)
      ? s + (d.value_total || 0) * ((!d.currency || d.currency === 'EUR') ? 1 : (d.exchange_rate || 1)) : s, 0)

  const slas = deals.filter(d => d.is_sla)
  const bus = [...new Set(deals.map(d => d.bu))]
  const country = deals[0]?.country || ''
  const region = deals[0]?.region || ''

  return (
    <div className="card overflow-hidden">
      <div className="p-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1.5 flex-wrap mb-0.5">
              {bus.map(b => <BUBadge key={b} bu={b}/>)}
              {slas.length > 0 && (
                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-blue-700">
                  <RefreshCw size={8}/> {slas.length} SLA
                </span>
              )}
            </div>
            <p className="font-semibold text-sm text-gray-900 truncate">{client}</p>
            <div className="flex items-center gap-2 text-[10px] text-gray-400 mt-0.5">
              {country && <span className="flex items-center gap-0.5"><MapPin size={8}/> {country}</span>}
              {region && <span>{region}</span>}
              <span>{deals.length} deal{deals.length !== 1 ? 's' : ''}</span>
            </div>
          </div>
          <div className="text-right shrink-0">
            <p className="text-sm font-bold text-gray-900">{formatK(totalFY26)}</p>
            <p className="text-[10px] text-gray-400">FY26</p>
            {totalPipe > 0 && <p className="text-[10px] text-amber-600">+{formatK(totalPipe)} pipe</p>}
          </div>
        </div>

        <button onClick={() => setOpen(o => !o)}
          className="mt-1.5 text-[10px] text-gray-400 flex items-center gap-1 hover:text-gray-600 min-h-tap">
          {open ? <ChevronUp size={10}/> : <ChevronDown size={10}/>}
          {open ? 'Hide' : `${deals.length} deals`}
        </button>
      </div>

      {open && (
        <div className="border-t border-gray-100">
          {deals.map(d => {
            const fy = MONTHS_K.reduce((s, m) => s + (d[m] || 0), 0)
            return (
              <div key={d.id} className="flex items-center justify-between px-3 py-2 border-b border-gray-50 last:border-0">
                <div className="flex items-center gap-2 min-w-0">
                  <StageBadge stage={d.stage}/>
                  {d.is_sla && <RefreshCw size={9} className="text-blue-500 shrink-0"/>}
                  <span className="text-xs text-gray-700 truncate">{d.description || d.deal_type || '—'}</span>
                </div>
                <div className="text-right shrink-0 ml-2">
                  <p className="text-xs font-medium text-gray-800">{formatK(d.value_total)}</p>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function Clients() {
  const { isAdmin, profile } = useAuth()
  const { t } = useTranslation()

  const [deals, setDeals] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [regionF, setRegionF] = useState('')
  const [countryF, setCountryF] = useState('')
  const [buF, setBuF] = useState('')
  const [slaOnly, setSlaOnly] = useState(false)
  const [viewMode, setViewMode] = useState('list')

  useEffect(() => {
    let q = supabase.from('deals').select('*')
      .eq('is_intercompany_mirror', false)
      .order('client')
    if (!isAdmin) {
      if (profile?.role === 'distributor' && profile?.company_id) {
        q = q.eq('company_id', profile.company_id)
      } else if (profile?.bu) {
        q = q.eq('bu', profile.bu)
      }
    }
    q.then(({ data }) => { setDeals(data || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, [profile, isAdmin])

  const countries = useMemo(() =>
    [...new Set(deals.map(d => d.country).filter(Boolean))].sort(),
    [deals]
  )

  const countriesForRegion = useMemo(() => {
    if (!regionF) return countries
    return [...new Set(deals.filter(d => d.region === regionF).map(d => d.country).filter(Boolean))].sort()
  }, [deals, regionF, countries])

  const grouped = useMemo(() => {
    let filtered = deals
    if (buF) filtered = filtered.filter(d => d.bu === buF)
    if (regionF) filtered = filtered.filter(d => d.region === regionF)
    if (countryF) filtered = filtered.filter(d => d.country === countryF)
    if (slaOnly) filtered = filtered.filter(d => d.is_sla)
    if (search) {
      const s = search.toLowerCase()
      filtered = filtered.filter(d =>
        d.client?.toLowerCase().includes(s) ||
        d.country?.toLowerCase().includes(s) ||
        d.sales_owner?.toLowerCase().includes(s)
      )
    }

    const map = {}
    filtered.forEach(d => {
      if (!map[d.client]) map[d.client] = []
      map[d.client].push(d)
    })

    return Object.entries(map).sort((a, b) => {
      const aFY = a[1].reduce((s, d) => s + MONTHS_K.reduce((ms, m) => ms + (d[m] || 0), 0), 0)
      const bFY = b[1].reduce((s, d) => s + MONTHS_K.reduce((ms, m) => ms + (d[m] || 0), 0), 0)
      return bFY - aFY
    })
  }, [deals, buF, regionF, countryF, slaOnly, search])

  const byRegion = useMemo(() => {
    const map = {}
    for (const [client, ds] of grouped) {
      const r = ds[0]?.region || 'Other'
      if (!map[r]) map[r] = []
      map[r].push([client, ds])
    }
    return map
  }, [grouped])

  const stats = useMemo(() => {
    const allDeals = grouped.flatMap(([, ds]) => ds)
    return {
      clients: grouped.length,
      withSLA: grouped.filter(([, ds]) => ds.some(d => d.is_sla)).length,
      totalValue: allDeals.reduce((s, d) => s + (d.value_total || 0), 0),
      pipeline: allDeals.filter(d => ['Pipeline', 'Offer Presented'].includes(d.stage))
        .reduce((s, d) => s + (d.value_total || 0), 0),
      invoiced: allDeals.filter(d => d.stage === 'Invoiced')
        .reduce((s, d) => s + (d.value_total || 0), 0),
    }
  }, [grouped])

  if (loading) return <Spinner/>

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h1 className="text-lg font-bold text-gray-900">{t('clients_title')}</h1>
          <p className="text-xs text-gray-400">{stats.clients} clients · {stats.withSLA} with SLA</p>
        </div>
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
          <button onClick={() => setViewMode('list')}
            className={`px-2.5 py-1 rounded text-xs font-semibold ${viewMode === 'list' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>
            List
          </button>
          <button onClick={() => setViewMode('region')}
            className={`px-2.5 py-1 rounded text-xs font-semibold ${viewMode === 'region' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>
            By Region
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <div className="card p-3">
          <p className="text-[10px] text-gray-400 uppercase font-semibold">Clients</p>
          <p className="text-xl font-bold text-navy">{stats.clients}</p>
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
          <p className="text-[10px] text-gray-400 uppercase font-semibold">Active SLAs</p>
          <p className="text-xl font-bold text-blue-600">{stats.withSLA}</p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[160px]">
          <input className="input pl-8 text-sm" placeholder="Search clients…"
            value={search} onChange={e => setSearch(e.target.value)} style={{ fontSize: '16px' }}/>
          <Search size={14} className="absolute left-2.5 top-3 text-gray-400"/>
        </div>
        <select className="select text-xs w-auto" value={regionF} onChange={e => { setRegionF(e.target.value); setCountryF('') }}>
          <option value="">All Regions</option>
          {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
        </select>
        <select className="select text-xs w-auto" value={countryF} onChange={e => setCountryF(e.target.value)}>
          <option value="">All Countries</option>
          {countriesForRegion.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        {isAdmin && (
          <select className="select text-xs w-auto" value={buF} onChange={e => setBuF(e.target.value)}>
            <option value="">All BU</option>
            <option value="VGT">VGT</option>
            <option value="ECT">ECT</option>
          </select>
        )}
        <button onClick={() => setSlaOnly(o => !o)}
          className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border ${
            slaOnly ? 'bg-blue-50 border-blue-300 text-blue-700' : 'border-gray-200 text-gray-500'
          }`}>
          <RefreshCw size={10} className="inline mr-1"/> SLA
        </button>
      </div>

      {/* Client list */}
      {viewMode === 'list' ? (
        <div className="space-y-2">
          {grouped.length === 0 ? (
            <EmptyState icon="🏥" title={t('clients_none')} description="Adjust filters or add deals."/>
          ) : grouped.map(([client, ds]) => (
            <ClientCard key={client} client={client} deals={ds}/>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {REGIONS.map(region => {
            const regionClients = byRegion[region]
            if (!regionClients?.length) return null
            const regionValue = regionClients.reduce((s, [, ds]) =>
              s + ds.reduce((ds2, d) => ds2 + (d.value_total || 0), 0), 0)
            return (
              <div key={region}>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold text-gray-500 uppercase flex items-center gap-1.5">
                    <Globe size={12}/> {region}
                    <span className="text-gray-400 font-normal">({regionClients.length} clients)</span>
                  </p>
                  <span className="text-xs text-gray-500 font-semibold">{formatK(regionValue)}</span>
                </div>
                <div className="space-y-2">
                  {regionClients.map(([client, ds]) => (
                    <ClientCard key={client} client={client} deals={ds}/>
                  ))}
                </div>
              </div>
            )
          })}
          {byRegion['Other']?.length > 0 && (
            <div>
              <p className="text-xs font-bold text-gray-400 uppercase mb-2">Other</p>
              <div className="space-y-2">
                {byRegion['Other'].map(([client, ds]) => (
                  <ClientCard key={client} client={client} deals={ds}/>
                ))}
              </div>
            </div>
          )}
          {grouped.length === 0 && (
            <EmptyState icon="🏥" title={t('clients_none')} description="Adjust filters or add deals."/>
          )}
        </div>
      )}
    </div>
  )
}

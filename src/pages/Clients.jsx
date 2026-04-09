import { useEffect, useState, useMemo } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../hooks/useAuth'
import { BUBadge, StageBadge, formatK, toEUR, CurrencyBadge, Spinner } from '../components/ui'
import { Building2, Search, ChevronDown, ChevronUp, RefreshCw } from 'lucide-react'

const MONTHS_K = ['apr','may','jun','jul','aug','sep','oct','nov','dec','jan','feb','mar']

function ProgressBar({ value, max, color }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0
  return (
    <div className="h-1.5 bg-gray-100 rounded-full overflow-hidden">
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }}/>
    </div>
  )
}

function ClientCard({ client, deals }) {
  const [open, setOpen] = useState(false)

  const totalFY26 = deals.reduce((s, d) => {
    const fy = MONTHS_K.reduce((ms, m) => ms + (d[m] || 0), 0)
    const fyEUR = toEUR(fy, d.currency, d.exchange_rate)
    return s + (['BackLog','Invoiced'].includes(d.stage) ? fyEUR : 0)
  }, 0)

  const totalPipe = deals.reduce((s, d) =>
    d.stage === 'Pipeline' || d.stage === 'Offer Presented'
      ? s + toEUR(d.value_total || 0, d.currency, d.exchange_rate) : s, 0)

  const slas = deals.filter(d => d.is_sla)
  const activeSLAs = slas.filter(d => {
    if (!d.ce_month || !d.ce_year) return true
    const ceDate = new Date(`${d.ce_year}-${String(['Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar'].indexOf(d.ce_month) + 4).padStart(2,'0')}-01`)
    return ceDate >= new Date()
  })

  const bus = [...new Set(deals.map(d => d.bu))]

  return (
    <div className="card overflow-hidden">
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              {bus.map(b => <BUBadge key={b} bu={b}/>)}
              {activeSLAs.length > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-blue-100 text-blue-800">
                  <RefreshCw size={9}/> {activeSLAs.length} SLA
                </span>
              )}
            </div>
            <p className="font-semibold text-gray-900 truncate">{client}</p>
            <p className="text-xs text-gray-400 mt-0.5">{deals[0]?.country} · {deals.length} deal{deals.length !== 1 ? 's' : ''}</p>
          </div>
          <div className="text-right shrink-0">
            <p className="text-sm font-bold text-gray-900">{formatK(totalFY26)}</p>
            <p className="text-xs text-gray-400">FY26 forecast</p>
            {totalPipe > 0 && <p className="text-xs text-amber-600">+{formatK(totalPipe)} pipe</p>}
          </div>
        </div>

        {/* SLA summary */}
        {activeSLAs.length > 0 && (
          <div className="mt-2 p-2 bg-blue-50 rounded-lg">
            <p className="text-[10px] font-semibold text-blue-600 uppercase tracking-wide mb-1">Active SLAs</p>
            {activeSLAs.map(sla => (
              <div key={sla.id} className="flex items-center justify-between text-xs">
                <span className="text-blue-800 truncate">{sla.description || sla.deal_type}</span>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  {sla.sla_owner && <span className="text-blue-500">{sla.sla_owner}</span>}
                  {sla.sla_renewal_target && (
                    <span className="text-green-600 font-medium">+{sla.sla_renewal_target}% target</span>
                  )}
                  <span className="text-blue-700 font-medium">{formatK(sla.value_total)}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        <button onClick={() => setOpen(o => !o)}
          className="mt-2 text-xs text-gray-400 flex items-center gap-1 hover:text-gray-600">
          All deals {open ? <ChevronUp size={12}/> : <ChevronDown size={12}/>}
        </button>
      </div>

      {open && (
        <div className="border-t border-gray-100">
          {deals.map(d => {
            const fy = MONTHS_K.reduce((s, m) => s + (d[m] || 0), 0)
            return (
              <div key={d.id} className="flex items-start justify-between px-4 py-2 border-b border-gray-50 last:border-0">
                <div className="flex flex-col gap-0.5 min-w-0">
                  <div className="flex items-center gap-2">
                    <StageBadge stage={d.stage}/>
                    {d.is_sla && <RefreshCw size={10} className="text-blue-500 shrink-0"/>}
                    <span className="text-xs text-gray-700 truncate">{d.description || d.deal_type}</span>
                  </div>
                  {(d.end_customer || d.distributor || d.hub) && (
                    <div className="flex items-center gap-1 flex-wrap ml-0.5">
                      {d.end_customer && <span className="text-[9px] bg-blue-50 text-blue-600 px-1 py-0.5 rounded">{d.end_customer}</span>}
                      {d.distributor && <><span className="text-gray-300 text-[9px]">→</span><span className="text-[9px] bg-amber-50 text-amber-600 px-1 py-0.5 rounded">{d.distributor}</span></>}
                      {d.hub && <><span className="text-gray-300 text-[9px]">→</span><span className="text-[9px] bg-purple-50 text-purple-600 px-1 py-0.5 rounded">{d.hub}</span></>}
                    </div>
                  )}
                </div>
                <div className="text-right shrink-0 ml-2">
                  <div className="flex items-center justify-end gap-1">
                    <CurrencyBadge currency={d.currency}/>
                    <p className="text-xs font-medium text-gray-800">
                      {d.currency && d.currency !== 'EUR'
                        ? `${d.currency === 'USD' ? '$' : '£'}${(d.value_total||0).toLocaleString()}`
                        : formatK(d.value_total)}
                    </p>
                  </div>
                  {d.currency && d.currency !== 'EUR' && (
                    <p className="text-[10px] text-blue-500">≈ {formatK(toEUR(d.value_total, d.currency, d.exchange_rate))}</p>
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

export default function Clients() {
  const { isAdmin, profile } = useAuth()
  const [deals, setDeals]   = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [buFilter, setBuFilter] = useState('all')
  const [slaOnly, setSlaOnly] = useState(false)

  useEffect(() => {
    let q = supabase.from('deals').select('*')
      .eq('is_intercompany_mirror', false)
      .order('client')

    if (!isAdmin && profile?.role === 'vgt') q = q.eq('bu', 'VGT')
    if (!isAdmin && profile?.role === 'ect') q = q.eq('bu', 'ECT')

    q.then(({ data }) => { setDeals(data || []); setLoading(false) })
  }, [profile, isAdmin])

  const grouped = useMemo(() => {
    let filtered = deals
    if (buFilter !== 'all') filtered = filtered.filter(d => d.bu === buFilter)
    if (slaOnly) filtered = filtered.filter(d => d.is_sla)
    if (search) filtered = filtered.filter(d =>
      d.client?.toLowerCase().includes(search.toLowerCase()) ||
      d.country?.toLowerCase().includes(search.toLowerCase())
    )

    const map = {}
    filtered.forEach(d => {
      if (!map[d.client]) map[d.client] = []
      map[d.client].push(d)
    })

    return Object.entries(map)
      .sort((a, b) => {
        const aFY = a[1].reduce((s,d) => s + MONTHS_K.reduce((ms,m) => ms + (d[m]||0), 0), 0)
        const bFY = b[1].reduce((s,d) => s + MONTHS_K.reduce((ms,m) => ms + (d[m]||0), 0), 0)
        return bFY - aFY
      })
  }, [deals, buFilter, slaOnly, search])

  const stats = useMemo(() => ({
    total: grouped.length,
    withSLA: grouped.filter(([,ds]) => ds.some(d => d.is_sla)).length,
    totalFY26: grouped.reduce((s,[,ds]) =>
      s + ds.reduce((ds2,d) => ds2 + MONTHS_K.reduce((ms,m) => ms+(d[m]||0),0), 0), 0),
  }), [grouped])

  if (loading) return <Spinner/>

  return (
    <div className="p-4 space-y-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between pt-1">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Clients</h1>
          <p className="text-sm text-gray-400">
            {stats.total} clients · {stats.withSLA} with SLA · {formatK(stats.totalFY26)} FY26
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 flex-wrap items-center">
        <div className="relative flex-1 min-w-32">
          <Search size={14} className="absolute left-2.5 top-2.5 text-gray-400"/>
          <input className="input pl-8" placeholder="Search client or country…"
            value={search} onChange={e => setSearch(e.target.value)}/>
        </div>
        {isAdmin && (
          <select className="select w-24" value={buFilter} onChange={e => setBuFilter(e.target.value)}>
            <option value="all">All BU</option>
            <option value="VGT">VGT</option>
            <option value="ECT">ECT</option>
          </select>
        )}
        <button onClick={() => setSlaOnly(o => !o)}
          className={`btn text-xs gap-1.5 ${slaOnly ? 'bg-blue-100 text-blue-800 border border-blue-200' : 'btn-secondary'}`}>
          <RefreshCw size={12}/> SLA only
        </button>
      </div>

      {/* Client list */}
      {grouped.length === 0
        ? <div className="text-center py-12 text-gray-400">
            <Building2 size={32} className="mx-auto mb-2 opacity-30"/>
            <p>No clients found</p>
          </div>
        : <div className="space-y-2 pb-2">
            {grouped.map(([client, ds]) => (
              <ClientCard key={client} client={client} deals={ds}/>
            ))}
          </div>
      }
    </div>
  )
}

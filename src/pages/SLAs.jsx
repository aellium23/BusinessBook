import { useState, useMemo, useEffect, memo } from 'react'
import { useSlas, deleteSla } from '../hooks/useSlas'
import { useAuth } from '../hooks/useAuth'
import { useTranslation } from '../hooks/useTranslation'
import { useDebounce } from '../hooks/useDebounce'
import { Spinner, EmptyState, BUBadge, formatK } from '../components/ui'
import { SLA_STATUSES, FY_RANGE, getFiscalYear } from '../constants'
import SlaFormModal from '../components/SlaFormModal'
import {
  Plus, Search, Pencil, Trash2, Calendar, User,
  TrendingUp, AlertCircle, ChevronDown, ChevronUp,
  Shield,
} from 'lucide-react'

function SlaStatusBadge({ status }) {
  const cfg = SLA_STATUSES.find(s => s.id === status) || SLA_STATUSES[0]
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-micro font-bold border ${cfg.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`}/>
      {cfg.label}
    </span>
  )
}

function RenewalBadge({ sla }) {
  const { t } = useTranslation()
  const rd = sla.renewal_date || sla.end_date
  if (!rd || !['warranty','active','pending_renewal'].includes(sla.status)) return null
  const days = Math.ceil((new Date(rd) - new Date()) / 86400000)
  if (days < 0) return <span className="text-micro font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700">{t('sla_expired')}</span>
  if (days <= 30) return <span className="text-micro font-bold px-1.5 py-0.5 rounded bg-red-100 text-red-700">{days}d</span>
  if (days <= 60) return <span className="text-micro font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">{days}d</span>
  if (days <= 90) return <span className="text-micro font-bold px-1.5 py-0.5 rounded bg-yellow-100 text-yellow-700">{days}d</span>
  return null
}

const SlaCard = memo(function SlaCard({ sla, onEdit, onDelete, canEdit, canDelete }) {
  const [expanded, setExpanded] = useState(false)
  const { t } = useTranslation()
  const revenue = sla.revenue_by_fy || {}

  return (
    <div className="card p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <BUBadge bu={sla.bu}/>
            <span className={`text-micro font-bold px-1.5 py-0.5 rounded ${sla.sales_type === 'Internal' ? 'bg-blue-50 text-blue-700' : 'bg-amber-50 text-amber-700'}`}>
              {sla.sales_type === 'Internal' ? 'Int' : 'Ext'}
            </span>
            <SlaStatusBadge status={sla.status}/>
            <RenewalBadge sla={sla}/>
            {sla.sla_type && <span className="text-micro text-gray-400">{sla.sla_type}</span>}
          </div>
          <p className="font-semibold text-sm text-gray-900 mt-1 truncate">{sla.client}</p>
          {sla.description && <p className="text-xs text-gray-500 truncate">{sla.description}</p>}
        </div>
        <div className="text-right shrink-0">
          <p className="text-lg font-bold text-gray-900">{formatK(sla.annual_value)}</p>
          <p className="text-micro text-gray-400">{t('sla_per_year')}</p>
        </div>
      </div>

      <div className="flex items-center gap-3 text-micro text-gray-500 flex-wrap">
        {sla.sla_owner && (
          <span className="flex items-center gap-1"><User size={9}/> {sla.sla_owner}</span>
        )}
        {sla.start_date && (
          <span className="flex items-center gap-1">
            <Calendar size={9}/> {t('sla_start')}: {new Date(sla.start_date).toLocaleDateString('pt-PT', { month: 'short', year: 'numeric' })}
          </span>
        )}
        {sla.warranty_end_date && sla.status === 'pipeline' && (
          <span className="flex items-center gap-1">
            <Shield size={9}/> {t('sla_warranty_ends')}: {new Date(sla.warranty_end_date).toLocaleDateString('pt-PT', { month: 'short', year: 'numeric' })}
          </span>
        )}
        {sla.deal_owner && sla.deal_owner !== sla.sla_owner && (
          <span className="text-gray-400">{t('sla_deal_label')}: {sla.deal_owner}</span>
        )}
        {sla.includes_updates && (
          <span className="badge-info">↑ {t('sla_updates_short')}</span>
        )}
        {(sla.support_hours != null && sla.support_hours !== '') && (
          <span className="badge-neutral">{sla.support_hours}h {t('sla_support_short')}</span>
        )}
        {sla.actual_production > 0 && sla.estimated_annual_studies > 0 && sla.actual_production > sla.estimated_annual_studies && (
          <span className="badge-danger">⚠ {Math.round(((sla.actual_production - sla.estimated_annual_studies) / sla.estimated_annual_studies) * 100)}% over</span>
        )}
      </div>

      <div className="flex items-center gap-1 flex-wrap">
        <button onClick={() => setExpanded(e => !e)}
          className="text-micro text-gray-400 hover:text-gray-600 flex items-center gap-0.5 min-h-tap">
          {expanded ? <ChevronUp size={10}/> : <ChevronDown size={10}/>}
          {expanded ? t('sla_hide') : t('sla_fy_break')}
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
                <p className="text-micro text-gray-400 font-medium">{fy}</p>
                <p className="text-xs font-bold text-gray-700">{revenue[fy] ? formatK(revenue[fy]) : '—'}</p>
              </div>
            ))}
          </div>
          {sla.previous_value && (
            <p className="text-micro text-orange-600 mt-1">
              {t('sla_prev_value_label')}: {formatK(sla.previous_value)} — {sla.change_reason || 'reduced'}
            </p>
          )}
        </div>
      )}
    </div>
  )
})

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

  const debouncedSearch = useDebounce(search)

  const { slas: rawSlas, loading, refetch } = useSlas({ bu: buF || undefined })
  const slas = useMemo(() => {
    if (!debouncedSearch) return rawSlas
    const s = debouncedSearch.toLowerCase()
    return rawSlas.filter(sla =>
      (sla.client || '').toLowerCase().includes(s) ||
      (sla.sla_owner || '').toLowerCase().includes(s) ||
      (sla.description || '').toLowerCase().includes(s) ||
      (sla.product || '').toLowerCase().includes(s)
    )
  }, [rawSlas, debouncedSearch])

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
    { id: 'active',   label: `${t('sla_tab_active')} (${tf.filter(s=>['warranty','active','pending_renewal'].includes(s.status)).length})` },
    { id: 'pipeline', label: `${t('sla_tab_pipeline')} (${tf.filter(s=>['draft','waiting_po'].includes(s.status)).length})` },
    { id: 'renewal',  label: `${t('sla_tab_renewal')} (${tf.filter(s=>['pending_renewal','renewed'].includes(s.status)).length})` },
    { id: 'closed',   label: `${t('sla_tab_closed')} (${tf.filter(s=>['expired','cancelled'].includes(s.status)).length})` },
    { id: 'all',      label: `${t('sla_tab_all')} (${tf.length})` },
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
              {t('sla_at_risk_msg').replace('{n}', kpis.atRiskCount).replace('{v}', formatK(kpis.atRiskValue))}
            </span>
          </div>
          <button onClick={() => setRenewalF('30')} className="text-xs text-red-600 font-semibold hover:text-red-800">{t('sla_view')} →</button>
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <div className="card p-3">
          <p className="text-micro text-gray-400 uppercase font-semibold">{t('sla_active_arr')}</p>
          <p className="text-xl font-bold text-green-600">{formatK(kpis.activeValue)}</p>
          <p className="text-xs text-gray-500">{kpis.activeCount} {t('sla_contracts')}</p>
        </div>
        <div className="card p-3">
          <p className="text-micro text-gray-400 uppercase font-semibold">{t('sla_renewals_90d')}</p>
          <p className="text-xl font-bold text-amber-600">{kpis.renewals90}</p>
          <p className="text-xs text-gray-500">{formatK(kpis.renewals90Value)} {t('sla_at_stake')}</p>
        </div>
        <div className="card p-3">
          <p className="text-micro text-gray-400 uppercase font-semibold">{t('sla_pipeline_arr')}</p>
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
                <p className="text-micro text-gray-400 font-medium">{fy}</p>
                <p className="text-sm font-bold text-gray-800">{total > 0 ? formatK(total) : '—'}</p>
                {isAdmin && total > 0 && (
                  <div className="flex justify-center gap-1 mt-0.5">
                    <span className="text-micro text-teal-600">{formatK(revenueByFY[fy].vgt)}</span>
                    <span className="text-micro text-coral-600">{formatK(revenueByFY[fy].ect)}</span>
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
            <option value="">{t('sla_all_regions')}</option>
            {regions.map(r => <option key={r}>{r}</option>)}
          </select>
        )}
        {countries.length > 0 && (
          <select className="select text-xs w-auto" value={countryF} onChange={e => setCountryF(e.target.value)}>
            <option value="">{t('sla_all_countries')}</option>
            {countries.map(c => <option key={c}>{c}</option>)}
          </select>
        )}
        {ownersList.length > 0 && (
          <select className="select text-xs w-auto" value={ownerF} onChange={e => setOwnerF(e.target.value)}>
            <option value="">{t('sla_all_owners')}</option>
            {ownersList.map(o => <option key={o}>{o}</option>)}
          </select>
        )}
        <select className="select text-xs w-auto" value={renewalF} onChange={e => setRenewalF(e.target.value)}>
          <option value="">{t('sla_renewal')}</option>
          <option value="30">{t('sla_renewal_30d')}</option>
          <option value="60">{t('sla_renewal_60d')}</option>
          <option value="90">{t('sla_renewal_90d')}</option>
        </select>
        <select className="select text-xs w-auto" value={statusF} onChange={e => setStatusF(e.target.value)}>
          <option value="">{t('sla_all_status')}</option>
          {SLA_STATUSES.map(s => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
        <select className="select text-xs w-auto" value={sortBy} onChange={e => setSortBy(e.target.value)}>
          <option value="value_desc">{t('sla_sort_value_desc')}</option>
          <option value="value_asc">{t('sla_sort_value_asc')}</option>
          <option value="client">{t('sla_sort_client')}</option>
          <option value="date_desc">{t('sla_sort_newest')}</option>
          <option value="date_asc">{t('sla_sort_oldest')}</option>
          <option value="renewal">{t('sla_sort_renewal')}</option>
        </select>
        <div className="flex gap-0.5 bg-gray-100 p-0.5 rounded-lg ml-auto">
          <button onClick={() => setViewMode('list')}
            className={`px-2 py-1 rounded text-xs font-semibold ${viewMode === 'list' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>
            {t('sla_view_list')}
          </button>
          <button onClick={() => setViewMode('kanban')}
            className={`px-2 py-1 rounded text-xs font-semibold ${viewMode === 'kanban' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}>
            {t('sla_view_kanban')}
          </button>
        </div>
      </div>

      {/* Contract type tabs */}
      <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
        {[
          { id: 'all_types', label: t('sla_type_all') },
          { id: 'maintenance', label: t('sla_type_maintenance') },
          { id: 'variable', label: t('sla_type_variable') },
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
      <div className="flex gap-1 flex-wrap border-b border-gray-200">
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
        <div className="sm:overflow-x-auto">
          <div className="flex gap-3 max-sm:flex-col sm:overflow-visible">
            {SLA_STATUSES.map(st => {
              const colSlas = typeFiltered.filter(s => s.status === st.id)
              const colValue = colSlas.reduce((s, a) => s + (Number(a.annual_value) || 0), 0)
              return (
                <div key={st.id} className="max-sm:w-full sm:flex-1 sm:min-w-[160px]">
                  <div className={`rounded-t-lg px-2 py-1.5 flex items-center justify-between ${st.color.split(' ').filter(c => c.startsWith('bg-')).join(' ')}`}>
                    <span className={`text-micro font-bold uppercase ${st.color.split(' ').filter(c => c.startsWith('text-')).join(' ')}`}>
                      {st.label}
                    </span>
                    <span className="text-micro font-semibold text-gray-500">{colSlas.length}</span>
                  </div>
                  <div className="bg-gray-50 rounded-b-lg p-1.5 space-y-1.5 min-h-[100px]">
                    {colValue > 0 && (
                      <p className="text-micro text-center text-gray-400 font-medium">{formatK(colValue)}</p>
                    )}
                    {colSlas.map(s => (
                      <div key={s.id} onClick={() => { setEditSla(s); setFormOpen(true) }}
                        className="bg-white rounded-lg p-2 shadow-sm border border-gray-100 cursor-pointer hover:shadow-md transition-shadow">
                        <div className="flex items-center gap-1 mb-0.5">
                          <BUBadge bu={s.bu}/>
                          <RenewalBadge sla={s}/>
                        </div>
                        <p className="text-xs font-semibold text-gray-900 truncate">{s.client}</p>
                        {s.description && <p className="text-micro text-gray-400 truncate">{s.description}</p>}
                        <p className="text-xs font-bold text-gray-700 mt-1">{formatK(s.annual_value)}<span className="text-micro text-gray-400 font-normal">{t('sla_yr')}</span></p>
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
                <p className="text-xs font-semibold text-gray-500 uppercase mb-2">{fy} — {fySlas.length} {fySlas.length > 1 ? t('sla_contracts_word') : t('sla_contract_word')}</p>
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
              action={canEdit && <button onClick={() => setFormOpen(true)} className="btn-primary">{t('sla_new_btn')}</button>}/>
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
              <button onClick={() => setConfirmDel(null)} className="btn-secondary flex-1">{t('cancel')}</button>
              <button onClick={handleDelete} className="bg-red-600 text-white rounded-lg px-4 py-2 text-sm font-semibold flex-1">{t('delete')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

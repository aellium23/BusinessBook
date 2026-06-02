import { useState, useMemo, useEffect } from 'react'
import { useDeals, deleteDeal, upsertDeal } from '../hooks/useDeals'
import { useAuth } from '../hooks/useAuth'
import { Spinner, EmptyState, formatK } from '../components/ui'
import DealForm from '../components/DealForm'
import KanbanBoard from '../components/KanbanBoard'
import { Plus, Search, Download, RefreshCw, LayoutGrid, List, Globe } from 'lucide-react'
import { useTranslation } from '../hooks/useTranslation'
import { STAGES, WEIGHTS, REGIONS, BUS, MONTHS, MONTHS_K, FORECAST_CATEGORIES, resolveForecastCategory } from '../constants'
import { canTransition, getAllowedTransitions } from '../lib/stateMachine'
import DealCard from '../components/deals/DealCard'
import DealsMapView from '../components/deals/DealsMapView'

function exportToCSV(deals) {
  const MONTHS = ['Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar']
  const MK = ['apr','may','jun','jul','aug','sep','oct','nov','dec','jan','feb','mar']
  const headers = ['BU','Stage','Client','Country','Region','Sales Owner','Deal Type','Is SLA','SLA Owner',
    'Value €','GM%','Win Prob%','Description',...MONTHS,'FY26 Total']
  const rows = deals.map(d => {
    const fy = MK.reduce((s,m)=>s+(Number(d[m])||0),0)
    return [
      d.bu, d.stage, d.client, d.country, d.region, d.sales_owner, d.deal_type,
      d.is_sla ? 'Yes' : 'No', d.sla_owner || '',
      d.value_total || 0, d.gm_pct ? (d.gm_pct*100).toFixed(1) : '',
      d.win_probability || '', d.description || '',
      ...MK.map(m => Number(d[m]) || 0), fy
    ]
  })
  const csvSafe = (v) => {
    if (typeof v !== 'string') return v
    let s = v.replace(/"/g, '""')
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s
    return (s.includes(',') || s.includes('"') || s.includes('\n')) ? `"${s}"` : s
  }
  const csv = [headers, ...rows].map(r => r.map(csvSafe).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a"); a.href = url
  a.download = `BusinessBook_FY26_${new Date().toISOString().slice(0,10)}.csv`
  a.click(); URL.revokeObjectURL(url)
}

const PAGE_SIZE_OPTIONS = [5, 10, 25]
const PERIOD_KEYS = [
  { key: 'deals_period_all', days: 0 },
  { key: 'deals_period_7d', days: 7 },
  { key: 'deals_period_30d', days: 30 },
  { key: 'deals_period_90d', days: 90 },
]

export default function Deals() {
  const { canEdit, isAdmin, editOwnOnly, profile, perms } = useAuth()
  const canDelete = perms?.canDelete ?? false
  const canEditDeal = (deal) => {
    if (!canEdit) return false
    if (isAdmin) return true
    if (editOwnOnly) return deal?.created_by === profile?.id || deal?.sales_owner === profile?.full_name || deal?.sales_owner === profile?.sales_owner_name
    return true
  }
  const { t } = useTranslation()

  // Filtros
  const [search, setSearch]     = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [stageF, setStageF]     = useState('')
  const [regionF, setRegionF]   = useState('')
  const [buF, setBuF]           = useState('')
  const [ownerF, setOwnerF]     = useState('')
  const [forecastF, setForecastF] = useState('') // '' | 'commit' | 'best_case' | 'upside' | 'omit'
  const [slaF, setSlaF]         = useState(false)
  const [periodF, setPeriodF]   = useState(0)   // dias; 0 = todos
  const [pageSize, setPageSize]             = useState(5)
  const [page, setPage]                     = useState(1)
  const [sortBy, setSortBy]               = useState('date_desc')
  const [invoicedMonthF, setInvoicedMonthF] = useState([])  // array of month keys
  const [viewMode, setViewMode] = useState(() => {
    if (typeof window === 'undefined') return 'list'
    return localStorage.getItem('bb_deals_view') || 'list'
  })

  useEffect(() => {
    try { localStorage.setItem('bb_deals_view', viewMode) } catch {}
  }, [viewMode])

  // Debounce search 300ms to avoid a network call on every keystroke
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])

  // Modal states
  const [editDeal, setEditDeal] = useState(null)
  const [formOpen, setFormOpen] = useState(false)
  const [confirmDel, setConfirmDel] = useState(null)
  const [showFilters, setShowFilters] = useState(false)

  const { deals: rawDeals, loading, refetch } = useDeals({
    stage:  stageF  || undefined,
    region: regionF || undefined,
    bu:     profile?.role === 'distributor' ? undefined : (buF || undefined),
    search: debouncedSearch || undefined,
  })

  // Filtros client-side adicionais
  const deals = useMemo(() => {
    let d = profile?.role === 'distributor'
      ? rawDeals.filter(x => x.company_id === profile?.company_id)
      : rawDeals
    if (slaF) d = d.filter(x => x.is_sla)
    if (ownerF) d = d.filter(x => x.sales_owner?.toLowerCase().includes(ownerF.toLowerCase()))
    if (forecastF) d = d.filter(x => resolveForecastCategory(x) === forecastF)
    if (periodF > 0) {
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - periodF)
      d = d.filter(x => x.updated_at && new Date(x.updated_at) >= cutoff)
    }
    if (invoicedMonthF.length > 0) {
      d = d.filter(x => x.stage === 'Invoiced' && invoicedMonthF.some(m => (Number(x[m]) || 0) > 0))
    }
    return d
  }, [rawDeals, slaF, ownerF, forecastF, periodF, invoicedMonthF.join(','), profile])

  // Totals computed from the client-side filtered deals (not the hook's raw totals)
  const filteredTotals = useMemo(() => deals.reduce((acc, d) => {
    const fy26 = MONTHS_K.reduce((s, m) => s + (Number(d[m]) || 0), 0)
    if (d.is_intercompany_mirror) return acc
    acc.pipeline += d.stage === 'Pipeline' ? (Number(d.value_total) || 0) : 0
    acc.backlog  += d.stage === 'BackLog'  ? fy26 : 0
    acc.invoiced += d.stage === 'Invoiced' ? fy26 : 0
    acc.forecast += ['BackLog','Invoiced'].includes(d.stage) ? fy26 : 0
    return acc
  }, { pipeline: 0, backlog: 0, invoiced: 0, forecast: 0 }), [deals])

  // Weighted forecast — uses deal-level win_probability if set, else stage default
  const weightedTotal = useMemo(() => {
    return deals.filter(d => !d.is_intercompany_mirror).reduce((s, d) => {
      const fy = MONTHS_K.reduce((ms, m) => ms + (Number(d[m]) || 0), 0)
      const baseRaw = ['BackLog', 'Invoiced'].includes(d.stage) ? fy : (Number(d.value_total) || 0)
      const base = baseRaw * ((!d.currency || d.currency === 'EUR') ? 1 : (Number(d.exchange_rate) || 1))
      const prob = d.win_probability != null ? d.win_probability / 100 : (WEIGHTS[d.stage] || 0)
      return s + base * prob
    }, 0)
  }, [deals])

  // Forecast roll-up (Commit / Best case / Upside) — excludes IC mirrors + Lost/Omit
  const forecastTotals = useMemo(() => {
    const result = { commit: 0, best_case: 0, upside: 0, omit: 0 }
    deals.forEach(d => {
      if (d.is_intercompany_mirror) return
      if (d.stage === 'Lost') return
      const cat = resolveForecastCategory(d)
      const fy26 = MONTHS_K.reduce((s, m) => s + (Number(d[m]) || 0), 0)
      const base = ['BackLog','Invoiced'].includes(d.stage) ? fy26 : (Number(d.value_total) || 0)
      const eur  = base * ((!d.currency || d.currency === 'EUR') ? 1 : (Number(d.exchange_rate) || 1))
      result[cat] = (result[cat] || 0) + eur
    })
    return result
  }, [deals])

  // Reset página quando filtros mudam
  const resetPage = () => setPage(1)
  const handleSearch = v => { setSearch(v); resetPage() }
  const handleStage  = v => { setStageF(v); resetPage() }
  const handleRegion = v => { setRegionF(v); resetPage() }
  const handleBu     = v => { setBuF(v); resetPage() }
  const handleOwner  = v => { setOwnerF(v); resetPage() }
  const handleSla    = ()  => { setSlaF(o => !o); resetPage() }
  const handlePeriod        = v => { setPeriodF(Number(v)); resetPage() }
  const handleInvoicedMonth = v => { setInvoicedMonthF(v); resetPage() }

  // Paginação
  const sortedDeals = useMemo(() => {
    const sorted = [...deals]
    sorted.sort((a, b) => {
      if (sortBy === 'value_desc') return (Number(b.value_total) || 0) - (Number(a.value_total) || 0)
      if (sortBy === 'value_asc')  return (Number(a.value_total) || 0) - (Number(b.value_total) || 0)
      if (sortBy === 'client')     return (a.client || '').localeCompare(b.client || '')
      if (sortBy === 'date_desc')  return new Date(b.created_at || 0) - new Date(a.created_at || 0)
      if (sortBy === 'date_asc')   return new Date(a.created_at || 0) - new Date(b.created_at || 0)
      if (sortBy === 'stage')      return STAGES.indexOf(a.stage) - STAGES.indexOf(b.stage)
      return 0
    })
    return sorted
  }, [deals, sortBy])
  const totalPages = Math.max(1, Math.ceil(sortedDeals.length / pageSize))
  const paginated  = sortedDeals.slice((page - 1) * pageSize, page * pageSize)

  // Owners únicos para o filtro
  const owners = useMemo(() => {
    const s = new Set(rawDeals.map(d => d.sales_owner).filter(Boolean))
    return Array.from(s).sort()
  }, [rawDeals])

  // Contagem de filtros activos
  const activeFilters = [search, stageF, regionF, buF, ownerF, forecastF, slaF, periodF > 0, invoicedMonthF.length > 0].filter(Boolean).length

  // Drag-drop on the Kanban: moving a card across stages
  async function handleStageChange(dealId, newStage) {
    const deal = rawDeals.find(d => d.id === dealId)
    if (!deal) return
    // Validate state machine transition
    if (!canTransition('deal', deal.stage, newStage)) {
      const allowed = getAllowedTransitions('deal', deal.stage).filter(s => s !== deal.stage)
      alert(`Cannot move deal from "${deal.stage}" to "${newStage}".\nAllowed transitions: ${allowed.join(', ') || 'none'}`)
      return
    }
    const { error } = await upsertDeal({
      id: dealId,
      stage: newStage,
      stage_changed_at: new Date().toISOString(),
    })
    if (error) {
      alert(`Failed to move deal: ${error.message}`)
    }
    refetch()
  }

  async function confirmDelete() {
    await deleteDeal(confirmDel.id)
    setConfirmDel(null); refetch()
  }

  return (
    <div className="p-4 space-y-4 max-w-4xl mx-auto">

      {/* Header */}
      <div className="flex items-center justify-between pt-1">
        <div>
          <h1 className="text-xl font-bold text-gray-900">{t("deals_title")}</h1>
          <p className="text-[10px] text-gray-400">{t("deals_subtitle")}</p>
          <p className="text-sm text-gray-400">
            {deals.length} {t("deals_records")}
            {activeFilters > 0 && <span className="ml-1 text-blue-500">· {activeFilters} {t("deals_filters_active")}</span>}
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          {/* View toggle — List vs Kanban */}
          <div className="inline-flex rounded-lg border border-gray-200 overflow-hidden" role="group" aria-label="View mode">
            <button type="button"
              onClick={() => setViewMode('list')}
              aria-pressed={viewMode === 'list'}
              title={t("deals_view_list")}
              className={`px-2.5 py-1.5 text-xs flex items-center gap-1 ${
                viewMode === 'list' ? 'bg-navy text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
              }`}>
              <List size={13}/><span className="hidden sm:inline">List</span>
            </button>
            <button type="button"
              onClick={() => setViewMode('kanban')}
              aria-pressed={viewMode === 'kanban'}
              title={t("deals_view_kanban")}
              className={`px-2.5 py-1.5 text-xs flex items-center gap-1 border-l border-gray-200 ${
                viewMode === 'kanban' ? 'bg-navy text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
              }`}>
              <LayoutGrid size={13}/><span className="hidden sm:inline">Kanban</span>
            </button>
            <button type="button"
              onClick={() => setViewMode('map')}
              aria-pressed={viewMode === 'map'}
              title={t("deals_view_map")}
              className={`px-2.5 py-1.5 text-xs flex items-center gap-1 border-l border-gray-200 ${
                viewMode === 'map' ? 'bg-navy text-white' : 'bg-white text-gray-500 hover:bg-gray-50'
              }`}>
              <Globe size={13}/><span className="hidden sm:inline">Map</span>
            </button>
          </div>

          <select className="select text-xs w-auto" value={sortBy} onChange={e => { setSortBy(e.target.value); setPage(1) }}>
            <option value="date_desc">{t("deals_sort_newest")}</option>
            <option value="date_asc">{t("deals_sort_oldest")}</option>
            <option value="value_desc">{t("deals_sort_value_desc")}</option>
            <option value="value_asc">{t("deals_sort_value_asc")}</option>
            <option value="client">{t("deals_sort_client")}</option>
            <option value="stage">{t("deals_sort_stage")}</option>
          </select>

          <button onClick={() => exportToCSV(deals)} className="btn-secondary text-xs">
            <Download size={14}/> {t("deals_export")}
          </button>
          <button
            onClick={() => setShowFilters(o => !o)}
            className={`btn-secondary text-xs gap-1 ${activeFilters > 0 ? 'ring-2 ring-blue-400' : ''}`}>
            <Search size={13}/>
            {t("deals_filters")}
            {activeFilters > 0 && (
              <span className="bg-blue-500 text-white text-[10px] rounded-full w-4 h-4 flex items-center justify-center font-bold">
                {activeFilters}
              </span>
            )}
          </button>
          {canEdit && (
            <button onClick={() => { setEditDeal(null); setFormOpen(true) }} className="btn-primary">
              <Plus size={16}/> <span className="hidden sm:inline">{t("deals_new")}</span>
            </button>
          )}
        </div>
      </div>

      {/* Search bar sempre visível */}
      <div className="relative">
        <Search size={14} className="absolute left-2.5 top-2.5 text-gray-400"/>
        <input className="input pl-8 w-full" placeholder={t("search_deals")}
          value={search} onChange={e => handleSearch(e.target.value)}/>
        {search && (
          <button onClick={() => handleSearch('')}
            className="absolute right-2.5 top-2.5 text-gray-400 hover:text-gray-600">×</button>
        )}
      </div>

      {/* Filtros avançados — colapsáveis */}
      {showFilters && (
        <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 space-y-3">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">

            {/* BU */}
            {isAdmin && (
              <div>
                <label className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide mb-1 block">BU</label>
                <select className="select text-xs w-full" value={buF} onChange={e => handleBu(e.target.value)}>
                  <option value="">{t("deals_all_bu")}</option>
                  {BUS.map(b => <option key={b} value={b}>{b}</option>)}
                </select>
              </div>
            )}

            {/* Stage */}
            <div>
              <label className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide mb-1 block">Stage</label>
              <select className="select text-xs w-full" value={stageF} onChange={e => handleStage(e.target.value)}>
                <option value="">{t("deals_all_stages")}</option>
                {STAGES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>

            {/* Region */}
            <div>
              <label className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide mb-1 block">Region</label>
              <select className="select text-xs w-full" value={regionF} onChange={e => handleRegion(e.target.value)}>
                <option value="">{t("deals_all_regions")}</option>
                {REGIONS.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>

            {/* Sales Owner */}
            <div>
              <label className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide mb-1 block">{t("df_owner")}</label>
              <select className="select text-xs w-full" value={ownerF} onChange={e => handleOwner(e.target.value)}>
                <option value="">{t("deals_all_owners")}</option>
                {owners.map(o => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>

            {/* Forecast category */}
            <div>
              <label className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide mb-1 block">Forecast</label>
              <select className="select text-xs w-full" value={forecastF}
                onChange={e => { setForecastF(e.target.value); resetPage() }}>
                <option value="">{t("deals_all_forecasts")}</option>
                {FORECAST_CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </div>

            {/* Invoiced Month */}
            <div>
              <label className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide mb-1 block">
                {t("deals_invoiced_month")}
              </label>
              <div className="flex gap-1 flex-wrap">
                <button onClick={() => setInvoicedMonthF([])}
                  className={`text-[10px] px-1.5 py-0.5 rounded ${invoicedMonthF.length === 0 ? 'bg-navy text-white' : 'bg-gray-100 text-gray-500'}`}>All</button>
                <button onClick={() => {
                  const m = new Date().getMonth() + 1
                  const elapsed = ((m - 4 + 12) % 12) + 1
                  setInvoicedMonthF(MONTHS_K.slice(0, elapsed))
                }}
                  className={`text-[10px] px-1.5 py-0.5 rounded ${invoicedMonthF.length > 1 ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'}`}>FY YTD</button>
              </div>
              <div className="grid grid-cols-4 gap-0.5 mt-1">
                {MONTHS.map((m, i) => (
                  <button key={m} onClick={() => {
                    setInvoicedMonthF(prev => prev.includes(MONTHS_K[i]) ? prev.filter(x => x !== MONTHS_K[i]) : [...prev, MONTHS_K[i]])
                  }}
                    className={`text-[10px] px-1 py-0.5 rounded ${invoicedMonthF.includes(MONTHS_K[i]) ? 'bg-blue-500 text-white' : 'bg-gray-50 text-gray-500 hover:bg-gray-100'}`}>
                    {m}
                  </button>
                ))}
              </div>
              {invoicedMonthF.length > 0 && (
                <p className="text-[9px] text-blue-500 mt-0.5">{invoicedMonthF.length} month{invoicedMonthF.length > 1 ? 's' : ''} selected</p>
              )}
            </div>

            {/* Período */}
            <div>
              <label className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide mb-1 block">{t("deals_period")}</label>
              <select className="select text-xs w-full" value={periodF} onChange={e => handlePeriod(e.target.value)}>
                {PERIOD_KEYS.map(p => <option key={p.days} value={p.days}>{t(p.key)}</option>)}
              </select>
            </div>

            {/* Cards por página */}
            <div>
              <label className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide mb-1 block">{t("deals_per_page")}</label>
              <select className="select text-xs w-full" value={pageSize} onChange={e => { setPageSize(Number(e.target.value)); resetPage() }}>
                {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n} {t("deals_per_page_suffix")}</option>)}
              </select>
            </div>
          </div>

          {/* Toggle SLA + Reset */}
          <div className="flex items-center justify-between">
            <button onClick={handleSla}
              className={`btn text-xs gap-1 ${slaF ? 'bg-blue-100 text-blue-800 border border-blue-200' : 'btn-secondary'}`}>
              <RefreshCw size={11}/> {t("deals_sla_only")}
            </button>
            {activeFilters > 0 && (
              <button onClick={() => {
                setSearch(''); setStageF(''); setRegionF(''); setBuF('')
                setOwnerF(''); setForecastF(''); setSlaF(false); setPeriodF(0); setInvoicedMonthF([]); resetPage()
              }} className="text-xs text-red-500 hover:text-red-700 font-medium">
                {t("deals_clear_filters")}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Forecast roll-up — Commit / Best case / Upside */}
      <div className="grid grid-cols-3 gap-2">
        {FORECAST_CATEGORIES.filter(c => c.id !== 'omit').map(c => {
          const v = forecastTotals[c.id] || 0
          const active = forecastF === c.id
          return (
            <button key={c.id} type="button"
              onClick={() => { setForecastF(active ? '' : c.id); resetPage() }}
              aria-pressed={active}
              className={`text-left rounded-xl border p-2.5 transition-colors ${
                active ? 'border-navy ring-2 ring-navy/10' : 'border-gray-200 hover:border-gray-300'
              } ${c.color.split(' ')[0]}`}>
              <p className="text-[10px] font-semibold uppercase tracking-wide opacity-70">{c.label}</p>
              <p className="text-sm font-bold mt-0.5">{formatK(v)}</p>
            </button>
          )
        })}
      </div>

      {/* Totais */}
      <div className="flex gap-4 overflow-x-auto pb-1">
        {[
          { l:t("deals_pipeline"), v:filteredTotals.pipeline, c:'text-amber-700' },
          { l:t("deals_backlog"),  v:filteredTotals.backlog,  c:'text-blue-700'  },
          { l:t("deals_actuals"),  v:filteredTotals.invoiced, c:'text-green-700' },
          { l:t("deals_fc"),       v:filteredTotals.forecast, c:'text-vgt font-bold' },
          { l:t("deals_weighted"), v:weightedTotal, c:'text-purple-700 font-bold' },
        ].map(({ l, v, c }) => (
          <div key={l} className="text-center shrink-0">
            <p className="text-[10px] text-gray-400">{l}</p>
            <p className={`text-sm font-semibold ${c}`}>{formatK(v)}</p>
          </div>
        ))}
      </div>

      {/* Lista paginada ou Kanban */}
      {loading ? <Spinner /> : deals.length === 0
        ? <EmptyState icon="📋" title={t("deals_empty_title")} description={t("deals_empty_desc")}
            action={canEdit && <button onClick={() => setFormOpen(true)} className="btn-primary">{t("deals_add")}</button>}/>
        : viewMode === 'map'
          ? <DealsMapView deals={deals} />
        : viewMode === 'kanban'
          ? <KanbanBoard
              deals={sortedDeals}
              canEdit={canEdit}
              onEdit={deal => { setEditDeal(deal); setFormOpen(true) }}
              onDelete={setConfirmDel}
              onMove={handleStageChange}
            />
        : <>
            <div className="space-y-2">
              {paginated.map(d => (
                <DealCard key={d.id} deal={d} canEdit={canEditDeal(d)} canDelete={canDelete}
                  onEdit={deal => { setEditDeal(deal); setFormOpen(true) }}
                  onDelete={setConfirmDel}
                />
              ))}
            </div>

            {/* Paginação */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-1">
                <p className="text-xs text-gray-400">
                  {t("deals_showing")} {(page-1)*pageSize+1}–{Math.min(page*pageSize, sortedDeals.length)} {t("deals_of")} {sortedDeals.length}
                </p>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => setPage(p => Math.max(1, p-1))}
                    disabled={page === 1}
                    className="btn-secondary text-xs px-2 py-1 disabled:opacity-30">
                    ←
                  </button>
                  {Array.from({length: totalPages}, (_, i) => i+1)
                    .filter(p => p === 1 || p === totalPages || Math.abs(p - page) <= 1)
                    .reduce((acc, p, i, arr) => {
                      if (i > 0 && p - arr[i-1] > 1) acc.push('…')
                      acc.push(p)
                      return acc
                    }, [])
                    .map((p, i) => p === '…'
                      ? <span key={`ellipsis-${i}`} className="text-xs text-gray-300 px-1">…</span>
                      : <button key={p} onClick={() => setPage(p)}
                          className={`text-xs px-2.5 py-1 rounded-lg font-medium transition-colors ${
                            p === page ? 'bg-navy text-white' : 'text-gray-500 hover:bg-gray-100'
                          }`}>{p}</button>
                    )
                  }
                  <button
                    onClick={() => setPage(p => Math.min(totalPages, p+1))}
                    disabled={page === totalPages}
                    className="btn-secondary text-xs px-2 py-1 disabled:opacity-30">
                    →
                  </button>
                </div>
              </div>
            )}
          </>
      }

      {formOpen && (
        <DealForm deal={editDeal}
          onClose={() => { setFormOpen(false); setEditDeal(null) }}
          onSaved={refetch} />
      )}

      {confirmDel && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="absolute inset-0 bg-black/40" onClick={() => setConfirmDel(null)} />
          <div className="relative bg-white rounded-t-3xl sm:rounded-2xl p-6 w-full sm:max-w-xs shadow-xl" style={{ paddingBottom: 'max(1.5rem, env(safe-area-inset-bottom))' }}>
            <h3 className="font-semibold text-gray-900 mb-2">{t("deals_delete_q")}</h3>
            <p className="text-sm text-gray-500 mb-1">
              <strong>{confirmDel.client}</strong> {t("deals_will_be_removed")}
            </p>
            {confirmDel.intercompany_value > 0 && (
              <p className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded mb-3">
                {t("deals_ic_also_deleted")}
              </p>
            )}
            <div className="flex gap-2 mt-4">
              <button onClick={() => setConfirmDel(null)} className="btn-secondary flex-1">{t("deals_cancel")}</button>
              <button onClick={confirmDelete} className="btn-danger flex-1">{t("deals_delete")}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

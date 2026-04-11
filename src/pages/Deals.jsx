import { useState, useMemo } from 'react'
import { useDeals, deleteDeal } from '../hooks/useDeals'
import { useAuth } from '../hooks/useAuth'
import { BUBadge, StageBadge, SalesTypeBadge, Spinner, EmptyState, formatK, CurrencyBadge } from '../components/ui'
import DealForm from '../components/DealForm'
import { Plus, Search, Trash2, Pencil, ChevronDown, ChevronUp, Link, AlertTriangle, Clock, Download, RefreshCw } from 'lucide-react'
import { useTranslation } from '../hooks/useTranslation'

const STAGES  = ['','Lead','Pipeline','Offer Presented','BackLog','Invoiced','Lost']
const WEIGHTS = { Lead: 0.10, Pipeline: 0.30, 'Offer Presented': 0.60, BackLog: 0.80, Invoiced: 1.0, Lost: 0 }
const REGIONS = ['','Europe','MEA','LATAM','APAC','NA']
const BUS     = ['','VGT','ECT']
const MONTHS_K = ['apr','may','jun','jul','aug','sep','oct','nov','dec','jan','feb','mar']
const MONTHS   = ['Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar']

function agingDays(deal) {
  if (!['Lead','Pipeline','Offer Presented'].includes(deal.stage)) return null
  const ref = deal.stage_changed_at || deal.updated_at || deal.created_at
  if (!ref) return null
  return Math.floor((Date.now() - new Date(ref).getTime()) / 86400000)
}

function AgingBadge({ days }) {
  if (days === null) return null
  if (days >= 90) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-red-100 text-red-700">
      <AlertTriangle size={10}/> {days}d
    </span>
  )
  if (days >= 45) return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-700">
      <Clock size={10}/> {days}d
    </span>
  )
  return <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-gray-100 text-gray-500"><Clock size={10}/>{days}d</span>
}


// ── Deal Score: verde/amarelo/vermelho baseado em saúde do deal ──────────
function dealScore(deal) {
  let score = 100
  const now = new Date()

  // Penalizar por inactividade (sem updated_at recente)
  if (deal.updated_at) {
    const daysSince = (now - new Date(deal.updated_at)) / 86400000
    if (daysSince > 90) score -= 30
    else if (daysSince > 45) score -= 15
    else if (daysSince > 21) score -= 5
  }

  // Penalizar por stage problemático
  if (deal.stage === 'Lost') return { score: 0, color: 'gray', label: 'Lost' }
  if (deal.stage === 'Invoiced') return { score: 100, color: 'green', label: 'Closed' }

  // Penalizar por probabilidade baixa
  const prob = deal.win_probability ?? { Lead:10, Pipeline:30, 'Offer Presented':60, BackLog:80 }[deal.stage] ?? 30
  if (prob < 20) score -= 25
  else if (prob < 40) score -= 10

  // Penalizar por valor em queda (sem dados históricos, usar proxy: deal sem valor)
  if (!deal.value_total || deal.value_total === 0) score -= 20

  // Penalizar se deal muito antigo sem avançar (created_at há >6 meses e ainda em Lead/Pipeline)
  if (deal.created_at && ['Lead','Pipeline'].includes(deal.stage)) {
    const age = (now - new Date(deal.created_at)) / 86400000
    if (age > 180) score -= 25
    else if (age > 90) score -= 10
  }

  // Bónus por actividade recente, SLA, produto definido
  if (deal.is_sla) score += 5
  if (deal.product) score += 5

  score = Math.max(0, Math.min(100, score))
  if (score >= 70) return { score, color: 'green', label: 'Healthy' }
  if (score >= 40) return { score, color: 'amber', label: 'At risk' }
  return { score, color: 'red', label: 'Critical' }
}

function DealCard({ deal, onEdit, onDelete, canEdit }) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const fy26 = MONTHS_K.reduce((s, m) => s + (deal[m] || 0), 0)
  const isIC  = deal.is_intercompany_mirror
  const hasIC = deal.intercompany_value > 0
  const score = dealScore(deal)

  const scoreBorderClass = score.color === 'green' ? 'border-l-4 border-green-400' :
    score.color === 'amber' ? 'border-l-4 border-amber-400' :
    score.color === 'red'   ? 'border-l-4 border-red-400' :
    score.color === 'gray'  ? 'border-l-4 border-gray-300' : ''

  return (
    <div className={`card p-3 space-y-2 ${isIC ? 'border-l-4 border-vgt' : scoreBorderClass}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap mb-1">
            <BUBadge bu={deal.bu} />
            <StageBadge stage={deal.stage} />
            <SalesTypeBadge type={deal.sales_type} />
            <AgingBadge days={agingDays(deal)} />
            {deal.product && (
              <span className="inline-flex px-2 py-0.5 rounded text-xs font-bold bg-navy/10 text-navy">
                {deal.product}
              </span>
            )}
            {deal.win_probability !== null && deal.win_probability !== undefined && (
              <span className={`inline-flex px-2 py-0.5 rounded text-xs font-bold ${
                deal.win_probability >= 80 ? 'bg-green-100 text-green-700' :
                deal.win_probability >= 50 ? 'bg-purple-100 text-purple-700' :
                deal.win_probability >= 20 ? 'bg-amber-100 text-amber-700' :
                'bg-gray-100 text-gray-500'
              }`}>{deal.win_probability}%</span>
            )}
            {deal.is_sla && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-blue-100 text-blue-800">
                <RefreshCw size={9}/> SLA
              </span>
            )}
            {deal.discount_status === 'pending' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-purple-100 text-purple-800">
                ⏳ Discount pending {deal.discount_requested}%
              </span>
            )}
            {deal.discount_status === 'approved' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-green-100 text-green-700">
                ✓ {deal.discount_approved}% approved
              </span>
            )}
            {deal.discount_status === 'counter' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-700">
                ↔ Counter: {deal.discount_approved}%
              </span>
            )}
            {deal.discount_status === 'rejected' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-red-100 text-red-700">
                ✗ Rejected
              </span>
            )}
            {isIC && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-vgt/10 text-vgt">
                <Link size={10}/> IC mirror
              </span>
            )}
            {hasIC && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-bold bg-amber-100 text-amber-800">
                <Link size={10}/> IC →VGT
              </span>
            )}
          </div>
          <p className="font-semibold text-sm text-gray-900 truncate">{deal.client}</p>
          <p className="text-xs text-gray-400">{[deal.country, deal.region, deal.sales_owner].filter(Boolean).join(' · ')}</p>
          {deal.description && <p className="text-xs text-gray-500 truncate mt-0.5">{deal.description}</p>}
          {deal.stage === 'Lost' && deal.lost_reason && (
            <p className="text-xs text-red-500 mt-0.5">Lost: {deal.lost_reason}</p>
          )}
          {(deal.equipment_count || deal.annual_studies || deal.annual_exams) && (
            <div className="flex items-center gap-2 flex-wrap mt-0.5">
              {deal.equipment_count && (
                <span className="text-[10px] text-gray-400">📡 {deal.equipment_count} equip.</span>
              )}
              {deal.annual_studies && (
                <span className="text-[10px] text-gray-400">📊 {Number(deal.annual_studies).toLocaleString()} studies/yr</span>
              )}
              {deal.annual_exams && (
                <span className="text-[10px] text-gray-400">📋 {Number(deal.annual_exams).toLocaleString()} exams/yr</span>
              )}
            </div>
          )}
          {(deal.end_customer || deal.distributor || deal.hub) && (
            <div className="flex items-center gap-1 flex-wrap mt-1">
              {deal.end_customer && (
                <span className="text-[10px] bg-blue-50 text-blue-600 px-1.5 py-0.5 rounded truncate max-w-28">{deal.end_customer}</span>
              )}
              {(deal.distributor || deal.hub) && <span className="text-gray-300 text-[10px]">→</span>}
              {deal.distributor && (
                <span className="text-[10px] bg-amber-50 text-amber-600 px-1.5 py-0.5 rounded truncate max-w-28">{deal.distributor}</span>
              )}
              {deal.hub && (
                <><span className="text-gray-300 text-[10px]">→</span>
                <span className="text-[10px] bg-purple-50 text-purple-600 px-1.5 py-0.5 rounded truncate max-w-28">{deal.hub}</span></>
              )}
            </div>
          )}
        </div>
        <div className="text-right shrink-0 min-w-0 max-w-28">
          <div className="flex items-center justify-end gap-1">
            <CurrencyBadge currency={deal.currency}/>
            <p className="text-sm font-bold text-gray-900">
              {deal.currency && deal.currency !== 'EUR'
                ? `${deal.currency === 'USD' ? '$' : '£'}${(deal.value_total||0).toLocaleString()}`
                : formatK(deal.value_total)}
            </p>
          </div>
          {deal.currency && deal.currency !== 'EUR' && deal.exchange_rate && (
            <p className="text-[10px] text-blue-500">≈ {formatK((deal.value_total||0) * (deal.exchange_rate||1))}</p>
          )}
          <p className="text-xs text-gray-400">FY26: {formatK(fy26)}</p>
          <p className="text-xs text-blue-600 font-medium">
            W: {formatK((deal.value_total||0) * (WEIGHTS[deal.stage]||0))}
          </p>
          {deal.end_customer_value && (
            <p className="text-[10px] text-gray-400">
              Project: {formatK(deal.end_customer_value)}
            </p>
          )}
          {hasIC && (
            <p className="text-xs text-amber-600 font-medium">
              VGT cost: {formatK(deal.intercompany_value)}
            </p>
          )}
        </div>
      </div>

      <div className="flex items-start sm:items-center justify-between pt-1 gap-2">
        <button onClick={() => setOpen(o => !o)} className="text-xs text-gray-400 flex items-center gap-1">
          Monthly {open ? <ChevronUp size={12}/> : <ChevronDown size={12}/>}
        </button>
        {canEdit && !isIC && (
          <div className="flex gap-2">
            <button onClick={() => onEdit(deal)} className="text-gray-400 hover:text-navy"><Pencil size={14}/></button>
            <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold mr-1 ${
              score.color === 'green' ? 'bg-green-100 text-green-700' :
              score.color === 'amber' ? 'bg-amber-100 text-amber-700' :
              score.color === 'red'   ? 'bg-red-100 text-red-700' :
              'bg-gray-100 text-gray-400'
            }`} title={`Score: ${score.score}/100`}>
              <span className={`w-1.5 h-1.5 rounded-full inline-block ${
                score.color === 'green' ? 'bg-green-500' :
                score.color === 'amber' ? 'bg-amber-500' :
                score.color === 'red'   ? 'bg-red-500' : 'bg-gray-400'
              }`}/>
              {score.label}
            </div>
            <button onClick={() => onDelete(deal)} className="text-gray-400 hover:text-red-500"><Trash2 size={14}/></button>
          </div>
        )}
        {isIC && (
          <span className="text-xs text-gray-400 italic">{t("deals_auto")}</span>
        )}
      </div>

      {open && (
        <div className="grid grid-cols-4 sm:grid-cols-6 gap-1 pt-1">
          {MONTHS.map((m, i) => {
            const v = deal[MONTHS_K[i]] || 0
            return (
              <div key={m} className={`text-center rounded p-1 ${v > 0 ? (isIC ? 'bg-vgt/10' : 'bg-blue-50') : 'bg-gray-50'}`}>
                <p className="text-[9px] text-gray-400">{m}</p>
                <p className="text-[10px] font-bold text-gray-700">{v > 0 ? `${(v/1000).toFixed(1)}K` : '—'}</p>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function exportToCSV(deals) {
  const MONTHS = ['Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec','Jan','Feb','Mar']
  const MK = ['apr','may','jun','jul','aug','sep','oct','nov','dec','jan','feb','mar']
  const headers = ['BU','Stage','Client','Country','Region','Sales Owner','Deal Type','Is SLA','SLA Owner',
    'Value €','GM%','Win Prob%','Description',...MONTHS,'FY26 Total']
  const rows = deals.map(d => {
    const fy = MK.reduce((s,m)=>s+(d[m]||0),0)
    return [
      d.bu, d.stage, d.client, d.country, d.region, d.sales_owner, d.deal_type,
      d.is_sla ? 'Yes' : 'No', d.sla_owner || '',
      d.value_total || 0, d.gm_pct ? (d.gm_pct*100).toFixed(1) : '',
      d.win_probability || '', d.description || '',
      ...MK.map(m => d[m] || 0), fy
    ]
  })
  const csv = [headers, ...rows].map(r => r.map(v =>
    typeof v === 'string' && v.includes(',') ? `"${v}"` : v
  ).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a"); a.href = url
  a.download = `BusinessBook_FY26_${new Date().toISOString().slice(0,10)}.csv`
  a.click(); URL.revokeObjectURL(url)
}

const PAGE_SIZE_OPTIONS = [5, 10, 25]
const PERIOD_OPTIONS = [
  { label: 'All time', days: 0 },
  { label: 'Last 7 days', days: 7 },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
]

export default function Deals() {
  const { canEdit, isAdmin, profile } = useAuth()
  const { t } = useTranslation()

  // Filtros
  const [search, setSearch]     = useState('')
  const [stageF, setStageF]     = useState('')
  const [regionF, setRegionF]   = useState('')
  const [buF, setBuF]           = useState('')
  const [ownerF, setOwnerF]     = useState('')
  const [slaF, setSlaF]         = useState(false)
  const [periodF, setPeriodF]   = useState(0)   // dias; 0 = todos
  const [pageSize, setPageSize] = useState(5)
  const [page, setPage]         = useState(1)

  // Modal states
  const [editDeal, setEditDeal] = useState(null)
  const [formOpen, setFormOpen] = useState(false)
  const [confirmDel, setConfirmDel] = useState(null)
  const [showFilters, setShowFilters] = useState(false)

  const { deals: rawDeals, loading, refetch, totals } = useDeals({
    stage:  stageF  || undefined,
    region: regionF || undefined,
    bu:     profile?.role === 'distributor' ? undefined : (buF || undefined),
    search: search  || undefined,
  })

  // Filtros client-side adicionais
  const deals = useMemo(() => {
    let d = profile?.role === 'distributor'
      ? rawDeals.filter(x => x.distributor === profile?.sales_owner_name)
      : rawDeals
    if (slaF) d = d.filter(x => x.is_sla)
    if (ownerF) d = d.filter(x => x.sales_owner?.toLowerCase().includes(ownerF.toLowerCase()))
    if (periodF > 0) {
      const cutoff = new Date()
      cutoff.setDate(cutoff.getDate() - periodF)
      d = d.filter(x => x.updated_at && new Date(x.updated_at) >= cutoff)
    }
    return d
  }, [rawDeals, slaF, ownerF, periodF, profile])

  // Reset página quando filtros mudam
  const resetPage = () => setPage(1)
  const handleSearch = v => { setSearch(v); resetPage() }
  const handleStage  = v => { setStageF(v); resetPage() }
  const handleRegion = v => { setRegionF(v); resetPage() }
  const handleBu     = v => { setBuF(v); resetPage() }
  const handleOwner  = v => { setOwnerF(v); resetPage() }
  const handleSla    = ()  => { setSlaF(o => !o); resetPage() }
  const handlePeriod = v => { setPeriodF(Number(v)); resetPage() }

  // Paginação
  const totalPages = Math.max(1, Math.ceil(deals.length / pageSize))
  const paginated  = deals.slice((page - 1) * pageSize, page * pageSize)

  // Owners únicos para o filtro
  const owners = useMemo(() => {
    const s = new Set(rawDeals.map(d => d.sales_owner).filter(Boolean))
    return Array.from(s).sort()
  }, [rawDeals])

  // Contagem de filtros activos
  const activeFilters = [search, stageF, regionF, buF, ownerF, slaF, periodF > 0].filter(Boolean).length

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
          <p className="text-sm text-gray-400">
            {deals.length} {t("deals_records")}
            {activeFilters > 0 && <span className="ml-1 text-blue-500">· {activeFilters} {t("deals_filters_active")}</span>}
          </p>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap justify-end">
          <button onClick={() => exportToCSV(deals)} className="btn-secondary text-xs">
            <Download size={14}/> Export
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
                  {BUS.map(b => <option key={b} value={b}>{b || t("deals_all_bu")}</option>)}
                </select>
              </div>
            )}

            {/* Stage */}
            <div>
              <label className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide mb-1 block">Stage</label>
              <select className="select text-xs w-full" value={stageF} onChange={e => handleStage(e.target.value)}>
                {STAGES.map(s => <option key={s} value={s}>{s || t("deals_all_stages")}</option>)}
              </select>
            </div>

            {/* Region */}
            <div>
              <label className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide mb-1 block">Region</label>
              <select className="select text-xs w-full" value={regionF} onChange={e => handleRegion(e.target.value)}>
                {REGIONS.map(r => <option key={r} value={r}>{r || t("deals_all_regions")}</option>)}
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

            {/* Período */}
            <div>
              <label className="text-[10px] text-gray-400 font-semibold uppercase tracking-wide mb-1 block">{t("deals_period")}</label>
              <select className="select text-xs w-full" value={periodF} onChange={e => handlePeriod(e.target.value)}>
                {PERIOD_OPTIONS.map(p => <option key={p.days} value={p.days}>{p.label}</option>)}
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
              <RefreshCw size={11}/> SLA only
            </button>
            {activeFilters > 0 && (
              <button onClick={() => {
                setSearch(''); setStageF(''); setRegionF(''); setBuF('')
                setOwnerF(''); setSlaF(false); setPeriodF(0); resetPage()
              }} className="text-xs text-red-500 hover:text-red-700 font-medium">
                {t("deals_clear_filters")}
              </button>
            )}
          </div>
        </div>
      )}

      {/* Totais */}
      <div className="flex gap-4 overflow-x-auto pb-1">
        {[
          { l:t("deals_pipeline"), v:totals.pipeline, c:'text-amber-700' },
          { l:t("deals_backlog"),  v:totals.backlog,  c:'text-blue-700'  },
          { l:t("deals_actuals"),  v:totals.invoiced, c:'text-green-700' },
          { l:t("deals_fc"),       v:totals.forecast, c:'text-vgt font-bold' },
          { l:t("deals_weighted"), v:deals.filter(d=>!d.is_intercompany_mirror).reduce((s,d)=>{
              const fy=MONTHS_K.reduce((ms,m)=>ms+(d[m]||0),0)
              const baseRaw=['BackLog','Invoiced'].includes(d.stage)?fy:(d.value_total||0)
              const base=baseRaw*((!d.currency||d.currency==='EUR')?1:(d.exchange_rate||1))
              const prob=d.win_probability!=null?d.win_probability/100:(WEIGHTS[d.stage]||0)
              return s+base*prob
            },0), c:'text-purple-700 font-bold' },
        ].map(({ l, v, c }) => (
          <div key={l} className="text-center shrink-0">
            <p className="text-[10px] text-gray-400">{l}</p>
            <p className={`text-sm font-semibold ${c}`}>{formatK(v)}</p>
          </div>
        ))}
      </div>

      {/* Lista paginada */}
      {loading ? <Spinner /> : deals.length === 0
        ? <EmptyState icon="📋" title="No deals found" description="Adjust filters or add a new deal"
            action={canEdit && <button onClick={() => setFormOpen(true)} className="btn-primary">{t("deals_add")}</button>}/>
        : <>
            <div className="space-y-2">
              {paginated.map(d => (
                <DealCard key={d.id} deal={d} canEdit={canEdit}
                  onEdit={deal => { setEditDeal(deal); setFormOpen(true) }}
                  onDelete={setConfirmDel}
                />
              ))}
            </div>

            {/* Paginação */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-1">
                <p className="text-xs text-gray-400">
                  {t("deals_showing")} {(page-1)*pageSize+1}–{Math.min(page*pageSize, deals.length)} {t("deals_of")} {deals.length}
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
          <div className="relative bg-white rounded-t-3xl sm:rounded-2xl p-6 w-full sm:max-w-xs shadow-xl">
            <h3 className="font-semibold text-gray-900 mb-2">{t("deals_delete_q")}</h3>
            <p className="text-sm text-gray-500 mb-1">
              <strong>{confirmDel.client}</strong> will be permanently removed.
            </p>
            {confirmDel.intercompany_value > 0 && (
              <p className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded mb-3">
                The linked VGT intercompany deal will also be deleted.
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
